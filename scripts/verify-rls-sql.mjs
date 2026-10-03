#!/usr/bin/env node
/**
 * Verifies the database security rules by impersonating real users inside ONE
 * transaction that is always rolled back — nothing it does is ever committed,
 * so it is safe to run against the live demo database.
 *
 *   node --env-file=.env.local scripts/verify-rls-sql.mjs
 *   node --env-file=.env.local scripts/verify-rls-sql.mjs --with-pending
 *
 * --with-pending first applies every migration file not yet recorded in
 * schema_migrations (inside the same rolled-back transaction), so new SQL can
 * be tested against the real schema and data before `db:push` commits it.
 *
 * Impersonation: `set local role authenticated|anon` plus the request.jwt.claims
 * setting auth.uid() reads — the same mechanism PostgREST uses. Each case runs
 * in its own savepoint, so a failing case cannot poison the next one.
 *
 * Needs DATABASE_URL (and SUPABASE_POOLER_HOST if the direct host is
 * unreachable) in .env.local.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { viaPoolerIfConfigured } from './lib/pg-connection.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(HERE, '..', 'supabase', 'migrations');
const withPending = process.argv.includes('--with-pending');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set (see scripts/db-push.mjs for the expected shape).');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: viaPoolerIfConfigured(process.env.DATABASE_URL),
  ssl: { rejectUnauthorized: false },
});

const EMAILS = {
  admin: 'admin@zppsu.edu.ph',
  head: 'president@zppsu.edu.ph', // CICS head
  secretary: 'secretary@zppsu.edu.ph', // CICS secretary
  faculty: 'faculty@zppsu.edu.ph', // CICS faculty
  h2: 'amendoza@zppsu.edu.ph', // CET head
  s2: 'jluna@zppsu.edu.ph', // CET secretary
};

const results = [];
let seq = 0;

async function q(sql, params) {
  return client.query(sql, params);
}

/** Runs `fn` impersonating `who` (a key of EMAILS, 'anon', or null = migrator). */
async function as(who, fn) {
  if (who === null) return fn();
  if (who === 'anon') {
    await q(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
    await q(`select set_config('request.jwt.claim.sub', '', true)`);
    await q('set local role anon');
  } else {
    const sub = ids[who];
    if (!sub) throw new Error(`no demo user for "${who}" — run the seed first`);
    await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub, role: 'authenticated' })]);
    await q(`select set_config('request.jwt.claim.sub', $1, true)`, [sub]);
    await q('set local role authenticated');
  }
  // On error the transaction is aborted until the caller's savepoint rollback,
  // which also undoes SET LOCAL — so only reset on the success path, or the
  // reset itself would fail and mask the real error.
  const out = await fn();
  await q('reset role');
  await q(`select set_config('request.jwt.claims', '', true)`);
  await q(`select set_config('request.jwt.claim.sub', '', true)`);
  return out;
}

/**
 * A case passes when `fn` resolves (expect 'ok') or rejects (expect 'deny').
 * `fn` may also throw an Error('ASSERT: ...') to fail an 'ok' case on content.
 */
async function check(name, expect, fn) {
  const sp = `t${(seq += 1)}`;
  await q(`savepoint ${sp}`);
  let outcome;
  let detail = '';
  try {
    await fn();
    outcome = 'ok';
  } catch (err) {
    outcome = String(err.message).startsWith('ASSERT:') ? 'assert' : 'deny';
    detail = String(err.message).replace(/^ASSERT:\s*/, '').slice(0, 140);
  }
  await q(`rollback to savepoint ${sp}`);
  const pass = outcome === expect;
  results.push({ name, pass, expect, outcome, detail });
}

function assert(cond, message) {
  if (!cond) throw new Error(`ASSERT: ${message}`);
}

/** Creates a CICS meeting as the migrator (no actor, so no notifications). */
async function fixtureMeeting(extra = {}) {
  const { rows } = await q(
    `insert into meetings (title, starts_at, department_id, secretary_id, meeting_type, sub_type, guests, panel_members)
     values ($1, now() + interval '1 day', $2, $3, $4, $5, $6::jsonb, $7::jsonb)
     returning id, chair_id`,
    [
      extra.title ?? 'RLS probe meeting',
      ids.cics,
      ids.secretary,
      extra.meeting_type ?? 'regular',
      extra.sub_type ?? null,
      JSON.stringify(extra.guests ?? []),
      JSON.stringify(extra.panel_members ?? []),
    ],
  );
  return rows[0];
}

