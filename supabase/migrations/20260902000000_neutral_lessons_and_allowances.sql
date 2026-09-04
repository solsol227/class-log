begin;

-- Programs belong to student enrollments. Lessons are neutral schedule slots.
alter table public.student_programs
  add column base_allowance_count integer;

update public.student_programs
set base_allowance_count = case program_type
  when 'weekday_vocal' then 4
  when 'weekend_vocal' then 4
  when 'trial' then 1
  else null
end;

alter table public.student_programs
  add constraint student_programs_base_allowance_valid check (
    ((program_type = 'weekday_vocal' and base_allowance_count = 4)
    or (program_type = 'weekend_vocal' and base_allowance_count = 4)
    or (program_type = 'trial' and base_allowance_count = 1)
    or (program_type = 'rental' and (base_allowance_count is null or base_allowance_count > 0))) is true
  );

comment on column public.student_programs.base_allowance_count is
  'Base entitlement count. Vocal programs repeat monthly; trial and rental apply to the enrollment lifetime. Legacy rental rows remain null until an operator configures them.';

create or replace function public.guard_student_program_base_allowance()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.program_type is distinct from old.program_type then
    raise exception 'A student program type is immutable; create a new enrollment.' using errcode = '23514';
  end if;
  if new.base_allowance_count is distinct from old.base_allowance_count
     and old.base_allowance_count is not null then
    raise exception 'Base allowance is immutable; use an append-only adjustment.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger student_programs_guard_base_allowance
before update of base_allowance_count, program_type on public.student_programs
for each row execute function public.guard_student_program_base_allowance();

create table public.student_program_allowance_adjustments (
  id uuid primary key default gen_random_uuid(),
  student_program_id uuid not null
    references public.student_programs(id) on delete restrict,
  target_month date,
  delta integer not null,
  reason text not null,
  created_by uuid not null default auth.uid()
    references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint student_program_allowance_adjustments_delta_valid check (delta <> 0),
  constraint student_program_allowance_adjustments_reason_valid check (btrim(reason) <> ''),
  constraint student_program_allowance_adjustments_month_valid check (
    target_month is null or target_month = date_trunc('month', target_month)::date
  )
);

create index student_program_allowance_adjustments_program_month_idx
  on public.student_program_allowance_adjustments(student_program_id, target_month);

alter table public.student_program_allowance_adjustments enable row level security;
alter table public.student_program_allowance_adjustments force row level security;

create policy student_program_allowance_adjustments_operator_select
on public.student_program_allowance_adjustments
for select to authenticated
using ((select public.is_operator()));

create policy student_program_allowance_adjustments_operator_insert
on public.student_program_allowance_adjustments
for insert to authenticated
with check ((select public.is_operator()) and created_by = (select auth.uid()));

revoke all on table public.student_program_allowance_adjustments from public, anon;
grant select, insert on table public.student_program_allowance_adjustments to authenticated;

-- Snapshot the exact enrollment that produced every existing makeup right.
alter table public.makeup_lessons
  add column source_student_program_id uuid;

update public.makeup_lessons makeups
set source_student_program_id = assignments.student_program_id
from public.lesson_assignments assignments
where assignments.lesson_id = makeups.original_lesson_id
  and assignments.student_id = makeups.student_id
  and makeups.source_student_program_id is null;

do $$
begin
  if exists (
    select 1
    from public.makeup_lessons
    where source_student_program_id is null
  ) then
    raise exception 'Every existing makeup must resolve to one source student program.';
  end if;

  if exists (
    select 1
    from public.makeup_lessons makeups
    join public.lesson_assignments replacement
      on replacement.lesson_id = makeups.replacement_lesson_id
     and replacement.student_id = makeups.student_id
    where makeups.status in ('scheduled', 'completed')
      and replacement.student_program_id is distinct from makeups.source_student_program_id
  ) then
    raise exception 'An existing makeup replacement uses a different student program than its source.';
  end if;

  if exists (
    select 1
    from public.lesson_assignments assignments
    join public.lessons lessons on lessons.id = assignments.lesson_id
    where assignments.unassigned_at is not null
      and (
        assignments.unassigned_at >= lessons.starts_at
        or exists (
          select 1 from public.attendance_records attendance
          where attendance.lesson_id = assignments.lesson_id
            and attendance.student_id = assignments.student_id
        )
        or exists (
          select 1 from public.lesson_feedback feedback
          where feedback.lesson_id = assignments.lesson_id
            and feedback.student_id = assignments.student_id
        )
      )
  ) then
    raise exception 'A legacy soft-unassigned assignment has usage history and requires review.';
  end if;
end;
$$;

alter table public.makeup_lessons
  alter column source_student_program_id set not null,
  add constraint makeup_lessons_source_student_program_fk
    foreign key (source_student_program_id, student_id)
    references public.student_programs(id, student_id)
    on delete restrict;

create index makeup_lessons_source_student_program_idx
  on public.makeup_lessons(source_student_program_id);

comment on column public.makeup_lessons.source_student_program_id is
  'Immutable student program enrollment that produced this independent one-use makeup entitlement.';

create or replace function public.guard_makeup_source_student_program()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.source_student_program_id is distinct from old.source_student_program_id then
    raise exception 'A makeup source student program cannot change.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger makeup_lessons_guard_source_student_program
before update of source_student_program_id on public.makeup_lessons
for each row execute function public.guard_makeup_source_student_program();

