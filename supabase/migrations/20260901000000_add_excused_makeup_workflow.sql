begin;

-- A makeup entitlement is anchored to exactly one excused attendance record.
-- Keep the existing lesson/student columns for current query paths, while a
-- composite FK prevents them from drifting away from the source attendance.
alter table public.attendance_records
  add constraint attendance_records_id_lesson_student_unique
    unique (id, lesson_id, student_id);

alter table public.makeup_lessons
  add column attendance_record_id uuid,
  add column replacement_attendance_record_id uuid,
  add column replacement_assignment_provenance text;

-- Backfill any rows that may have been created after the PR19 preflight. The
-- migration intentionally aborts rather than guessing when the source is not
-- an excused attendance record.
update public.makeup_lessons makeups
set attendance_record_id = attendance.id
from public.attendance_records attendance
where attendance.lesson_id = makeups.original_lesson_id
  and attendance.student_id = makeups.student_id
  and attendance.status = 'excused'
  and makeups.attendance_record_id is null;

do $$
begin
  if exists (
    select 1
    from public.makeup_lessons
    where attendance_record_id is null
  ) then
    raise exception 'Every existing makeup must have one excused source attendance.';
  end if;

  if exists (
    select attendance_record_id
    from public.makeup_lessons
    group by attendance_record_id
    having count(*) > 1
  ) then
    raise exception 'An excused attendance is linked to more than one makeup.';
  end if;

  if exists (
    select 1
    from public.makeup_lessons
    where status = 'requested'
      and replacement_lesson_id is not null
  ) then
    raise exception 'A requested makeup unexpectedly has a replacement lesson.';
  end if;
end;
$$;

update public.makeup_lessons
set replacement_assignment_provenance = 'existing'
where replacement_lesson_id is not null
  and replacement_assignment_provenance is null;

update public.makeup_lessons makeups
set replacement_attendance_record_id = attendance.id
from public.attendance_records attendance
where makeups.status = 'completed'
  and attendance.lesson_id = makeups.replacement_lesson_id
  and attendance.student_id = makeups.student_id
  and makeups.replacement_attendance_record_id is null;

do $$
begin
  if exists (
    select 1
    from public.makeup_lessons
    where status = 'completed'
      and replacement_attendance_record_id is null
  ) then
    raise exception 'Every completed makeup must have replacement attendance.';
  end if;
end;
$$;

-- Every existing excused attendance becomes one requested entitlement. The
-- original recorder is the most accurate available creator for backfilled rows.
insert into public.makeup_lessons (
  student_id,
  original_lesson_id,
  attendance_record_id,
  status,
  created_by
)
select
  attendance.student_id,
  attendance.lesson_id,
  attendance.id,
  'requested',
  attendance.recorded_by
from public.attendance_records attendance
where attendance.status = 'excused'
  and not exists (
    select 1
    from public.makeup_lessons makeups
    where makeups.attendance_record_id = attendance.id
  );

alter table public.makeup_lessons
  alter column attendance_record_id set not null,
  add constraint makeup_lessons_attendance_record_unique
    unique (attendance_record_id),
  add constraint makeup_lessons_source_attendance_fk
    foreign key (attendance_record_id, original_lesson_id, student_id)
    references public.attendance_records(id, lesson_id, student_id)
    on delete restrict,
  add constraint makeup_lessons_replacement_attendance_unique
    unique (replacement_attendance_record_id),
  add constraint makeup_lessons_replacement_attendance_fk
    foreign key (replacement_attendance_record_id, replacement_lesson_id, student_id)
    references public.attendance_records(id, lesson_id, student_id)
    on delete restrict,
  add constraint makeup_lessons_assignment_provenance_valid check (
    replacement_assignment_provenance is null
    or replacement_assignment_provenance in ('existing', 'created', 'reactivated')
  );

alter table public.makeup_lessons
  drop constraint makeup_lessons_original_assignment_fk,
  add constraint makeup_lessons_original_assignment_fk
    foreign key (original_lesson_id, student_id)
    references public.lesson_assignments(lesson_id, student_id)
    on delete restrict;