async function fixtureMinutes(meetingId) {
  const { rows } = await q(
    `insert into minutes (meeting_id, document_title, status) values ($1, 'RLS probe minutes', 'draft') returning id`,
    [meetingId],
  );
  return rows[0].id;
}

const ids = {};

async function main() {
  await client.connect();
  await q('begin');
  await q(`set local lock_timeout = '5s'`);
  await q(`set local statement_timeout = '60s'`);

  if (withPending) {
    const applied = new Set((await q('select name from schema_migrations')).rows.map((r) => r.name));
    const pending = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql') && !applied.has(f)).sort();
    for (const file of pending) {
      process.stdout.write(`  (dry-run) apply ${file} ... `);
      await q(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
      console.log('ok');
    }
    if (pending.length === 0) console.log('  no pending migrations');
  }

  for (const [key, email] of Object.entries(EMAILS)) {
    const { rows } = await q('select id from profiles where email = $1', [email]);
    ids[key] = rows[0]?.id;
  }
  ids.cics = (await q(`select id from departments where short = 'CICS'`)).rows[0]?.id;
  ids.cet = (await q(`select id from departments where short = 'CET'`)).rows[0]?.id;

  // --- Function privileges --------------------------------------------------
  await check('anon cannot call notify_user', 'deny', () =>
    as('anon', () => q(`select notify_user($1, 'x', 'spoof', 'spoof')`, [ids.faculty])));
  await check('signed-in users cannot call notify_user', 'deny', () =>
    as('faculty', () => q(`select notify_user($1, 'x', 'spoof', 'spoof')`, [ids.head])));
  await check('signed-in users cannot call log_audit', 'deny', () =>
    as('faculty', () => q(`select log_audit('forged', 'forged')`)));
  await check('anon cannot call lock_minutes', 'deny', () =>
    as('anon', () => q(`select lock_minutes(gen_random_uuid())`)));
  await check('anon can list departments for the register form', 'ok', () =>
    as('anon', async () => {
      const { rows } = await q('select * from list_departments_public()');
      assert(rows.length > 0, 'no departments returned');
    }));
  await check('schema_migrations is not readable by users', 'deny', () =>
    as('faculty', () => q('select * from schema_migrations')));

  // --- Sign-up and activation ---------------------------------------------
  await check('self-registration as admin lands as inactive faculty', 'ok', async () => {
    let newId;
    try {
      const { rows } = await q(
        `insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
         values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
                 'rls-probe-' || floor(random() * 1e9)::text || '@example.invalid',
                 '{"name":"Probe","role":"admin","active":true}'::jsonb)
         returning id`,
      );
      newId = rows[0].id;
    } catch (err) {
      throw new Error(`ASSERT: could not insert a probe auth user (${err.message})`);
    }
    const { rows } = await q('select role, active, requested_role from profiles where id = $1', [newId]);
    assert(rows[0]?.role === 'faculty', `role is ${rows[0]?.role}`);
    assert(rows[0]?.active === false, 'account is active');
    assert(rows[0]?.requested_role === 'admin', 'requested role not recorded');
  });
  await check('an inactive user sees no meetings', 'ok', async () => {
    await q('update profiles set active = false where id = $1', [ids.faculty]);
    await as('faculty', async () => {
      const { rows } = await q('select count(*)::int as n from meetings');
      assert(rows[0].n === 0, `inactive faculty sees ${rows[0].n} meetings`);
    });
  });
  await check('an inactive admin is not an admin', 'ok', async () => {
    await q('update profiles set active = false where id = $1', [ids.admin]);
    await as('admin', async () => {
      const { rows } = await q('select sm_is_admin() as a');
      assert(rows[0].a === false, 'inactive admin still resolves as admin');
    });
  });

  // --- Meetings -------------------------------------------------------------
  await check('secretary can create a meeting with RETURNING; chair defaults to the head', 'ok', () =>
    as('secretary', async () => {
      const { rows } = await q(
        `insert into meetings (title, starts_at, department_id, secretary_id)
         values ('RLS probe', now() + interval '1 day', sm_department(), auth.uid())
         returning id, chair_id`,
      );
      assert(rows[0]?.id, 'no row returned');
      assert(rows[0].chair_id === ids.head, `chair_id is ${rows[0].chair_id}, expected the CICS head`);
    }));
  await check('secretary cannot make themselves the approving chair', 'deny', () =>
    as('secretary', () =>
      q(`insert into meetings (title, starts_at, department_id, secretary_id, chair_id)
         values ('RLS probe', now(), sm_department(), auth.uid(), auth.uid())`)));
  await check('secretary cannot create an already-approved meeting', 'deny', () =>
    as('secretary', () =>
      q(`insert into meetings (title, starts_at, department_id, secretary_id, status)
         values ('RLS probe', now(), sm_department(), auth.uid(), 'approved')`)));
  await check('secretary cannot schedule into another department', 'deny', () =>
    as('secretary', () =>
      q(`insert into meetings (title, starts_at, department_id, secretary_id)
         values ('RLS probe', now(), $1, auth.uid())`, [ids.cet])));
  await check('a guest without a name is rejected', 'deny', () =>
    as('secretary', () =>
      q(`insert into meetings (title, starts_at, department_id, secretary_id, guests)
         values ('RLS probe', now(), sm_department(), auth.uid(), '[{"name":"  "}]')`)));
  await check('typed panel syncs linked accounts and makes them participants', 'ok', () =>
    as('secretary', async () => {
      const panel = [{ name: 'Engr. External Panelist', affiliation: 'WMSU' }, { name: 'Dr. Antonio Mendoza', userId: ids.h2 }];
      const { rows } = await q(
        `insert into meetings (title, starts_at, department_id, secretary_id, meeting_type, sub_type, panel_members, chairperson_name)
         values ('RLS probe defense', now() + interval '1 day', sm_department(), auth.uid(), 'capstone', 'Mock Defense', $1::jsonb, 'Dr. Typed Chair')
         returning id, panel_member_ids, chairperson_name`,
        [JSON.stringify(panel)],
      );
      assert(rows[0].panel_member_ids?.includes(ids.h2), 'linked panelist missing from panel_member_ids');
      assert(rows[0].chairperson_name === 'Dr. Typed Chair', 'typed chairperson not saved');
      const p = await q('select 1 from meeting_participants where meeting_id = $1 and user_id = $2', [rows[0].id, ids.h2]);
      assert(p.rowCount === 1, 'linked panelist was not added as a participant');
    }));
  await check('a head from another college can open a meeting they sit on', 'ok', async () => {
    const m = await fixtureMeeting();
    await as('h2', async () => {
      const before = await q('select 1 from meetings where id = $1', [m.id]);
      assert(before.rowCount === 0, 'visible before being added (control failed)');
    });
    await q('insert into meeting_participants (meeting_id, user_id) values ($1, $2)', [m.id, ids.h2]);
    await as('h2', async () => {
      const after = await q('select 1 from meetings where id = $1', [m.id]);
      assert(after.rowCount === 1, 'cross-college panelist cannot see the meeting');
    });
  });
  await check('adding a participant notifies them (with the meeting id)', 'ok', async () => {
    const m = await fixtureMeeting();
    await as('secretary', () => q('insert into meeting_participants (meeting_id, user_id) values ($1, $2)', [m.id, ids.faculty]));
    const { rows } = await q(`select type from notifications where user_id = $1 and meeting_id = $2`, [ids.faculty, m.id]);
    assert(rows.length === 1 && rows[0].type === 'meeting_invite', `got ${rows.length} notifications`);
  });

  // --- Minutes workflow -----------------------------------------------------
  await check('direct writes to minutes signatures are rejected', 'deny', async () => {
    const m = await fixtureMeeting();
    const minutesId = await fixtureMinutes(m.id);
    await as('secretary', () =>
      q(`update minutes set signatures = '[{"userId":"x","role":"Head"}]'::jsonb where id = $1`, [minutesId]));
  });
  await check('direct status change on minutes is rejected', 'deny', async () => {
    const m = await fixtureMeeting();
    const minutesId = await fixtureMinutes(m.id);
    await as('secretary', () => q(`update minutes set status = 'approved' where id = $1`, [minutesId]));
  });
  await check('a client insert of minutes is forced to an unsigned draft', 'ok', async () => {
    const m = await fixtureMeeting();
    await as('secretary', async () => {
      const { rows } = await q(
        `insert into minutes (meeting_id, document_title, status, signatures)
         values ($1, 'probe', 'approved', '[{"userId":"x"}]'::jsonb) returning status, signatures`,
        [m.id],
      );
      assert(rows[0].status === 'draft', `status ${rows[0].status}`);
      assert(Array.isArray(rows[0].signatures) && rows[0].signatures.length === 0, 'signatures kept');
    });
  });
  await check('body edits by the secretary still work', 'ok', async () => {
    const m = await fixtureMeeting();
    const minutesId = await fixtureMinutes(m.id);
    await as('secretary', async () => {
      const r = await q(`update minutes set call_to_order = 'Called to order at 9:00 AM.' where id = $1`, [minutesId]);
      assert(r.rowCount === 1, 'body update matched no rows');
    });
  });
  await check('a secretary signing as "Head" is recorded as the secretary', 'ok', async () => {
    const m = await fixtureMeeting();
    const minutesId = await fixtureMinutes(m.id);
    await as('secretary', async () => {
      const { rows } = await q(`select signatures from sign_minutes($1, 'Head', null)`, [minutesId]);
      const sig = rows[0].signatures.at(-1);
      assert(sig.kind === 'secretary' && sig.role === 'Faculty Secretary', `got ${sig.kind}/${sig.role}`);
    });
  });
  await check('the head approves (sign + lock in one call), and an amendment drops the approval', 'ok', async () => {
    const m = await fixtureMeeting();
    const minutesId = await fixtureMinutes(m.id);
    await as('head', async () => {
      const { rows } = await q(`select locked_at, signatures from approve_minutes($1, null)`, [minutesId]);
      assert(rows[0].locked_at, 'not locked after approval');
      assert(rows[0].signatures.some((s) => s.kind === 'approver'), 'no approver signature');
    });
    await as('secretary', async () => {
      const { rows } = await q(`select locked_at, signatures from amend_minutes($1, 'probe amend')`, [minutesId]);
      assert(rows[0].locked_at === null, 'still locked after amend');
      assert(!rows[0].signatures.some((s) => s.kind === 'approver'), 'approver signature survived the amendment');
    });
  });
  await check('a secretary cannot approve minutes', 'deny', async () => {
    const m = await fixtureMeeting();
    const minutesId = await fixtureMinutes(m.id);
    await as('secretary', () => q(`select approve_minutes($1, null)`, [minutesId]));
  });
  await check('signing locked minutes is refused', 'deny', async () => {
    const m = await fixtureMeeting();
    const minutesId = await fixtureMinutes(m.id);
    await as('head', () => q(`select approve_minutes($1, null)`, [minutesId]));
    await as('secretary', () => q(`select sign_minutes($1, 'x', null)`, [minutesId]));
  });

  // --- Attachments ----------------------------------------------------------
  await check('the meeting secretary can attach evidence', 'ok', async () => {
    const m = await fixtureMeeting();
    await as('secretary', () =>
      q(`insert into meeting_attachments (meeting_id, kind, storage_path, file_name, mime_type, size_bytes)
         values ($1, 'attendance_sheet', $2, 'probe.jpg', 'image/jpeg', 1024)`, [m.id, `${m.id}/probe.jpg`]));
  });
  await check('faculty cannot attach evidence', 'deny', async () => {
    const m = await fixtureMeeting();
    await as('faculty', () =>
      q(`insert into meeting_attachments (meeting_id, kind, storage_path, file_name, mime_type, size_bytes)
         values ($1, 'evidence', $2, 'f.jpg', 'image/jpeg', 1024)`, [m.id, `${m.id}/f.jpg`]));
  });
  await check("another college's secretary cannot attach to this meeting", 'deny', async () => {
    const m = await fixtureMeeting();
    await as('s2', () =>
      q(`insert into meeting_attachments (meeting_id, kind, storage_path, file_name, mime_type, size_bytes)
         values ($1, 'evidence', $2, 's.jpg', 'image/jpeg', 1024)`, [m.id, `${m.id}/s.jpg`]));
  });

  // --- Personal meetings and recordings (0018) ------------------------------
  await check('faculty can log a personal entry linked to a meeting they can see', 'ok', async () => {
    const m = await fixtureMeeting();
    await as('faculty', () =>
      q(`insert into personal_meetings (user_id, title, meeting_date, meeting_id)
         values (auth.uid(), 'My notes', current_date, $1)`, [m.id]));
  });
  await check("faculty cannot link another college's meeting", 'deny', async () => {
    const { rows } = await q(
      `insert into meetings (title, starts_at, department_id, secretary_id) values ('CET probe', now() + interval '1 day', $1, $2) returning id`,
      [ids.cet, ids.s2],
    );
    await as('faculty', () =>
      q(`insert into personal_meetings (user_id, title, meeting_date, meeting_id)
         values (auth.uid(), 'Snoop', current_date, $1)`, [rows[0].id]));
  });
  await check("a secretary cannot read a faculty member's personal log", 'ok', async () => {
    const { rows: own } = await q(
      `insert into personal_meetings (user_id, title, meeting_date) values ($1, 'Private', current_date) returning id`,
      [ids.faculty],
    );
    await as('secretary', async () => {
      const { rows } = await q('select id from personal_meetings where id = $1', [own[0].id]);
      assert(rows.length === 0, 'secretary could read it');
    });
  });
  await check('faculty can store audio in their own personal-audio folder', 'ok', () =>
    as('faculty', () =>
      q(`insert into storage.objects (bucket_id, name) values ('personal-audio', $1)`, [`${ids.faculty}/probe/rec.webm`])));
  await check("faculty cannot store audio in someone else's folder", 'deny', () =>
    as('faculty', () =>
      q(`insert into storage.objects (bucket_id, name) values ('personal-audio', $1)`, [`${ids.secretary}/probe/rec.webm`])));

  // --- People search --------------------------------------------------------
  await check('faculty get no results from people search', 'ok', () =>
    as('faculty', async () => {
      const { rows } = await q(`select * from search_people('ma', 10)`);
      assert(rows.length === 0, `faculty got ${rows.length} rows`);
    }));
  await check('a secretary can search people across colleges', 'ok', () =>
    as('secretary', async () => {
      const { rows } = await q(`select * from search_people('mendoza', 10)`);
      assert(rows.some((r) => r.id === ids.h2), 'CET head not found');
    }));

  // --- Existing behaviour still holds ---------------------------------------
  await check('secretary still sees their department meetings', 'ok', () =>
    as('secretary', async () => {
      const { rows } = await q('select count(*)::int as n from meetings where department_id = sm_department()');
      assert(rows[0].n > 0, 'no department meetings visible');
    }));
  await check('faculty still see their department meetings', 'ok', () =>
    as('faculty', async () => {
      const { rows } = await q('select count(*)::int as n from meetings');
      assert(rows[0].n > 0, 'no meetings visible');
    }));

  await q('rollback');
  await client.end();

  const width = Math.max(...results.map((r) => r.name.length));
  for (const r of results) {
    const tag = r.pass ? 'PASS' : 'FAIL';
    const why = r.pass ? '' : `  (expected ${r.expect}, got ${r.outcome}${r.detail ? `: ${r.detail}` : ''})`;
    console.log(`${tag}  ${r.name.padEnd(width)}${why}`);
  }
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed — everything was rolled back.`);
  process.exit(failed ? 1 : 0);
}

main().catch(async (err) => {
  console.error(`\nverify-rls-sql aborted: ${err.message}`);
  try {
    await q('rollback');
  } catch {
    /* connection may already be gone */
  }
  await client.end().catch(() => {});
  process.exit(1);
});
