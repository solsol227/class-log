begin;

do $$
declare
  operator_count integer;
  linked_staff_count integer;
begin
  select count(*) into operator_count
  from auth.users
  where raw_app_meta_data ->> 'role' = 'operator';

  select count(*) into linked_staff_count
  from public.staff_profiles
  where auth_user_id is not null;

  if operator_count <> 1 then
    raise exception 'Exactly one existing operator Auth user is required before owner bootstrap.';
  end if;

  if linked_staff_count <> 0 then
    raise exception 'Staff Auth links must be reviewed before operator account bootstrap.';
  end if;
end;
$$;

create table public.operator_accounts (
  auth_user_id uuid primary key references auth.users(id) on delete restrict,
  access_level text not null,
  login_id text unique,
  is_login_enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operator_accounts_access_level_valid
    check (access_level in ('owner', 'staff')),
  constraint operator_accounts_login_id_normalized
    check (
      (access_level = 'owner' and login_id is null)
      or
      (access_level = 'staff'
        and login_id is not null
        and login_id = lower(btrim(login_id))
        and login_id ~ '^[a-z0-9_-]{4,32}$')
    ),
  constraint operator_accounts_owner_enabled
    check (access_level <> 'owner' or is_login_enabled)
);

create trigger operator_accounts_set_updated_at
before update on public.operator_accounts
for each row execute function public.set_updated_at();

insert into public.operator_accounts(auth_user_id, access_level)
select id, 'owner'
from auth.users
where raw_app_meta_data ->> 'role' = 'operator';

alter table public.operator_accounts enable row level security;
alter table public.operator_accounts force row level security;

-- SECURITY DEFINER is required to avoid recursive operator_accounts and
-- staff_profiles RLS lookups. These helpers are private and not PostgREST RPCs.
create or replace function private.current_operator_access_level()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select accounts.access_level
  from public.operator_accounts accounts
  where accounts.auth_user_id = auth.uid()
    and accounts.is_login_enabled
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'operator'
    and (
      accounts.access_level = 'owner'
      or exists (
        select 1
        from public.staff_profiles profiles
        where profiles.auth_user_id = accounts.auth_user_id
          and profiles.is_active
      )
    );
$$;

create or replace function private.is_active_operator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_operator_access_level() in ('owner', 'staff');
$$;

create or replace function private.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_operator_access_level() = 'owner';
$$;

create or replace function private.current_staff_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select profiles.id
  from public.staff_profiles profiles
  join public.operator_accounts accounts
    on accounts.auth_user_id = profiles.auth_user_id
  where profiles.auth_user_id = auth.uid()
    and profiles.is_active
    and accounts.access_level = 'staff'
    and accounts.is_login_enabled
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'operator';
$$;

create or replace function private.is_assigned_staff(target_lesson_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.lesson_staff assignments
    where assignments.lesson_id = target_lesson_id
      and assignments.staff_id = private.current_staff_id()
  );
$$;

-- Keep the existing function name for every owner-only mutation policy and
-- RPC. Common staff reads are granted by explicit SELECT policies below.
create or replace function public.is_operator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_owner();
$$;

create or replace function public.get_my_operator_context()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.current_operator_access_level() = 'owner'
      then jsonb_build_object('accessLevel', 'owner', 'staffProfileId', null)
    when private.current_operator_access_level() = 'staff'
      then jsonb_build_object(
        'accessLevel', 'staff',
        'staffProfileId', private.current_staff_id()
      )
    else null
  end;
$$;