alter table public.makeup_lessons
  drop constraint makeup_lessons_replacement_student_unique,
  drop constraint makeup_lessons_replacement_required,
  add constraint makeup_lessons_workflow_shape check (
    (
      status = 'requested'
      and replacement_lesson_id is null
      and replacement_attendance_record_id is null
      and replacement_assignment_provenance is null
    )
    or (
      status = 'scheduled'
      and replacement_lesson_id is not null
      and replacement_attendance_record_id is null
      and replacement_assignment_provenance is not null
    )
    or (
      status = 'completed'
      and replacement_lesson_id is not null
      and replacement_attendance_record_id is not null
      and replacement_assignment_provenance is not null
    )
    or status = 'cancelled'
  );

create unique index makeup_lessons_active_replacement_student_idx
  on public.makeup_lessons(replacement_lesson_id, student_id)
  where status in ('scheduled', 'completed');

comment on column public.makeup_lessons.attendance_record_id is
  'The unique excused attendance record that created this makeup entitlement.';
comment on column public.makeup_lessons.replacement_attendance_record_id is
  'The replacement lesson attendance that completed this makeup workflow.';
comment on column public.makeup_lessons.replacement_assignment_provenance is
  'Whether the replacement assignment already existed, was created, or was reactivated by makeup scheduling.';

create table public.makeup_lesson_events (
  id uuid primary key default gen_random_uuid(),
  makeup_lesson_id uuid not null
    references public.makeup_lessons(id) on delete restrict,
  event_type text not null,
  from_status text,
  to_status text not null,
  replacement_lesson_id uuid
    references public.lessons(id) on delete restrict,
  replacement_attendance_record_id uuid
    references public.attendance_records(id) on delete restrict,
  assignment_provenance text,
  actor_user_id uuid default auth.uid()
    references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint makeup_lesson_events_type_valid check (
    event_type in ('created', 'scheduled', 'rescheduled', 'unmatched', 'completed', 'cancelled', 'reopened')
  ),
  constraint makeup_lesson_events_from_status_valid check (
    from_status is null or from_status in ('requested', 'scheduled', 'completed', 'cancelled')
  ),
  constraint makeup_lesson_events_to_status_valid check (
    to_status in ('requested', 'scheduled', 'completed', 'cancelled')
  ),
  constraint makeup_lesson_events_provenance_valid check (
    assignment_provenance is null
    or assignment_provenance in ('existing', 'created', 'reactivated')
  )
);

create index makeup_lesson_events_makeup_created_idx
  on public.makeup_lesson_events(makeup_lesson_id, created_at);

alter table public.makeup_lesson_events enable row level security;
alter table public.makeup_lesson_events force row level security;

create policy makeup_lesson_events_operator_select
on public.makeup_lesson_events
for select to authenticated
using ((select public.is_operator()));

create policy makeup_lesson_events_operator_insert
on public.makeup_lesson_events
for insert to authenticated
with check ((select public.is_operator()));

revoke all on table public.makeup_lesson_events from public, anon;
grant select, insert on table public.makeup_lesson_events to authenticated;

insert into public.makeup_lesson_events (
  makeup_lesson_id,
  event_type,
  from_status,
  to_status,
  replacement_lesson_id,
  replacement_attendance_record_id,
  assignment_provenance,
  actor_user_id,
  created_at
)
select
  id,
  'created',
  null,
  status,
  replacement_lesson_id,
  replacement_attendance_record_id,
  replacement_assignment_provenance,
  created_by,
  created_at
