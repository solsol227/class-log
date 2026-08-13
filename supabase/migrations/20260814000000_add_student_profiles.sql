begin;

alter table public.students
  add column gender text,
  add column age text,
  add column phone text,
  add column acquisition_source text,
  add column category text,
  add column joined_month date,
  add column special_notes text,
  add constraint students_gender_valid check (
    gender is null or gender in ('male', 'female')
  ),
  add constraint students_age_not_blank check (
    age is null or length(btrim(age)) > 0
  ),
  add constraint students_phone_valid check (
    phone is null or phone ~ '^010[0-9]{8}$'
  ),
  add constraint students_acquisition_source_not_blank check (
    acquisition_source is null or length(btrim(acquisition_source)) > 0
  ),
  add constraint students_category_not_blank check (
    category is null or length(btrim(category)) > 0
  ),
  add constraint students_joined_month_is_first_day check (
    joined_month is null
    or joined_month = date_trunc('month', joined_month)::date
  ),
  add constraint students_special_notes_not_blank check (
    special_notes is null or length(btrim(special_notes)) > 0
  );

-- Deleting a student profile must not leave its student Auth user orphaned.
-- The trigger runs in the same transaction as all public FK cascades. If the
-- Auth user is missing, is not a student, or cannot be deleted because another
-- relation still references it, the entire profile deletion is rolled back.
create function public.delete_student_auth_user_after_profile_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  auth_role text;
begin
  select users.raw_app_meta_data ->> 'role'
  into auth_role
  from auth.users
  where users.id = old.auth_user_id
  for update;

  if not found then
    raise exception 'Student Auth user was not found.'
      using errcode = '23503';
  end if;

  if auth_role is distinct from 'student' then
    raise exception 'Only student Auth users can be deleted with a student profile.'
      using errcode = '42501';
  end if;

  delete from auth.users
  where users.id = old.auth_user_id
    and users.raw_app_meta_data ->> 'role' = 'student';

  if not found then
    raise exception 'Student Auth user could not be deleted.'
      using errcode = '23503';
  end if;

  return old;
end;
$$;

create trigger students_delete_auth_user
after delete on public.students
for each row execute function public.delete_student_auth_user_after_profile_delete();

revoke all on function public.delete_student_auth_user_after_profile_delete()
  from public, anon, authenticated;

commit;
