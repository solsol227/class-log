begin;

-- Schedule mutation RPCs lock lessons before taking student advisory locks.
-- Use the same order here so a batch assignment cannot deadlock with a
-- concurrent lesson edit or Draft confirmation.
create or replace function public.assign_student_to_lessons(
  target_lesson_ids uuid[],
  target_student_id uuid,
  target_student_program_id uuid
)
returns uuid[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
  requested_count integer;
  distinct_count integer;
  affected_count integer := 0;
  target_lesson_id uuid;
  assigned_lesson_id uuid;
  assigned_lesson_ids uuid[] := '{}'::uuid[];
begin
  if private.is_owner() is not true then
    raise exception 'Schedule management access is required.' using errcode = '42501';
  end if;

  requested_count := coalesce(pg_catalog.cardinality(target_lesson_ids), 0);
  if requested_count < 1 or requested_count > 100 or target_student_id is null
     or target_student_program_id is null
     or pg_catalog.array_position(target_lesson_ids, null) is not null then
    raise exception 'One to 100 valid lessons are required.' using errcode = '22023';
  end if;

  select count(distinct requested.lesson_id)::integer
  into distinct_count
  from pg_catalog.unnest(target_lesson_ids) as requested(lesson_id);
  if distinct_count <> requested_count then
    raise exception 'Duplicate lessons are not allowed.' using errcode = '22023';
  end if;

  perform 1
  from public.lessons lessons
  where lessons.id = any(target_lesson_ids)
  order by lessons.id
  for update;

  if (
    select count(*)
    from public.lessons lessons
    where lessons.id = any(target_lesson_ids)
      and lessons.status <> 'cancelled'
  ) <> requested_count then
    raise exception 'One or more assignable lessons were not found.' using errcode = 'P0002';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_student_id::text, 0)
  );

  perform 1
  from public.students students
  where students.id = target_student_id
  for update;
  if not found then
    raise exception 'Student was not found.' using errcode = 'P0002';
  end if;

  perform 1
  from public.student_programs programs
  where programs.id = target_student_program_id
    and programs.student_id = target_student_id
    and programs.status = 'active'
    and programs.base_allowance_count is not null
  for update;
  if not found then
    raise exception 'An active, configured student program is required.' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.lesson_assignments assignments
    where assignments.student_id = target_student_id
      and assignments.lesson_id = any(target_lesson_ids)
      and assignments.unassigned_at is null
  ) then
    raise exception 'The student is already assigned to one or more lessons.' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.makeup_lessons makeups
    where makeups.student_id = target_student_id
      and makeups.replacement_lesson_id = any(target_lesson_ids)
      and makeups.status in ('scheduled', 'completed')
  ) then
    raise exception 'A protected makeup assignment cannot be replaced.' using errcode = '23514';
  end if;

  for target_lesson_id in
    select requested.lesson_id
    from pg_catalog.unnest(target_lesson_ids) as requested(lesson_id)
    order by requested.lesson_id
  loop
    assigned_lesson_id := null;
    insert into public.lesson_assignments(
      lesson_id, student_id, student_program_id, unassigned_at
    ) values (
      target_lesson_id, target_student_id, target_student_program_id, null
    )
    on conflict on constraint lesson_assignments_pkey do update
      set student_program_id = excluded.student_program_id,
          unassigned_at = null
      where lesson_assignments.unassigned_at is not null
    returning lesson_id into assigned_lesson_id;

    if assigned_lesson_id is null then
      raise exception 'A lesson assignment changed concurrently.' using errcode = '40001';
    end if;
    assigned_lesson_ids := pg_catalog.array_append(assigned_lesson_ids, assigned_lesson_id);
    affected_count := affected_count + 1;
  end loop;

  if affected_count <> requested_count
     or pg_catalog.cardinality(assigned_lesson_ids) <> requested_count then
    raise exception 'Batch assignment affected an unexpected row count.' using errcode = 'P0001';
  end if;

  return assigned_lesson_ids;
end;
$$;

revoke all on function public.assign_student_to_lessons(uuid[], uuid, uuid)
  from public, anon;
grant execute on function public.assign_student_to_lessons(uuid[], uuid, uuid)
  to authenticated;

commit;
