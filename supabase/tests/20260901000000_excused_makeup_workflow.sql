begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

create temporary table pr19_context (
  operator_id uuid not null,
  student_id uuid not null,
  student_auth_id uuid not null,
  student_program_id uuid not null,
  program_type text not null,
  visible_makeup_id uuid,
  draft_makeup_id uuid
);

insert into pr19_context (
  operator_id,
  student_id,
  student_auth_id,
  student_program_id,
  program_type
)
select
  operators.id,
  students.id,
  students.auth_user_id,
  programs.id,
  programs.program_type
from auth.users operators
cross join lateral (
  select students.*
  from public.students
  join public.student_programs programs
    on programs.student_id = students.id
   and programs.status = 'active'
   and programs.program_type in ('weekday_vocal', 'weekend_vocal', 'trial')
  limit 1
) students
join public.student_programs programs
  on programs.student_id = students.id
 and programs.status = 'active'
 and programs.program_type in ('weekday_vocal', 'weekend_vocal', 'trial')
where operators.raw_app_meta_data ->> 'role' = 'operator'
limit 1;

select is(
  (select count(*) from pr19_context),
  1::bigint,
  'an operator and an active non-rental student program are available'
);

create or replace function pg_temp.run_pr19_workflow()
returns text
language plpgsql
as $$
declare
  ctx pr19_context%rowtype;
  source_one uuid := gen_random_uuid();
  source_two uuid := gen_random_uuid();
  source_three uuid := gen_random_uuid();
  replacement_one uuid := gen_random_uuid();
  replacement_two uuid := gen_random_uuid();
  replacement_three uuid := gen_random_uuid();
  replacement_four uuid := gen_random_uuid();
  draft_replacement uuid := gen_random_uuid();
  source_attendance_one uuid := gen_random_uuid();
  source_attendance_two uuid := gen_random_uuid();
  source_attendance_three uuid := gen_random_uuid();
  replacement_attendance_one uuid := gen_random_uuid();
  replacement_attendance_two uuid := gen_random_uuid();
  replacement_attendance_three uuid := gen_random_uuid();
  first_makeup uuid;
  second_makeup uuid;
  third_makeup uuid;
  chained_makeup uuid;
  blocked boolean;
