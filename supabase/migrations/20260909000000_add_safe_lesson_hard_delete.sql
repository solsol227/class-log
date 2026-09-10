begin;

-- A transaction-scoped capability lets the two existing delete guards distinguish
-- this audited RPC from direct table DELETEs. Authenticated callers cannot create
-- or inspect capabilities, and a failed RPC rolls the capability back with it.
create table private.lesson_delete_capabilities (
  transaction_id bigint not null,
  lesson_id uuid not null,
  actor_user_id uuid not null,
  makeup_lesson_ids uuid[] not null default '{}'::uuid[],
  primary key (transaction_id, lesson_id)
);

revoke all on table private.lesson_delete_capabilities from public, anon, authenticated;

create or replace function public.guard_lesson_assignment_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from private.lesson_delete_capabilities capability
    where capability.transaction_id = pg_catalog.txid_current()
      and capability.lesson_id = old.lesson_id
      and capability.actor_user_id = auth.uid()
  ) then
    return old;
  end if;

  raise exception 'Assignments must be preserved and soft-unassigned.' using errcode = 'P0001';
end;
$$;

create or replace function public.guard_lesson_delete_usage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from private.lesson_delete_capabilities capability
    where capability.transaction_id = pg_catalog.txid_current()
      and capability.lesson_id = old.id
      and capability.actor_user_id = auth.uid()
  ) then
    return old;
  end if;

  raise exception 'Lessons must be deleted through the protected delete workflow.' using errcode = 'P0001';
end;
$$;

-- Attendance remains append-only for direct table operations. The protected
-- lesson delete RPC may remove it only while holding the transaction capability.
create or replace function public.guard_attendance_makeup_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  makeup_row public.makeup_lessons%rowtype;
begin
  if tg_op = 'DELETE' then
    if exists (
      select 1
      from private.lesson_delete_capabilities capability
      where capability.transaction_id = pg_catalog.txid_current()
        and capability.lesson_id = old.lesson_id
        and capability.actor_user_id = auth.uid()
    ) then
      return old;
    end if;

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

-- Cancelled makeup history may be removed only when the lesson delete RPC has
-- explicitly included that exact makeup row in its transaction capability.
create or replace function public.guard_makeup_workflow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_status text;
  replacement_status text;
begin
  if tg_op = 'DELETE' then
    if old.status = 'cancelled' and exists (
      select 1
      from private.lesson_delete_capabilities capability
      where capability.transaction_id = pg_catalog.txid_current()
        and old.id = any(capability.makeup_lesson_ids)
        and capability.actor_user_id = auth.uid()
    ) then
      return old;
    end if;

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