create or replace function public.link_staff_operator_account(
  target_staff_id uuid,
  target_auth_user_id uuid,
  target_login_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_login_id text := lower(btrim(target_login_id));
  linked_staff_id uuid;
begin
  if not private.is_owner() then
    raise exception 'Owner access is required.' using errcode = '42501';
  end if;
  if normalized_login_id !~ '^[a-z0-9_-]{4,32}$' then
    raise exception 'Login ID is invalid.' using errcode = '23514';
  end if;
  if not exists (
    select 1 from auth.users
    where id = target_auth_user_id
      and raw_app_meta_data ->> 'role' = 'operator'
  ) or exists (
    select 1 from public.students where auth_user_id = target_auth_user_id
  ) then
    raise exception 'The Auth user is not an operator account.' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.students where nickname = normalized_login_id
  ) then
    raise exception 'Login ID conflicts with a student identifier.' using errcode = '23505';
  end if;
  if exists (
    select 1 from public.operator_accounts where auth_user_id = target_auth_user_id
  ) then
    raise exception 'The Auth user already has an operator account.' using errcode = '23505';
  end if;

  update public.staff_profiles
  set auth_user_id = target_auth_user_id
  where id = target_staff_id
    and is_active
    and auth_user_id is null
  returning id into linked_staff_id;

  if linked_staff_id is null then
    raise exception 'An active staff profile without an account was not found.' using errcode = 'P0002';
  end if;

  insert into public.operator_accounts(
    auth_user_id, access_level, login_id, is_login_enabled, created_by
  ) values (
    target_auth_user_id, 'staff', normalized_login_id, true, auth.uid()
  );

  return linked_staff_id;
end;
$$;

create or replace function public.create_staff_with_operator_account(
  staff_display_name text,
  staff_role text,
  target_auth_user_id uuid,
  target_login_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_login_id text := lower(btrim(target_login_id));
  created_staff_id uuid;
begin
  if not private.is_owner() then
    raise exception 'Owner access is required.' using errcode = '42501';
  end if;
  if staff_display_name is null or btrim(staff_display_name) = ''
     or staff_role not in ('manager', 'vocal_trainer')
     or normalized_login_id !~ '^[a-z0-9_-]{4,32}$' then
    raise exception 'Staff account values are invalid.' using errcode = '23514';
  end if;
  if not exists (
    select 1 from auth.users
    where id = target_auth_user_id
      and raw_app_meta_data ->> 'role' = 'operator'
  ) or exists (
    select 1 from public.students where auth_user_id = target_auth_user_id
  ) then
    raise exception 'The Auth user is not an operator account.' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.students where nickname = normalized_login_id
  ) then
    raise exception 'Login ID conflicts with a student identifier.' using errcode = '23505';
  end if;
  if exists (
    select 1 from public.operator_accounts where auth_user_id = target_auth_user_id
  ) then
    raise exception 'The Auth user already has an operator account.' using errcode = '23505';
  end if;

  insert into public.staff_profiles(display_name, role, auth_user_id, created_by)
  values (btrim(staff_display_name), staff_role, target_auth_user_id, auth.uid())
  returning id into created_staff_id;

  insert into public.operator_accounts(
    auth_user_id, access_level, login_id, is_login_enabled, created_by
  ) values (
    target_auth_user_id, 'staff', normalized_login_id, true, auth.uid()
  );

  return created_staff_id;
end;
$$;

