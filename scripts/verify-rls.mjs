#!/usr/bin/env node
/**
 * Verifies the RLS boundary from the client side.
 *
 *   node --env-file=.env.local scripts/verify-rls.mjs
 *
 * Signs in as each demo account with the *publishable* key — the same key the
 * browser uses — so every query runs under that user's policies. A UI that hides
 * a control proves nothing; this proves the database refuses.
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !anon) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  process.exit(1);
}

const ACCOUNTS = {
  admin: ['admin@zppsu.edu.ph', 'admin123'],
  head: ['president@zppsu.edu.ph', 'head123'],
  secretary: ['secretary@zppsu.edu.ph', 'sec123'],
  faculty: ['faculty@zppsu.edu.ph', 'fac123'],
  cetFaculty: ['lreyes@zppsu.edu.ph', 'fac123'],
};

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
  const ok = typeof expected === 'function' ? expected(actual) : actual === expected;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  (got ${JSON.stringify(actual)})`}`);
  ok ? (pass += 1) : (fail += 1);
  return ok;
}

async function signIn(role) {
  const [email, password] = ACCOUNTS[role];
  const client = createClient(url, anon, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign in as ${role} (${email}): ${error.message}`);
  return client;
}

async function main() {
  console.log('=== sign in ===');
  const c = {};
  for (const role of Object.keys(ACCOUNTS)) {
    c[role] = await signIn(role);
    console.log(`  ok    ${role} (${ACCOUNTS[role][0]})`);
  }

  // -------------------------------------------------------------------------
  console.log('\n=== meetings visibility (scopeMeetings) ===');

  const titles = async (client) => {
    const { data, error } = await client.from('meetings').select('title, meeting_type');
    if (error) throw new Error(`meetings select: ${error.message}`);
    return data.map((m) => m.title);
  };

  const adminSees = await titles(c.admin);
  check('admin sees all 10 meetings', adminSees.length, 10);

  const headSees = await titles(c.head);
  check('CICS head sees only CICS (8)', headSees.length, 8);
  check(
    'CICS head cannot see the CET strategic planning meeting',
    headSees.some((t) => t.includes('CET Strategic')),
    false,
  );
  check(
    'CICS head cannot see the OAA accreditation briefing',
    headSees.some((t) => t.includes('Accreditation Briefing')),
    false,
  );

  const secSees = await titles(c.secretary);
  check(
    'CICS secretary also sees the OAA meeting they minute',
    secSees.some((t) => t.includes('Accreditation Briefing')),
    true,
  );
  check(
    'CICS secretary still cannot see the CET meeting',
    secSees.some((t) => t.includes('CET Strategic')),
    false,
  );

  const facSees = await titles(c.faculty);
  check('CICS faculty sees CICS meetings', facSees.length > 0, true);
  check(
    'CICS faculty cannot see the CET meeting',
    facSees.some((t) => t.includes('CET Strategic')),
    false,
  );

  const cetSees = await titles(c.cetFaculty);
  check(
    'CET faculty sees the CET meeting',
    cetSees.some((t) => t.includes('CET Strategic')),
    true,
  );
  check(
    'CET faculty cannot see CICS capstone defences',
    cetSees.some((t) => t.includes('Capstone')),
    false,
  );

  // -------------------------------------------------------------------------
  console.log('\n=== derived documents follow the meeting ===');

  const countOf = async (client, table) => {
    const { data, error } = await client.from(table).select('id');
    if (error) throw new Error(`${table}: ${error.message}`);
    return data.length;
  };

  check('admin sees 5 transcripts', await countOf(c.admin, 'transcripts'), 5);
  check(
    'CET faculty sees 0 transcripts (all belong to CICS meetings)',
    await countOf(c.cetFaculty, 'transcripts'),
    0,
  );
  check('admin sees 5 minutes', await countOf(c.admin, 'minutes'), 5);
  check('CET faculty sees 0 minutes', await countOf(c.cetFaculty, 'minutes'), 0);

  // -------------------------------------------------------------------------
  console.log('\n=== tasks (scopeTasks) ===');

  check('admin sees all 8 tasks', await countOf(c.admin, 'tasks'), 8);
  const { data: facTasks } = await c.faculty.from('tasks').select('title, assignee_id');
  check('faculty sees only their own tasks', facTasks.length > 0 && facTasks.length < 8, true);

  // -------------------------------------------------------------------------
  console.log('\n=== audit log is admin-only and append-only ===');

  const { data: adminAudit, error: adminAuditErr } = await c.admin
    .from('audit_log')
    .select('action');
  check('admin can read the audit log', !adminAuditErr && adminAudit.length >= 6, true);

  const { data: facAudit } = await c.faculty.from('audit_log').select('action');
  check('faculty reads zero audit rows', facAudit?.length ?? 0, 0);

  const { error: forgeErr } = await c.faculty
    .from('audit_log')
    .insert({ action: 'forged', detail: 'should never land', user_name: 'Attacker' });
  check('faculty cannot insert a forged audit row', forgeErr !== null, true);

  const { error: notifErr } = await c.faculty
    .from('notifications')
    .insert({ user_id: '00000000-0000-0000-0000-000000000000', type: 'task', title: 'forged' });
  check('faculty cannot fabricate a notification', notifErr !== null, true);

  // -------------------------------------------------------------------------
  console.log('\n=== locked minutes are read-only ===');

  const { data: locked } = await c.admin
    .from('minutes')
    .select('id, document_title, locked_at, status')
    .not('locked_at', 'is', null)
    .limit(1)
    .single();
  check('a locked document exists in the seed', Boolean(locked), true);

  const { error: editLockedErr } = await c.secretary
    .from('minutes')
    .update({ call_to_order: 'tampered' })
    .eq('id', locked.id);
  const { data: afterEdit } = await c.admin
    .from('minutes')
    .select('call_to_order')
    .eq('id', locked.id)
    .single();
  check(
    'secretary edit of a locked document changes nothing',
    editLockedErr !== null || !afterEdit.call_to_order.includes('tampered'),
    true,
  );

  // -------------------------------------------------------------------------
  console.log('\n=== faculty cannot escalate their own role ===');

  /*
   * Must target the *signed-in* user. An earlier version of this used
   * .limit(1), which returned an arbitrary visible CICS profile — it happened to
   * pick the dean, so the assertion was testing "can faculty edit someone
   * else's row" (blocked) rather than the escalation that matters.
   */
  const { data: authUser } = await c.faculty.auth.getUser();
  const myId = authUser.user.id;

  const { error: selfPromoteErr } = await c.faculty
    .from('profiles')
    .update({ role: 'admin' })
    .eq('id', myId);
  const { data: meAfter } = await c.faculty.from('profiles').select('role').eq('id', myId).single();
  check('faculty cannot promote themselves to admin', meAfter.role, 'faculty');

  const { error: deptErr } = await c.faculty
    .from('profiles')
    .update({ department_id: null })
    .eq('id', myId);
  const { data: deptAfter } = await c.faculty
    .from('profiles')
    .select('department_id')
    .eq('id', myId)
    .single();
  check('faculty cannot move themselves out of their department', deptAfter.department_id !== null, true);

  // Editing your own name/position is the whole point of the profile page.
  const { error: nameErr } = await c.faculty
    .from('profiles')
    .update({ position: 'Associate Professor' })
    .eq('id', myId);
  check('faculty can still edit their own position', nameErr, null);

  void selfPromoteErr;
  void deptErr;

  // -------------------------------------------------------------------------
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error(`\nverification error: ${err.message}`);
  process.exit(1);
});
