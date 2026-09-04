begin;

create extension if not exists pgtap with schema extensions;
select plan(6);

create temporary table neutral_lesson_context as
select
  operators.id as operator_id,
  programs.student_id,
  programs.id as student_program_id
from auth.users operators
cross join lateral (
  select programs.*
  from public.student_programs programs
  where programs.status = 'active'
    and programs.program_type in ('weekday_vocal', 'weekend_vocal')
  limit 1
) programs
where operators.raw_app_meta_data ->> 'role' = 'operator'
limit 1;

select is((select count(*) from neutral_lesson_context), 1::bigint, 'operator and monthly student program exist');

create or replace function pg_temp.run_neutral_lesson_allowance_test()
returns boolean
language plpgsql
as $$
declare
  ctx neutral_lesson_context%rowtype;
  lesson_id uuid;
  extra_lesson_id uuid;
  item integer;
  blocked boolean := false;
begin
  select * into strict ctx from neutral_lesson_context;
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
    '2099-12-01'::date,
    1,
    'neutral lesson quota test'
  );

  lesson_id := public.save_lesson_with_assignments(
    null,
    'neutral Draft test',
    '2099-12-01 10:00+09',
    '2099-12-01 11:00+09',
    '',
    '',
    'draft',
    array[ctx.student_program_id]
  );

  if not exists (
    select 1
    from public.student_program_allowance_statuses
    where student_program_id = ctx.student_program_id
      and period_month = '2099-12-01'
      and draft_count = 1
      and reserved_count = 0
      and used_count = 0
      and remaining_count = 5
  ) then
    return false;
  end if;

  perform public.confirm_draft_lesson(lesson_id);
  if not exists (
    select 1
    from public.student_program_allowance_statuses
    where student_program_id = ctx.student_program_id
      and period_month = '2099-12-01'
      and reserved_count = 1
      and remaining_count = 4
  ) then
    return false;
  end if;

  for item in 2..5 loop
    perform public.save_lesson_with_assignments(
      null,
      'neutral scheduled test ' || item,
      ('2099-12-' || lpad(item::text, 2, '0') || ' 10:00+09')::timestamptz,
      ('2099-12-' || lpad(item::text, 2, '0') || ' 11:00+09')::timestamptz,
      '',
      '',
      'scheduled',
      array[ctx.student_program_id]
    );
  end loop;

  begin
    extra_lesson_id := public.save_lesson_with_assignments(
      null,
      'neutral quota overflow test',
      '2099-12-06 10:00+09',
      '2099-12-06 11:00+09',
      '',
      '',
      'scheduled',
      array[ctx.student_program_id]
    );
  exception when check_violation then
    blocked := true;
  end;

  return blocked and extra_lesson_id is null;
end;
$$;

select ok(pg_temp.run_neutral_lesson_allowance_test(), 'Draft is free, confirmation commits quota, and overflow is blocked');

select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'lessons' and column_name = 'program_type'
  ),
  0::bigint,
  'lessons has no program_type column'
);

select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'lesson_assignments' and column_name = 'assignment_purpose'
  ),
  0::bigint,
  'assignment purpose was not added'
);

select is(
  (
    select count(*)
    from public.student_program_allowance_adjustments
    where reason = 'neutral lesson quota test' and delta = 1
  ),
  1::bigint,
  'allowance adjustment is appended once'
);

select is(
  (
    select count(*)
    from public.makeup_lessons
    where source_student_program_id is null
  ),
  0::bigint,
  'every makeup has a source student program'
);

select * from finish();
rollback;
