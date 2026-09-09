// Isolated PostgreSQL (PGlite) only. Never connects to Supabase or reads .env files.
// npm install --prefix .temp/pr24-validation --no-save --package-lock=false @electric-sql/pglite@0.3.14
// node scripts/test-operator-ux-db.mjs
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '../.temp/pr24-validation/node_modules/@electric-sql/pglite/dist/index.js';

const db = new PGlite();
let stage = 'platform bootstrap';
let passed = 0;
const ids = Object.fromEntries(['operator', 'staffAuth', 'otherStaffAuth', 'authA', 'authB', 'a', 'b'].map(k => [k, randomUUID()]));
const check = (value, label) => { assert.ok(value, label); passed++; };
const query = async (sql, args = []) => (await db.query(sql, args)).rows;
const scalar = async (sql, args = []) => Object.values((await query(sql, args))[0])[0];
const claims = async (role, id) => {
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: id, role: 'authenticated', app_metadata: { role } })]);
};
const blocked = async (fn, code, label) => {
  const expectedCodes = Array.isArray(code) ? code : [code];
  try { await fn(); } catch (error) { check(expectedCodes.includes(error.code), `${label}: unexpected SQLSTATE ${error.code}`); return; }
  assert.fail(`${label}: unexpectedly succeeded`);
};
const save = (id, category, programs = [], title = 'fixture schedule', status = 'draft', day = '2096-02-02') => scalar(
  'select public.save_lesson_with_assignments($1,$2,$3,$4,$5,$6,$7,$8::uuid[],$9)',
  [id, title, `${day} 10:00+09`, `${day} 11:00+09`, '', '', status, programs, category],
);

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create schema extensions;
    create table auth.users(id uuid primary key, raw_app_meta_data jsonb, created_at timestamptz default now());
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    grant usage on schema auth to authenticated, anon;
    create function public.rls_auto_enable() returns event_trigger language plpgsql security definer set search_path = pg_catalog as $$ begin end; $$;
    alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
  `);
  for (const [id, role] of [[ids.operator, 'operator'], [ids.authA, 'student'], [ids.authB, 'student']]) {
    await db.query('insert into auth.users(id, raw_app_meta_data) values ($1,$2)', [id, JSON.stringify({ role })]);
  }
  const migrationDir = new URL('../supabase/migrations/', import.meta.url);
  const files = (await readdir(migrationDir)).filter(f => f.endsWith('.sql')).sort();
  let legacy;
  let monthly;
  for (const file of files) {
    stage = `migration ${file.slice(0, 14)}`;
    if (file.startsWith('20260826090000')) {
      await claims('operator', ids.operator);
      for (const [id, auth, name] of [[ids.a, ids.authA, 'fixture-a'], [ids.b, ids.authB, 'fixture-b']]) {
        await db.query('insert into public.students(id,auth_user_id,nickname) values ($1,$2,$3)', [id, auth, name]);
      }
      monthly = await scalar("insert into public.student_programs(student_id,program_type,status,started_at) values ($1,'weekday_vocal','active','2026-01-01') returning id", [ids.a]);
      await db.query("insert into public.student_programs(student_id,program_type,status,started_at) values ($1,'rental','active','2026-01-01')", [ids.b]);
    }
    if (file.startsWith('20260902020000')) {
      await claims('operator', ids.operator);
      await scalar("select public.configure_rental_program_allowance(id,10) from public.student_programs where program_type='rental'");
    }
    if (file.startsWith('20260904030000')) {
      legacy = await scalar("select public.save_lesson_with_assignments(null,'legacy','2096-02-02 10:00+09','2096-02-02 11:00+09','','','draft','{}'::uuid[])");
    }
    await db.exec(await readFile(new URL(file, migrationDir), 'utf8'));
  }
  check(files.length === 34, 'all 34 append-only migrations loaded');
  stage = 'staff operator account bootstrap';
  await claims('operator', ids.operator);
  await db.query('insert into auth.users(id, raw_app_meta_data) values ($1,$2),($3,$2)', [ids.staffAuth, JSON.stringify({ role: 'operator' }), ids.otherStaffAuth]);
  const staffId = await scalar("select public.create_staff_with_operator_account('fixture staff','vocal_trainer',$1,'staff_one')", [ids.staffAuth]);
  const otherStaffId = await scalar("select public.create_staff_with_operator_account('other staff','manager',$1,'staff_two')", [ids.otherStaffAuth]);
  check(await scalar("select public.get_my_operator_context()->>'accessLevel'") === 'owner', 'existing operator is bootstrapped as owner');
  stage = 'category and assignment regression';
  await claims('operator', ids.operator);
  await db.exec('set role authenticated');
  check(await scalar('select schedule_category is null from public.lessons where id=$1', [legacy]), 'existing lesson remains unclassified');
  await save(legacy, null, [], 'edited legacy');
  check(await scalar('select title from public.lessons where id=$1', [legacy]) === 'edited legacy', 'unclassified metadata editable');
  check(Boolean(await scalar("select public.save_lesson_with_assignments($1,'legacy RPC edit','2096-02-02 10:00+09','2096-02-02 11:00+09','','','draft','{}'::uuid[])", [legacy])), 'legacy Vercel lesson update remains callable');
  check(await scalar('select schedule_category is null from public.lessons where id=$1', [legacy]), 'legacy update preserves unclassified category');
  await blocked(() => scalar("select public.save_lesson_with_assignments(null,'legacy create','2096-02-20 10:00+09','2096-02-20 11:00+09','','','draft','{}'::uuid[])", []), '23514', 'legacy Vercel cannot create an unclassified lesson');
  await blocked(() => save(null, null), '23514', 'new category required');
  await blocked(() => save(null, 'weekday_vocal'), '23514', 'program type is not a category');
  const lesson = await save(null, 'weekend', [monthly], 'fixture schedule', 'scheduled', '2096-02-03');
  const source = await save(null, 'trial', [monthly], 'makeup source', 'scheduled', '2026-02-01');
  await db.query("insert into public.attendance_records(lesson_id,student_id,status) values ($1,$2,'excused')", [source, ids.a]);
  const makeup = await scalar('select id from public.makeup_lessons where original_lesson_id=$1', [source]);
  const replacement = await save(null, 'weekend', [], 'replacement', 'draft', '2096-02-04');
  await scalar('select public.schedule_makeup_lesson($1,$2)', [makeup, replacement]);
  const snapshot = async () => scalar(`select jsonb_build_object(
    'assignments',(select jsonb_agg(to_jsonb(a)) from public.lesson_assignments a),
    'attendance',(select jsonb_agg(to_jsonb(a)) from public.attendance_records a),
    'makeups',(select jsonb_agg(to_jsonb(m)) from public.makeup_lessons m),
    'allowances',(select jsonb_agg(to_jsonb(s)) from public.student_program_allowance_statuses s),
    'programs',(select jsonb_agg(to_jsonb(p)) from public.student_programs p))`);
  const before = await snapshot();
  await save(lesson, 'trial', [monthly], 'fixture schedule', 'scheduled', '2096-02-03');
  await save(source, 'weekend', [monthly], 'makeup source', 'scheduled', '2026-02-01');
  await save(replacement, 'trial', [monthly], 'replacement', 'draft', '2096-02-04');
  assert.deepEqual(await snapshot(), before);
  passed++;
  check(await scalar('select schedule_category from public.lessons where id=$1', [lesson]) === 'trial', 'category changed independently of weekday allowance');
  await blocked(() => save(null, 'weekday', [monthly], 'overlap', 'draft', '2096-02-03'), '23P01', 'overlap guard retained');

  await blocked(() => scalar('select public.cancel_lesson($1)', [replacement]), 'P0001', 'linked Draft cancellation cannot bypass makeup protection');
  await blocked(() => db.query('delete from public.lessons where id=$1', [replacement]), 'P0001', 'linked Draft delete guard retained');
  const emptyDraft = await save(null, 'weekday', [], 'empty Draft', 'draft', '2096-02-05');
  check(await scalar('delete from public.lessons where id=$1 returning true', [emptyDraft]), 'empty Draft remains deletable');
  const cancellable = await save(null, 'trial', [], 'cancel fixture', 'scheduled', '2096-02-06');
  await scalar('select public.cancel_lesson($1)', [cancellable]);
  check(await scalar('select status from public.lessons where id=$1', [cancellable]) === 'cancelled', 'confirmed cancellation retained');

  for (let day = 7; day <= 9; day++) await save(null, 'trial', [monthly], 'quota fixture', 'scheduled', '2096-02-0' + day);
  await blocked(() => save(null, 'weekend', [monthly], 'over quota', 'scheduled', '2096-02-10'), '23514', 'category never bypasses ordinary quota');

  stage = 'PR26 makeup completion policy';
  const manualSource = await save(null, 'trial', [monthly], 'manual completion source', 'scheduled', '2026-02-15');
  await db.query("insert into public.attendance_records(lesson_id,student_id,status) values ($1,$2,'excused')", [manualSource, ids.a]);
  const manualMakeup = await scalar('select id from public.makeup_lessons where original_lesson_id=$1', [manualSource]);
  const assignmentCountBeforeManual = await scalar('select count(*)::int from public.lesson_assignments');
  const adjustmentCountBeforeManual = await scalar('select count(*)::int from public.student_program_allowance_adjustments');
  check(await scalar("select public.complete_makeup_without_schedule($1,'manual close')", [manualMakeup]) === manualMakeup, 'manual completion keeps the makeup row id');
  check(await scalar(`select status='completed'
    and completion_method='manual_without_schedule'
    and completed_by=$2
    and completed_at is not null
    and completion_note='manual close'
    and replacement_lesson_id is null
    and replacement_attendance_record_id is null
    and replacement_assignment_provenance is null
    from public.makeup_lessons where id=$1`, [manualMakeup, ids.operator]), 'manual completion has no replacement records');
  check(await scalar(`select count(*)::int=1 from public.makeup_lesson_events
    where makeup_lesson_id=$1 and event_type='completed'
      and completion_method='manual_without_schedule'
      and completion_note='manual close' and actor_user_id=$2`, [manualMakeup, ids.operator]), 'manual completion metadata is appended to history');
  check(await scalar('select public.restore_manual_makeup_completion($1)', [manualMakeup]) === manualMakeup, 'manual restore keeps the makeup row id');
  check(await scalar(`select status='requested'
    and completion_method is null and completed_by is null
    and completed_at is null and completion_note is null
    from public.makeup_lessons where id=$1`, [manualMakeup]), 'manual restore clears only current completion fields');
  check(await scalar(`select count(*)::int=1 from public.makeup_lesson_events
    where makeup_lesson_id=$1 and event_type='reopened'
      and from_status='completed' and to_status='requested'
      and completion_method='manual_without_schedule'
      and completion_note='manual close' and actor_user_id=$2`, [manualMakeup, ids.operator]), 'manual restore preserves prior completion metadata in a new event row');
  check(await scalar('select count(*)::int from public.makeup_lessons where id=$1', [manualMakeup]) === 1, 'manual restore creates no duplicate makeup row');
  check(await scalar('select count(*)::int from public.lesson_assignments') === assignmentCountBeforeManual, 'manual completion and restore create no assignment');
  check(await scalar('select count(*)::int from public.student_program_allowance_adjustments') === adjustmentCountBeforeManual, 'manual completion and restore create no allowance adjustment');

  const automaticReplacement = await save(null, 'weekend', [], 'automatic replacement', 'scheduled', '2096-02-11');
  await scalar('select public.schedule_makeup_lesson($1,$2)', [manualMakeup, automaticReplacement]);
  const automaticAttendance = await scalar("insert into public.attendance_records(lesson_id,student_id,status) values ($1,$2,'present') returning id", [automaticReplacement, ids.a]);
  check(await scalar(`select status='completed'
    and completion_method='replacement_attendance'
    and replacement_lesson_id=$2 and replacement_attendance_record_id=$3
    and completed_by is null and completed_at is null and completion_note is null
    from public.makeup_lessons where id=$1`, [manualMakeup, automaticReplacement, automaticAttendance]), 'replacement attendance completes through the existing completed status');
  await blocked(() => scalar('select public.restore_manual_makeup_completion($1)', [manualMakeup]), 'P0002', 'automatic completion cannot be manually restored');
  check(await scalar('select count(*)::int from public.attendance_records where id=$1', [automaticAttendance]) === 1, 'failed automatic restore preserves replacement attendance');
  check(await scalar(`select count(*)::int=1 from public.makeup_lesson_events
    where makeup_lesson_id=$1 and event_type='completed'
      and completion_method='replacement_attendance' and completion_note is null`, [manualMakeup]), 'automatic completion path is appended to history');

  stage = 'independent profile/program transactions';
  const profileArgs = [ids.a, 'fixture-renamed', null, 25, null, null, null, 'profile note'];
  const profileSave = () => scalar('select public.save_student_profile($1,$2,$3,$4,$5,$6,$7,$8)', profileArgs);
  const programsSave = changes => scalar('select public.save_student_programs($1,$2)', [ids.a, JSON.stringify(changes)]);
  const programsBefore = await scalar('select jsonb_agg(to_jsonb(p)) from public.student_programs p');
  check(await scalar("select has_function_privilege('authenticated','public.save_student_profile_and_programs(uuid,text,text,integer,text,text,date,text,jsonb)','EXECUTE')"), 'legacy integrated student RPC remains callable during rollout');
  await profileSave();
  assert.deepEqual(await scalar('select jsonb_agg(to_jsonb(p)) from public.student_programs p'), programsBefore); passed++;
  const profileBefore = await scalar('select to_jsonb(s) from public.students s where id=$1', [ids.a]);
  await programsSave({ start: [{ programType: 'trial', startedAt: '2026-01-01' }] });
  assert.deepEqual(await scalar('select to_jsonb(s) from public.students s where id=$1', [ids.a]), profileBefore); passed++;
  const trial = await scalar("select id from public.student_programs where student_id=$1 and program_type='trial' and status='active'", [ids.a]);
  await blocked(() => programsSave({ stop: [{ id: trial, endedAt: '2026-09-04' }], start: [{ programType: 'weekday_vocal', startedAt: '2026-09-04' }] }), '23505', 'duplicate start rolls back entire bundle');
  check(await scalar('select status from public.student_programs where id=$1', [trial]) === 'active', 'failed bundle kept trial active');
  await blocked(() => programsSave({ stop: [{ id: monthly, endedAt: '2026-09-04' }] }), '23514', 'future assignment stop protection');
  await programsSave({ stop: [{ id: trial, endedAt: '2026-09-04', stopReason: 'break' }] });
  await programsSave({ reasonUpdates: [{ id: trial, stopReason: 'ended' }], start: [{ programType: 'trial', startedAt: '2026-09-05' }] });
  check(await scalar("select count(*)::int from public.student_programs where student_id=$1 and program_type='trial'", [ids.a]) === 2, 'restart preserves old enrollment');
  check(await scalar('select stop_reason from public.student_programs where id=$1', [trial]) === 'ended', 'stopped reason remains editable');

  const activeTrial = await scalar("select id from public.student_programs where student_id=$1 and program_type='trial' and status='active'", [ids.a]);
  check(Boolean(await save(null, 'weekday', [activeTrial], 'trial in weekday', 'scheduled', '2096-02-12')), 'trial allowance accepted in weekday category');
  const rental = await scalar("select id from public.student_programs where student_id=$1 and program_type='rental' and status='active'", [ids.b]);
  check(Boolean(await save(null, 'weekday', [rental], 'rental in weekday', 'scheduled', '2096-02-12')), 'rental allowance accepted in weekday category');

  stage = 'RLS and RPC grants';
  await claims('operator', ids.operator);
  stage = 'staff assignment fixture';
  await db.query('insert into public.lesson_staff(lesson_id,staff_id,role) values ($1,$3,$4),($2,$3,$4)', [source, lesson, staffId, 'vocal_trainer']);
  stage = 'assigned staff checks';
  await claims('operator', ids.staffAuth);
  check(await scalar("select public.get_my_operator_context()->>'accessLevel'") === 'staff', 'active linked staff resolves staff context');
  check(await scalar('select count(*)::int from public.students') === 2, 'active staff can read operational student data');
  await blocked(() => save(null, 'trial'), '42501', 'staff cannot create schedules');
  stage = 'assigned staff attendance';
  check(Boolean(await scalar("update public.attendance_records set status='absent' where lesson_id=$1 and student_id=$2 returning id", [source, ids.a])), 'assigned staff can update attendance');
  stage = 'assigned staff feedback';
  check(Boolean(await scalar("insert into public.lesson_feedback(lesson_id,student_id,author_staff_id,body) values ($1,$2,$3,'staff feedback') returning id", [lesson, ids.a, staffId])), 'assigned staff can create own feedback');
  check(await scalar("insert into public.lesson_feedback(lesson_id,student_id,author_staff_id,body) values ($1,$2,$3,'forged feedback') returning author_staff_id", [lesson, ids.a, otherStaffId]) === staffId, 'staff feedback provider is forced to self');
  await claims('operator', ids.otherStaffAuth);
  stage = 'unassigned staff attendance';
  check((await query("update public.attendance_records set status='present' where lesson_id=$1 and student_id=$2 returning id", [source, ids.a])).length === 0, 'unassigned staff cannot update attendance');
  await claims('operator', ids.operator);
  stage = 'disable staff';
  await scalar('select public.set_staff_operator_account_enabled($1,false)', [staffId]);
  await claims('operator', ids.staffAuth);
  check(await scalar('select public.get_my_operator_context() is null'), 'disabled staff has no operator context');
  check(await scalar('select count(*)::int from public.students') === 0, 'disabled staff loses operational reads immediately');
  await claims('operator', ids.operator);
  await scalar('select public.set_staff_operator_account_enabled($1,true)', [staffId]);
  await claims('student', ids.authA);
  check(await scalar('select count(*)::int from public.students') === 1, 'student sees self only');
  check(await scalar('select count(*)::int from public.lessons where id=$1', [legacy]) === 0, 'student cannot see Draft');
  check(await scalar('select count(*)::int from public.lessons where id=$1', [lesson]) === 1, 'student sees own confirmed lesson');
  await blocked(profileSave, ['42501', 'P0002'], 'student profile mutation denied');
  await blocked(() => programsSave({}), ['42501', 'P0002'], 'student programs mutation denied');
  await blocked(() => save(null, 'weekday'), ['42501', 'P0002'], 'student lesson mutation denied');
  await blocked(() => scalar('select public.complete_makeup_without_schedule($1,null)', [manualMakeup]), ['42501', 'P0002'], 'student manual makeup completion denied');
  check(!await scalar("select has_function_privilege('anon','public.complete_makeup_without_schedule(uuid,text)','EXECUTE')"), 'anonymous manual completion RPC denied');
  check(!await scalar("select has_function_privilege('anon','public.restore_manual_makeup_completion(uuid)','EXECUTE')"), 'anonymous manual restore RPC denied');
  check(!await scalar("select has_function_privilege('anon','public.save_student_programs(uuid,jsonb)','EXECUTE')"), 'anonymous programs RPC denied');
  check(!await scalar("select has_function_privilege('anon','public.save_student_profile(uuid,text,text,integer,text,text,date,text)','EXECUTE')"), 'anonymous profile RPC denied');
  console.log(`PASS: ${files.length} migrations and ${passed} local PostgreSQL assertions. Synthetic in-memory data only.`);
} catch (error) {
  // Never print query parameters, identities, or raw database errors.
  console.error(`FAIL: ${stage}; ${error.code ?? 'assertion'}; ${error instanceof assert.AssertionError || error.code === '42601' ? error.message : 'SQL execution failed'}`);
  process.exitCode = 1;
} finally {
  await db.close();
}
