begin;

do $$
declare
  future_completed_count integer;
  elapsed_scheduled_count integer;
begin
  select count(*) into future_completed_count
  from public.lessons
  where status = 'completed' and ends_at > now();

  select count(*) into elapsed_scheduled_count
  from public.lessons
  where status = 'scheduled' and ends_at <= now();

  raise notice 'lesson_status_audit future_completed=% elapsed_scheduled=%',
    future_completed_count,
    elapsed_scheduled_count;
end;
$$;

create or replace function public.apply_lesson_time_status()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status in ('draft', 'cancelled') then
    return new;
  end if;

  new.status := case
    when new.ends_at <= now() then 'completed'
    else 'scheduled'
  end;
  return new;
end;
$$;

create trigger lessons_apply_time_status
before insert or update of ends_at, status on public.lessons
for each row execute function public.apply_lesson_time_status();

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
  selected_student_id uuid;
  lock_student_id uuid;
  enrollment_id uuid;
  resolved_status text;
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
  if lesson_status not in ('draft', 'scheduled') then
    raise exception 'Unsupported editable lesson status.' using errcode = '23514';
  end if;
  if array_position(coalesce(selected_student_ids, '{}'::uuid[]), null) is not null then
    raise exception 'Selected students cannot contain null.' using errcode = '23514';
  end if;

  resolved_status := case
    when lesson_status = 'draft' then 'draft'
    when lesson_ends_at <= now() then 'completed'
    else 'scheduled'
  end;

  if lesson_id is not null then
    select program_type
      into existing_program_type
    from public.lessons
    where id = lesson_id and status <> 'cancelled'
    for update;
    if not found then
      raise exception 'Editable lesson was not found.' using errcode = 'P0002';
    end if;
  end if;

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
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(lock_student_id::text, 0)
    );
  end loop;

  if lesson_id is null then
    insert into public.lessons(title, starts_at, ends_at, location, notes, program_type, status)
    values (
      btrim(lesson_title), lesson_starts_at, lesson_ends_at,
      nullif(btrim(lesson_location), ''), nullif(btrim(lesson_notes), ''),
      lesson_program_type, resolved_status
    )
    returning id into saved_id;
  else
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
        status = resolved_status
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

create or replace function public.confirm_draft_lesson(target_lesson_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  confirmed_id uuid;
begin
  if not public.is_operator() then
    raise exception 'Operator access is required.' using errcode = '42501';
  end if;

  update public.lessons
  set status = case when ends_at <= now() then 'completed' else 'scheduled' end
  where id = target_lesson_id and status = 'draft'
  returning id into confirmed_id;

  if confirmed_id is null then
    raise exception 'Draft lesson was not found.' using errcode = 'P0002';
  end if;
  return confirmed_id;
end;
$$;

create or replace function public.sync_elapsed_lesson_statuses(target_lesson_ids uuid[])
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  updated_count integer;
begin
  if not public.is_operator() then
    raise exception 'Operator access is required.' using errcode = '42501';
  end if;
  if target_lesson_ids is null or cardinality(target_lesson_ids) = 0 then
    return 0;
  end if;

  update public.lessons
  set status = 'completed'
  where id = any(target_lesson_ids)
    and status = 'scheduled'
    and ends_at <= now();

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

revoke all on function public.apply_lesson_time_status() from public, anon, authenticated;
revoke all on function public.sync_elapsed_lesson_statuses(uuid[]) from public, anon;
grant execute on function public.sync_elapsed_lesson_statuses(uuid[]) to authenticated;
revoke all on function public.save_lesson_with_assignments(uuid,text,timestamptz,timestamptz,text,text,text,text,uuid[]) from public, anon;
grant execute on function public.save_lesson_with_assignments(uuid,text,timestamptz,timestamptz,text,text,text,text,uuid[]) to authenticated;
revoke all on function public.confirm_draft_lesson(uuid) from public, anon;
grant execute on function public.confirm_draft_lesson(uuid) to authenticated;

commit;