create or replace function public.delete_lesson_safely(target_lesson_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  locked_lesson_id uuid;
  locked_lesson_status text;
  deleted_lesson_id uuid;
  removable_makeup_ids uuid[] := '{}'::uuid[];
  expected_assignment_count integer;
  deleted_assignment_count integer;
  expected_staff_count integer;
  deleted_staff_count integer;
  expected_attendance_count integer;
  deleted_attendance_count integer;
  expected_makeup_count integer;
  deleted_makeup_count integer;
  expected_makeup_event_count integer;
  deleted_makeup_event_count integer;
  deleted_lesson_count integer;
begin
  if private.is_owner() is not true then
    raise exception 'Schedule management access is required.' using errcode = '42501';
  end if;

  select lessons.id, lessons.status
  into locked_lesson_id, locked_lesson_status
  from public.lessons lessons
  where lessons.id = target_lesson_id
  for update;

  if not found then
    raise exception 'Lesson was not found.' using errcode = 'P0002';
  end if;

  -- Serialize allowance reads and assignment mutations in the same deterministic
  -- order used by schedule workflows before checking protected history.
  perform 1
  from public.lesson_assignments assignments
  where assignments.lesson_id = target_lesson_id
  order by assignments.student_id
  for update;

  perform 1
  from public.student_programs programs
  join public.lesson_assignments assignments
    on assignments.student_program_id = programs.id
  where assignments.lesson_id = target_lesson_id
  order by programs.id
  for update of programs;

  perform 1
  from public.lesson_staff staff
  where staff.lesson_id = target_lesson_id
  order by staff.staff_id, staff.role
  for update;

  perform 1
  from public.attendance_records attendance
  where attendance.lesson_id = target_lesson_id
  order by attendance.student_id, attendance.id
  for update;

  perform 1
  from public.lesson_feedback feedback
  where feedback.lesson_id = target_lesson_id
  order by feedback.id
  for update;

  perform 1
  from public.makeup_lessons makeups
  where makeups.original_lesson_id = target_lesson_id
     or makeups.replacement_lesson_id = target_lesson_id
     or exists (
       select 1 from public.makeup_lesson_events events
       where events.makeup_lesson_id = makeups.id
         and events.replacement_lesson_id = target_lesson_id
     )
  order by makeups.id
  for update;

  perform 1
  from public.makeup_lesson_events events
  where events.replacement_lesson_id = target_lesson_id
     or exists (
       select 1 from public.makeup_lessons makeups
       where makeups.id = events.makeup_lesson_id
         and (
           makeups.original_lesson_id = target_lesson_id
           or makeups.replacement_lesson_id = target_lesson_id
         )
     )
  order by events.id
  for update;

  select count(*)::integer into expected_assignment_count
  from public.lesson_assignments assignments
  where assignments.lesson_id = target_lesson_id;

  select count(*)::integer into expected_staff_count
  from public.lesson_staff staff
  where staff.lesson_id = target_lesson_id;

  select count(*)::integer into expected_attendance_count
  from public.attendance_records attendance
  where attendance.lesson_id = target_lesson_id;

  if exists (
    select 1 from public.lesson_feedback feedback
    where feedback.lesson_id = target_lesson_id
  ) then
    raise exception 'Lesson has feedback or comment history.' using errcode = 'P1001';
  end if;

  select coalesce(pg_catalog.array_agg(makeups.id order by makeups.id), '{}'::uuid[])
  into removable_makeup_ids
  from public.makeup_lessons makeups
  where makeups.original_lesson_id = target_lesson_id
     or makeups.replacement_lesson_id = target_lesson_id
     or exists (
       select 1 from public.makeup_lesson_events events
       where events.makeup_lesson_id = makeups.id
         and events.replacement_lesson_id = target_lesson_id
     );

  if pg_catalog.cardinality(removable_makeup_ids) > 0
     and (
       locked_lesson_status <> 'cancelled'
       or exists (
         select 1 from public.makeup_lessons makeups
         where makeups.id = any(removable_makeup_ids)
           and makeups.status <> 'cancelled'
       )
     ) then
    raise exception 'Lesson has an active or completed makeup relationship.' using errcode = 'P1002';
  end if;

  select count(*)::integer into expected_makeup_event_count
  from public.makeup_lesson_events events
  where events.makeup_lesson_id = any(removable_makeup_ids)
     or events.replacement_lesson_id = target_lesson_id;

  select count(*)::integer into expected_makeup_count
  from public.makeup_lessons makeups
  where makeups.id = any(removable_makeup_ids);

  insert into private.lesson_delete_capabilities(
    transaction_id, lesson_id, actor_user_id, makeup_lesson_ids
  ) values (
    pg_catalog.txid_current(), target_lesson_id, auth.uid(), removable_makeup_ids
  );

  delete from public.makeup_lesson_events
  where makeup_lesson_id = any(removable_makeup_ids)
     or replacement_lesson_id = target_lesson_id;
  get diagnostics deleted_makeup_event_count = row_count;

  if deleted_makeup_event_count <> expected_makeup_event_count then
    raise exception 'Makeup event delete affected an unexpected row count.' using errcode = 'P0001';
  end if;

  delete from public.makeup_lessons
  where id = any(removable_makeup_ids);
  get diagnostics deleted_makeup_count = row_count;

  if deleted_makeup_count <> expected_makeup_count then
    raise exception 'Makeup delete affected an unexpected row count.' using errcode = 'P0001';
  end if;

  delete from public.attendance_records
  where lesson_id = target_lesson_id;
  get diagnostics deleted_attendance_count = row_count;

  if deleted_attendance_count <> expected_attendance_count then
    raise exception 'Attendance delete affected an unexpected row count.' using errcode = 'P0001';
  end if;

  delete from public.lesson_assignments
  where lesson_id = target_lesson_id;
  get diagnostics deleted_assignment_count = row_count;

  if deleted_assignment_count <> expected_assignment_count then
    raise exception 'Lesson assignment delete affected an unexpected row count.' using errcode = 'P0001';
  end if;

  delete from public.lesson_staff
  where lesson_id = target_lesson_id;
  get diagnostics deleted_staff_count = row_count;

  if deleted_staff_count <> expected_staff_count then
    raise exception 'Lesson staff delete affected an unexpected row count.' using errcode = 'P0001';
  end if;

  delete from public.lessons
  where id = target_lesson_id
  returning id into deleted_lesson_id;
  get diagnostics deleted_lesson_count = row_count;

  if deleted_lesson_count <> 1 or deleted_lesson_id is distinct from target_lesson_id then
    raise exception 'Lesson delete did not affect the expected row.' using errcode = 'P0001';
  end if;

  delete from private.lesson_delete_capabilities
  where transaction_id = pg_catalog.txid_current()
    and lesson_id = target_lesson_id
    and actor_user_id = auth.uid();

  return deleted_lesson_id;
end;
$$;

-- Keep Draft confirmation behind the same owner permission boundary while
-- preserving the established student advisory-lock order.
create or replace function public.confirm_draft_lesson(target_lesson_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  locked_lesson_id uuid;
  assignment record;
  confirmed_id uuid;
begin
  if private.is_owner() is not true then
    raise exception 'Schedule management access is required.' using errcode = '42501';
  end if;

  select id into locked_lesson_id
  from public.lessons
  where id = target_lesson_id and status = 'draft'
  for update;
  if locked_lesson_id is null then
    raise exception 'Draft lesson was not found.' using errcode = 'P0002';
  end if;

  for assignment in
    select student_id
    from public.lesson_assignments
    where lesson_id = target_lesson_id and unassigned_at is null
    order by student_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(assignment.student_id::text, 0)
    );
  end loop;

  update public.lessons
  set status = case when ends_at <= now() then 'completed' else 'scheduled' end
  where id = target_lesson_id and status = 'draft'
  returning id into confirmed_id;

  return confirmed_id;
end;
$$;

revoke all on function public.guard_lesson_assignment_delete() from public, anon, authenticated;
revoke all on function public.guard_lesson_delete_usage() from public, anon, authenticated;
revoke all on function public.guard_attendance_makeup_history() from public, anon, authenticated;
revoke all on function public.guard_makeup_workflow() from public, anon, authenticated;
revoke all on function public.delete_lesson_safely(uuid) from public, anon;
grant execute on function public.delete_lesson_safely(uuid) to authenticated;
revoke all on function public.confirm_draft_lesson(uuid) from public, anon;
grant execute on function public.confirm_draft_lesson(uuid) to authenticated;

commit;
