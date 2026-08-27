begin;

do $$
begin
  if exists (select 1 from public.students where display_name is distinct from nickname) then
    raise exception 'students.display_name differs from nickname; cleanup stopped.';
  end if;
  if exists (select 1 from public.students where category is not null) then
    raise exception 'students.category contains data; cleanup stopped.';
  end if;
end;
$$;

alter table public.students
  drop constraint students_display_name_not_blank,
  drop constraint students_category_not_blank,
  drop column display_name,
  drop column category;

commit;
