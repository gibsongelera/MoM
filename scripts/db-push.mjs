#!/usr/bin/env node
/**
 * Applies every SQL file in supabase/migrations, in filename order, over a
 * direct Postgres connection.
 *
 * Each file runs inside its own transaction and is recorded in
 * schema_migrations, so re-running only applies what is new.
 *
 *   node --env-file=.env.local scripts/db-push.mjs
 *   node --env-file=.env.local scripts/db-push.mjs --force 0002_rls.sql
 *
 * Needs DATABASE_URL in .env.local. Supabase dashboard -> Connect -> ORM /
 * "Direct connection" (or the session pooler on port 5432). The password is the
 * database password, not the service-role key.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(HERE, '..', 'supabase', 'migrations');
const ENV_FILE = join(HERE, '..', '.env.local');

const args = process.argv.slice(2);
const forceIdx = args.indexOf('--force');
const forced = forceIdx >= 0 ? args.slice(forceIdx + 1) : [];

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) {
  console.error(
    'DATABASE_URL is not set.\n' +
      'Add it to .env.local — Supabase dashboard -> Connect -> Direct connection.\n' +
      'Example: postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres',
  );
  process.exit(1);
}

/**
 * Diffs the raw .env.local line against what --env-file actually loaded.
 *
 * Node's env-file parser treats an UNQUOTED `#` as a comment delimiter -- the
 * same as dotenv and most shells. `DATABASE_URL=postgresql://postgres:pa#ss@host`
 * silently truncates at `#`, and the truncated value still parses as a
 * syntactically valid URL, so nothing downstream can tell the difference: pg
 * connects, sends the wrong password, and the only symptom is
 * "password authentication failed" -- which reads exactly like a wrong
 * password, not a mangled one. This caught that class of bug once already;
 * check for it up front instead of debugging it again next time.
 */
function checkForEnvFileTruncation() {
  if (!existsSync(ENV_FILE)) return;
  const line = readFileSync(ENV_FILE, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith('DATABASE_URL='));
  if (!line) return;

  let raw = line.slice('DATABASE_URL='.length);
  if (/^".*"$/.test(raw) || /^'.*'$/.test(raw)) raw = raw.slice(1, -1);

  if (raw !== rawUrl) {
    console.error(`
DATABASE_URL in .env.local is ${raw.length} characters, but Node only loaded ${rawUrl.length}.

This almost always means an unquoted special character truncated the value --
most commonly the # character, which --env-file treats as a comment start, or ?,
which a URL parser reads as the start of the query string.

Fix: wrap the value in double quotes in .env.local:
  DATABASE_URL="postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres"`);
    process.exit(1);
  }
}

checkForEnvFileTruncation();

/**
 * Percent-encodes the password so a literal special character cannot break URL
 * parsing.
 *
 * Supabase-generated passwords routinely contain `?`, `,`, `#`, `@` and `/`, all
 * of which are structural in a URL — a raw `?` starts the query component, so
 * the whole string fails to parse with a bare "Invalid URL". Expecting whoever
 * pastes the password to hand-encode it is a reliable way to lose an afternoon,
 * so handle it here.
 *
 * The credential delimiter is the LAST `@`, since the password may contain one.
 */
function normalizeConnectionString(url) {
  const schemeEnd = url.indexOf('://');
  if (schemeEnd < 0) return url;

  const scheme = url.slice(0, schemeEnd + 3);
  const rest = url.slice(schemeEnd + 3);

  const at = rest.lastIndexOf('@');
  if (at < 0) return url; // no credentials to encode

  const credentials = rest.slice(0, at);
  const hostAndPath = rest.slice(at + 1);

  const colon = credentials.indexOf(':');
  if (colon < 0) return url; // user only, no password

  const user = credentials.slice(0, colon);
  const password = credentials.slice(colon + 1);

  // Already encoded? Leave it be rather than turning %XX into %25XX.
  const alreadyEncoded = /%[0-9A-Fa-f]{2}/.test(password);
  const safePassword = alreadyEncoded ? password : encodeURIComponent(password);

  return `${scheme}${encodeURIComponent(user)}:${safePassword}@${hostAndPath}`;
}

/**
 * Refuses to guess a missing host rather than fabricating one.
 *
 * An earlier version of this reconstructed a plausible-looking connection
 * string from NEXT_PUBLIC_SUPABASE_URL whenever `@host` was missing. That is
 * exactly how the env-file truncation bug above went undetected for two full
 * debugging rounds: the fabricated string parsed as a perfectly valid URL and
 * connected, so the only symptom was "password authentication failed" --
 * which reads like a wrong password, not a silently mangled one. A missing
 * credential should stop the script, not be guessed at.
 */
function checkHasHost(url) {
  if (url.includes('@')) return;
  console.error(`
DATABASE_URL has no @host segment.

Expected shape:
  postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres

Copy the whole line from the Supabase dashboard -> Connect -> Direct connection,
and wrap it in double quotes in .env.local -- an unquoted # or ? in the password
gets treated as a comment or query delimiter and truncates the value before it
reaches this script.`,
  );
  process.exit(1);
}

checkHasHost(rawUrl);
const connectionString = normalizeConnectionString(rawUrl);
if (connectionString !== rawUrl) {
  console.log('note: percent-encoded special characters in the database password');
}

// Fail with something actionable rather than pg's bare "Invalid URL".
try {
  const probe = new URL(connectionString);
  if (!probe.hostname) throw new Error('no host');
  if (!probe.password) {
    console.error(
      'DATABASE_URL has no password.\n' +
        'Expected: postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres',
    );
    process.exit(1);
  }
} catch {
  console.error(
    'DATABASE_URL could not be parsed as a connection string.\n\n' +
      'Expected shape:\n' +
      '  postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres\n\n' +
      'Copy it from the Supabase dashboard -> Connect -> Direct connection, and\n' +
      'make sure the whole line is present — a copy that stops after the password\n' +
      'is the usual cause. Special characters in the password are handled here, so\n' +
      'paste it exactly as shown.',
  );
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  // Supabase terminates TLS with a certificate this client has no CA bundle for.
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  console.log('connected');

  await client.query(`
    create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  const { rows } = await client.query('select name from schema_migrations');
  const applied = new Set(rows.map((r) => r.name));

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let ran = 0;
  for (const file of files) {
    const isForced = forced.includes(file);
    if (applied.has(file) && !isForced) {
      console.log(`  skip  ${file} (already applied)`);
      continue;
    }

    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    process.stdout.write(`  apply ${file} ... `);
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query(
        `insert into schema_migrations (name) values ($1)
         on conflict (name) do update set applied_at = now()`,
        [file],
      );
      await client.query('commit');
      console.log('ok');
      ran += 1;
    } catch (err) {
      await client.query('rollback');
      console.log('FAILED');
      console.error(`\n${file} failed and was rolled back:\n  ${err.message}`);
      if (err.position) {
        const upto = sql.slice(0, Number(err.position));
        console.error(`  at line ${upto.split('\n').length}`);
      }
      process.exit(1);
    }
  }

  console.log(`\n${ran} migration(s) applied, ${files.length - ran} already current.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => client.end());
