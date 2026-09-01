begin;

create or replace function public.guard_scheduled_makeup_assignment_release()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
    tg_op = 'DELETE'
    or (old.unassigned_at is null and new.unassigned_at is not null)
  ) and exists (
    select 1
    from public.makeup_lessons makeups
    where makeups.replacement_lesson_id = old.lesson_id
      and makeups.student_id = old.student_id
      and makeups.status = 'scheduled'
  ) then
    raise exception 'A scheduled makeup replacement assignment must be released through the makeup workflow.'
      using errcode = 'P0001';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger lesson_assignments_guard_scheduled_makeup_release
before update of unassigned_at or delete on public.lesson_assignments
for each row execute function public.guard_scheduled_makeup_assignment_release();

revoke all on function public.guard_scheduled_makeup_assignment_release()
from public, anon, authenticated;

commit;
