begin;

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
  selected_student_id uuid;
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

  if lesson_id is null then
    insert into public.lessons(title, starts_at, ends_at, location, notes, program_type, status)
    values (btrim(lesson_title), lesson_starts_at, lesson_ends_at,
            nullif(btrim(lesson_location), ''), nullif(btrim(lesson_notes), ''),
            lesson_program_type, lesson_status)
    returning id into saved_id;
  else
    update public.lessons
    set title = btrim(lesson_title), starts_at = lesson_starts_at, ends_at = lesson_ends_at,
        location = nullif(btrim(lesson_location), ''), notes = nullif(btrim(lesson_notes), ''),
        program_type = lesson_program_type,
        status = case when status = 'completed' then 'completed' else lesson_status end
    where id = lesson_id and status <> 'cancelled'
    returning id into saved_id;
    if saved_id is null then
      raise exception 'Editable lesson was not found.' using errcode = 'P0002';
    end if;
  end if;

  foreach selected_student_id in array coalesce(selected_student_ids, '{}'::uuid[]) loop
    select id into enrollment_id
    from public.student_programs
    where student_id = selected_student_id
      and program_type = lesson_program_type
      and status = 'active';
    if enrollment_id is null then
      raise exception 'Student does not have an active matching program.' using errcode = '23514';
    end if;
    perform public.lock_student_schedule(selected_student_id);
    insert into public.lesson_assignments(lesson_id, student_id, student_program_id, unassigned_at)
    values (saved_id, selected_student_id, enrollment_id, null)
    on conflict on constraint lesson_assignments_pkey do update
      set student_program_id = excluded.student_program_id, unassigned_at = null;
  end loop;

  update public.lesson_assignments
  set unassigned_at = now()
  where lesson_assignments.lesson_id = saved_id
    and lesson_assignments.unassigned_at is null
    and not (lesson_assignments.student_id = any(coalesce(selected_student_ids, '{}'::uuid[])));

  return saved_id;
end;
$$;

commit;
