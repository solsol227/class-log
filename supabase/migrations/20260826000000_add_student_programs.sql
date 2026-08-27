begin;

do $$
begin
  if exists (
    select 1 from public.students
    where age is not null
      and (btrim(age) !~ '^[0-9]+$' or btrim(age)::integer not between 1 and 119)
  ) then
    raise exception 'students.age contains values that cannot be converted safely.';
  end if;
  if exists (
    select 1 from public.students
    where acquisition_source is not null
      and acquisition_source not in ('instagram', 'daangn', 'referral', 'naver')
  ) then
    raise exception 'students.acquisition_source contains an unsupported value.';
  end if;
end;
$$;

alter table public.students
  drop constraint students_age_not_blank,
  drop constraint students_acquisition_source_not_blank,
  alter column age type integer using nullif(btrim(age), '')::integer,
  add constraint students_age_valid check (age is null or age between 1 and 119),
  add constraint students_acquisition_source_valid check (
    acquisition_source is null
    or acquisition_source in ('instagram', 'daangn', 'referral', 'naver')
  );

create table public.student_programs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  program_type text not null,
  status text not null default 'active',
  stop_reason text,
  started_at date not null,
  ended_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_programs_program_type_valid check (
    program_type in ('weekday_vocal', 'weekend_vocal', 'rental', 'trial')
  ),
  constraint student_programs_status_valid check (status in ('active', 'stopped')),
  constraint student_programs_stop_reason_valid check (
    stop_reason is null or stop_reason in ('break', 'ended', 'other')
  ),
  constraint student_programs_lifecycle_valid check (
    (status = 'active' and ended_at is null and stop_reason is null)
    or (status = 'stopped' and ended_at is not null)
  ),
  constraint student_programs_date_order check (
    ended_at is null or ended_at >= started_at
  ),
  constraint student_programs_id_student_unique unique (id, student_id),
  constraint student_programs_id_student_program_unique
    unique (id, student_id, program_type)
);

create unique index student_programs_one_active_type_idx
  on public.student_programs(student_id, program_type)
  where status = 'active';
create index student_programs_student_id_idx on public.student_programs(student_id);

create trigger student_programs_set_updated_at
before update on public.student_programs
for each row execute function public.set_updated_at();

alter table public.lessons add column program_type text;
update public.lessons set program_type = 'weekday_vocal' where program_type is null;
alter table public.lessons
  add constraint lessons_program_type_valid check (
    program_type in ('weekday_vocal', 'weekend_vocal', 'trial')
  );

do $$
begin
  if exists (select 1 from public.lessons where program_type is null) then
    raise exception 'Every existing lesson must have a program_type.';
  end if;
end;
$$;

alter table public.lessons alter column program_type set not null;

insert into public.student_programs (student_id, program_type, status, started_at)
select
  assignments.student_id,
  'weekday_vocal',
  'active',
  min(timezone('Asia/Seoul', lessons.starts_at)::date)
from public.lesson_assignments assignments
join public.lessons lessons on lessons.id = assignments.lesson_id
where lessons.program_type = 'weekday_vocal'
group by assignments.student_id
on conflict (student_id, program_type) where status = 'active' do nothing;

do $$
begin
  if exists (
    select 1
    from public.lesson_assignments assignments
    join public.lessons lessons on lessons.id = assignments.lesson_id
    left join public.student_programs programs
      on programs.student_id = assignments.student_id
     and programs.program_type = lessons.program_type
     and programs.status = 'active'
    where programs.id is null
  ) then
    raise exception 'A student_program enrollment could not be backfilled.';
  end if;
end;
$$;

alter table public.lesson_assignments add column student_program_id uuid;

update public.lesson_assignments assignments
set student_program_id = programs.id
from public.lessons lessons, public.student_programs programs
where lessons.id = assignments.lesson_id
  and programs.student_id = assignments.student_id
  and programs.program_type = lessons.program_type
  and programs.status = 'active';

do $$
begin
  if exists (select 1 from public.lesson_assignments where student_program_id is null) then
    raise exception 'Every lesson assignment must be linked to a student_program.';
  end if;
end;
$$;

alter table public.lesson_assignments
  alter column student_program_id set not null,
  add constraint lesson_assignments_student_program_fk
    foreign key (student_program_id, student_id)
    references public.student_programs(id, student_id)
    on delete restrict;
create index lesson_assignments_student_program_id_idx
  on public.lesson_assignments(student_program_id);

create or replace function public.validate_lesson_assignment_program()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  lesson_program text;
  enrollment_program text;
  enrollment_status text;
begin
  select program_type into lesson_program
  from public.lessons where id = new.lesson_id;

  select program_type, status into enrollment_program, enrollment_status
  from public.student_programs
  where id = new.student_program_id and student_id = new.student_id;

  if lesson_program is null or enrollment_program is null
     or lesson_program is distinct from enrollment_program then
    raise exception 'Lesson and student program do not match.' using errcode = '23514';
  end if;

  if new.unassigned_at is null
     and (tg_op = 'INSERT' or old.unassigned_at is not null
          or new.student_program_id is distinct from old.student_program_id)
     and enrollment_status <> 'active' then
    raise exception 'Stopped student programs cannot receive assignments.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger lesson_assignments_validate_program
before insert or update on public.lesson_assignments
for each row execute function public.validate_lesson_assignment_program();

create or replace function public.prevent_program_stop_with_future_assignments()
returns trigger
language plpgsql
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
  ) then
    raise exception 'Future lesson assignments must be removed before stopping a program.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger student_programs_prevent_unsafe_stop
before update of status on public.student_programs
for each row execute function public.prevent_program_stop_with_future_assignments();

alter table public.student_programs enable row level security;
alter table public.student_programs force row level security;
create policy student_programs_operator_all on public.student_programs
for all to authenticated
using ((select public.is_operator()))
with check ((select public.is_operator()));
create policy student_programs_student_select on public.student_programs
for select to authenticated
using (student_id = (select private.current_student_id()));

revoke all on table public.student_programs from public, anon;
grant select, insert, update, delete on table public.student_programs to authenticated;

create view public.student_program_statuses
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
  end as effective_status
from public.student_programs programs
left join public.lesson_assignments assignments on assignments.student_program_id = programs.id
left join public.lessons lessons on lessons.id = assignments.lesson_id and lessons.status <> 'cancelled'
group by programs.id;

revoke all on table public.student_program_statuses from public, anon;
grant select on table public.student_program_statuses to authenticated;

revoke all on function public.validate_lesson_assignment_program() from public, anon, authenticated;
revoke all on function public.prevent_program_stop_with_future_assignments() from public, anon, authenticated;

commit;