from public.makeup_lessons;

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

    if old.status = 'completed' then
      raise exception 'Completed makeup history cannot be changed.' using errcode = '23514';
    end if;

    if old.status = 'cancelled' and new.status <> 'requested' then
      raise exception 'Cancelled makeup can only be reopened.' using errcode = '23514';
    end if;

    if not (
      new.status = old.status
      or (old.status = 'requested' and new.status in ('scheduled', 'cancelled'))
      or (old.status = 'scheduled' and new.status in ('requested', 'completed', 'cancelled'))
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

  if new.status = 'completed' then
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

create trigger makeup_lessons_guard_workflow
before insert or update or delete on public.makeup_lessons
for each row execute function public.guard_makeup_workflow();

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

  insert into public.makeup_lesson_events (
    makeup_lesson_id,
    event_type,
    from_status,
    to_status,
    replacement_lesson_id,
    replacement_attendance_record_id,
    assignment_provenance
  ) values (
    new.id,
    resolved_event,
    case when tg_op = 'INSERT' then null else old.status end,
    new.status,
    event_replacement_lesson_id,
    event_replacement_attendance_id,
    event_provenance
  );

  return new;
end;
$$;

create trigger makeup_lessons_log_workflow_event
after insert or update on public.makeup_lessons
for each row execute function public.log_makeup_workflow_event();

create or replace function public.guard_attendance_makeup_history()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  linked_makeup_status text;
begin
  if tg_op = 'DELETE' then
    raise exception 'Attendance history cannot be deleted.' using errcode = '23514';
  end if;

  if old.status = 'excused' and new.status <> 'excused' then
    select status into linked_makeup_status
    from public.makeup_lessons
    where attendance_record_id = old.id;

    if linked_makeup_status in ('requested', 'scheduled') then
      raise exception 'Cancel the makeup entitlement before changing excused attendance.' using errcode = '23514';
    end if;

    if linked_makeup_status = 'completed' then
      raise exception 'Attendance with completed makeup cannot be changed.' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger attendance_records_guard_makeup_history
before update of status or delete on public.attendance_records
for each row execute function public.guard_attendance_makeup_history();

create or replace function public.create_excused_makeup_entitlement()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'excused' then
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
  end if;

  return new;
end;
$$;

create trigger attendance_records_create_makeup_entitlement
after insert or update of status on public.attendance_records
for each row execute function public.create_excused_makeup_entitlement();

create or replace function public.schedule_makeup_lesson(
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
  scheduled_id uuid;
begin
  if not public.is_operator() then
    raise exception 'Operator access is required.' using errcode = '42501';
  end if;

  select * into makeup_row
  from public.makeup_lessons
  where id = target_makeup_id and status = 'requested'
  for update;
  if not found then
    raise exception 'Requested makeup was not found.' using errcode = 'P0002';
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
      replacement_assignment_provenance = provenance,
      status = 'scheduled'
  where id = target_makeup_id and status = 'requested'
  returning id into scheduled_id;

  if scheduled_id is null then
    raise exception 'Makeup was not scheduled.' using errcode = 'P0002';
  end if;

  return scheduled_id;
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

create or replace function public.return_makeup_to_requested(
  target_makeup_id uuid,
  release_replacement_assignment boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  makeup_row public.makeup_lessons%rowtype;
  released boolean := false;
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

  update public.makeup_lessons
  set replacement_lesson_id = null,
      replacement_attendance_record_id = null,
      replacement_assignment_provenance = null,
      status = 'requested'
  where id = target_makeup_id and status = 'scheduled';

  if release_replacement_assignment
     and makeup_row.replacement_assignment_provenance in ('created', 'reactivated')
     and not exists (
       select 1 from public.attendance_records
       where lesson_id = makeup_row.replacement_lesson_id
         and student_id = makeup_row.student_id
     )
     and not exists (
       select 1 from public.lesson_feedback
       where lesson_id = makeup_row.replacement_lesson_id
         and student_id = makeup_row.student_id
     )
     and not exists (
       select 1 from public.makeup_lessons other
       where other.id <> makeup_row.id
         and other.replacement_lesson_id = makeup_row.replacement_lesson_id
         and other.student_id = makeup_row.student_id
         and other.status in ('scheduled', 'completed')
     ) then
    update public.lesson_assignments
    set unassigned_at = now()
    where lesson_id = makeup_row.replacement_lesson_id
      and student_id = makeup_row.student_id
      and unassigned_at is null;
    released := found;
  end if;

  return jsonb_build_object(
    'makeup_id', makeup_row.id,
    'assignment_released', released
  );
end;
$$;

create or replace function public.cancel_makeup_entitlement(
  target_makeup_id uuid,
  release_replacement_assignment boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  makeup_row public.makeup_lessons%rowtype;
  released boolean := false;
begin
  if not public.is_operator() then
    raise exception 'Operator access is required.' using errcode = '42501';
  end if;

  select * into makeup_row
  from public.makeup_lessons
  where id = target_makeup_id and status in ('requested', 'scheduled')
  for update;
  if not found then
    raise exception 'Cancellable makeup was not found.' using errcode = 'P0002';
  end if;

  update public.makeup_lessons
  set status = 'cancelled'
  where id = target_makeup_id and status in ('requested', 'scheduled');

  if makeup_row.status = 'scheduled'
     and release_replacement_assignment
     and makeup_row.replacement_assignment_provenance in ('created', 'reactivated')
     and not exists (
       select 1 from public.attendance_records
       where lesson_id = makeup_row.replacement_lesson_id
         and student_id = makeup_row.student_id
     )
     and not exists (
       select 1 from public.lesson_feedback
       where lesson_id = makeup_row.replacement_lesson_id
         and student_id = makeup_row.student_id
     )
     and not exists (
       select 1 from public.makeup_lessons other
       where other.id <> makeup_row.id
         and other.replacement_lesson_id = makeup_row.replacement_lesson_id
         and other.student_id = makeup_row.student_id
         and other.status in ('scheduled', 'completed')
     ) then
    update public.lesson_assignments
    set unassigned_at = now()
    where lesson_id = makeup_row.replacement_lesson_id
      and student_id = makeup_row.student_id
      and unassigned_at is null;
    released := found;
  end if;

  return jsonb_build_object(
    'makeup_id', makeup_row.id,
    'assignment_released', released
  );
end;
$$;

create or replace function public.reopen_makeup_entitlement(target_makeup_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  reopened_id uuid;
begin
  if not public.is_operator() then
    raise exception 'Operator access is required.' using errcode = '42501';
  end if;

  update public.makeup_lessons
  set replacement_lesson_id = null,
      replacement_attendance_record_id = null,
      replacement_assignment_provenance = null,
      status = 'requested'
  where id = target_makeup_id
    and status = 'cancelled'
    and exists (
      select 1
      from public.attendance_records attendance
      where attendance.id = makeup_lessons.attendance_record_id
        and attendance.status = 'excused'
    )
  returning id into reopened_id;

  if reopened_id is null then
    raise exception 'Cancelled makeup cannot be reopened.' using errcode = 'P0002';
  end if;

  return reopened_id;
end;
$$;

create or replace function public.complete_makeup_lesson(target_makeup_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  makeup_row public.makeup_lessons%rowtype;
  replacement_attendance_id uuid;
  completed_id uuid;
begin
  if not public.is_operator() then
    raise exception 'Operator access is required.' using errcode = '42501';
  end if;

  select * into makeup_row
  from public.makeup_lessons
  where id = target_makeup_id and status = 'scheduled'
  for update;
  if not found or makeup_row.replacement_lesson_id is null then
    raise exception 'Scheduled makeup was not found.' using errcode = 'P0002';
  end if;

  select id into replacement_attendance_id
  from public.attendance_records
  where lesson_id = makeup_row.replacement_lesson_id
    and student_id = makeup_row.student_id
    and status in ('present', 'absent', 'excused');

  if replacement_attendance_id is null then
    raise exception 'Replacement attendance is required.' using errcode = '23514';
  end if;

  update public.makeup_lessons
  set replacement_attendance_record_id = replacement_attendance_id,
      status = 'completed'
  where id = target_makeup_id and status = 'scheduled'
  returning id into completed_id;

  if completed_id is null then
    raise exception 'Makeup was not completed.' using errcode = 'P0002';
  end if;

  return completed_id;
end;
$$;

revoke all on function public.guard_makeup_workflow() from public, anon, authenticated;
revoke all on function public.log_makeup_workflow_event() from public, anon, authenticated;
revoke all on function public.guard_attendance_makeup_history() from public, anon, authenticated;
revoke all on function public.create_excused_makeup_entitlement() from public, anon, authenticated;

revoke all on function public.schedule_makeup_lesson(uuid, uuid) from public, anon;
revoke all on function public.reschedule_makeup_lesson(uuid, uuid) from public, anon;
revoke all on function public.return_makeup_to_requested(uuid, boolean) from public, anon;
revoke all on function public.cancel_makeup_entitlement(uuid, boolean) from public, anon;
revoke all on function public.reopen_makeup_entitlement(uuid) from public, anon;
revoke all on function public.complete_makeup_lesson(uuid) from public, anon;
revoke all on function public.delete_requested_makeup(uuid) from authenticated;

grant execute on function public.schedule_makeup_lesson(uuid, uuid) to authenticated;
grant execute on function public.reschedule_makeup_lesson(uuid, uuid) to authenticated;
grant execute on function public.return_makeup_to_requested(uuid, boolean) to authenticated;
grant execute on function public.cancel_makeup_entitlement(uuid, boolean) to authenticated;
grant execute on function public.reopen_makeup_entitlement(uuid) to authenticated;
grant execute on function public.complete_makeup_lesson(uuid) to authenticated;

revoke delete on table public.attendance_records from authenticated;
revoke delete on table public.makeup_lessons from authenticated;

commit;
