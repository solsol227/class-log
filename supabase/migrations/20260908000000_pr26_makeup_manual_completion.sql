begin;

alter table public.makeup_lessons
  add column completion_method text,
  add column completed_by uuid references auth.users(id) on delete set null,
  add column completed_at timestamptz,
  add column completion_note text,
  add constraint makeup_lessons_completion_method_valid check (
    completion_method is null
    or completion_method in ('replacement_attendance', 'manual_without_schedule')
  ),
  add constraint makeup_lessons_completion_note_length check (
    completion_note is null or char_length(completion_note) <= 500
  );

alter table public.makeup_lesson_events
  add column completion_method text,
  add column completion_note text,
  add constraint makeup_lesson_events_completion_method_valid check (
    completion_method is null
    or completion_method in ('replacement_attendance', 'manual_without_schedule')
  ),
  add constraint makeup_lesson_events_completion_note_valid check (
    completion_note is null
    or (
      completion_method = 'manual_without_schedule'
      and char_length(completion_note) <= 500
    )
  );

update public.makeup_lessons
set completion_method = 'replacement_attendance'
where status = 'completed'
  and replacement_attendance_record_id is not null
  and completion_method is null;

update public.makeup_lesson_events
set completion_method = 'replacement_attendance'
where event_type = 'completed'
  and replacement_attendance_record_id is not null
  and completion_method is null;

alter table public.makeup_lesson_events
  add constraint makeup_lesson_events_completion_context_valid check (
    (event_type = 'completed' and completion_method is not null)
    or (
      event_type = 'reopened'
      and (
        completion_method is null
        or completion_method = 'manual_without_schedule'
      )
    )
    or (
      event_type not in ('completed', 'reopened')
      and completion_method is null
    )
  );

comment on column public.makeup_lessons.completion_method is
  'Internal completion path used for data integrity and restore eligibility, not a separate UI status.';
comment on column public.makeup_lessons.completed_by is
  'Operator who manually completed the makeup without a replacement schedule, when applicable.';
comment on column public.makeup_lessons.completed_at is
  'Timestamp when the makeup was manually completed without a replacement schedule, when applicable.';
comment on column public.makeup_lessons.completion_note is
  'Optional operator note/reason for manual completion without a replacement schedule.';
comment on column public.makeup_lesson_events.completion_method is
  'Completion path captured at the time of a completed or reopened event.';
comment on column public.makeup_lesson_events.completion_note is
  'Manual completion note captured in append-only history.';

create or replace function public.set_makeup_completion_method()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'completed'
     and new.replacement_attendance_record_id is not null then
    new.completion_method := 'replacement_attendance';
    new.completed_by := null;
    new.completed_at := null;
    new.completion_note := null;
  end if;
  return new;
end;
$$;

drop trigger if exists makeup_lessons_a_set_completion_method on public.makeup_lessons;
create trigger makeup_lessons_a_set_completion_method
before insert or update on public.makeup_lessons
for each row execute function public.set_makeup_completion_method();

alter table public.makeup_lessons
  drop constraint makeup_lessons_workflow_shape,
  add constraint makeup_lessons_workflow_shape check (
    (
      status = 'requested'
      and replacement_lesson_id is null
      and replacement_attendance_record_id is null
      and replacement_assignment_provenance is null
      and completion_method is null
      and completed_by is null
      and completed_at is null
      and completion_note is null
    )
    or (
      status = 'scheduled'
      and replacement_lesson_id is not null
      and replacement_attendance_record_id is null
      and replacement_assignment_provenance is not null
      and completion_method is null
      and completed_by is null
      and completed_at is null
      and completion_note is null
    )
    or (
      status = 'completed'
      and (
        (
          completion_method = 'replacement_attendance'
          and replacement_lesson_id is not null
          and replacement_attendance_record_id is not null
          and replacement_assignment_provenance is not null
          and completed_by is null
          and completed_at is null
          and completion_note is null
        )
        or (
          completion_method = 'manual_without_schedule'
          and replacement_lesson_id is null
          and replacement_attendance_record_id is null
          and replacement_assignment_provenance is null
          and completed_by is not null
          and completed_at is not null
        )
      )
    )
    or (
      status = 'cancelled'
      and completion_method is null
      and completed_by is null
      and completed_at is null
      and completion_note is null
    )
  );

create or replace function public.guard_makeup_workflow()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  source_status text;
  replacement_status text;
begin
  if tg_op = 'DELETE' then
    raise exception 'Makeup history cannot be deleted.' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    if new.attendance_record_id is distinct from old.attendance_record_id
       or new.original_lesson_id is distinct from old.original_lesson_id
       or new.student_id is distinct from old.student_id then
      raise exception 'Makeup source attendance cannot be changed.' using errcode = '23514';
    end if;

    if old.status = 'completed'
       and not (
         old.completion_method = 'manual_without_schedule'
         and new.status = 'requested'
         and new.replacement_lesson_id is null
         and new.replacement_attendance_record_id is null
         and new.replacement_assignment_provenance is null
       ) then
      raise exception 'Completed makeup history cannot be changed.' using errcode = '23514';
    end if;

    if old.status = 'cancelled' and new.status <> 'requested' then
      raise exception 'Cancelled makeup can only be reopened.' using errcode = '23514';
    end if;

    if not (
      new.status = old.status
      or (old.status = 'requested' and new.status in ('scheduled', 'completed', 'cancelled'))
      or (old.status = 'scheduled' and new.status in ('requested', 'completed', 'cancelled'))
      or (old.status = 'completed' and old.completion_method = 'manual_without_schedule' and new.status = 'requested')
      or (old.status = 'cancelled' and new.status = 'requested')
    ) then
      raise exception 'Invalid makeup status transition.' using errcode = '23514';
    end if;
  elsif new.status <> 'requested' then
    raise exception 'New makeup entitlements must start as requested.' using errcode = '23514';
  end if;

  select status into source_status
  from public.attendance_records
  where id = new.attendance_record_id
    and lesson_id = new.original_lesson_id
    and student_id = new.student_id;

  if source_status is null then
    raise exception 'Makeup source attendance was not found.' using errcode = '23514';
  end if;

  if new.status in ('requested', 'scheduled', 'completed')
     and source_status <> 'excused' then
    raise exception 'Open makeup requires excused source attendance.' using errcode = '23514';
  end if;

  if new.status = 'completed' and new.completion_method = 'replacement_attendance' then
    select status into replacement_status
    from public.attendance_records
    where id = new.replacement_attendance_record_id
      and lesson_id = new.replacement_lesson_id
      and student_id = new.student_id;

    if replacement_status not in ('present', 'absent', 'excused') then
      raise exception 'Replacement attendance is required to complete makeup.' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.log_makeup_workflow_event()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  resolved_event text;
  event_replacement_lesson_id uuid;
  event_replacement_attendance_id uuid;
  event_provenance text;
  event_completion_method text;
  event_completion_note text;
  resolved_cause text;
