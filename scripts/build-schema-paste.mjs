#!/usr/bin/env node
/**
 * Regenerates supabase/SCHEMA_PASTE.sql from supabase/migrations/.
 *
 *   node scripts/build-schema-paste.mjs
 *
 * The bundle is for the case where scripts/db-push.mjs cannot be used — no
 * direct Postgres connection, dashboard-only access — and the schema has to go
 * in through the SQL editor instead.
 *
 * Generated rather than hand-maintained on purpose: a migration added later
 * appears in the bundle on the next run, instead of the bundle quietly
 * describing a schema the repo no longer has.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(HERE, '..', 'supabase', 'migrations');
const OUT_FILE = join(HERE, '..', 'supabase', 'SCHEMA_PASTE.sql');

const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();

if (files.length === 0) {
  console.error(`No .sql files found in ${MIGRATIONS_DIR}`);
  process.exit(1);
}

const RULE = `-- ${'='.repeat(74)}`;
const banner = (title) => `${RULE}\n-- ${title}\n${RULE}`;

const header = `${banner('SmartMin — complete schema, paste-ready')}
--
-- GENERATED FILE — do not edit by hand. Change the migration, then run:
--   node scripts/build-schema-paste.mjs
--
-- Contents (supabase/migrations/, concatenated in filename order):
${files.map((f) => `--   ${f}`).join('\n')}
--
-- Usage: paste this whole file into the Supabase SQL editor and run it once, on
-- a project where these objects do not exist yet. The editor sends the script as
-- a single multi-statement query, which Postgres runs as one implicit
-- transaction — a failure anywhere rolls the entire bundle back, so you never
-- end up with half a schema.
--
-- The final section records each file in schema_migrations. Without it, a later
-- 'npm run db:push' would try to replay 0001 and abort on "type already exists".
--
-- Accounts are NOT created here. Run 'npm run db:seed-users-only' afterwards.
`;

const body = files
  .map((file) => {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8').replace(/\s+$/, '');
    return `${banner(`BEGIN ${file}`)}\n\n${sql}\n\n${banner(`END ${file}`)}\n`;
  })
  .join('\n');

const bookkeeping = `${banner('Migration bookkeeping — keeps scripts/db-push.mjs in sync')}

create table if not exists schema_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);

insert into schema_migrations (name) values
${files.map((f) => `  ('${f}')`).join(',\n')}
on conflict (name) do nothing;
`;

const out = `${header}\n${body}\n${bookkeeping}`;
writeFileSync(OUT_FILE, out, 'utf8');

console.log(`supabase/SCHEMA_PASTE.sql written from ${files.length} migration(s):`);
files.forEach((f) => console.log(`  ${f}`));
