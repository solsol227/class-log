begin;

create unique index makeup_lessons_one_open_request_idx
  on public.makeup_lessons(original_lesson_id, student_id)
  where status in ('requested', 'scheduled');
create index makeup_lessons_status_created_idx
  on public.makeup_lessons(status, created_at);

create or replace function public.validate_makeup_program()
returns trigger
language plpgsql
set search_path = ''
as $$
declare original_program text; replacement_program text;
begin
  if new.replacement_lesson_id is null then return new; end if;
  select program_type into original_program from public.lessons where id = new.original_lesson_id;
  select program_type into replacement_program from public.lessons where id = new.replacement_lesson_id;
  if original_program is null or replacement_program is null
     or original_program is distinct from replacement_program then
    raise exception 'Makeup lessons must use the same program as the original lesson.' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger makeup_lessons_validate_program
before insert or update of original_lesson_id, replacement_lesson_id on public.makeup_lessons
for each row execute function public.validate_makeup_program();

drop policy makeup_lessons_student_select on public.makeup_lessons;
create policy makeup_lessons_student_select on public.makeup_lessons
for select to authenticated
using (
  student_id = (select private.current_student_id())
  and exists (
    select 1 from public.lessons original
    where original.id = makeup_lessons.original_lesson_id and original.status <> 'draft'
  )
  and (
    replacement_lesson_id is null
    or exists (
      select 1 from public.lessons replacement
      where replacement.id = makeup_lessons.replacement_lesson_id and replacement.status <> 'draft'
    )
  )
);

revoke all on function public.validate_makeup_program() from public, anon, authenticated;

commit;