-- Exact-match validation and lesson-level program ownership are obsolete.
drop trigger if exists makeup_lessons_validate_program on public.makeup_lessons;
drop function if exists public.validate_makeup_program();
drop trigger if exists lesson_assignments_validate_program on public.lesson_assignments;
drop function if exists public.validate_lesson_assignment_program();
drop trigger if exists lessons_validate_schedule_change on public.lessons;

create or replace function public.student_program_period_month(
  target_student_program_id uuid,
  target_starts_at timestamptz
)
returns date
language sql
stable
set search_path = ''
as $$
  select case
    when programs.program_type in ('weekday_vocal', 'weekend_vocal')
      then date_trunc('month', target_starts_at at time zone 'Asia/Seoul')::date
    else null
  end
  from public.student_programs programs
  where programs.id = target_student_program_id;
$$;

create or replace function public.lock_student_program_allowance(
  target_student_program_id uuid,
  target_month date
)
returns void
language sql
set search_path = ''
as $$
  select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      target_student_program_id::text || ':' || coalesce(target_month::text, 'enrollment'),
      0
    )
  );
$$;

create or replace function public.is_makeup_assignment(
  target_lesson_id uuid,
  target_student_id uuid,
  target_student_program_id uuid
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.makeup_lessons makeups
    where makeups.replacement_lesson_id = target_lesson_id
      and makeups.student_id = target_student_id
      and makeups.source_student_program_id = target_student_program_id
      and makeups.status in ('scheduled', 'completed')
  );
$$;

