begin;

create table public.staff_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  display_name text not null,
  role text not null,
  is_active boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_profiles_display_name_not_blank check (length(btrim(display_name)) > 0),
  constraint staff_profiles_role_valid check (role in ('manager', 'vocal_trainer'))
);

create table public.lesson_staff (
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  staff_id uuid not null references public.staff_profiles(id) on delete restrict,
  role text not null,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (lesson_id, staff_id, role),
  constraint lesson_staff_role_valid check (role in ('manager', 'vocal_trainer'))
);

create index lesson_staff_staff_id_idx on public.lesson_staff(staff_id);
create trigger staff_profiles_set_updated_at
before update on public.staff_profiles
for each row execute function public.set_updated_at();

create or replace function private.validate_staff_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare auth_role text;
begin
  if new.auth_user_id is null then return new; end if;
  select raw_app_meta_data ->> 'role' into auth_role
  from auth.users where id = new.auth_user_id;
  if auth_role is distinct from 'operator' then
    raise exception 'Only operator Auth users can be linked to staff profiles.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger staff_profiles_validate_auth
before insert or update of auth_user_id on public.staff_profiles
for each row execute function private.validate_staff_profile();

create or replace function public.validate_lesson_staff_role()
returns trigger
language plpgsql
set search_path = ''
as $$
declare profile_role text; profile_active boolean;
begin
  select role, is_active into profile_role, profile_active
  from public.staff_profiles where id = new.staff_id;
  if profile_role is distinct from new.role then
    raise exception 'Lesson staff role must match the staff profile role.' using errcode = '23514';
  end if;
  if not profile_active then
    raise exception 'Inactive staff cannot be newly assigned.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger lesson_staff_validate_role
before insert or update on public.lesson_staff
for each row execute function public.validate_lesson_staff_role();

alter table public.staff_profiles enable row level security;
alter table public.staff_profiles force row level security;
alter table public.lesson_staff enable row level security;
alter table public.lesson_staff force row level security;

create policy staff_profiles_operator_all on public.staff_profiles
for all to authenticated using ((select public.is_operator())) with check ((select public.is_operator()));
create policy lesson_staff_operator_all on public.lesson_staff
for all to authenticated using ((select public.is_operator())) with check ((select public.is_operator()));

create policy lesson_staff_student_select on public.lesson_staff
for select to authenticated
using (
  exists (
    select 1 from public.lesson_assignments assignments
    join public.lessons lessons on lessons.id = assignments.lesson_id
    where assignments.lesson_id = lesson_staff.lesson_id
      and assignments.student_id = (select private.current_student_id())
      and assignments.unassigned_at is null
      and lessons.status <> 'draft'
  )
);

create policy staff_profiles_student_select on public.staff_profiles
for select to authenticated
using (
  exists (
    select 1 from public.lesson_staff
    join public.lesson_assignments assignments on assignments.lesson_id = lesson_staff.lesson_id
    join public.lessons lessons on lessons.id = assignments.lesson_id
    where lesson_staff.staff_id = staff_profiles.id
      and assignments.student_id = (select private.current_student_id())
      and assignments.unassigned_at is null
      and lessons.status <> 'draft'
  )
);

revoke all on table public.staff_profiles, public.lesson_staff from public, anon;
grant select, insert, update, delete on table public.staff_profiles, public.lesson_staff to authenticated;
revoke all on function private.validate_staff_profile() from public, anon, authenticated;
revoke all on function public.validate_lesson_staff_role() from public, anon, authenticated;

commit;
