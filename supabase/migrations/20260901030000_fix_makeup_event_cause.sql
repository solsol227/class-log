begin;

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
  elsif old.status = 'cancelled' and new.status = 'requested' then
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
    event_cause
  ) values (
    new.id,
    resolved_event,
    case when tg_op = 'INSERT' then null else old.status end,
    new.status,
    event_replacement_lesson_id,
    event_replacement_attendance_id,
    event_provenance,
    resolved_cause
  );

  return new;
end;
$$;

revoke all on function public.log_makeup_workflow_event()
from public, anon, authenticated;

commit;
