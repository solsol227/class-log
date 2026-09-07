begin;

create extension if not exists pgtap with schema extensions;
select plan(4);

create temporary table pr26_context as
select
  operators.id as operator_id,
  candidate.student_id,
  candidate.student_auth_id,
  candidate.student_program_id
from auth.users operators
cross join lateral (
  select
    students.id as student_id,
    students.auth_user_id as student_auth_id,
    programs.id as student_program_id
  from public.students
  join public.student_programs programs
    on programs.student_id = students.id
   and programs.status = 'active'
  where students.auth_user_id is not null
  limit 1
) candidate
where operators.raw_app_meta_data ->> 'role' = 'operator'
limit 1;

select is(
  (select count(*) from pr26_context),
  1::bigint,
  'an operator and an active student program are available'
);

select has_column(
  'public',
  'makeup_lesson_events',
  'completion_method',
  'makeup events preserve the completion path'
);

select has_column(
  'public',
  'makeup_lesson_events',
  'completion_note',
  'makeup events preserve the manual completion note'
);

create or replace function pg_temp.run_pr26_workflow()
returns boolean
language plpgsql
as $$
declare
  ctx pr26_context%rowtype;
  source_manual uuid := gen_random_uuid();
  source_auto uuid := gen_random_uuid();
  source_student_blocked uuid := gen_random_uuid();
  replacement_auto uuid := gen_random_uuid();
  source_manual_attendance uuid := gen_random_uuid();
  source_auto_attendance uuid := gen_random_uuid();
  source_student_blocked_attendance uuid := gen_random_uuid();
  replacement_auto_attendance uuid := gen_random_uuid();
  manual_makeup uuid;
  auto_makeup uuid;
  student_blocked_makeup uuid;
  assignment_count_before bigint;
  adjustment_count_before bigint;
  blocked boolean;
