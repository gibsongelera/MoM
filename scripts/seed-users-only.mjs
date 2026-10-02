#!/usr/bin/env node
/**
 * Creates the four role accounts and nothing else.
 *
 *   node --env-file=.env.local scripts/seed-users-only.mjs
 *
 * scripts/seed-demo.mjs fills the database with 14 accounts and a whole term's
 * worth of meetings, transcripts, minutes and tasks. That is the wrong starting
 * point for a live demo or a defence, where every record on screen should be one
 * you just created in the app. This script gives you the minimum needed to sign
 * in as each role — auth users, their profiles, and the two department head
 * pointers — and touches no content table at all.
 *
 * Deliberately never writes to: meetings, meeting_participants, audio_recordings,
 * transcripts, minutes, tasks, personal_meetings, notifications, audit_log,
 * app_settings. Departments and app_settings already exist from migration
 * 0005_reference_data.sql.
 *
 * Runs with the service-role key, so it bypasses RLS and can create auth users —
 * never import anything from here into the app.
 *
 * Accounts are created with email_confirm: true. The @zppsu.edu.ph addresses do
 * not receive mail, so a confirmation link would strand every login.
 *
 * Idempotent: existing accounts are reused and their password, metadata and
 * profile row are re-synced with this file.
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n' +
      'The service-role key is in the Supabase dashboard under\n' +
      'Project Settings -> API Keys -> service_role. Put it in .env.local.',
  );
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } });

// ---------------------------------------------------------------------------
// Accounts. Passwords match the chips on the login page.
// ---------------------------------------------------------------------------
const USERS = [
  { key: 'admin',     email: 'admin@zppsu.edu.ph',     password: 'admin123', name: 'Dr. Elena Dominguez', role: 'admin',     dept: 'ICT',  position: 'System Administrator',     joined: '2023-08-10' },
  { key: 'head',      email: 'president@zppsu.edu.ph', password: 'head123',  name: 'Engr. Ricardo Gomez', role: 'head',      dept: 'CICS', position: 'College Dean (CICS)',      joined: '2022-06-01' },
  { key: 'secretary', email: 'secretary@zppsu.edu.ph', password: 'sec123',   name: 'Sarah Torres',        role: 'secretary', dept: 'CICS', position: 'Faculty Secretary (CICS)', joined: '2024-01-15' },
  { key: 'faculty',   email: 'faculty@zppsu.edu.ph',   password: 'fac123',   name: 'Prof. Juan Dela Cruz', role: 'faculty',  dept: 'CICS', position: 'Associate Professor',      joined: '2023-09-01' },
];

/** Department short code -> the account that heads it. */
const DEPARTMENT_HEADS = [
  ['CICS', 'head'],
  ['ICT', 'admin'],
];

/** Tables that must stay empty for a clean demo. */
const CONTENT_TABLES = ['meetings', 'transcripts', 'minutes', 'tasks'];

const dept = {};
const user = {};

// ---------------------------------------------------------------------------
async function loadDepartments() {
  const { data, error } = await db.from('departments').select('id, short');
  if (error) throw error;
  if (!data.length) {
    throw new Error(
      'No departments found. Apply the migrations first:\n' +
        '  npm run db:push\n' +
        'or paste supabase/SCHEMA_PASTE.sql into the Supabase SQL editor.',
    );
  }
  data.forEach((d) => (dept[d.short] = d.id));

  // Fail here rather than writing a profile with a null department: the
  // department drives RLS scoping, so a silently unscoped account is worse than
  // a stopped script.
  const missing = [...new Set(USERS.map((u) => u.dept))].filter((s) => !dept[s]);
  if (missing.length) {
    throw new Error(
      `Departments missing from the database: ${missing.join(', ')}.\n` +
        'They come from 0005_reference_data.sql — re-run the migrations.',
    );
  }

  console.log(`departments: ${data.length}`);
}

async function findExistingUser(email) {
  // listUsers has no email filter, so page until we find it.
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function seedUsers() {
  for (const u of USERS) {
    const metadata = {
      name: u.name,
      role: u.role,
      department_id: u.dept, // the handle_new_user trigger resolves short codes
      position: u.position,
      active: true,
    };

    let account = await findExistingUser(u.email);

    if (account) {
      // Keep the password and metadata in sync with this file on re-runs.
      const { data, error } = await db.auth.admin.updateUserById(account.id, {
        password: u.password,
        email_confirm: true,
        user_metadata: metadata,
      });
      if (error) throw new Error(`update ${u.email}: ${error.message}`);
      account = data.user;
      console.log(`  reuse  ${u.email}`);
    } else {
      const { data, error } = await db.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
        user_metadata: metadata,
      });
      if (error) throw new Error(`create ${u.email}: ${error.message}`);
      account = data.user;
      console.log(`  create ${u.email}`);
    }

    user[u.key] = account.id;

    // The trigger fires on INSERT only, so an existing profile needs the same
    // values written explicitly.
    const { error: pErr } = await db.from('profiles').upsert(
      {
        id: account.id,
        name: u.name,
        email: u.email,
        role: u.role,
        department_id: dept[u.dept],
        position: u.position,
        active: true,
        joined_at: u.joined,
      },
      { onConflict: 'id' },
    );
    if (pErr) throw new Error(`profile ${u.email}: ${pErr.message}`);
  }

  // Department heads, now that the profiles exist.
  for (const [short, key] of DEPARTMENT_HEADS) {
    const { error } = await db.from('departments').update({ head_id: user[key] }).eq('short', short);
    if (error) throw new Error(`department head ${short}: ${error.message}`);
  }

  console.log(`profiles: ${USERS.length}, department heads: ${DEPARTMENT_HEADS.length}`);
}

/**
 * Reports what is already in the content tables.
 *
 * Informational, never destructive — this script has no --reset. Rows here mean
 * a previous `npm run db:seed` (or real usage) left data behind, and a demo that
 * opens on somebody else's meetings is the exact thing this script exists to
 * avoid. Clear it with `npm run db:reset`, which wipes content and keeps
 * accounts.
 */
async function reportContentTables() {
  const counts = [];
  for (const table of CONTENT_TABLES) {
    const { count, error } = await db.from(table).select('id', { count: 'exact', head: true });
    if (error) throw new Error(`count ${table}: ${error.message}`);
    counts.push([table, count ?? 0]);
  }

  const dirty = counts.filter(([, n]) => n > 0);
  console.log(`\ncontent tables: ${counts.map(([t, n]) => `${t}=${n}`).join(', ')}`);

  if (dirty.length) {
    console.log(
      'note: the database is not empty. This script added no content, but\n' +
        '      leftover rows are present. `npm run db:reset` clears demo content\n' +
        '      while keeping accounts.',
    );
  } else {
    console.log('clean: no meetings, transcripts, minutes or tasks.');
  }
}

async function main() {
  await loadDepartments();
  await seedUsers();
  await reportContentTables();

  console.log('\nAccounts ready. Sign in with:');
  for (const u of USERS) {
    console.log(`  ${u.email.padEnd(24)} / ${u.password.padEnd(9)} (${u.role})`);
  }
}

main().catch((err) => {
  console.error(`\nSeed failed: ${err.message}`);
  process.exit(1);
});
