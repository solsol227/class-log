begin;

-- Reproduce the pre-fix ordering bug before replacing the function. Test rows
-- are deleted in this transaction and never become application data.
do $$
declare
  operator_id uuid;
  test_student_id uuid;
  test_program_id uuid;
  lesson_a uuid;
  lesson_b uuid;
  conflict_seen boolean := false;
begin
  select id into operator_id
  from auth.users
  where raw_app_meta_data ->> 'role' = 'operator'
  order by created_at
  limit 1;

  select id, student_id into test_program_id, test_student_id
  from public.student_programs
  where program_type = 'weekday_vocal' and status = 'active'
  order by created_at
  limit 1;

  if operator_id is null or test_program_id is null then
    raise exception 'Review regression test prerequisites are missing.';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', operator_id,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object('role', 'operator')
    )::text,
    true
  );

  insert into public.lessons(title, starts_at, ends_at, status, program_type)
  values ('__review_pre_fix_a__', '2099-12-01 10:00+09', '2099-12-01 11:00+09', 'scheduled', 'weekday_vocal')
  returning id into lesson_a;
  insert into public.lessons(title, starts_at, ends_at, status, program_type)
  values ('__review_pre_fix_b__', '2099-12-01 13:00+09', '2099-12-01 14:00+09', 'scheduled', 'weekday_vocal')
  returning id into lesson_b;

  insert into public.lesson_assignments(lesson_id, student_id, student_program_id)
  values
    (lesson_a, test_student_id, test_program_id),
    (lesson_b, test_student_id, test_program_id);

  begin
    perform public.save_lesson_with_assignments(
      lesson_a,
      '__review_pre_fix_a__',
      '2099-12-01 13:00+09',
      '2099-12-01 14:00+09',
      '',
      '',
      'weekday_vocal',
      'scheduled',
      '{}'::uuid[]
    );
  exception when sqlstate '23P01' then
    conflict_seen := true;
  end;

  if not conflict_seen then
    raise exception 'The expected pre-fix overlap bug was not reproduced.';
  end if;

  delete from public.lessons where id in (lesson_a, lesson_b);
end;
$$;