begin
  if tg_op = 'INSERT' then
    resolved_event := 'created';
  elsif old.status = new.status
        and old.replacement_lesson_id is distinct from new.replacement_lesson_id then
    resolved_event := 'rescheduled';
  elsif old.status = 'requested' and new.status = 'scheduled' then
    resolved_event := 'scheduled';
  elsif old.status = 'scheduled' and new.status = 'requested' then
    resolved_event := 'unmatched';
  elsif new.status = 'completed' and old.status <> 'completed' then
    resolved_event := 'completed';
  elsif new.status = 'cancelled' and old.status <> 'cancelled' then
    resolved_event := 'cancelled';
  elsif old.status in ('cancelled', 'completed') and new.status = 'requested' then
    resolved_event := 'reopened';
  else
    return new;
  end if;

  if resolved_event in ('unmatched', 'reopened') then
    event_replacement_lesson_id := old.replacement_lesson_id;
    event_replacement_attendance_id := old.replacement_attendance_record_id;
    event_provenance := old.replacement_assignment_provenance;
  else
    event_replacement_lesson_id := new.replacement_lesson_id;
    event_replacement_attendance_id := new.replacement_attendance_record_id;
    event_provenance := new.replacement_assignment_provenance;
  end if;

  if resolved_event = 'reopened' then
    event_completion_method := old.completion_method;
    event_completion_note := old.completion_note;
  else
    event_completion_method := new.completion_method;
    event_completion_note := new.completion_note;
  end if;

  resolved_cause := coalesce(
    nullif(current_setting('class_log.makeup_event_cause', true), ''),
    'operator'
  );
  if resolved_cause not in ('source_attendance', 'replacement_attendance', 'operator') then
    resolved_cause := 'operator';
  end if;

  insert into public.makeup_lesson_events (
    makeup_lesson_id,
    event_type,
    from_status,
    to_status,
    replacement_lesson_id,
    replacement_attendance_record_id,
    assignment_provenance,
    event_cause,
    completion_method,
    completion_note
  ) values (
    new.id,
    resolved_event,
    case when tg_op = 'INSERT' then null else old.status end,
    new.status,
    event_replacement_lesson_id,
    event_replacement_attendance_id,
    event_provenance,
    resolved_cause,
    event_completion_method,
    event_completion_note
  );

  return new;
end;
$$;

create or replace function public.complete_makeup_without_schedule(
  target_makeup_id uuid,
  completion_reason text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  completed_id uuid;
begin
  if not public.is_operator() then
    raise exception 'Operator access is required.' using errcode = '42501';
  end if;

  update public.makeup_lessons
  set status = 'completed',
      completion_method = 'manual_without_schedule',
      completed_by = auth.uid(),
      completed_at = now(),
      completion_note = nullif(btrim(completion_reason), '')
  where id = target_makeup_id
    and status = 'requested'
    and replacement_lesson_id is null
    and replacement_attendance_record_id is null
  returning id into completed_id;

  if completed_id is null then
    raise exception 'Requested makeup without a replacement schedule was not found.' using errcode = 'P0002';
  end if;

  return completed_id;
end;
$$;

create or replace function public.restore_manual_makeup_completion(target_makeup_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  restored_id uuid;
begin
  if not public.is_operator() then
    raise exception 'Operator access is required.' using errcode = '42501';
  end if;

  update public.makeup_lessons
  set status = 'requested',
      completion_method = null,
      completed_by = null,
      completed_at = null,
      completion_note = null
  where id = target_makeup_id
    and status = 'completed'
    and completion_method = 'manual_without_schedule'
    and replacement_lesson_id is null
    and replacement_attendance_record_id is null
  returning id into restored_id;

  if restored_id is null then
    raise exception 'Manual makeup completion was not found.' using errcode = 'P0002';
  end if;

  return restored_id;
end;
$$;

revoke all on function public.complete_makeup_without_schedule(uuid, text) from public, anon;
revoke all on function public.restore_manual_makeup_completion(uuid) from public, anon;
grant execute on function public.complete_makeup_without_schedule(uuid, text) to authenticated;
grant execute on function public.restore_manual_makeup_completion(uuid) to authenticated;
revoke all on function public.set_makeup_completion_method() from public, anon, authenticated;
revoke all on function public.guard_makeup_workflow() from public, anon, authenticated;
revoke all on function public.log_makeup_workflow_event() from public, anon, authenticated;

commit;
