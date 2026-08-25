begin;

alter table public.lesson_assignments
  add column unassigned_at timestamptz,
  add constraint lesson_assignments_unassigned_after_assigned check (
    unassigned_at is null or unassigned_at >= assigned_at
  );

create index lesson_assignments_active_student_id_idx
  on public.lesson_assignments(student_id)
  where unassigned_at is null;

drop policy lesson_assignments_student_select on public.lesson_assignments;

create policy lesson_assignments_student_select on public.lesson_assignments
for select to authenticated
using (
  student_id = (select public.current_student_id())
  and unassigned_at is null
);

drop policy lessons_student_select on public.lessons;

create policy lessons_student_select on public.lessons
for select to authenticated
using (
  exists (
    select 1
    from public.lesson_assignments assignments
    where assignments.lesson_id = lessons.id
      and assignments.student_id = (select public.current_student_id())
      and assignments.unassigned_at is null
  )
);

comment on column public.lesson_assignments.unassigned_at is
  'Null while the student is actively assigned; timestamped when removed without deleting related records.';

commit;
