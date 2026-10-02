#!/usr/bin/env node
/**
 * Enforces the retention policy (rec #12). Deletes meeting-audio recordings
 * (Storage object + row) older than app_settings.retention_days. Transcripts
 * and minutes are governance records and are kept unless --include-transcripts
 * is passed.
 *
 *   node --env-file=.env.local scripts/purge-retention.mjs
 *   node --env-file=.env.local scripts/purge-retention.mjs --include-transcripts
 *   node --env-file=.env.local scripts/purge-retention.mjs --dry-run
 *
 * Intended to run on a schedule (cron / Supabase scheduled function).
 */
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey || !process.env.DATABASE_URL) {
  console.error('Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and DATABASE_URL in .env.local.');
  process.exit(1);
}
const DRY = process.argv.includes('--dry-run');
const INCLUDE_TRANSCRIPTS = process.argv.includes('--include-transcripts');

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', prepare: false, max: 1, idle_timeout: 5 });

async function main() {
  const row = (await sql`select retention_days from public.app_settings limit 1`)[0];
  const days = row?.retention_days ?? 365;
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  console.log(`Retention: ${days} days → deleting audio created before ${cutoff}${DRY ? ' (dry run)' : ''}`);

  const olds = await sql`select id, storage_path from public.audio_recordings where created_at < ${cutoff}`;
  console.log(`  audio recordings past retention: ${olds.length}`);
  if (!DRY && olds.length) {
    const paths = olds.map((o) => o.storage_path).filter(Boolean);
    if (paths.length) {
      const { error } = await admin.storage.from('meeting-audio').remove(paths);
      if (error) console.warn('  storage remove warning:', error.message);
    }
    await sql`delete from public.audio_recordings where created_at < ${cutoff}`;
    console.log(`  deleted ${olds.length} recordings + ${paths.length} objects`);
  }

  if (INCLUDE_TRANSCRIPTS) {
    const t = await sql`select count(*)::int as n from public.transcripts where created_at < ${cutoff}`;
    console.log(`  transcripts past retention: ${t[0].n}`);
    if (!DRY && t[0].n) {
      await sql`delete from public.transcripts where created_at < ${cutoff}`;
      console.log(`  deleted ${t[0].n} transcripts`);
    }
  } else {
    console.log('  transcripts/minutes kept (governance records). Pass --include-transcripts to purge them too.');
  }
}

main()
  .then(() => sql.end())
  .then(() => { console.log('Done.'); process.exit(0); })
  .catch(async (e) => { console.error('Purge failed:', e.message); await sql.end().catch(() => {}); process.exit(1); });
