begin;

alter table public.makeup_lesson_events
  add column event_cause text not null default 'operator',
  add constraint makeup_lesson_events_cause_valid check (
    event_cause in ('operator', 'source_attendance', 'replacement_attendance')
  );

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

  resolved_cause := nullif(
    current_setting('class_log.makeup_event_cause', true),
    ''
  );
  if resolved_cause not in ('source_attendance', 'replacement_attendance') then
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

create or replace function public.guard_scheduled_makeup_assignment_release()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('class_log.allow_makeup_assignment_release', true) = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if (
    tg_op = 'DELETE'
    or (old.unassigned_at is null and new.unassigned_at is not null)
  ) and exists (
    select 1
    from public.makeup_lessons makeups
    where makeups.replacement_lesson_id = old.lesson_id
      and makeups.student_id = old.student_id
      and makeups.status = 'scheduled'
  ) then
    raise exception 'A scheduled makeup replacement assignment must be changed through the makeup workflow.'
      using errcode = 'P0001';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.guard_attendance_makeup_history()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  makeup_row public.makeup_lessons%rowtype;
begin
  if tg_op = 'DELETE' then
    raise exception 'Attendance history cannot be deleted.' using errcode = '23514';
  end if;

  if old.status = 'excused' and new.status <> 'excused' then
    select * into makeup_row
    from public.makeup_lessons
    where attendance_record_id = old.id
    for update;

    if found and makeup_row.status = 'completed' then
      raise exception 'Attendance with completed makeup cannot be changed.' using errcode = '23514';
    end if;

    if found and makeup_row.status = 'scheduled' then
      if makeup_row.replacement_assignment_provenance in ('created', 'reactivated') then
        if exists (
          select 1 from public.attendance_records
          where lesson_id = makeup_row.replacement_lesson_id
            and student_id = makeup_row.student_id
        ) or exists (
          select 1 from public.lesson_feedback
          where lesson_id = makeup_row.replacement_lesson_id
            and student_id = makeup_row.student_id
        ) or exists (
          select 1 from public.makeup_lessons other
          where other.id <> makeup_row.id
            and other.replacement_lesson_id = makeup_row.replacement_lesson_id
            and other.student_id = makeup_row.student_id
            and other.status in ('scheduled', 'completed')
        ) then
          raise exception 'The makeup-owned assignment has records that must be preserved.'
            using errcode = 'P0001';
        end if;

        perform set_config('class_log.allow_makeup_assignment_release', 'on', true);
        update public.lesson_assignments
        set unassigned_at = now()
        where lesson_id = makeup_row.replacement_lesson_id
          and student_id = makeup_row.student_id
          and unassigned_at is null;
        perform set_config('class_log.allow_makeup_assignment_release', '', true);
      end if;
    end if;

    if found and makeup_row.status in ('requested', 'scheduled') then
      perform set_config('class_log.makeup_event_cause', 'source_attendance', true);
      update public.makeup_lessons
      set status = 'cancelled'
      where id = makeup_row.id
        and status in ('requested', 'scheduled');
      perform set_config('class_log.makeup_event_cause', '', true);
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.create_excused_makeup_entitlement()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  entitlement_row public.makeup_lessons%rowtype;
  replacement_makeup_id uuid;
begin
  if new.status = 'excused' then
    select * into entitlement_row
    from public.makeup_lessons
    where attendance_record_id = new.id
    for update;

    if found and entitlement_row.status = 'cancelled' then
      if entitlement_row.replacement_lesson_id is not null
         and entitlement_row.replacement_assignment_provenance in ('created', 'reactivated') then
        if exists (
          select 1 from public.attendance_records
          where lesson_id = entitlement_row.replacement_lesson_id
            and student_id = entitlement_row.student_id
        ) or exists (
          select 1 from public.lesson_feedback
          where lesson_id = entitlement_row.replacement_lesson_id
            and student_id = entitlement_row.student_id
        ) or exists (
          select 1 from public.makeup_lessons other
          where other.id <> entitlement_row.id
            and other.replacement_lesson_id = entitlement_row.replacement_lesson_id
            and other.student_id = entitlement_row.student_id
            and other.status in ('scheduled', 'completed')
        ) then
          raise exception 'The previous makeup assignment has records that must be preserved.'
            using errcode = 'P0001';
        end if;

        update public.lesson_assignments
        set unassigned_at = now()
        where lesson_id = entitlement_row.replacement_lesson_id
          and student_id = entitlement_row.student_id
          and unassigned_at is null;
      end if;

      perform set_config('class_log.makeup_event_cause', 'source_attendance', true);
      update public.makeup_lessons
      set replacement_lesson_id = null,
          replacement_attendance_record_id = null,
          replacement_assignment_provenance = null,
          status = 'requested'
      where id = entitlement_row.id
        and status = 'cancelled';
      perform set_config('class_log.makeup_event_cause', '', true);
    elsif not found then
      perform set_config('class_log.makeup_event_cause', 'source_attendance', true);
      insert into public.makeup_lessons (
        student_id,
        original_lesson_id,
        attendance_record_id,
        status,
        created_by
      ) values (
        new.student_id,
        new.lesson_id,
        new.id,
        'requested',
        new.recorded_by
      )
      on conflict (attendance_record_id) do nothing;
      perform set_config('class_log.makeup_event_cause', '', true);
    end if;
  end if;

  select id into replacement_makeup_id
  from public.makeup_lessons
  where replacement_lesson_id = new.lesson_id
    and student_id = new.student_id
    and status = 'scheduled'
  for update;

  if replacement_makeup_id is not null
     and new.status in ('present', 'absent', 'excused') then
    perform set_config('class_log.makeup_event_cause', 'replacement_attendance', true);
    update public.makeup_lessons
    set replacement_attendance_record_id = new.id,
        status = 'completed'
    where id = replacement_makeup_id
      and status = 'scheduled';
    perform set_config('class_log.makeup_event_cause', '', true);
  end if;

  return new;