create or replace function public.save_lesson_with_assignments(
  lesson_id uuid,
  lesson_title text,
  lesson_starts_at timestamptz,
  lesson_ends_at timestamptz,
  lesson_location text,
  lesson_notes text,
  lesson_program_type text,
  lesson_status text,
  selected_student_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved_id uuid;
  existing_program_type text;
  existing_status text;
  selected_student_id uuid;
  lock_student_id uuid;
  enrollment_id uuid;
begin
  if not public.is_operator() then
    raise exception 'Operator access is required.' using errcode = '42501';
  end if;
  if lesson_title is null or length(btrim(lesson_title)) = 0 then
    raise exception 'Lesson title is required.' using errcode = '23514';
  end if;
  if lesson_ends_at <= lesson_starts_at then
    raise exception 'Lesson end must be after start.' using errcode = '23514';
  end if;
  if lesson_program_type not in ('weekday_vocal', 'weekend_vocal', 'trial') then
    raise exception 'Unsupported lesson program.' using errcode = '23514';
  end if;
  if lesson_status not in ('draft', 'scheduled', 'completed') then
    raise exception 'Unsupported editable lesson status.' using errcode = '23514';
  end if;
  if array_position(coalesce(selected_student_ids, '{}'::uuid[]), null) is not null then
    raise exception 'Selected students cannot contain null.' using errcode = '23514';
  end if;

  if lesson_id is not null then
    select program_type, status
      into existing_program_type, existing_status
    from public.lessons
    where id = lesson_id and status <> 'cancelled'
    for update;
    if not found then
      raise exception 'Editable lesson was not found.' using errcode = 'P0002';
    end if;
  end if;

  -- Every affected student is locked before any assignment or lesson mutation.
  for lock_student_id in
    select distinct candidate_student_id
    from (
      select unnest(coalesce(selected_student_ids, '{}'::uuid[])) as candidate_student_id
      union all
      select assignments.student_id
      from public.lesson_assignments assignments
      where assignments.lesson_id = save_lesson_with_assignments.lesson_id
        and assignments.unassigned_at is null
    ) students_to_lock
    where candidate_student_id is not null
    order by candidate_student_id
  loop
    perform public.lock_student_schedule(lock_student_id);
  end loop;

  if lesson_id is null then
    insert into public.lessons(title, starts_at, ends_at, location, notes, program_type, status)
    values (
      btrim(lesson_title), lesson_starts_at, lesson_ends_at,
      nullif(btrim(lesson_location), ''), nullif(btrim(lesson_notes), ''),
      lesson_program_type, lesson_status
    )
    returning id into saved_id;
  else
    -- Remove students that will not be present in the final roster before the
    -- lesson update trigger evaluates overlap. A program change temporarily
    -- removes every active assignment so old enrollments cannot block it.
    update public.lesson_assignments
    set unassigned_at = now()
    where lesson_assignments.lesson_id = save_lesson_with_assignments.lesson_id
      and lesson_assignments.unassigned_at is null
      and (
        existing_program_type is distinct from lesson_program_type
        or not (
          lesson_assignments.student_id = any(
            coalesce(selected_student_ids, '{}'::uuid[])
          )
        )
      );

    update public.lessons
    set title = btrim(lesson_title),
        starts_at = lesson_starts_at,
        ends_at = lesson_ends_at,
        location = nullif(btrim(lesson_location), ''),
        notes = nullif(btrim(lesson_notes), ''),
        program_type = lesson_program_type,
        status = case when existing_status = 'completed' then 'completed' else lesson_status end
    where id = lesson_id
    returning id into saved_id;
  end if;

  for selected_student_id in
    select distinct unnest(coalesce(selected_student_ids, '{}'::uuid[]))
  loop
    select id into enrollment_id
    from public.student_programs
    where student_id = selected_student_id
      and program_type = lesson_program_type
      and status = 'active';
    if enrollment_id is null then
      raise exception 'Student does not have an active matching program.' using errcode = '23514';
    end if;

    insert into public.lesson_assignments(lesson_id, student_id, student_program_id, unassigned_at)
    values (saved_id, selected_student_id, enrollment_id, null)
    on conflict on constraint lesson_assignments_pkey do update
      set student_program_id = excluded.student_program_id,
          unassigned_at = null;
  end loop;

  return saved_id;
end;
$$;

create or replace function public.replace_lesson_staff(
  target_lesson_id uuid,
  selected_staff_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_count integer;
  valid_count integer;
begin
  if not public.is_operator() then
    raise exception 'Operator access is required.' using errcode = '42501';
  end if;
  if array_position(coalesce(selected_staff_ids, '{}'::uuid[]), null) is not null then
    raise exception 'Selected staff cannot contain null.' using errcode = '23514';
  end if;

  perform 1 from public.lessons where id = target_lesson_id for update;
  if not found then
    raise exception 'Lesson was not found.' using errcode = 'P0002';
  end if;

  select count(*) into selected_count
  from (select distinct unnest(coalesce(selected_staff_ids, '{}'::uuid[]))) selected;
  select count(*) into valid_count
  from public.staff_profiles
  where id = any(coalesce(selected_staff_ids, '{}'::uuid[]))
    and is_active;

  if valid_count <> selected_count then
    raise exception 'Every selected staff profile must exist and be active.' using errcode = '23514';
  end if;

  delete from public.lesson_staff where lesson_id = target_lesson_id;
  insert into public.lesson_staff(lesson_id, staff_id, role)
  select target_lesson_id, id, role
  from public.staff_profiles
  where id = any(coalesce(selected_staff_ids, '{}'::uuid[]));

  return target_lesson_id;
end;
$$;

create or replace function public.complete_makeup_lesson(target_makeup_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  makeup_row public.makeup_lessons%rowtype;
  completed_id uuid;
begin
  if not public.is_operator() then
    raise exception 'Operator access is required.' using errcode = '42501';
  end if;

  select * into makeup_row
  from public.makeup_lessons
  where id = target_makeup_id and status = 'scheduled'
  for update;
  if not found or makeup_row.replacement_lesson_id is null then
    raise exception 'Scheduled makeup lesson was not found.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.attendance_records
    where lesson_id = makeup_row.replacement_lesson_id
      and student_id = makeup_row.student_id
  ) then
    raise exception 'Replacement attendance is required.' using errcode = '23514';
  end if;

  update public.makeup_lessons
  set status = 'completed'
  where id = target_makeup_id and status = 'scheduled'
  returning id into completed_id;
  if completed_id is null then
    raise exception 'Makeup lesson was not completed.' using errcode = 'P0002';
  end if;

  return completed_id;
end;
$$;

grant execute on function public.replace_lesson_staff(uuid, uuid[]) to authenticated;
grant execute on function public.complete_makeup_lesson(uuid) to authenticated;

-- Post-fix SQL regression suite. All synthetic rows are removed before commit.
do $$
declare
  operator_id uuid;
  test_student_id uuid;
  test_program_id uuid;
  lesson_a uuid;
  lesson_b uuid;
  lesson_c uuid;
  lesson_d uuid;
  original_lesson uuid;
  replacement_lesson uuid;
  test_makeup uuid;
  staff_one uuid;
  staff_two uuid;
  conflict_seen boolean;
begin
  select id into operator_id
  from auth.users
  where raw_app_meta_data ->> 'role' = 'operator'
  order by created_at
  limit 1;
  select id, student_id into test_program_id, test_student_id
  from public.student_programs
  where program_type = 'weekday_vocal' and status = 'active'
  order by created_at
  limit 1;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', operator_id,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object('role', 'operator')
    )::text,
    true
  );

  -- Case A: removing the student in the same request permits the overlap.
  insert into public.lessons(title, starts_at, ends_at, status, program_type)
  values ('__review_case_a__', '2099-12-02 10:00+09', '2099-12-02 11:00+09', 'scheduled', 'weekday_vocal') returning id into lesson_a;
  insert into public.lessons(title, starts_at, ends_at, status, program_type)
  values ('__review_case_a_peer__', '2099-12-02 13:00+09', '2099-12-02 14:00+09', 'scheduled', 'weekday_vocal') returning id into lesson_b;
  insert into public.lesson_assignments(lesson_id, student_id, student_program_id)
  values (lesson_a, test_student_id, test_program_id), (lesson_b, test_student_id, test_program_id);
  perform public.save_lesson_with_assignments(lesson_a, '__review_case_a__', '2099-12-02 13:00+09', '2099-12-02 14:00+09', '', '', 'weekday_vocal', 'scheduled', '{}'::uuid[]);
  if exists (select 1 from public.lesson_assignments where lesson_id = lesson_a and unassigned_at is null) then
    raise exception 'Case A failed: removed assignment remained active.';
  end if;
  delete from public.lessons where id in (lesson_a, lesson_b);

  -- Case B: retaining the student still rejects the overlap and rolls back.
  insert into public.lessons(title, starts_at, ends_at, status, program_type)
  values ('__review_case_b__', '2099-12-03 10:00+09', '2099-12-03 11:00+09', 'scheduled', 'weekday_vocal') returning id into lesson_a;
  insert into public.lessons(title, starts_at, ends_at, status, program_type)
  values ('__review_case_b_peer__', '2099-12-03 13:00+09', '2099-12-03 14:00+09', 'scheduled', 'weekday_vocal') returning id into lesson_b;
  insert into public.lesson_assignments(lesson_id, student_id, student_program_id)
  values (lesson_a, test_student_id, test_program_id), (lesson_b, test_student_id, test_program_id);
  conflict_seen := false;
  begin
    perform public.save_lesson_with_assignments(lesson_a, '__review_case_b__', '2099-12-03 13:00+09', '2099-12-03 14:00+09', '', '', 'weekday_vocal', 'scheduled', array[test_student_id]);
  exception when sqlstate '23P01' then
    conflict_seen := true;
  end;
  if not conflict_seen or not exists (select 1 from public.lesson_assignments where lesson_id = lesson_a and unassigned_at is null) then
    raise exception 'Case B failed: overlap or rollback was not preserved.';
  end if;
  delete from public.lessons where id in (lesson_a, lesson_b);

  -- Case C: touching boundaries are allowed.
  insert into public.lessons(title, starts_at, ends_at, status, program_type)
  values ('__review_case_c_one__', '2099-12-04 17:00+09', '2099-12-04 18:00+09', 'scheduled', 'weekday_vocal') returning id into lesson_c;
  insert into public.lessons(title, starts_at, ends_at, status, program_type)
  values ('__review_case_c_two__', '2099-12-04 18:00+09', '2099-12-04 19:00+09', 'scheduled', 'weekday_vocal') returning id into lesson_d;
  insert into public.lesson_assignments(lesson_id, student_id, student_program_id)
  values (lesson_c, test_student_id, test_program_id), (lesson_d, test_student_id, test_program_id);
  delete from public.lessons where id in (lesson_c, lesson_d);

  -- Case D: draft and scheduled lessons both occupy the student's time.
  insert into public.lessons(title, starts_at, ends_at, status, program_type)
  values ('__review_case_d_draft__', '2099-12-05 20:00+09', '2099-12-05 21:00+09', 'draft', 'weekday_vocal') returning id into lesson_c;
  insert into public.lessons(title, starts_at, ends_at, status, program_type)
  values ('__review_case_d_scheduled__', '2099-12-05 20:30+09', '2099-12-05 21:30+09', 'scheduled', 'weekday_vocal') returning id into lesson_d;
  insert into public.lesson_assignments(lesson_id, student_id, student_program_id)
  values (lesson_c, test_student_id, test_program_id);
  conflict_seen := false;
  begin
    insert into public.lesson_assignments(lesson_id, student_id, student_program_id)
    values (lesson_d, test_student_id, test_program_id);
  exception when sqlstate '23P01' then
    conflict_seen := true;
  end;
  if not conflict_seen then raise exception 'Case D failed: draft overlap was allowed.'; end if;
  delete from public.lessons where id in (lesson_c, lesson_d);

  -- Staff replacement succeeds atomically and preserves the previous set on error.
  insert into public.lessons(title, starts_at, ends_at, status, program_type)
  values ('__review_staff__', '2099-12-06 10:00+09', '2099-12-06 11:00+09', 'scheduled', 'weekday_vocal') returning id into lesson_a;
  insert into public.staff_profiles(display_name, role) values ('__review_staff_one__', 'manager') returning id into staff_one;
  insert into public.staff_profiles(display_name, role) values ('__review_staff_two__', 'vocal_trainer') returning id into staff_two;
  insert into public.lesson_staff(lesson_id, staff_id, role) values (lesson_a, staff_one, 'manager');
  perform public.replace_lesson_staff(lesson_a, array[staff_two]);
  if not exists (select 1 from public.lesson_staff where lesson_id = lesson_a and staff_id = staff_two)
     or exists (select 1 from public.lesson_staff where lesson_id = lesson_a and staff_id = staff_one) then
    raise exception 'Staff replacement success case failed.';
  end if;
  begin
    perform public.replace_lesson_staff(lesson_a, array[staff_one, gen_random_uuid()]);
  exception when sqlstate '23514' then
    null;
  end;
  if not exists (select 1 from public.lesson_staff where lesson_id = lesson_a and staff_id = staff_two)
     or exists (select 1 from public.lesson_staff where lesson_id = lesson_a and staff_id = staff_one) then
    raise exception 'Staff replacement rollback case failed.';
  end if;
  delete from public.lessons where id = lesson_a;
  delete from public.staff_profiles where id in (staff_one, staff_two);

  -- Makeup completion requires attendance and changes exactly one scheduled row.
  insert into public.lessons(title, starts_at, ends_at, status, program_type)
  values ('__review_makeup_original__', '2099-12-07 10:00+09', '2099-12-07 11:00+09', 'completed', 'weekday_vocal') returning id into original_lesson;
  insert into public.lessons(title, starts_at, ends_at, status, program_type)
  values ('__review_makeup_replacement__', '2099-12-08 10:00+09', '2099-12-08 11:00+09', 'completed', 'weekday_vocal') returning id into replacement_lesson;
  insert into public.lesson_assignments(lesson_id, student_id, student_program_id)
  values (original_lesson, test_student_id, test_program_id), (replacement_lesson, test_student_id, test_program_id);
  insert into public.makeup_lessons(student_id, original_lesson_id, replacement_lesson_id, status)
  values (test_student_id, original_lesson, replacement_lesson, 'scheduled') returning id into test_makeup;
  insert into public.attendance_records(lesson_id, student_id, status)
  values (replacement_lesson, test_student_id, 'present');
  perform public.complete_makeup_lesson(test_makeup);
  if not exists (select 1 from public.makeup_lessons where id = test_makeup and status = 'completed') then
    raise exception 'Makeup completion success case failed.';
  end if;
  begin
    perform public.complete_makeup_lesson(test_makeup);
  exception when sqlstate 'P0002' then
    null;
  end;
  delete from public.makeup_lessons where id = test_makeup;
  delete from public.lessons where id in (original_lesson, replacement_lesson);
end;
$$;

commit;
