begin;

-- Lessons are now shared schedules. Student membership is represented by
-- lesson_assignments, which is also the integrity anchor for student-scoped
-- lesson data.

drop policy lessons_student_select on public.lessons;

alter table public.attendance_records
  drop constraint attendance_records_lesson_student_fk,
  drop constraint attendance_records_lesson_unique;

alter table public.makeup_lessons
  drop constraint makeup_lessons_original_student_fk,
  drop constraint makeup_lessons_replacement_student_fk,
  drop constraint makeup_lessons_replacement_unique;

alter table public.lesson_feedback
  drop constraint lesson_feedback_lesson_student_fk,
  drop constraint lesson_feedback_lesson_unique;

drop index public.lessons_student_starts_at_idx;

alter table public.lessons
  drop constraint lessons_id_student_unique,
  drop constraint lessons_student_id_fkey,
  drop column student_id;

create table public.lesson_assignments (
  lesson_id uuid not null,
  student_id uuid not null,
  assigned_at timestamptz not null default now(),
  assigned_by uuid not null default auth.uid()
    references auth.users(id) on delete restrict,
  constraint lesson_assignments_pkey primary key (lesson_id, student_id),
  constraint lesson_assignments_lesson_id_fkey
    foreign key (lesson_id)
    references public.lessons(id)
    on delete cascade,
  constraint lesson_assignments_student_id_fkey
    foreign key (student_id)
    references public.students(id)
    on delete cascade
);

create index lesson_assignments_student_id_idx
  on public.lesson_assignments(student_id);

alter table public.attendance_records
  add constraint attendance_records_lesson_student_unique
    unique (lesson_id, student_id),
  add constraint attendance_records_lesson_assignment_fk
    foreign key (lesson_id, student_id)
    references public.lesson_assignments(lesson_id, student_id)
    on delete cascade;

alter table public.makeup_lessons
  add constraint makeup_lessons_original_assignment_fk
    foreign key (original_lesson_id, student_id)
    references public.lesson_assignments(lesson_id, student_id)
    on delete cascade,
  add constraint makeup_lessons_replacement_assignment_fk
    foreign key (replacement_lesson_id, student_id)
    references public.lesson_assignments(lesson_id, student_id)
    on delete restrict,
  add constraint makeup_lessons_replacement_student_unique
    unique (replacement_lesson_id, student_id);

alter table public.lesson_feedback
  add constraint lesson_feedback_lesson_student_unique
    unique (lesson_id, student_id),
  add constraint lesson_feedback_lesson_assignment_fk
    foreign key (lesson_id, student_id)
    references public.lesson_assignments(lesson_id, student_id)
    on delete cascade;

alter table public.lesson_assignments enable row level security;
alter table public.lesson_assignments force row level security;

create policy lesson_assignments_operator_all on public.lesson_assignments
for all to authenticated
using ((select public.is_operator()))
with check ((select public.is_operator()));

create policy lesson_assignments_student_select on public.lesson_assignments
for select to authenticated
using (student_id = (select public.current_student_id()));

create policy lessons_student_select on public.lessons
for select to authenticated
using (
  exists (
    select 1
    from public.lesson_assignments assignments
    where assignments.lesson_id = lessons.id
      and assignments.student_id = (select public.current_student_id())
  )
);

revoke all on table public.lesson_assignments from public, anon;
grant select, insert, update, delete on table public.lesson_assignments to authenticated;

commit;