create or replace function public.set_staff_operator_account_enabled(
  target_staff_id uuid,
  enabled boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_staff_id uuid;
begin
  if not private.is_owner() then
    raise exception 'Owner access is required.' using errcode = '42501';
  end if;

  update public.operator_accounts accounts
  set is_login_enabled = enabled
  from public.staff_profiles profiles
  where profiles.id = target_staff_id
    and profiles.auth_user_id = accounts.auth_user_id
    and accounts.access_level = 'staff'
    and (not enabled or profiles.is_active)
  returning profiles.id into changed_staff_id;

  if changed_staff_id is null then
    raise exception 'A matching staff operator account was not found.' using errcode = 'P0002';
  end if;
  return changed_staff_id;
end;
$$;

create or replace function public.delete_or_archive_staff(target_staff_id uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  archived_id uuid;
begin
  if not public.is_operator() then
    raise exception 'Owner access is required.' using errcode = '42501';
  end if;

  update public.staff_profiles
  set is_active = false
  where id = target_staff_id and is_active
  returning id into archived_id;

  if archived_id is null then
    raise exception 'Active staff profile was not found.' using errcode = 'P0002';
  end if;

  update public.operator_accounts accounts
  set is_login_enabled = false
  from public.staff_profiles profiles
  where profiles.id = archived_id
    and profiles.auth_user_id = accounts.auth_user_id
    and accounts.access_level = 'staff';

  return 'archived';
end;
$$;

create or replace function public.restore_staff_profile(target_staff_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  restored_id uuid;
begin
  if not public.is_operator() then
    raise exception 'Owner access is required.' using errcode = '42501';
  end if;

  update public.staff_profiles
  set is_active = true
  where id = target_staff_id and not is_active
  returning id into restored_id;

  if restored_id is null then
    raise exception 'Archived staff profile was not found.' using errcode = 'P0002';
  end if;

  update public.operator_accounts accounts
  set is_login_enabled = true
  from public.staff_profiles profiles
  where profiles.id = restored_id
    and profiles.auth_user_id = accounts.auth_user_id
    and accounts.access_level = 'staff';

  return restored_id;
end;
$$;

create or replace function public.protect_staff_attendance_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_operator() then return new; end if;
  if private.current_staff_id() is null then return new; end if;

  if tg_op = 'INSERT' then
    new.recorded_by = auth.uid();
    new.recorded_at = now();
  elsif new.id is distinct from old.id
    or new.lesson_id is distinct from old.lesson_id
    or new.student_id is distinct from old.student_id
    or new.recorded_by is distinct from old.recorded_by
    or new.recorded_at is distinct from old.recorded_at
    or new.created_at is distinct from old.created_at then
    raise exception 'Attendance ownership fields cannot be changed.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger attendance_records_protect_staff_write
before insert or update on public.attendance_records
for each row execute function public.protect_staff_attendance_write();

create or replace function public.protect_staff_feedback_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_operator() then return new; end if;
  if private.current_staff_id() is null then return new; end if;

  if tg_op = 'INSERT' then
    new.author_staff_id = private.current_staff_id();
    new.created_by = auth.uid();
    new.deleted_at = null;
  elsif new.id is distinct from old.id
    or new.lesson_id is distinct from old.lesson_id
    or new.student_id is distinct from old.student_id
    or new.author_staff_id is distinct from old.author_staff_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
    or new.deleted_at is distinct from old.deleted_at then
    raise exception 'Feedback ownership fields cannot be changed.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger lesson_feedback_protect_staff_write
before insert or update on public.lesson_feedback
for each row execute function public.protect_staff_feedback_write();

create policy operator_accounts_owner_select on public.operator_accounts
for select to authenticated using ((select private.is_owner()));

create policy students_staff_select on public.students
for select to authenticated using ((select private.is_active_operator()));
create policy monthly_activity_plans_staff_select on public.monthly_activity_plans
for select to authenticated using ((select private.is_active_operator()));
create policy monthly_activity_items_staff_select on public.monthly_activity_items
for select to authenticated using ((select private.is_active_operator()));
create policy lessons_staff_select on public.lessons
for select to authenticated using ((select private.is_active_operator()));
create policy lesson_assignments_staff_select on public.lesson_assignments
for select to authenticated using ((select private.is_active_operator()));
create policy attendance_records_staff_select on public.attendance_records
for select to authenticated using ((select private.is_active_operator()));
create policy makeup_lessons_staff_select on public.makeup_lessons
for select to authenticated using ((select private.is_active_operator()));
create policy makeup_lesson_events_staff_select on public.makeup_lesson_events
for select to authenticated using ((select private.is_active_operator()));
create policy lesson_feedback_staff_select on public.lesson_feedback
for select to authenticated using ((select private.is_active_operator()));
create policy feedback_comments_staff_select on public.feedback_comments
for select to authenticated using ((select private.is_active_operator()));
create policy student_programs_staff_select on public.student_programs
for select to authenticated using ((select private.is_active_operator()));
create policy student_program_allowance_adjustments_staff_select
on public.student_program_allowance_adjustments
for select to authenticated using ((select private.is_active_operator()));
create policy staff_profiles_staff_select on public.staff_profiles
for select to authenticated using ((select private.is_active_operator()));
create policy lesson_staff_staff_select on public.lesson_staff
for select to authenticated using ((select private.is_active_operator()));

create policy attendance_records_assigned_staff_insert
on public.attendance_records for insert to authenticated
with check (
  (select private.is_assigned_staff(lesson_id))
  and exists (
    select 1 from public.lesson_assignments assignments
    where assignments.lesson_id = attendance_records.lesson_id
      and assignments.student_id = attendance_records.student_id
      and assignments.unassigned_at is null
  )
);
create policy attendance_records_assigned_staff_update
on public.attendance_records for update to authenticated
using ((select private.is_assigned_staff(lesson_id)))
with check (
  (select private.is_assigned_staff(lesson_id))
  and exists (
    select 1 from public.lesson_assignments assignments
    where assignments.lesson_id = attendance_records.lesson_id
      and assignments.student_id = attendance_records.student_id
      and assignments.unassigned_at is null
  )
);

create policy lesson_feedback_assigned_staff_insert
on public.lesson_feedback for insert to authenticated
with check (
  author_staff_id = (select private.current_staff_id())
  and created_by = auth.uid()
  and deleted_at is null
  and (select private.is_assigned_staff(lesson_id))
  and exists (
    select 1 from public.lesson_assignments assignments
    where assignments.lesson_id = lesson_feedback.lesson_id
      and assignments.student_id = lesson_feedback.student_id
      and assignments.unassigned_at is null
  )
);
create policy lesson_feedback_assigned_staff_update
on public.lesson_feedback for update to authenticated
using (
  (select private.is_assigned_staff(lesson_id))
  and deleted_at is null
  and (
    created_by = auth.uid()
    or author_staff_id = (select private.current_staff_id())
  )
)
with check (
  (select private.is_assigned_staff(lesson_id))
  and deleted_at is null
  and (
    created_by = auth.uid()
    or author_staff_id = (select private.current_staff_id())
  )
);

create policy feedback_comments_assigned_staff_insert
on public.feedback_comments for insert to authenticated
with check (
  author_user_id = auth.uid()
  and deleted_at is null
  and exists (
    select 1 from public.lesson_feedback feedback
    where feedback.id = feedback_comments.feedback_id
      and feedback.deleted_at is null
      and private.is_assigned_staff(feedback.lesson_id)
  )
);
create policy feedback_comments_assigned_staff_update
on public.feedback_comments for update to authenticated
using (
  author_user_id = auth.uid()
  and exists (
    select 1 from public.lesson_feedback feedback
    where feedback.id = feedback_comments.feedback_id
      and private.is_assigned_staff(feedback.lesson_id)
  )
)
with check (author_user_id = auth.uid());

-- Attendance-triggered makeup lifecycle writes must remain atomic for assigned
-- staff without granting direct makeup or event mutation policies.
alter function public.guard_lesson_usage_record_creation() security definer;
alter function public.create_excused_makeup_entitlement() security definer;
alter function public.log_makeup_workflow_event() security definer;

revoke all on table public.operator_accounts from public, anon, authenticated, service_role;
grant select on table public.operator_accounts to authenticated;

revoke all on function private.current_operator_access_level() from public, anon, authenticated, service_role;
revoke all on function private.is_active_operator() from public, anon, authenticated, service_role;
revoke all on function private.is_owner() from public, anon, authenticated, service_role;
revoke all on function private.current_staff_id() from public, anon, authenticated, service_role;
revoke all on function private.is_assigned_staff(uuid) from public, anon, authenticated, service_role;
grant execute on function private.current_operator_access_level() to authenticated;
grant execute on function private.is_active_operator() to authenticated;
grant execute on function private.is_owner() to authenticated;
grant execute on function private.current_staff_id() to authenticated;
grant execute on function private.is_assigned_staff(uuid) to authenticated;

revoke all on function public.get_my_operator_context() from public, anon, service_role;
grant execute on function public.get_my_operator_context() to authenticated;
revoke all on function public.link_staff_operator_account(uuid, uuid, text) from public, anon, service_role;
revoke all on function public.create_staff_with_operator_account(text, text, uuid, text) from public, anon, service_role;
revoke all on function public.set_staff_operator_account_enabled(uuid, boolean) from public, anon, service_role;
grant execute on function public.link_staff_operator_account(uuid, uuid, text) to authenticated;
grant execute on function public.create_staff_with_operator_account(text, text, uuid, text) to authenticated;
grant execute on function public.set_staff_operator_account_enabled(uuid, boolean) to authenticated;

revoke all on function public.protect_staff_attendance_write() from public, anon, authenticated, service_role;
revoke all on function public.protect_staff_feedback_write() from public, anon, authenticated, service_role;

commit;