begin
  select * into strict ctx from pr19_context;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', ctx.operator_id,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object('role', 'operator')
    )::text,
    true
  );

  insert into public.lessons (
    id, title, starts_at, ends_at, status, program_type, created_by
  ) values
    (source_one, 'PR19 source one', now() + interval '1 day', now() + interval '2 days', 'scheduled', ctx.program_type, ctx.operator_id),
    (source_two, 'PR19 source two', now() + interval '3 days', now() + interval '4 days', 'scheduled', ctx.program_type, ctx.operator_id),
    (source_three, 'PR19 source three', now() + interval '5 days', now() + interval '6 days', 'scheduled', ctx.program_type, ctx.operator_id),
    (replacement_one, 'PR19 replacement one', now() + interval '7 days', now() + interval '8 days', 'scheduled', ctx.program_type, ctx.operator_id),
    (replacement_two, 'PR19 replacement two', now() + interval '9 days', now() + interval '10 days', 'scheduled', ctx.program_type, ctx.operator_id),
    (replacement_three, 'PR19 replacement three', now() + interval '11 days', now() + interval '12 days', 'scheduled', ctx.program_type, ctx.operator_id),
    (replacement_four, 'PR19 replacement four', now() + interval '13 days', now() + interval '14 days', 'scheduled', ctx.program_type, ctx.operator_id),
    (draft_replacement, 'PR19 draft replacement', now() + interval '15 days', now() + interval '16 days', 'draft', ctx.program_type, ctx.operator_id);

  insert into public.lesson_assignments (
    lesson_id, student_id, student_program_id, assigned_by
  ) values
    (source_one, ctx.student_id, ctx.student_program_id, ctx.operator_id),
    (source_two, ctx.student_id, ctx.student_program_id, ctx.operator_id),
    (source_three, ctx.student_id, ctx.student_program_id, ctx.operator_id);

  insert into public.attendance_records (
    id, lesson_id, student_id, status, recorded_by
  ) values (
    source_attendance_one, source_one, ctx.student_id, 'excused', ctx.operator_id
  );

  select id into strict first_makeup
  from public.makeup_lessons
  where attendance_record_id = source_attendance_one;

  update public.attendance_records
  set status = 'excused'
  where id = source_attendance_one;

  if (select count(*) from public.makeup_lessons where attendance_record_id = source_attendance_one) <> 1 then
    raise exception 'duplicate entitlement was created';
  end if;

  perform public.schedule_makeup_lesson(first_makeup, replacement_one);

  blocked := false;
  begin
    update public.lesson_assignments
    set unassigned_at = now()
    where lesson_id = replacement_one
      and student_id = ctx.student_id;
  exception when raise_exception then
    blocked := true;
  end;
  if not blocked then
    raise exception 'scheduled replacement assignment could be released outside the makeup workflow';
  end if;

  perform public.reschedule_makeup_lesson(first_makeup, replacement_two);

  if not exists (
    select 1 from public.lesson_assignments
    where lesson_id = replacement_one
      and student_id = ctx.student_id
      and unassigned_at is not null
  ) then
    raise exception 'reschedule did not soft-unassign the makeup-owned old assignment';
  end if;

  insert into public.attendance_records (
    id, lesson_id, student_id, status, recorded_by
  ) values (
    replacement_attendance_one, replacement_two, ctx.student_id, 'present', ctx.operator_id
  );

  if (select status from public.makeup_lessons where id = first_makeup) <> 'completed' then
    raise exception 'present replacement attendance did not complete makeup automatically';
  end if;

  blocked := false;
  begin
    update public.attendance_records set status = 'absent' where id = source_attendance_one;
  exception when check_violation then
    blocked := true;
  end;
  if not blocked then
    raise exception 'completed source attendance could be changed';
  end if;

  insert into public.attendance_records (
    id, lesson_id, student_id, status, recorded_by
  ) values (
    source_attendance_two, source_two, ctx.student_id, 'excused', ctx.operator_id
  );
  select id into strict second_makeup
  from public.makeup_lessons
  where attendance_record_id = source_attendance_two;

  update public.attendance_records set status = 'absent' where id = source_attendance_two;

  if (select status from public.makeup_lessons where id = second_makeup) <> 'cancelled' then
    raise exception 'non-excused source attendance did not cancel requested makeup';
  end if;

  update public.attendance_records set status = 'excused' where id = source_attendance_two;

  if (select id from public.makeup_lessons where attendance_record_id = source_attendance_two) <> second_makeup then
    raise exception 'cancelled entitlement was replaced by a new row';
  end if;

  if (select status from public.makeup_lessons where id = second_makeup) <> 'requested' then
    raise exception 'cancelled entitlement did not reopen automatically';
  end if;

  perform public.schedule_makeup_lesson(second_makeup, replacement_three);
  update public.attendance_records set status = 'present' where id = source_attendance_two;

  if (select status from public.makeup_lessons where id = second_makeup) <> 'cancelled' then
    raise exception 'non-excused source attendance did not cancel scheduled makeup';
  end if;
  if not exists (
    select 1 from public.lesson_assignments
    where lesson_id = replacement_three
      and student_id = ctx.student_id
      and unassigned_at is not null
  ) then
    raise exception 'source attendance change did not release makeup-owned assignment';
  end if;

  update public.attendance_records set status = 'excused' where id = source_attendance_two;
  if (select status from public.makeup_lessons where id = second_makeup) <> 'requested' then
    raise exception 'scheduled cancellation did not reopen the same entitlement';
  end if;
  perform public.schedule_makeup_lesson(second_makeup, replacement_three);

  insert into public.attendance_records (
    id, lesson_id, student_id, status, recorded_by
  ) values (
    replacement_attendance_two, replacement_three, ctx.student_id, 'absent', ctx.operator_id
  );
  if (select status from public.makeup_lessons where id = second_makeup) <> 'completed' then
    raise exception 'absent replacement attendance did not complete makeup automatically';
  end if;

  insert into public.attendance_records (
    id, lesson_id, student_id, status, recorded_by
  ) values (
    source_attendance_three, source_three, ctx.student_id, 'excused', ctx.operator_id
  );
  select id into strict third_makeup
  from public.makeup_lessons
  where attendance_record_id = source_attendance_three;
  perform public.schedule_makeup_lesson(third_makeup, replacement_four);

  insert into public.attendance_records (
    id, lesson_id, student_id, status, recorded_by
  ) values (
    replacement_attendance_three, replacement_four, ctx.student_id, 'excused', ctx.operator_id
  );
  select id into strict chained_makeup
  from public.makeup_lessons
  where attendance_record_id = replacement_attendance_three;
  if (select status from public.makeup_lessons where id = third_makeup) <> 'completed' then
    raise exception 'excused replacement did not complete the prior makeup';
  end if;
  if (select status from public.makeup_lessons where id = chained_makeup) <> 'requested' then
    raise exception 'excused replacement did not create the next entitlement';
  end if;

  perform public.schedule_makeup_lesson(chained_makeup, draft_replacement);

  update pr19_context
  set visible_makeup_id = second_makeup,
      draft_makeup_id = chained_makeup;

  return 'ok';
end;
$$;

select is(
  pg_temp.run_pr19_workflow(),
  'ok',
  'excused entitlement and makeup workflow transitions are enforced'
);

select ok(
  (select count(*) from public.makeup_lesson_events) >= 12,
  'workflow transitions produce append-only events'
);

select set_config(
  'request.jwt.claims',
  (
    select jsonb_build_object(
      'sub', operator_id,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object('role', 'operator')
    )::text
    from pr19_context
  ),
  true
);
set local role authenticated;

select ok(
  (select count(*) from public.makeup_lesson_events) > 0,
  'operator can read makeup event history'
);

reset role;
select set_config(
  'request.jwt.claims',
  (
    select jsonb_build_object(
      'sub', student_auth_id,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object('role', 'student')
    )::text
    from pr19_context
  ),
  true
);
set local role authenticated;

select is(
  (
    select count(*)
    from public.makeup_lessons
    where id = (select visible_makeup_id from pr19_context)
  ),
  1::bigint,
  'student can read an own makeup whose lessons are visible'
);

select is(
  (
    select count(*)
    from public.makeup_lessons
    where id = (select draft_makeup_id from pr19_context)
  ) + (
    select count(*)
    from public.makeup_lesson_events
  ),
  0::bigint,
  'student cannot read Draft-linked makeup or operator event history'
);

reset role;
select * from finish();
rollback;
