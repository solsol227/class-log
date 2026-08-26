begin;

alter table public.lessons
  drop constraint lessons_status_valid,
  add constraint lessons_status_valid check (
    status in ('draft', 'scheduled', 'completed', 'cancelled')
  );

create or replace function public.lock_student_schedule(target_student_id uuid)
returns void
language sql
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended(target_student_id::text, 0));
$$;

create or replace function public.assert_student_schedule_available(
  target_lesson_id uuid,
  target_student_id uuid,
  target_starts_at timestamptz,
  target_ends_at timestamptz
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  conflict_title text;
begin
  perform public.lock_student_schedule(target_student_id);
  select lessons.title into conflict_title
  from public.lesson_assignments assignments
  join public.lessons lessons on lessons.id = assignments.lesson_id
  where assignments.student_id = target_student_id
    and assignments.unassigned_at is null
    and lessons.id <> target_lesson_id
    and lessons.status <> 'cancelled'
    and lessons.starts_at < target_ends_at
    and lessons.ends_at > target_starts_at
  order by lessons.starts_at
  limit 1;

  if conflict_title is not null then
    raise exception 'Student already has an overlapping lesson: %', conflict_title
      using errcode = '23P01';
  end if;
end;
$$;

create or replace function public.validate_assignment_schedule()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  lesson_row public.lessons%rowtype;
begin
  if new.unassigned_at is not null then return new; end if;
  if tg_op = 'UPDATE' and old.unassigned_at is null
     and new.lesson_id = old.lesson_id and new.student_id = old.student_id then
    return new;
  end if;
  select * into lesson_row from public.lessons where id = new.lesson_id;
  perform public.assert_student_schedule_available(
    new.lesson_id, new.student_id, lesson_row.starts_at, lesson_row.ends_at
  );
  return new;
end;
$$;

create trigger lesson_assignments_validate_schedule
before insert or update on public.lesson_assignments
for each row execute function public.validate_assignment_schedule();

create or replace function public.validate_lesson_schedule_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  assignment record;
  enrollment_program text;
begin
  if new.status = 'cancelled' then return new; end if;
  if new.starts_at = old.starts_at and new.ends_at = old.ends_at
     and new.program_type = old.program_type and new.status = old.status then
    return new;
  end if;
  for assignment in
    select student_id, student_program_id
    from public.lesson_assignments
    where lesson_id = new.id and unassigned_at is null
    order by student_id
  loop
    select program_type into enrollment_program
    from public.student_programs where id = assignment.student_program_id;
    if enrollment_program is distinct from new.program_type then
      raise exception 'Assigned student program does not match the lesson.' using errcode = '23514';
    end if;
    perform public.assert_student_schedule_available(
      new.id, assignment.student_id, new.starts_at, new.ends_at
    );
  end loop;
  return new;
end;
$$;

create trigger lessons_validate_schedule_change
before update of starts_at, ends_at, program_type, status on public.lessons
for each row execute function public.validate_lesson_schedule_change();

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
    if saved_id is null then raise exception 'Editable lesson was not found.' using errcode = 'P0002'; end if;
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
    on conflict (lesson_id, student_id) do update
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

create or replace function public.confirm_draft_lesson(target_lesson_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare confirmed_id uuid;
begin
  if not public.is_operator() then raise exception 'Operator access is required.' using errcode = '42501'; end if;
  update public.lessons set status = 'scheduled'
  where id = target_lesson_id and status = 'draft'
  returning id into confirmed_id;
  if confirmed_id is null then raise exception 'Draft lesson was not found.' using errcode = 'P0002'; end if;
  return confirmed_id;
end;
$$;

drop policy lesson_assignments_student_select on public.lesson_assignments;
create policy lesson_assignments_student_select on public.lesson_assignments
for select to authenticated
using (
  student_id = (select private.current_student_id())
  and unassigned_at is null
  and exists (
    select 1 from public.lessons
    where lessons.id = lesson_assignments.lesson_id and lessons.status <> 'draft'
  )
);

drop policy lessons_student_select on public.lessons;
create policy lessons_student_select on public.lessons
for select to authenticated
using (
  status <> 'draft'
  and exists (
    select 1 from public.lesson_assignments assignments
    where assignments.lesson_id = lessons.id
      and assignments.student_id = (select private.current_student_id())
      and assignments.unassigned_at is null
  )
);

drop policy attendance_records_student_select on public.attendance_records;
create policy attendance_records_student_select on public.attendance_records
for select to authenticated
using (
  student_id = (select private.current_student_id())
  and exists (select 1 from public.lessons where lessons.id = attendance_records.lesson_id and lessons.status <> 'draft')
);

drop policy makeup_lessons_student_select on public.makeup_lessons;
create policy makeup_lessons_student_select on public.makeup_lessons
for select to authenticated
using (
  student_id = (select private.current_student_id())
  and exists (select 1 from public.lessons where lessons.id = makeup_lessons.original_lesson_id and lessons.status <> 'draft')
);

drop policy lesson_feedback_student_select on public.lesson_feedback;
create policy lesson_feedback_student_select on public.lesson_feedback
for select to authenticated
using (
  student_id = (select private.current_student_id())
  and published_at is not null
  and exists (select 1 from public.lessons where lessons.id = lesson_feedback.lesson_id and lessons.status <> 'draft')
);

grant execute on function public.save_lesson_with_assignments(uuid,text,timestamptz,timestamptz,text,text,text,text,uuid[]) to authenticated;
grant execute on function public.confirm_draft_lesson(uuid) to authenticated;
revoke all on function public.lock_student_schedule(uuid) from public, anon, authenticated;
revoke all on function public.assert_student_schedule_available(uuid,uuid,timestamptz,timestamptz) from public, anon, authenticated;
revoke all on function public.validate_assignment_schedule() from public, anon, authenticated;
revoke all on function public.validate_lesson_schedule_change() from public, anon, authenticated;

commit;