begin
  select * into strict ctx from pr26_context;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', ctx.operator_id,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object('role', 'operator')
    )::text,
    true
  );

  perform public.add_student_program_allowance_adjustment(
    ctx.student_program_id,
    date_trunc('month', now() at time zone 'Asia/Seoul')::date,
    20,
    'PR26 workflow test capacity'
  );
  perform public.add_student_program_allowance_adjustment(
    ctx.student_program_id,
    (date_trunc('month', now() at time zone 'Asia/Seoul') + interval '1 month')::date,
    20,
    'PR26 workflow test next-month capacity'
  );

  insert into public.lessons (
    id, title, starts_at, ends_at, status, created_by, schedule_category
  ) values
    (source_manual, 'PR26 manual source', now() + interval '1 day', now() + interval '1 day 1 hour', 'scheduled', ctx.operator_id, 'weekend'),
    (source_auto, 'PR26 automatic source', now() + interval '2 days', now() + interval '2 days 1 hour', 'scheduled', ctx.operator_id, 'weekend'),
    (source_student_blocked, 'PR26 blocked source', now() + interval '3 days', now() + interval '3 days 1 hour', 'scheduled', ctx.operator_id, 'weekend'),
    (replacement_auto, 'PR26 automatic replacement', now() + interval '7 days', now() + interval '7 days 1 hour', 'scheduled', ctx.operator_id, 'weekend');

  insert into public.lesson_assignments (
    lesson_id, student_id, student_program_id, assigned_by
  ) values
    (source_manual, ctx.student_id, ctx.student_program_id, ctx.operator_id),
    (source_auto, ctx.student_id, ctx.student_program_id, ctx.operator_id),
    (source_student_blocked, ctx.student_id, ctx.student_program_id, ctx.operator_id);

  insert into public.attendance_records (
    id, lesson_id, student_id, status, recorded_by
  ) values
    (source_manual_attendance, source_manual, ctx.student_id, 'excused', ctx.operator_id),
    (source_auto_attendance, source_auto, ctx.student_id, 'excused', ctx.operator_id),
    (source_student_blocked_attendance, source_student_blocked, ctx.student_id, 'excused', ctx.operator_id);

  select id into strict manual_makeup
  from public.makeup_lessons
  where attendance_record_id = source_manual_attendance;

  select id into strict auto_makeup
  from public.makeup_lessons
  where attendance_record_id = source_auto_attendance;

  select id into strict student_blocked_makeup
  from public.makeup_lessons
  where attendance_record_id = source_student_blocked_attendance;

  select count(*) into assignment_count_before
  from public.lesson_assignments
  where student_id = ctx.student_id;

  select count(*) into adjustment_count_before
  from public.student_program_allowance_adjustments
  where student_program_id = ctx.student_program_id;

  if public.complete_makeup_without_schedule(manual_makeup, 'PR26 manual completion') <> manual_makeup then
    raise exception 'manual completion did not return the existing makeup id';
  end if;

  if not exists (
    select 1
    from public.makeup_lessons
    where id = manual_makeup
      and status = 'completed'
      and completion_method = 'manual_without_schedule'
      and completed_by = ctx.operator_id
      and completed_at is not null
      and completion_note = 'PR26 manual completion'
      and replacement_lesson_id is null
      and replacement_attendance_record_id is null
      and replacement_assignment_provenance is null
  ) then
    raise exception 'manual completion current state is invalid';
  end if;

  if (select count(*) from public.lesson_assignments where student_id = ctx.student_id) <> assignment_count_before
     or (select count(*) from public.student_program_allowance_adjustments where student_program_id = ctx.student_program_id) <> adjustment_count_before then
    raise exception 'manual completion changed assignments or allowance adjustments';
  end if;

  if not exists (
    select 1
    from public.makeup_lesson_events
    where makeup_lesson_id = manual_makeup
      and event_type = 'completed'
      and completion_method = 'manual_without_schedule'
      and completion_note = 'PR26 manual completion'
      and actor_user_id = ctx.operator_id
  ) then
    raise exception 'manual completion event did not preserve its metadata';
  end if;

  if public.restore_manual_makeup_completion(manual_makeup) <> manual_makeup then
    raise exception 'manual restore did not return the existing makeup id';
  end if;

  if not exists (
    select 1
    from public.makeup_lessons
    where id = manual_makeup
      and status = 'requested'
      and completion_method is null
      and completed_by is null
      and completed_at is null
      and completion_note is null
  ) then
    raise exception 'manual restore did not clear current completion state';
  end if;

  if not exists (
    select 1
    from public.makeup_lesson_events
    where makeup_lesson_id = manual_makeup
      and event_type = 'reopened'
      and from_status = 'completed'
      and to_status = 'requested'
      and completion_method = 'manual_without_schedule'
      and completion_note = 'PR26 manual completion'
      and actor_user_id = ctx.operator_id
  ) then
    raise exception 'manual restore event did not preserve prior completion metadata';
  end if;

  if (select count(*) from public.makeup_lessons where attendance_record_id = source_manual_attendance) <> 1 then
    raise exception 'manual restore created a duplicate makeup row';
  end if;

  perform public.schedule_makeup_lesson(auto_makeup, replacement_auto);
  insert into public.attendance_records (
    id, lesson_id, student_id, status, recorded_by
  ) values (
    replacement_auto_attendance, replacement_auto, ctx.student_id, 'present', ctx.operator_id
  );

  blocked := false;
  begin
    perform public.restore_manual_makeup_completion(auto_makeup);
  exception when no_data_found then
    blocked := true;
  end;

  if not blocked or not exists (
    select 1
    from public.makeup_lessons
    where id = auto_makeup
      and status = 'completed'
      and completion_method = 'replacement_attendance'
      and replacement_lesson_id = replacement_auto
      and replacement_attendance_record_id = replacement_auto_attendance
  ) then
    raise exception 'automatic completion was restored or lost its replacement records';
  end if;

  if not exists (
    select 1
    from public.makeup_lesson_events
    where makeup_lesson_id = auto_makeup
      and event_type = 'completed'
      and completion_method = 'replacement_attendance'
      and completion_note is null
  ) then
    raise exception 'automatic completion event did not preserve its completion path';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', ctx.student_auth_id,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object('role', 'student')
    )::text,
    true
  );

  blocked := false;
  begin
    perform public.complete_makeup_without_schedule(student_blocked_makeup, null);
  exception when insufficient_privilege then
    blocked := true;
  end;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', ctx.operator_id,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object('role', 'operator')
    )::text,
    true
  );

  if not blocked
     or (select status from public.makeup_lessons where id = student_blocked_makeup) <> 'requested' then
    raise exception 'student could manually complete a makeup';
  end if;

  return true;
end;
$$;

select ok(
  pg_temp.run_pr26_workflow(),
  'manual completion, same-row restore, event history, automatic completion protection, and operator access are enforced'
);

select * from finish();

rollback;
