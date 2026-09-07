-- PR24: operator classification only. No backfill or user-data DML.
begin;

alter table public.lessons add column schedule_category text
  constraint lessons_schedule_category_check check (schedule_category in ('weekday', 'weekend', 'trial'));
comment on column public.lessons.schedule_category is
  'Operator classification only; NULL is unclassified. Never determines enrollment eligibility, quota, or makeup rights.';

-- New inserts must be classified. Existing NULL rows remain editable.
create function public.require_new_lesson_category()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.schedule_category is null then
    raise exception 'Schedule category is required for new lessons.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.require_new_lesson_category() from public, anon;
create trigger lessons_require_category before insert on public.lessons
for each row execute function public.require_new_lesson_category();

-- Keep the existing eight-argument overload during the Vercel rollout. The new
-- app calls this nine-argument overload by named arguments, so PostgREST can
-- route both versions without ambiguity. The insert trigger still prevents the
-- legacy overload from creating an unclassified new lesson.
create or replace function public.save_lesson_with_assignments(
  lesson_id uuid,
  lesson_title text,
  lesson_starts_at timestamptz,
  lesson_ends_at timestamptz,
  lesson_location text,
  lesson_notes text,
  lesson_status text,
  selected_student_program_ids uuid[],
  lesson_category text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved_id uuid;
  current_lesson public.lessons%rowtype;
  resolved_status text;
  selection record;
  existing_assignment record;
begin
  if not public.is_operator() then
    raise exception 'Operator access is required.' using errcode = '42501';
  end if;
  if (lesson_id is null and lesson_category is null)
     or (lesson_category is not null and lesson_category not in ('weekday', 'weekend', 'trial')) then
    raise exception 'Schedule category is required for new lessons and must be valid.' using errcode = '23514';
  end if;
  if lesson_title is null or btrim(lesson_title) = '' then
    raise exception 'Lesson title is required.' using errcode = '23514';
  end if;
  if lesson_ends_at <= lesson_starts_at then
    raise exception 'Lesson end must be after start.' using errcode = '23514';
  end if;
  if lesson_status not in ('draft', 'scheduled') then
    raise exception 'Unsupported editable lesson status.' using errcode = '23514';
  end if;
  if array_position(coalesce(selected_student_program_ids, '{}'::uuid[]), null) is not null then
    raise exception 'Selected student programs cannot contain null.' using errcode = '23514';
  end if;
  if exists (
    select programs.student_id
    from public.student_programs programs
    where programs.id = any(coalesce(selected_student_program_ids, '{}'::uuid[]))
    group by programs.student_id
    having count(*) > 1
  ) then
    raise exception 'Only one student program can be used per student and lesson.' using errcode = '23514';
  end if;
  if (
    select count(*) from public.student_programs
    where id = any(coalesce(selected_student_program_ids, '{}'::uuid[]))
  ) <> cardinality(coalesce(selected_student_program_ids, '{}'::uuid[])) then
    raise exception 'A selected student program was not found.' using errcode = '23514';
  end if;

  resolved_status := case
    when lesson_status = 'draft' then 'draft'
    when lesson_ends_at <= now() then 'completed'
    else 'scheduled'
  end;

  if lesson_id is not null then
    select * into current_lesson
    from public.lessons
    where id = lesson_id and status <> 'cancelled'
    for update;
    saved_id := current_lesson.id;
    if saved_id is null then
      raise exception 'Editable lesson was not found.' using errcode = 'P0002';
    end if;
  end if;


  -- Metadata-only edits do not touch assignments, attendance, status, or quota.
  -- Compare under the lesson lock; assignment RPCs use the same lock.
  if saved_id is not null
     and current_lesson.starts_at = lesson_starts_at
     and current_lesson.ends_at = lesson_ends_at
     and lesson_status = (case when current_lesson.status = 'draft' then 'draft' else 'scheduled' end)
     and (select coalesce(array_agg(a.student_program_id order by a.student_program_id), '{}'::uuid[])
          from public.lesson_assignments a where a.lesson_id = saved_id and a.unassigned_at is null)
       = (select coalesce(array_agg(p order by p), '{}'::uuid[]) from unnest(selected_student_program_ids) p) then
    update public.lessons
    set title = btrim(lesson_title), location = nullif(btrim(lesson_location), ''),
        notes = nullif(btrim(lesson_notes), ''), schedule_category = lesson_category
    where id = saved_id;
    return saved_id;
  end if;

  for selection in
    select distinct programs.id, programs.student_id
    from public.student_programs programs
    where programs.id = any(coalesce(selected_student_program_ids, '{}'::uuid[]))
    order by programs.student_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(selection.student_id::text, 0)
    );
  end loop;

  for existing_assignment in
    select assignments.student_id
    from public.lesson_assignments assignments
    where assignments.lesson_id = save_lesson_with_assignments.lesson_id
      and assignments.unassigned_at is null
      and not exists (
        select 1
        from public.student_programs selected
        where selected.id = any(coalesce(selected_student_program_ids, '{}'::uuid[]))
          and selected.student_id = assignments.student_id
      )
    order by assignments.student_id
  loop
    update public.lesson_assignments
    set unassigned_at = now()
    where lesson_assignments.lesson_id = save_lesson_with_assignments.lesson_id
      and lesson_assignments.student_id = existing_assignment.student_id
      and lesson_assignments.unassigned_at is null;
  end loop;

  if lesson_id is null then
    insert into public.lessons(title, starts_at, ends_at, location, notes, status, schedule_category)
    values (
      btrim(lesson_title), lesson_starts_at, lesson_ends_at,
      nullif(btrim(lesson_location), ''), nullif(btrim(lesson_notes), ''),
      resolved_status, lesson_category
    ) returning id into saved_id;
  else
    perform set_config('class_log.skip_assignment_quota_check', 'on', true);
    update public.lessons
    set title = btrim(lesson_title),
        starts_at = lesson_starts_at,
        ends_at = lesson_ends_at,
        location = nullif(btrim(lesson_location), ''),
        notes = nullif(btrim(lesson_notes), ''),
        schedule_category = lesson_category,
        status = resolved_status
    where id = lesson_id
    returning id into saved_id;
    perform set_config('class_log.skip_assignment_quota_check', '', true);
  end if;

  for selection in
    select distinct programs.id, programs.student_id, programs.status
    from public.student_programs programs
    where programs.id = any(coalesce(selected_student_program_ids, '{}'::uuid[]))
    order by programs.student_id
  loop
    select assignments.student_program_id, assignments.unassigned_at
      into existing_assignment
    from public.lesson_assignments assignments
    where assignments.lesson_id = saved_id
      and assignments.student_id = selection.student_id;

    if selection.status <> 'active'
       and (
         not found
         or existing_assignment.unassigned_at is not null
         or existing_assignment.student_program_id is distinct from selection.id
       ) then
      raise exception 'Stopped student programs cannot receive ordinary assignments.' using errcode = '23514';
    end if;

    insert into public.lesson_assignments(
      lesson_id, student_id, student_program_id, unassigned_at
    ) values (
      saved_id, selection.student_id, selection.id, null
    )
    on conflict on constraint lesson_assignments_pkey do update
      set student_program_id = excluded.student_program_id,
          unassigned_at = null;
  end loop;

  return saved_id;
