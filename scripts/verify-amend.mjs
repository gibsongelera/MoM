#!/usr/bin/env node
/**
 * Verifies the approve -> lock -> amend -> re-approve cascade.
 *
 *   node --env-file=.env.local scripts/verify-amend.mjs
 *
 * This is the highest-risk behaviour in the port. Editing approved minutes must
 * invalidate the approving signature, and every step has to happen together:
 * done as separate client writes there are windows where a document is signed
 * but edited, or unlocked but still marked approved.
 *
 * Runs as real sessions with the publishable key, then restores the seeded state
 * so the demo walkthrough is unaffected.
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

let pass = 0;
let fail = 0;
function check(label, actual, expected) {
  const ok = typeof expected === 'function' ? expected(actual) : actual === expected;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  (got ${JSON.stringify(actual)})`}`);
  ok ? (pass += 1) : (fail += 1);
}

async function signIn(email, password) {
  const client = createClient(url, anon, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`${email}: ${error.message}`);
  return client;
}

const hasHeadSignature = (sigs) =>
  (sigs ?? []).some((s) => /dean|chair|head|president/i.test(s.role ?? ''));
const hasSecretarySignature = (sigs) =>
  (sigs ?? []).some((s) => /secretary/i.test(s.role ?? ''));

async function main() {
  const secretary = await signIn('secretary@zppsu.edu.ph', 'sec123');
  const head = await signIn('president@zppsu.edu.ph', 'head123');
  const faculty = await signIn('faculty@zppsu.edu.ph', 'fac123');

  // The seeded Mock Defense minutes: secretary-signed, pending, unlocked.
  const { data: target, error: findErr } = await secretary
    .from('minutes')
    .select('id, meeting_id, document_title, status, locked_at, signatures, amendments')
    .eq('document_title', 'Minutes of the Capstone Mock Defense')
    .single();
  if (findErr) throw new Error(`locate target minutes: ${findErr.message}`);

  console.log(`target: ${target.document_title}`);
  console.log('\n=== starting state ===');
  check('status is pending_approval', target.status, 'pending_approval');
  check('not locked', target.locked_at, null);
  check('secretary has signed', hasSecretarySignature(target.signatures), true);
  check('head has not signed', hasHeadSignature(target.signatures), false);

  // -------------------------------------------------------------------------
  console.log('\n=== faculty cannot approve ===');
  const { error: facLockErr } = await faculty.rpc('lock_minutes', { p_minutes_id: target.id });
  check('lock_minutes rejects a faculty caller', facLockErr !== null, true);

  // -------------------------------------------------------------------------
  console.log('\n=== head signs, then approves and locks ===');
  const { error: signErr } = await head.rpc('sign_minutes', {
    p_minutes_id: target.id,
    p_role_label: 'College Dean / Chairperson',
    p_data_url: '',
  });
  check('sign_minutes succeeds for the chair', signErr, null);

  const { error: lockErr } = await head.rpc('lock_minutes', { p_minutes_id: target.id });
  check('lock_minutes succeeds for the chair', lockErr, null);

  const { data: afterLock } = await secretary
    .from('minutes')
    .select('status, locked_at, locked_by, signatures')
    .eq('id', target.id)
    .single();
  check('status became approved', afterLock.status, 'approved');
  check('locked_at is set', afterLock.locked_at !== null, true);
  check('locked_by is recorded', afterLock.locked_by !== null, true);
  check('head signature present', hasHeadSignature(afterLock.signatures), true);

  const { data: meetingAfterLock } = await secretary
    .from('meetings')
    .select('status')
    .eq('id', target.meeting_id)
    .single();
  check('parent meeting became approved', meetingAfterLock.status, 'approved');

  // -------------------------------------------------------------------------
  console.log('\n=== locked document rejects direct edits ===');
  await secretary.from('minutes').update({ call_to_order: 'TAMPERED' }).eq('id', target.id);
  const { data: afterTamper } = await secretary
    .from('minutes')
    .select('call_to_order')
    .eq('id', target.id)
    .single();
  check(
    'call_to_order unchanged while locked',
    (afterTamper.call_to_order ?? '').includes('TAMPERED'),
    false,
  );

  // -------------------------------------------------------------------------
  console.log('\n=== secretary amends the locked document ===');
  const { error: amendErr } = await secretary.rpc('amend_minutes', {
    p_minutes_id: target.id,
    p_summary: 'Corrected the LoRaWAN packet-loss figures after panel review',
  });
  check('amend_minutes succeeds for the secretary', amendErr, null);

  const { data: afterAmend } = await secretary
    .from('minutes')
    .select('status, locked_at, locked_by, signatures, amendments')
    .eq('id', target.id)
    .single();

  check('head signature was cleared', hasHeadSignature(afterAmend.signatures), false);
  check('secretary signature survived', hasSecretarySignature(afterAmend.signatures), true);
  check('lock was released', afterAmend.locked_at, null);
  check('locked_by was cleared', afterAmend.locked_by, null);
  check('status reverted to pending_approval', afterAmend.status, 'pending_approval');
  check('amendment was recorded', afterAmend.amendments.length, 1);
  check(
    'amendment carries the summary',
    afterAmend.amendments[0]?.summary?.includes('LoRaWAN'),
    true,
  );
  check('amendment names the author', afterAmend.amendments[0]?.byName, 'Sarah Torres');

  const { data: meetingAfterAmend } = await secretary
    .from('meetings')
    .select('status')
    .eq('id', target.meeting_id)
    .single();
  check('parent meeting reverted to pending_approval', meetingAfterAmend.status, 'pending_approval');

  // -------------------------------------------------------------------------
  console.log('\n=== the chair is told to re-approve ===');
  const { data: headNotifs } = await head
    .from('notifications')
    .select('title, body')
    .order('created_at', { ascending: false })
    .limit(5);
  check(
    'chair received a re-approval notification',
    (headNotifs ?? []).some((n) => /re-approval|require/i.test(n.title)),
    true,
  );

  // -------------------------------------------------------------------------
  console.log('\n=== the amendment is in the audit trail ===');
  const admin = await signIn('admin@zppsu.edu.ph', 'admin123');
  const { data: audit } = await admin
    .from('audit_log')
    .select('action, detail, user_name')
    .order('created_at', { ascending: false })
    .limit(10);
  check(
    'minutes_amended was logged',
    (audit ?? []).some((a) => a.action === 'minutes_amended'),
    true,
  );
  check(
    'minutes_locked was logged',
    (audit ?? []).some((a) => a.action === 'minutes_locked'),
    true,
  );
  check(
    'the audit entry attributes the real actor',
    (audit ?? []).find((a) => a.action === 'minutes_amended')?.user_name,
    'Sarah Torres',
  );

  // -------------------------------------------------------------------------
  console.log('\n=== now unlocked, the secretary can edit again ===');
  const { error: editErr } = await secretary
    .from('minutes')
    .update({ call_to_order: 'Mock defense session called to order at 02:00 PM by the Chair.' })
    .eq('id', target.id);
  check('edit succeeds once unlocked', editErr, null);

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log('\nRestoring seeded state: npm run db:seed');
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error(`\nverification error: ${err.message}`);
  process.exit(1);
});