create or replace function public.assert_student_program_allowance(
  target_student_program_id uuid,
  allowance_month date,
  excluded_lesson_id uuid default null,
  include_target boolean default false
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  program_row public.student_programs%rowtype;
  adjustment_count integer;
  committed_count integer;
  available_count integer;
begin
  select * into program_row
  from public.student_programs
  where id = target_student_program_id;

  if not found then
    raise exception 'Student program was not found.' using errcode = 'P0002';
  end if;
  if program_row.base_allowance_count is null then
    raise exception 'The student program allowance is not configured.' using errcode = '23514';
  end if;
  if program_row.program_type in ('weekday_vocal', 'weekend_vocal') and allowance_month is null then
    raise exception 'A monthly student program requires a target month.' using errcode = '23514';
  end if;
  if program_row.program_type in ('trial', 'rental') and allowance_month is not null then
    raise exception 'This student program uses an enrollment-wide allowance.' using errcode = '23514';
  end if;

  perform public.lock_student_program_allowance(target_student_program_id, allowance_month);

  select coalesce(sum(adjustments.delta), 0)::integer
    into adjustment_count
  from public.student_program_allowance_adjustments adjustments
  where adjustments.student_program_id = target_student_program_id
    and adjustments.target_month is not distinct from allowance_month;

  select count(*)::integer
    into committed_count
  from public.lesson_assignments assignments
  join public.lessons lessons on lessons.id = assignments.lesson_id
  where assignments.student_program_id = target_student_program_id
    and assignments.unassigned_at is null
    and lessons.status <> 'draft'
    and (excluded_lesson_id is null or lessons.id <> excluded_lesson_id)
    and public.student_program_period_month(target_student_program_id, lessons.starts_at)
        is not distinct from allowance_month
    and not public.is_makeup_assignment(
      assignments.lesson_id,
      assignments.student_id,
      assignments.student_program_id
    );

  if include_target then
    committed_count := committed_count + 1;
  end if;

  available_count := program_row.base_allowance_count + adjustment_count;
  if committed_count > available_count then
    raise exception 'Student program allowance exceeded (%/%).', committed_count, available_count
      using errcode = '23514';
  end if;
end;
$$;

do $$
declare
  usage_period record;
begin
  for usage_period in
    select distinct
      assignments.student_program_id,
      public.student_program_period_month(assignments.student_program_id, lessons.starts_at) as period_month
    from public.lesson_assignments assignments
    join public.lessons lessons on lessons.id = assignments.lesson_id
    where assignments.unassigned_at is null
      and lessons.status <> 'draft'
      and not public.is_makeup_assignment(
        assignments.lesson_id,
        assignments.student_id,
        assignments.student_program_id
      )
    order by assignments.student_program_id, period_month
  loop
    perform public.assert_student_program_allowance(
      usage_period.student_program_id,
      usage_period.period_month,
      null,
      false
    );
  end loop;
end;
$$;

create or replace function public.assert_assignment_releasable(
  target_lesson_id uuid,
  target_student_id uuid
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  lesson_starts_at timestamptz;
  lesson_status text;
begin
  select starts_at, status into lesson_starts_at, lesson_status
  from public.lessons
  where id = target_lesson_id
  for update;

  if lesson_starts_at is null then
    raise exception 'Lesson was not found.' using errcode = 'P0002';
  end if;
  if lesson_status <> 'draft' and lesson_starts_at <= now() then
    raise exception 'An assignment cannot be released after the lesson starts.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.attendance_records
    where lesson_id = target_lesson_id and student_id = target_student_id
  ) or exists (
    select 1 from public.lesson_feedback
    where lesson_id = target_lesson_id
      and student_id = target_student_id
  ) then
    raise exception 'An assignment with attendance or feedback cannot be released.' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.validate_lesson_assignment_enrollment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  enrollment_status text;
  lesson_row public.lessons%rowtype;
  target_month date;
begin
  if tg_op = 'UPDATE'
     and old.unassigned_at is null
     and (
       new.unassigned_at is not null
       or new.student_program_id is distinct from old.student_program_id
     )
     then
    perform public.assert_assignment_releasable(old.lesson_id, old.student_id);
  end if;

  if new.unassigned_at is not null then return new; end if;

  select status into enrollment_status
  from public.student_programs
  where id = new.student_program_id and student_id = new.student_id;

  if enrollment_status is null then
    raise exception 'The selected student program does not belong to the student.' using errcode = '23514';
  end if;
  if (tg_op = 'INSERT' or old.unassigned_at is not null
      or new.student_program_id is distinct from old.student_program_id)
     and enrollment_status <> 'active'
     and coalesce(current_setting('class_log.allow_stopped_makeup_assignment', true), '') <> 'on' then
    raise exception 'Stopped student programs cannot receive ordinary assignments.' using errcode = '23514';
  end if;

  select * into lesson_row from public.lessons where id = new.lesson_id;
  if lesson_row.status <> 'draft'
     and coalesce(current_setting('class_log.skip_assignment_quota_check', true), '') <> 'on' then
    target_month := public.student_program_period_month(new.student_program_id, lesson_row.starts_at);
    perform public.assert_student_program_allowance(
      new.student_program_id,
      target_month,
      new.lesson_id,
      true
    );
  end if;
  return new;
end;
$$;

create trigger lesson_assignments_validate_enrollment
before insert or update on public.lesson_assignments
for each row execute function public.validate_lesson_assignment_enrollment();

create or replace function public.guard_lesson_assignment_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Assignments must be preserved and soft-unassigned.' using errcode = 'P0001';
end;
$$;

create trigger lesson_assignments_guard_delete
before delete on public.lesson_assignments
for each row execute function public.guard_lesson_assignment_delete();

create or replace function public.validate_lesson_schedule_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  assignment record;
  target_month date;
begin
  if new.starts_at = old.starts_at
     and new.ends_at = old.ends_at
     and new.status = old.status then
    return new;
  end if;

  if old.status <> 'draft'
     and (
       new.status = 'draft'
       or new.starts_at is distinct from old.starts_at
       or new.ends_at is distinct from old.ends_at
     ) then
    for assignment in
      select student_id
      from public.lesson_assignments
      where lesson_id = new.id and unassigned_at is null
      order by student_id
    loop
      perform public.assert_assignment_releasable(new.id, assignment.student_id);
    end loop;
  end if;

  if new.status = 'cancelled' then
    if coalesce(current_setting('class_log.allow_lesson_cancellation', true), '') <> 'on' then
      raise exception 'Lessons must be cancelled through the cancellation workflow.' using errcode = 'P0001';
    end if;
    return new;
  end if;

  for assignment in
    select student_id, student_program_id
    from public.lesson_assignments
    where lesson_id = new.id and unassigned_at is null
    order by student_id
  loop
    perform public.assert_student_schedule_available(
      new.id, assignment.student_id, new.starts_at, new.ends_at
    );
    if new.status <> 'draft'
       and coalesce(current_setting('class_log.skip_assignment_quota_check', true), '') <> 'on'
       and not public.is_makeup_assignment(new.id, assignment.student_id, assignment.student_program_id) then
      target_month := public.student_program_period_month(assignment.student_program_id, new.starts_at);
      perform public.assert_student_program_allowance(
        assignment.student_program_id,
        target_month,
        new.id,
        true
      );
    end if;
  end loop;
  return new;
end;
$$;

create trigger lessons_validate_schedule_change
before update of starts_at, ends_at, status on public.lessons
for each row execute function public.validate_lesson_schedule_change();

create or replace function public.guard_lesson_delete_usage()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'draft' then
    raise exception 'Confirmed lessons must be cancelled rather than deleted.' using errcode = 'P0001';
  end if;
  return old;
end;
$$;

create trigger lessons_guard_usage_delete
before delete on public.lessons
for each row execute function public.guard_lesson_delete_usage();

create or replace function public.guard_lesson_usage_record_creation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  lesson_row public.lessons%rowtype;
begin
  select * into lesson_row
  from public.lessons
  where id = new.lesson_id
  for update;
  if not found or lesson_row.status in ('draft', 'cancelled') then
    raise exception 'Usage records require a confirmed, non-cancelled lesson.' using errcode = '23514';
  end if;
  if not exists (
    select 1
    from public.lesson_assignments assignments
    where assignments.lesson_id = new.lesson_id
      and assignments.student_id = new.student_id
      and assignments.unassigned_at is null
  ) then
    raise exception 'Usage records require an active lesson assignment.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger attendance_records_guard_lesson_state
before insert on public.attendance_records
for each row execute function public.guard_lesson_usage_record_creation();

create trigger lesson_feedback_guard_lesson_state
before insert on public.lesson_feedback
for each row execute function public.guard_lesson_usage_record_creation();

-- New neutral-lesson RPC. Passing enrollment ids avoids duplicating student ids.
create or replace function public.save_lesson_with_assignments(
  lesson_id uuid,
  lesson_title text,
  lesson_starts_at timestamptz,
  lesson_ends_at timestamptz,
  lesson_location text,
  lesson_notes text,
  lesson_status text,
  selected_student_program_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved_id uuid;
  resolved_status text;
  selection record;
  existing_assignment record;
begin
  if not public.is_operator() then
    raise exception 'Operator access is required.' using errcode = '42501';
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
    select id into saved_id
    from public.lessons
    where id = lesson_id and status <> 'cancelled'
    for update;
    if saved_id is null then
      raise exception 'Editable lesson was not found.' using errcode = 'P0002';
    end if;
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
    insert into public.lessons(title, starts_at, ends_at, location, notes, status)
    values (
      btrim(lesson_title), lesson_starts_at, lesson_ends_at,
      nullif(btrim(lesson_location), ''), nullif(btrim(lesson_notes), ''),
      resolved_status
    ) returning id into saved_id;
  else
    perform set_config('class_log.skip_assignment_quota_check', 'on', true);
    update public.lessons
    set title = btrim(lesson_title),
        starts_at = lesson_starts_at,
        ends_at = lesson_ends_at,
        location = nullif(btrim(lesson_location), ''),
        notes = nullif(btrim(lesson_notes), ''),
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

create or replace function public.confirm_draft_lesson(target_lesson_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  lesson_row public.lessons%rowtype;
  assignment record;
  confirmed_id uuid;
begin
  if not public.is_operator() then
    raise exception 'Operator access is required.' using errcode = '42501';
  end if;
  select * into lesson_row
  from public.lessons
  where id = target_lesson_id and status = 'draft'
  for update;
  if not found then
    raise exception 'Draft lesson was not found.' using errcode = 'P0002';
  end if;

  for assignment in
    select student_id, student_program_id
    from public.lesson_assignments
    where lesson_id = target_lesson_id and unassigned_at is null
    order by student_program_id, student_id
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

create or replace function public.cancel_lesson(target_lesson_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  lesson_row public.lessons%rowtype;
  assignment record;
  cancelled_id uuid;
begin
  if not public.is_operator() then
    raise exception 'Operator access is required.' using errcode = '42501';
  end if;
  select * into lesson_row
  from public.lessons
  where id = target_lesson_id and status <> 'cancelled'
  for update;
  if not found then
    raise exception 'Cancellable lesson was not found.' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.makeup_lessons
    where replacement_lesson_id = target_lesson_id and status = 'scheduled'
  ) then
    raise exception 'A scheduled makeup must be rescheduled before cancelling its lesson.' using errcode = 'P0001';
  end if;

  if lesson_row.status = 'draft' or lesson_row.starts_at > now() then
    for assignment in
      select student_id
      from public.lesson_assignments
      where lesson_id = target_lesson_id and unassigned_at is null
      order by student_id
    loop
      if not exists (
        select 1 from public.attendance_records
        where lesson_id = target_lesson_id and student_id = assignment.student_id
      ) and not exists (
        select 1 from public.lesson_feedback
        where lesson_id = target_lesson_id
          and student_id = assignment.student_id
      ) then
        update public.lesson_assignments
        set unassigned_at = now()
        where lesson_id = target_lesson_id
          and student_id = assignment.student_id
          and unassigned_at is null;
      end if;
    end loop;
  end if;

  perform set_config('class_log.allow_lesson_cancellation', 'on', true);
  update public.lessons
  set status = 'cancelled'
  where id = target_lesson_id and status <> 'cancelled'
  returning id into cancelled_id;
  perform set_config('class_log.allow_lesson_cancellation', '', true);
  return cancelled_id;
end;
$$;

create or replace function public.add_student_program_allowance_adjustment(
  target_student_program_id uuid,
  adjustment_month date,
  adjustment_delta integer,
  adjustment_reason text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  program_type text;
  adjustment_id uuid;
  normalized_month date;
begin
  if not public.is_operator() then
    raise exception 'Operator access is required.' using errcode = '42501';
  end if;
  if adjustment_delta = 0 or adjustment_reason is null or btrim(adjustment_reason) = '' then
    raise exception 'Adjustment delta and reason are required.' using errcode = '23514';
  end if;
  select programs.program_type into program_type
  from public.student_programs programs
  where programs.id = target_student_program_id
  for update;
  if not found then
    raise exception 'Student program was not found.' using errcode = 'P0002';
  end if;

  normalized_month := case
    when program_type in ('weekday_vocal', 'weekend_vocal')
      then date_trunc('month', adjustment_month)::date
    else null
  end;
  if program_type in ('weekday_vocal', 'weekend_vocal') and adjustment_month is null then
    raise exception 'A monthly adjustment requires a target month.' using errcode = '23514';
  end if;

  insert into public.student_program_allowance_adjustments(
    student_program_id, target_month, delta, reason, created_by
  ) values (
    target_student_program_id, normalized_month, adjustment_delta,
    btrim(adjustment_reason), auth.uid()
  ) returning id into adjustment_id;

  return adjustment_id;
end;
$$;

create or replace function public.configure_rental_program_allowance(
  target_student_program_id uuid,
  allowance_count integer
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  configured_id uuid;
begin
  if not public.is_operator() then
    raise exception 'Operator access is required.' using errcode = '42501';
  end if;
  if allowance_count is null or allowance_count <= 0 then
    raise exception 'Rental allowance must be positive.' using errcode = '23514';
  end if;
  update public.student_programs
  set base_allowance_count = allowance_count
  where id = target_student_program_id
    and program_type = 'rental'
    and base_allowance_count is null
    and not exists (
      select 1 from public.lesson_assignments
      where student_program_id = target_student_program_id
    )
  returning id into configured_id;
  if configured_id is null then
    raise exception 'An unconfigured, unused rental program was not found.' using errcode = 'P0002';
  end if;
  return configured_id;
end;
$$;

create or replace function public.validate_student_program_allowance_adjustment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_program_type text;
begin
  select program_type into target_program_type
  from public.student_programs
  where id = new.student_program_id;
  if target_program_type in ('weekday_vocal', 'weekend_vocal') then
    if new.target_month is null then
      raise exception 'A monthly adjustment requires a target month.' using errcode = '23514';
    end if;
  elsif target_program_type in ('trial', 'rental') then
    if new.target_month is not null then
      raise exception 'An enrollment-wide adjustment cannot have a target month.' using errcode = '23514';
    end if;
  else
    raise exception 'Student program was not found.' using errcode = 'P0002';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_student_program_allowance_adjustment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_student_program_allowance(
    new.student_program_id,
    new.target_month,
    null,
    false
  );
  return new;
end;
$$;

create trigger student_program_allowance_adjustments_validate
before insert on public.student_program_allowance_adjustments
for each row execute function public.validate_student_program_allowance_adjustment();

create trigger student_program_allowance_adjustments_enforce
after insert on public.student_program_allowance_adjustments
for each row execute function public.enforce_student_program_allowance_adjustment();

-- Source-based makeup lifecycle. The source enrollment may be stopped.
create or replace function public.create_excused_makeup_entitlement()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  entitlement_row public.makeup_lessons%rowtype;
  replacement_makeup_id uuid;
  source_program_id uuid;
begin
  if new.status = 'excused' then
    select assignments.student_program_id into source_program_id
    from public.lesson_assignments assignments
    where assignments.lesson_id = new.lesson_id
      and assignments.student_id = new.student_id;
    if source_program_id is null then
      raise exception 'Excused attendance must have a source student program.' using errcode = '23514';
    end if;

    select * into entitlement_row
    from public.makeup_lessons
    where attendance_record_id = new.id
    for update;

    if found and entitlement_row.source_student_program_id is distinct from source_program_id then
      raise exception 'The makeup source student program cannot change.' using errcode = '23514';
    elsif found and entitlement_row.status = 'cancelled' then
      if entitlement_row.replacement_lesson_id is not null
         and entitlement_row.replacement_assignment_provenance in ('created', 'reactivated') then
        perform set_config('class_log.allow_makeup_assignment_release', 'on', true);
        update public.lesson_assignments
        set unassigned_at = now()
        where lesson_id = entitlement_row.replacement_lesson_id
          and student_id = entitlement_row.student_id
          and unassigned_at is null;
        perform set_config('class_log.allow_makeup_assignment_release', '', true);
      end if;

      perform set_config('class_log.makeup_event_cause', 'source_attendance', true);
      update public.makeup_lessons
      set replacement_lesson_id = null,
          replacement_attendance_record_id = null,
          replacement_assignment_provenance = null,
          status = 'requested'
      where id = entitlement_row.id and status = 'cancelled';
      perform set_config('class_log.makeup_event_cause', '', true);
    elsif not found then
      perform set_config('class_log.makeup_event_cause', 'source_attendance', true);
      insert into public.makeup_lessons(
        student_id, original_lesson_id, attendance_record_id,
        source_student_program_id, status, created_by
      ) values (
        new.student_id, new.lesson_id, new.id,
        source_program_id, 'requested', new.recorded_by
      ) on conflict (attendance_record_id) do nothing;
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
    where id = replacement_makeup_id and status = 'scheduled';
    perform set_config('class_log.makeup_event_cause', '', true);
  end if;
  return new;
end;
$$;

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
  replacement_status text;
  assignment_row public.lesson_assignments%rowtype;
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
  select status into replacement_status
  from public.lessons
  where id = target_replacement_lesson_id
    and status in ('draft', 'scheduled');
  if replacement_status is null then
    raise exception 'Replacement lesson must be Draft or Scheduled.' using errcode = 'P0002';
  end if;
  if target_replacement_lesson_id = makeup_row.original_lesson_id then
    raise exception 'A makeup must use a different lesson.' using errcode = '23514';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(makeup_row.student_id::text, 0)
  );
  select * into assignment_row
  from public.lesson_assignments
  where lesson_id = target_replacement_lesson_id
    and student_id = makeup_row.student_id
  for update;

  assignment_exists := found;
  perform set_config('class_log.allow_stopped_makeup_assignment', 'on', true);
  perform set_config('class_log.skip_assignment_quota_check', 'on', true);
  if not assignment_exists then
    insert into public.lesson_assignments(
      lesson_id, student_id, student_program_id, unassigned_at
    ) values (
      target_replacement_lesson_id, makeup_row.student_id,
      makeup_row.source_student_program_id, null
    );
    provenance := 'created';
  elsif assignment_row.unassigned_at is not null then
    update public.lesson_assignments
    set student_program_id = makeup_row.source_student_program_id,
        unassigned_at = null
    where lesson_id = target_replacement_lesson_id
      and student_id = makeup_row.student_id;
    provenance := 'reactivated';
  else
    if assignment_row.student_program_id is distinct from makeup_row.source_student_program_id then
      update public.lesson_assignments
      set student_program_id = makeup_row.source_student_program_id
      where lesson_id = target_replacement_lesson_id
        and student_id = makeup_row.student_id;
    end if;
    provenance := 'existing';
  end if;
  perform set_config('class_log.allow_stopped_makeup_assignment', '', true);
  perform set_config('class_log.skip_assignment_quota_check', '', true);

  update public.makeup_lessons
  set replacement_lesson_id = target_replacement_lesson_id,
      replacement_attendance_record_id = null,
      replacement_assignment_provenance = provenance,
      status = 'scheduled'
  where id = target_makeup_id and status = 'requested'
  returning id into scheduled_id;
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
  replacement_status text;
  assignment_row public.lesson_assignments%rowtype;
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
  select status into replacement_status
  from public.lessons
  where id = target_replacement_lesson_id
    and status in ('draft', 'scheduled');
  if replacement_status is null or target_replacement_lesson_id = makeup_row.original_lesson_id then
    raise exception 'A different Draft or Scheduled replacement lesson is required.' using errcode = '23514';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(makeup_row.student_id::text, 0)
  );
  if makeup_row.replacement_assignment_provenance in ('created', 'reactivated') then
    perform set_config('class_log.allow_makeup_assignment_release', 'on', true);
    update public.lesson_assignments
    set unassigned_at = now()
    where lesson_id = makeup_row.replacement_lesson_id
      and student_id = makeup_row.student_id
      and unassigned_at is null;
    perform set_config('class_log.allow_makeup_assignment_release', '', true);
  end if;

  select * into assignment_row
  from public.lesson_assignments
  where lesson_id = target_replacement_lesson_id
    and student_id = makeup_row.student_id
  for update;

  assignment_exists := found;
  perform set_config('class_log.allow_stopped_makeup_assignment', 'on', true);
  perform set_config('class_log.skip_assignment_quota_check', 'on', true);
  if not assignment_exists then
    insert into public.lesson_assignments(
      lesson_id, student_id, student_program_id, unassigned_at
    ) values (
      target_replacement_lesson_id, makeup_row.student_id,
      makeup_row.source_student_program_id, null
    );
    provenance := 'created';
  elsif assignment_row.unassigned_at is not null then
    update public.lesson_assignments
    set student_program_id = makeup_row.source_student_program_id,
        unassigned_at = null
    where lesson_id = target_replacement_lesson_id
      and student_id = makeup_row.student_id;
    provenance := 'reactivated';
  else
    if assignment_row.student_program_id is distinct from makeup_row.source_student_program_id then
      update public.lesson_assignments
      set student_program_id = makeup_row.source_student_program_id
      where lesson_id = target_replacement_lesson_id
        and student_id = makeup_row.student_id;
    end if;
    provenance := 'existing';
  end if;
  perform set_config('class_log.allow_stopped_makeup_assignment', '', true);
  perform set_config('class_log.skip_assignment_quota_check', '', true);

  update public.makeup_lessons
  set replacement_lesson_id = target_replacement_lesson_id,
      replacement_attendance_record_id = null,
      replacement_assignment_provenance = provenance
  where id = target_makeup_id and status = 'scheduled'
  returning id into rescheduled_id;
  return rescheduled_id;
end;
$$;

-- Program stopping ignores independent makeup rights, but still blocks ordinary future commitments.
create or replace function public.prevent_program_stop_with_future_assignments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'active' and new.status = 'stopped' and exists (
    select 1
    from public.lesson_assignments assignments
    join public.lessons lessons on lessons.id = assignments.lesson_id
    where assignments.student_program_id = old.id
      and assignments.unassigned_at is null
      and lessons.status <> 'cancelled'
      and lessons.ends_at > now()
      and not public.is_makeup_assignment(
        assignments.lesson_id,
        assignments.student_id,
        assignments.student_program_id
      )
  ) then
    raise exception 'Future ordinary lesson assignments must be removed before stopping a program.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_makeup_reclassification_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  assignment_program_id uuid;
  old_lesson_starts_at timestamptz;
begin
  if old.status = 'scheduled'
     and old.replacement_lesson_id is not null
     and (
       new.status not in ('scheduled', 'completed')
       or new.replacement_lesson_id is distinct from old.replacement_lesson_id
     ) then
    select assignments.student_program_id, lessons.starts_at
      into assignment_program_id, old_lesson_starts_at
    from public.lesson_assignments assignments
    join public.lessons lessons on lessons.id = assignments.lesson_id
    where assignments.lesson_id = old.replacement_lesson_id
      and assignments.student_id = old.student_id
      and assignments.unassigned_at is null;
    if assignment_program_id is not null then
      perform public.assert_student_program_allowance(
        assignment_program_id,
        public.student_program_period_month(assignment_program_id, old_lesson_starts_at),
        null,
        false
      );
    end if;
  end if;
  return new;
end;
$$;

create trigger makeup_lessons_enforce_reclassification_quota
after update of status, replacement_lesson_id on public.makeup_lessons
for each row execute function public.enforce_makeup_reclassification_quota();

-- Atomic student-program management now sets fixed allowances and requires rental counts.
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
  change_base_allowance integer;
  change_date date;
  change_stop_reason text;
begin
  if not (select public.is_operator()) then
    raise exception 'Only operators can save student profiles and programs.' using errcode = '42501';
  end if;
  if target_student_id is null or profile_nickname is null or btrim(profile_nickname) = '' then
    raise exception 'Student profile values are invalid.' using errcode = 'P0001';
  end if;
  program_changes := coalesce(program_changes, '{}'::jsonb);
  if jsonb_typeof(program_changes) <> 'object'
     or jsonb_typeof(coalesce(program_changes -> 'stop', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(program_changes -> 'start', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(program_changes -> 'reasonUpdates', '[]'::jsonb)) <> 'array' then
    raise exception 'Program changes must be arrays.' using errcode = 'P0001';
  end if;

  select id into locked_student_id
  from public.students where id = target_student_id for update;
  if locked_student_id is null then
    raise exception 'Student not found.' using errcode = 'P0002';
  end if;

  update public.students
  set nickname = btrim(profile_nickname), gender = profile_gender, age = profile_age,
      phone = profile_phone, acquisition_source = profile_acquisition_source,
      joined_month = profile_joined_month, special_notes = profile_special_notes
  where id = target_student_id;

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
    'studentId', target_student_id, 'profileUpdated', true,
    'programsStopped', stopped_count, 'programsStarted', started_count,
    'reasonsUpdated', reason_updated_count
  );
end;
$$;

-- Allowance read model follows underlying student_program RLS.
create view public.student_program_allowance_statuses
with (security_invoker = true)
as
with periods as (
  select programs.id as student_program_id,
         case when programs.program_type in ('weekday_vocal', 'weekend_vocal')
           then date_trunc('month', now() at time zone 'Asia/Seoul')::date
           else null end as period_month
  from public.student_programs programs
  union
  select assignments.student_program_id,
         case when programs.program_type in ('weekday_vocal', 'weekend_vocal')
           then date_trunc('month', lessons.starts_at at time zone 'Asia/Seoul')::date
           else null end
  from public.lesson_assignments assignments
  join public.lessons lessons on lessons.id = assignments.lesson_id
  join public.student_programs programs on programs.id = assignments.student_program_id
  union
  select adjustments.student_program_id, adjustments.target_month
  from public.student_program_allowance_adjustments adjustments
), makeup_assignment_keys as (
  select distinct replacement_lesson_id as lesson_id,
                  student_id,
                  source_student_program_id as student_program_id
  from public.makeup_lessons
  where status in ('scheduled', 'completed')
), regular_counts as (
  select assignments.student_program_id,
         case when programs.program_type in ('weekday_vocal', 'weekend_vocal')
           then date_trunc('month', lessons.starts_at at time zone 'Asia/Seoul')::date
           else null end as period_month,
         count(*) filter (where assignments.unassigned_at is null and lessons.status = 'draft')::integer as draft_count,
         count(*) filter (
           where assignments.unassigned_at is null
             and lessons.status <> 'draft'
             and lessons.starts_at > now()
             and makeup_assignment_keys.lesson_id is null
         )::integer as reserved_count,
         count(*) filter (
           where assignments.unassigned_at is null
             and lessons.status <> 'draft'
             and lessons.starts_at <= now()
             and makeup_assignment_keys.lesson_id is null
         )::integer as used_count
  from public.lesson_assignments assignments
  join public.lessons lessons on lessons.id = assignments.lesson_id
  join public.student_programs programs on programs.id = assignments.student_program_id
  left join makeup_assignment_keys
    on makeup_assignment_keys.lesson_id = assignments.lesson_id
   and makeup_assignment_keys.student_id = assignments.student_id
   and makeup_assignment_keys.student_program_id = assignments.student_program_id
  group by assignments.student_program_id,
           case when programs.program_type in ('weekday_vocal', 'weekend_vocal')
             then date_trunc('month', lessons.starts_at at time zone 'Asia/Seoul')::date
             else null end
), adjustment_counts as (
  select student_program_id, target_month as period_month, sum(delta)::integer as adjustment_count
  from public.student_program_allowance_adjustments
  group by student_program_id, target_month
), makeup_counts as (
  select source_student_program_id as student_program_id,
         count(*) filter (where status = 'requested')::integer as makeup_available_count,
         count(*) filter (where status = 'scheduled')::integer as makeup_reserved_count,
         count(*) filter (where status = 'completed')::integer as makeup_used_count
  from public.makeup_lessons
  group by source_student_program_id
)
select programs.id as student_program_id,
       programs.student_id,
       programs.program_type,
       periods.period_month,
       programs.base_allowance_count,
       coalesce(adjustment_counts.adjustment_count, 0) as operator_adjustment_count,
       coalesce(regular_counts.draft_count, 0) as draft_count,
       coalesce(regular_counts.reserved_count, 0) as reserved_count,
       coalesce(regular_counts.used_count, 0) as used_count,
       case when programs.base_allowance_count is null then null else
         programs.base_allowance_count
         + coalesce(adjustment_counts.adjustment_count, 0)
         - coalesce(regular_counts.reserved_count, 0)
         - coalesce(regular_counts.used_count, 0)
       end as remaining_count,
       case when periods.period_month is null
                    or periods.period_month = date_trunc('month', now() at time zone 'Asia/Seoul')::date
         then coalesce(makeup_counts.makeup_available_count, 0) else 0 end as makeup_available_count,
       case when periods.period_month is null
                    or periods.period_month = date_trunc('month', now() at time zone 'Asia/Seoul')::date
         then coalesce(makeup_counts.makeup_reserved_count, 0) else 0 end as makeup_reserved_count,
       case when periods.period_month is null
                    or periods.period_month = date_trunc('month', now() at time zone 'Asia/Seoul')::date
         then coalesce(makeup_counts.makeup_used_count, 0) else 0 end as makeup_used_count
from periods
join public.student_programs programs on programs.id = periods.student_program_id
left join regular_counts
  on regular_counts.student_program_id = periods.student_program_id
 and regular_counts.period_month is not distinct from periods.period_month
left join adjustment_counts
  on adjustment_counts.student_program_id = periods.student_program_id
 and adjustment_counts.period_month is not distinct from periods.period_month
left join makeup_counts on makeup_counts.student_program_id = periods.student_program_id;

revoke all on table public.student_program_allowance_statuses from public, anon;
grant select on table public.student_program_allowance_statuses to authenticated;

create or replace function public.get_my_student_program_allowance_statuses()
returns table (
  student_program_id uuid,
  student_id uuid,
  program_type text,
  period_month date,
  base_allowance_count integer,
  operator_adjustment_count integer,
  draft_count integer,
  reserved_count integer,
  used_count integer,
  remaining_count integer,
  makeup_available_count integer,
  makeup_reserved_count integer,
  makeup_used_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select statuses.student_program_id,
         statuses.student_id,
         statuses.program_type,
         statuses.period_month,
         statuses.base_allowance_count,
         statuses.operator_adjustment_count,
         statuses.draft_count,
         statuses.reserved_count,
         statuses.used_count,
         statuses.remaining_count,
         statuses.makeup_available_count,
         statuses.makeup_reserved_count,
         statuses.makeup_used_count
  from public.student_program_allowance_statuses statuses
  join public.student_programs programs on programs.id = statuses.student_program_id
  where statuses.student_id = private.current_student_id()
    and (
      programs.status = 'active'
      or statuses.makeup_available_count > 0
      or statuses.makeup_reserved_count > 0
    );
$$;

create or replace view public.student_program_statuses
with (security_invoker = true)
as
select
  programs.id as student_program_id,
  programs.student_id,
  programs.program_type,
  programs.status as stored_status,
  programs.started_at,
  programs.ended_at,
  programs.stop_reason,
  max(lessons.starts_at) filter (where assignments.unassigned_at is null) as last_lesson_at,
  case
    when programs.status = 'stopped' then 'stopped'
    when greatest(
      programs.started_at::timestamptz,
      coalesce(max(lessons.starts_at) filter (where assignments.unassigned_at is null), programs.started_at::timestamptz)
    ) >= now() - interval '3 months' then 'active'
    else 'inactive'
  end as effective_status,
  programs.base_allowance_count
from public.student_programs programs
left join public.lesson_assignments assignments on assignments.student_program_id = programs.id
left join public.lessons lessons on lessons.id = assignments.lesson_id and lessons.status <> 'cancelled'
group by programs.id;

-- Drop the old overload and all active dependencies before removing the lesson column.
drop function if exists public.save_lesson_with_assignments(
  uuid, text, timestamptz, timestamptz, text, text, text, text, uuid[]
);

alter table public.lessons drop constraint if exists lessons_program_type_valid;
alter table public.lessons drop column program_type;

revoke all on function public.student_program_period_month(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.lock_student_program_allowance(uuid, date) from public, anon, authenticated;
revoke all on function public.is_makeup_assignment(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.assert_student_program_allowance(uuid, date, uuid, boolean) from public, anon, authenticated;
revoke all on function public.assert_assignment_releasable(uuid, uuid) from public, anon, authenticated;
revoke all on function public.validate_lesson_assignment_enrollment() from public, anon, authenticated;
revoke all on function public.guard_lesson_assignment_delete() from public, anon, authenticated;
revoke all on function public.validate_lesson_schedule_change() from public, anon, authenticated;
revoke all on function public.guard_lesson_delete_usage() from public, anon, authenticated;
revoke all on function public.guard_lesson_usage_record_creation() from public, anon, authenticated;
revoke all on function public.guard_makeup_source_student_program() from public, anon, authenticated;
revoke all on function public.guard_student_program_base_allowance() from public, anon, authenticated;
revoke all on function public.enforce_makeup_reclassification_quota() from public, anon, authenticated;

revoke all on function public.save_lesson_with_assignments(
  uuid, text, timestamptz, timestamptz, text, text, text, uuid[]
) from public, anon;
grant execute on function public.save_lesson_with_assignments(
  uuid, text, timestamptz, timestamptz, text, text, text, uuid[]
) to authenticated;

revoke all on function public.confirm_draft_lesson(uuid) from public, anon;
grant execute on function public.confirm_draft_lesson(uuid) to authenticated;
revoke all on function public.cancel_lesson(uuid) from public, anon;
grant execute on function public.cancel_lesson(uuid) to authenticated;
revoke all on function public.add_student_program_allowance_adjustment(uuid, date, integer, text) from public, anon;
grant execute on function public.add_student_program_allowance_adjustment(uuid, date, integer, text) to authenticated;
revoke all on function public.configure_rental_program_allowance(uuid, integer) from public, anon;
grant execute on function public.configure_rental_program_allowance(uuid, integer) to authenticated;
revoke all on function public.get_my_student_program_allowance_statuses() from public, anon;
grant execute on function public.get_my_student_program_allowance_statuses() to authenticated;
revoke all on function public.schedule_makeup_lesson(uuid, uuid) from public, anon;
grant execute on function public.schedule_makeup_lesson(uuid, uuid) to authenticated;
revoke all on function public.reschedule_makeup_lesson(uuid, uuid) from public, anon;
grant execute on function public.reschedule_makeup_lesson(uuid, uuid) to authenticated;

commit;