end;
$$;

create or replace function public.reschedule_makeup_lesson(
  target_makeup_id uuid,
  target_replacement_lesson_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  makeup_row public.makeup_lessons%rowtype;
  original_program text;
  replacement_program text;
  enrollment_id uuid;
  assignment_unassigned_at timestamptz;
  assignment_exists boolean;
  provenance text;
  rescheduled_id uuid;
begin
  if not public.is_operator() then
    raise exception 'Operator access is required.' using errcode = '42501';
  end if;

  select * into makeup_row
  from public.makeup_lessons
  where id = target_makeup_id and status = 'scheduled'
  for update;
  if not found then
    raise exception 'Scheduled makeup was not found.' using errcode = 'P0002';
  end if;
  if makeup_row.replacement_lesson_id = target_replacement_lesson_id then
    return makeup_row.id;
  end if;

  select program_type into original_program
  from public.lessons
  where id = makeup_row.original_lesson_id;
  select program_type into replacement_program
  from public.lessons
  where id = target_replacement_lesson_id and status <> 'cancelled';

  if original_program is null or replacement_program is null then
    raise exception 'Replacement lesson was not found.' using errcode = 'P0002';
  end if;
  if target_replacement_lesson_id = makeup_row.original_lesson_id
     or original_program is distinct from replacement_program then
    raise exception 'Makeup lessons must use a different lesson in the same program.' using errcode = '23514';
  end if;

  select id into enrollment_id
  from public.student_programs
  where student_id = makeup_row.student_id
    and program_type = replacement_program
    and status = 'active';
  if enrollment_id is null then
    raise exception 'Student does not have an active matching program.' using errcode = '23514';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(makeup_row.student_id::text, 0)
  );

  if makeup_row.replacement_assignment_provenance in ('created', 'reactivated') then
    if exists (
      select 1 from public.attendance_records
      where lesson_id = makeup_row.replacement_lesson_id
        and student_id = makeup_row.student_id
    ) or exists (
      select 1 from public.lesson_feedback
      where lesson_id = makeup_row.replacement_lesson_id
        and student_id = makeup_row.student_id
    ) or exists (
      select 1 from public.makeup_lessons other
      where other.id <> makeup_row.id
        and other.replacement_lesson_id = makeup_row.replacement_lesson_id
        and other.student_id = makeup_row.student_id
        and other.status in ('scheduled', 'completed')
    ) then
      raise exception 'The previous makeup assignment has records that must be preserved.'
        using errcode = 'P0001';
    end if;

    perform set_config('class_log.allow_makeup_assignment_release', 'on', true);
    update public.lesson_assignments
    set unassigned_at = now()
    where lesson_id = makeup_row.replacement_lesson_id
      and student_id = makeup_row.student_id
      and unassigned_at is null;
    perform set_config('class_log.allow_makeup_assignment_release', '', true);
  end if;

  select unassigned_at into assignment_unassigned_at
  from public.lesson_assignments
  where lesson_id = target_replacement_lesson_id
    and student_id = makeup_row.student_id
  for update;
  assignment_exists := found;

  if not assignment_exists then
    insert into public.lesson_assignments (
      lesson_id, student_id, student_program_id, unassigned_at
    ) values (
      target_replacement_lesson_id, makeup_row.student_id, enrollment_id, null
    );
    provenance := 'created';
  elsif assignment_unassigned_at is not null then
    update public.lesson_assignments
    set student_program_id = enrollment_id,
        unassigned_at = null
    where lesson_id = target_replacement_lesson_id
      and student_id = makeup_row.student_id;
    provenance := 'reactivated';
  else
    provenance := 'existing';
  end if;

  update public.makeup_lessons
  set replacement_lesson_id = target_replacement_lesson_id,
      replacement_attendance_record_id = null,
      replacement_assignment_provenance = provenance
  where id = target_makeup_id and status = 'scheduled'
  returning id into rescheduled_id;

  if rescheduled_id is null then
    raise exception 'Makeup replacement was not changed.' using errcode = 'P0002';
  end if;

  return rescheduled_id;
end;
$$;

create or replace function public.guard_scheduled_makeup_replacement_lesson()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'cancelled'
     and new.status = 'cancelled'
     and exists (
       select 1 from public.makeup_lessons
       where replacement_lesson_id = old.id
         and status = 'scheduled'
     ) then
    raise exception 'A lesson used by scheduled makeup cannot be cancelled.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger lessons_guard_scheduled_makeup_cancellation
before update of status on public.lessons
for each row execute function public.guard_scheduled_makeup_replacement_lesson();

revoke all on function public.guard_scheduled_makeup_replacement_lesson()
from public, anon, authenticated;
revoke all on function public.return_makeup_to_requested(uuid, boolean) from authenticated;
revoke all on function public.cancel_makeup_entitlement(uuid, boolean) from authenticated;
revoke all on function public.reopen_makeup_entitlement(uuid) from authenticated;
revoke all on function public.complete_makeup_lesson(uuid) from authenticated;

commit;