end;
$$;

create or replace function public.save_student_profile(
  target_student_id uuid, profile_nickname text, profile_gender text,
  profile_age integer, profile_phone text, profile_acquisition_source text,
  profile_joined_month date, profile_special_notes text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved_id uuid;
begin
  if not public.is_operator() then
    raise exception 'Operator access is required.' using errcode = '42501';
  end if;
  if target_student_id is null or profile_nickname is null or btrim(profile_nickname) = '' then
    raise exception 'Student profile values are invalid.' using errcode = '23514';
  end if;
  update public.students
  set nickname = btrim(profile_nickname), gender = profile_gender, age = profile_age,
      phone = profile_phone, acquisition_source = profile_acquisition_source,
      joined_month = profile_joined_month, special_notes = profile_special_notes
  where id = target_student_id returning id into saved_id;
  if saved_id is null then
    raise exception 'Student not found.' using errcode = 'P0002';
  end if;
  return jsonb_build_object('studentId', saved_id, 'profileUpdated', true);
end;
$$;

-- Preserve the program reconciliation transaction, constraints, and stop guards.
create or replace function public.save_student_programs(
  target_student_id uuid,
  program_changes jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  change_item jsonb;
  locked_student_id uuid;
  affected_rows integer;
  stopped_count integer := 0;
  started_count integer := 0;
  reason_updated_count integer := 0;
  change_id uuid;
  change_program_type text;
  change_base_allowance integer;
  change_date date;
  change_stop_reason text;
begin
  if not (select public.is_operator()) then
    raise exception 'Only operators can save student profiles and programs.' using errcode = '42501';
  end if;
  if target_student_id is null then
    raise exception 'Student profile values are invalid.' using errcode = 'P0001';
  end if;
  program_changes := coalesce(program_changes, '{}'::jsonb);
  if jsonb_typeof(program_changes) <> 'object'
     or jsonb_typeof(coalesce(program_changes -> 'stop', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(program_changes -> 'start', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(program_changes -> 'reasonUpdates', '[]'::jsonb)) <> 'array' then
    raise exception 'Program changes must be arrays.' using errcode = 'P0001';
  end if;

  if jsonb_array_length(coalesce(program_changes -> 'stop', '[]'::jsonb)) > 4
     or jsonb_array_length(coalesce(program_changes -> 'start', '[]'::jsonb)) > 4
     or jsonb_array_length(coalesce(program_changes -> 'reasonUpdates', '[]'::jsonb)) > 100 then
    raise exception 'Too many program changes.' using errcode = '23514';
  end if;

  select id into locked_student_id
  from public.students where id = target_student_id for update;
  if locked_student_id is null then
    raise exception 'Student not found.' using errcode = 'P0002';
  end if;


  for change_item in
    select value from jsonb_array_elements(coalesce(program_changes -> 'stop', '[]'::jsonb))
  loop
    change_id := (change_item ->> 'id')::uuid;
    change_date := (change_item ->> 'endedAt')::date;
    change_stop_reason := nullif(change_item ->> 'stopReason', '');
    if change_stop_reason is not null and change_stop_reason not in ('break', 'ended', 'other') then
      raise exception 'Stop reason is invalid.' using errcode = 'P0001';
    end if;
    update public.student_programs
    set status = 'stopped', ended_at = change_date, stop_reason = change_stop_reason
    where id = change_id and student_id = target_student_id and status = 'active';
    get diagnostics affected_rows = row_count;
    if affected_rows <> 1 then raise exception 'Active student program was not found.' using errcode = 'P0002'; end if;
    stopped_count := stopped_count + 1;
  end loop;

  for change_item in
    select value from jsonb_array_elements(coalesce(program_changes -> 'reasonUpdates', '[]'::jsonb))
  loop
    change_id := (change_item ->> 'id')::uuid;
    change_stop_reason := nullif(change_item ->> 'stopReason', '');
    if change_stop_reason is not null and change_stop_reason not in ('break', 'ended', 'other') then
      raise exception 'Stop reason is invalid.' using errcode = 'P0001';
    end if;
    update public.student_programs
    set stop_reason = change_stop_reason
    where id = change_id and student_id = target_student_id and status = 'stopped';
    get diagnostics affected_rows = row_count;
    if affected_rows <> 1 then raise exception 'Stopped student program was not found.' using errcode = 'P0002'; end if;
    reason_updated_count := reason_updated_count + 1;
  end loop;

  for change_item in
    select value from jsonb_array_elements(coalesce(program_changes -> 'start', '[]'::jsonb))
  loop
    change_program_type := change_item ->> 'programType';
    change_date := (change_item ->> 'startedAt')::date;
    change_base_allowance := case change_program_type
      when 'weekday_vocal' then 4
      when 'weekend_vocal' then 4
      when 'trial' then 1
      when 'rental' then (change_item ->> 'baseAllowanceCount')::integer
      else null
    end;
    if change_program_type not in ('weekday_vocal', 'weekend_vocal', 'rental', 'trial')
       or change_base_allowance is null or change_base_allowance <= 0 then
      raise exception 'Program type or base allowance is invalid.' using errcode = 'P0001';
    end if;
    insert into public.student_programs(
      student_id, program_type, status, started_at, base_allowance_count
    ) values (
      target_student_id, change_program_type, 'active', change_date, change_base_allowance
    );
    started_count := started_count + 1;
  end loop;

  return jsonb_build_object(
    'studentId', target_student_id, 'programsUpdated', true,
    'programsStopped', stopped_count, 'programsStarted', started_count,
    'reasonsUpdated', reason_updated_count
  );
end;
$$;

-- Keep the integrated RPC during the Vercel rollout. The new app no longer
-- calls it, while the currently deployed app can continue profile/program
-- saves until the code deployment is complete. Remove it in a later migration
-- after production deployment is verified.

revoke all on function public.save_lesson_with_assignments(uuid, text, timestamptz, timestamptz, text, text, text, uuid[], text) from public, anon;
grant execute on function public.save_lesson_with_assignments(uuid, text, timestamptz, timestamptz, text, text, text, uuid[], text) to authenticated;
revoke all on function public.save_student_profile(uuid, text, text, integer, text, text, date, text) from public, anon;
grant execute on function public.save_student_profile(uuid, text, text, integer, text, text, date, text) to authenticated;
revoke all on function public.save_student_programs(uuid, jsonb) from public, anon;
grant execute on function public.save_student_programs(uuid, jsonb) to authenticated;

commit;
