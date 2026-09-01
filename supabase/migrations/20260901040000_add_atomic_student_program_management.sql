begin;

create or replace function public.save_student_profile_and_programs(
  target_student_id uuid,
  profile_nickname text,
  profile_gender text,
  profile_age integer,
  profile_phone text,
  profile_acquisition_source text,
  profile_joined_month date,
  profile_special_notes text,
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
  change_date date;
  change_stop_reason text;
begin
  if not (select public.is_operator()) then
    raise exception 'Only operators can save student profiles and programs.'
      using errcode = '42501';
  end if;

  if target_student_id is null
     or profile_nickname is null
     or btrim(profile_nickname) = '' then
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
    raise exception 'Too many program changes were requested.' using errcode = 'P0001';
  end if;

  select id into locked_student_id
  from public.students
  where id = target_student_id
  for update;

  if locked_student_id is null then
    raise exception 'Student not found.' using errcode = 'P0002';
  end if;

  update public.students
  set nickname = btrim(profile_nickname),
      gender = profile_gender,
      age = profile_age,
      phone = profile_phone,
      acquisition_source = profile_acquisition_source,
      joined_month = profile_joined_month,
      special_notes = profile_special_notes
  where id = target_student_id;

  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'Student profile was not updated.' using errcode = 'P0002';
  end if;

  for change_item in
    select value from jsonb_array_elements(coalesce(program_changes -> 'stop', '[]'::jsonb))
  loop
    change_id := (change_item ->> 'id')::uuid;
    change_date := (change_item ->> 'endedAt')::date;
    change_stop_reason := nullif(change_item ->> 'stopReason', '');

    if change_stop_reason is not null
       and change_stop_reason not in ('break', 'ended', 'other') then
      raise exception 'Stop reason is invalid.' using errcode = 'P0001';
    end if;

    update public.student_programs
    set status = 'stopped',
        ended_at = change_date,
        stop_reason = change_stop_reason
    where id = change_id
      and student_id = target_student_id
      and status = 'active';

    get diagnostics affected_rows = row_count;
    if affected_rows <> 1 then
      raise exception 'Active student program was not found.' using errcode = 'P0002';
    end if;
    stopped_count := stopped_count + 1;
  end loop;

  for change_item in
    select value from jsonb_array_elements(coalesce(program_changes -> 'reasonUpdates', '[]'::jsonb))
  loop
    change_id := (change_item ->> 'id')::uuid;
    change_stop_reason := nullif(change_item ->> 'stopReason', '');

    if change_stop_reason is not null
       and change_stop_reason not in ('break', 'ended', 'other') then
      raise exception 'Stop reason is invalid.' using errcode = 'P0001';
    end if;

    update public.student_programs
    set stop_reason = change_stop_reason
    where id = change_id
      and student_id = target_student_id
      and status = 'stopped';

    get diagnostics affected_rows = row_count;
    if affected_rows <> 1 then
      raise exception 'Stopped student program was not found.' using errcode = 'P0002';
    end if;
    reason_updated_count := reason_updated_count + 1;
  end loop;

  for change_item in
    select value from jsonb_array_elements(coalesce(program_changes -> 'start', '[]'::jsonb))
  loop
    change_program_type := change_item ->> 'programType';
    change_date := (change_item ->> 'startedAt')::date;

    if change_program_type not in ('weekday_vocal', 'weekend_vocal', 'rental', 'trial') then
      raise exception 'Program type is invalid.' using errcode = 'P0001';
    end if;

    insert into public.student_programs (
      student_id,
      program_type,
      status,
      started_at
    ) values (
      target_student_id,
      change_program_type,
      'active',
      change_date
    );
    started_count := started_count + 1;
  end loop;

  return jsonb_build_object(
    'studentId', target_student_id,
    'profileUpdated', true,
    'programsStopped', stopped_count,
    'programsStarted', started_count,
    'reasonsUpdated', reason_updated_count
  );
end;
$$;

revoke all on function public.save_student_profile_and_programs(
  uuid, text, text, integer, text, text, date, text, jsonb
) from public, anon;

grant execute on function public.save_student_profile_and_programs(
  uuid, text, text, integer, text, text, date, text, jsonb
) to authenticated;

commit;
