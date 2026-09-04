begin;

-- Match save_lesson_with_assignments and the schedule validation trigger:
-- every multi-student operation acquires student advisory locks in UUID order.
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
  if not public.is_operator() then
    raise exception 'Operator access is required.' using errcode = '42501';
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

revoke all on function public.confirm_draft_lesson(uuid) from public, anon;
grant execute on function public.confirm_draft_lesson(uuid) to authenticated;

commit;
