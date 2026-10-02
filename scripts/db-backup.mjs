#!/usr/bin/env node
/**
 * Logical backup of the public schema, for use before applying migrations when
 * pg_dump is not installed.
 *
 *   node --env-file=.env.local scripts/db-backup.mjs
 *
 * Writes backups/<timestamp>/ (gitignored):
 *   data/<table>.json        every row of every public table
 *   functions.sql            CREATE OR REPLACE for every public function
 *   policies.json            pg_policies rows for public + storage
 *   triggers.sql             CREATE TRIGGER for every user trigger in public
 *   restore-functions.sql    functions.sql wrapped in a transaction — replaying
 *                            it restores the pre-migration function bodies
 *
 * Read-only: runs in a READ ONLY transaction.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { viaPoolerIfConfigured } from './lib/pg-connection.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(HERE, '..', 'backups', stamp);
mkdirSync(join(OUT, 'data'), { recursive: true });

const client = new pg.Client({
  connectionString: viaPoolerIfConfigured(process.env.DATABASE_URL),
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  await client.query('begin read only');

  const tables = (
    await client.query(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`,
    )
  ).rows.map((r) => r.table_name);

  let rowsTotal = 0;
  for (const t of tables) {
    const { rows } = await client.query(`select * from public."${t.replace(/"/g, '""')}"`);
    writeFileSync(join(OUT, 'data', `${t}.json`), JSON.stringify(rows, null, 2));
    rowsTotal += rows.length;
  }

  const fns = (
    await client.query(
      `select p.proname, pg_get_functiondef(p.oid) as def
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prokind = 'f'
       order by p.proname`,
    )
  ).rows;
  const functionsSql = fns.map((f) => `${f.def.trim()};\n`).join('\n');
  writeFileSync(join(OUT, 'functions.sql'), functionsSql);
  writeFileSync(
    join(OUT, 'restore-functions.sql'),
    `-- Restores every public function body as it was at ${stamp}.\n` +
      `-- Functions ADDED later are not dropped; drop them explicitly if needed.\n` +
      `begin;\n\n${functionsSql}\ncommit;\n`,
  );

  const policies = (
    await client.query(`select * from pg_policies where schemaname in ('public', 'storage') order by schemaname, tablename, policyname`)
  ).rows;
  writeFileSync(join(OUT, 'policies.json'), JSON.stringify(policies, null, 2));

  const triggers = (
    await client.query(
      `select pg_get_triggerdef(t.oid) as def
       from pg_trigger t
       join pg_class c on c.oid = t.tgrelid
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and not t.tgisinternal
       order by c.relname, t.tgname`,
    )
  ).rows;
  writeFileSync(join(OUT, 'triggers.sql'), triggers.map((t) => `${t.def};`).join('\n') + '\n');

  await client.query('rollback');
  await client.end();
  console.log(
    `backup written to ${OUT}\n  ${tables.length} tables, ${rowsTotal} rows, ${fns.length} functions, ` +
      `${policies.length} policies, ${triggers.length} triggers`,
  );
}

main().catch(async (err) => {
  console.error(`backup failed: ${err.message}`);
  await client.end().catch(() => {});
  process.exit(1);
});
