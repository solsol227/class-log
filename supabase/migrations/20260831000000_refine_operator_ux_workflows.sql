begin;

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
    raise exception 'Operator access is required.' using errcode = '42501';
  end if;

  update public.staff_profiles
  set is_active = false
  where id = target_staff_id
    and is_active
  returning id into archived_id;

  if archived_id is null then
    raise exception 'Active staff profile was not found.' using errcode = 'P0002';
  end if;

  return 'archived';
end;
$$;

revoke all on function public.delete_or_archive_staff(uuid) from public, anon;
grant execute on function public.delete_or_archive_staff(uuid) to authenticated;

commit;
