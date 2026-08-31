begin;

create or replace function public.delete_or_archive_staff(target_staff_id uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result text;
begin
  if not public.is_operator() then
    raise exception 'Operator access is required.' using errcode = '42501';
  end if;

  perform 1
  from public.staff_profiles
  where id = target_staff_id and is_active
  for update;
  if not found then
    raise exception 'Active staff profile was not found.' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.lesson_staff where staff_id = target_staff_id)
     or exists (select 1 from public.lesson_feedback where author_staff_id = target_staff_id) then
    update public.staff_profiles
    set is_active = false
    where id = target_staff_id and is_active;
    if not found then
      raise exception 'Staff profile was not archived.' using errcode = 'P0002';
    end if;
    result := 'archived';
  else
    delete from public.staff_profiles
    where id = target_staff_id and is_active;
    if not found then
      raise exception 'Staff profile was not deleted.' using errcode = 'P0002';
    end if;
    result := 'deleted';
  end if;

  return result;
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
    raise exception 'Operator access is required.' using errcode = '42501';
  end if;

  update public.staff_profiles
  set is_active = true
  where id = target_staff_id and not is_active
  returning id into restored_id;
  if restored_id is null then
    raise exception 'Archived staff profile was not found.' using errcode = 'P0002';
  end if;

  return restored_id;
end;
$$;

create or replace function public.replace_lesson_staff(
  target_lesson_id uuid,
  selected_staff_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_count integer;
  valid_count integer;
begin
  if not public.is_operator() then
    raise exception 'Operator access is required.' using errcode = '42501';
  end if;
  if array_position(coalesce(selected_staff_ids, '{}'::uuid[]), null) is not null then
    raise exception 'Selected staff cannot contain null.' using errcode = '23514';
  end if;

  perform 1 from public.lessons where id = target_lesson_id for update;
  if not found then
    raise exception 'Lesson was not found.' using errcode = 'P0002';
  end if;

  perform 1
  from public.staff_profiles
  where id = any(coalesce(selected_staff_ids, '{}'::uuid[]))
  order by id
  for key share;

  select count(*) into selected_count
  from (select distinct unnest(coalesce(selected_staff_ids, '{}'::uuid[])) as staff_id) selected;

  select count(*) into valid_count
  from (select distinct unnest(coalesce(selected_staff_ids, '{}'::uuid[])) as staff_id) selected
  join public.staff_profiles profiles on profiles.id = selected.staff_id
  where profiles.is_active
     or exists (
       select 1 from public.lesson_staff existing
       where existing.lesson_id = target_lesson_id
         and existing.staff_id = selected.staff_id
     );

  if valid_count <> selected_count then
    raise exception 'Newly selected staff profiles must exist and be active.' using errcode = '23514';
  end if;

  delete from public.lesson_staff
  where lesson_id = target_lesson_id
    and not (staff_id = any(coalesce(selected_staff_ids, '{}'::uuid[])));

  insert into public.lesson_staff(lesson_id, staff_id, role)
  select target_lesson_id, profiles.id, profiles.role
  from public.staff_profiles profiles
  where profiles.id = any(coalesce(selected_staff_ids, '{}'::uuid[]))
    and profiles.is_active
    and not exists (
      select 1 from public.lesson_staff existing
      where existing.lesson_id = target_lesson_id
        and existing.staff_id = profiles.id
    );

  return target_lesson_id;
end;
$$;

create or replace function public.update_makeup_reason(target_makeup_id uuid, new_reason text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  updated_id uuid;
begin
  if not public.is_operator() then
    raise exception 'Operator access is required.' using errcode = '42501';
  end if;

  perform 1
  from public.makeup_lessons
  where id = target_makeup_id and status in ('requested', 'scheduled')
  for update;
  if not found then
    raise exception 'Editable makeup lesson was not found.' using errcode = 'P0002';
  end if;

  update public.makeup_lessons
  set reason = nullif(btrim(new_reason), '')
  where id = target_makeup_id and status in ('requested', 'scheduled')
  returning id into updated_id;
  if updated_id is null then
    raise exception 'Makeup reason was not updated.' using errcode = 'P0002';
  end if;

  return updated_id;
end;
$$;

create or replace function public.delete_requested_makeup(target_makeup_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  deleted_id uuid;
begin
  if not public.is_operator() then
    raise exception 'Operator access is required.' using errcode = '42501';
  end if;

  perform 1
  from public.makeup_lessons
  where id = target_makeup_id
    and status = 'requested'
    and replacement_lesson_id is null
  for update;
  if not found then
    raise exception 'Deletable makeup request was not found.' using errcode = 'P0002';
  end if;

  delete from public.makeup_lessons
  where id = target_makeup_id
    and status = 'requested'
    and replacement_lesson_id is null
  returning id into deleted_id;
  if deleted_id is null then
    raise exception 'Makeup request was not deleted.' using errcode = 'P0002';
  end if;

  return deleted_id;
end;
$$;

revoke all on function public.delete_or_archive_staff(uuid) from public, anon;
revoke all on function public.restore_staff_profile(uuid) from public, anon;
revoke all on function public.replace_lesson_staff(uuid, uuid[]) from public, anon;
revoke all on function public.update_makeup_reason(uuid, text) from public, anon;
revoke all on function public.delete_requested_makeup(uuid) from public, anon;

grant execute on function public.delete_or_archive_staff(uuid) to authenticated;
grant execute on function public.restore_staff_profile(uuid) to authenticated;
grant execute on function public.replace_lesson_staff(uuid, uuid[]) to authenticated;
grant execute on function public.update_makeup_reason(uuid, text) to authenticated;
grant execute on function public.delete_requested_makeup(uuid) to authenticated;

commit;
