begin;

create or replace function private.student_can_view_lesson(target_lesson_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.lessons
    join public.lesson_assignments assignments on assignments.lesson_id = lessons.id
    where lessons.id = target_lesson_id
      and lessons.status <> 'draft'
      and assignments.student_id = private.current_student_id()
      and assignments.unassigned_at is null
  );
$$;

create or replace function private.student_can_view_student_lesson(
  target_lesson_id uuid,
  target_student_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_student_id = private.current_student_id()
    and exists (
      select 1 from public.lessons
      where id = target_lesson_id and status <> 'draft'
    );
$$;

create or replace function private.student_can_view_feedback(target_feedback_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.lesson_feedback feedback
    join public.lessons lessons on lessons.id = feedback.lesson_id
    where feedback.id = target_feedback_id
      and feedback.student_id = private.current_student_id()
      and feedback.published_at is not null
      and feedback.deleted_at is null
      and lessons.status <> 'draft'
  );
$$;

drop policy lessons_student_select on public.lessons;
create policy lessons_student_select on public.lessons
for select to authenticated using ((select private.student_can_view_lesson(id)));

drop policy lesson_assignments_student_select on public.lesson_assignments;
create policy lesson_assignments_student_select on public.lesson_assignments
for select to authenticated
using (
  student_id = (select private.current_student_id())
  and unassigned_at is null
  and (select private.student_can_view_lesson(lesson_id))
);

drop policy attendance_records_student_select on public.attendance_records;
create policy attendance_records_student_select on public.attendance_records
for select to authenticated
using ((select private.student_can_view_student_lesson(lesson_id, student_id)));

drop policy makeup_lessons_student_select on public.makeup_lessons;
create policy makeup_lessons_student_select on public.makeup_lessons
for select to authenticated
using (
  (select private.student_can_view_student_lesson(original_lesson_id, student_id))
  and (replacement_lesson_id is null or (select private.student_can_view_student_lesson(replacement_lesson_id, student_id)))
);

drop policy lesson_feedback_student_select on public.lesson_feedback;
create policy lesson_feedback_student_select on public.lesson_feedback
for select to authenticated using ((select private.student_can_view_feedback(id)));

drop policy feedback_comments_student_select on public.feedback_comments;
create policy feedback_comments_student_select on public.feedback_comments
for select to authenticated
using (deleted_at is null and (select private.student_can_view_feedback(feedback_id)));

drop policy feedback_comments_student_insert on public.feedback_comments;
create policy feedback_comments_student_insert on public.feedback_comments
for insert to authenticated
with check (
  author_user_id = auth.uid()
  and deleted_at is null
  and (select private.student_can_view_feedback(feedback_id))
);

drop policy lesson_staff_student_select on public.lesson_staff;
create policy lesson_staff_student_select on public.lesson_staff
for select to authenticated using ((select private.student_can_view_lesson(lesson_id)));

drop policy staff_profiles_student_select on public.staff_profiles;
create policy staff_profiles_student_select on public.staff_profiles
for select to authenticated
using (
  exists (
    select 1 from public.lesson_staff
    where lesson_staff.staff_id = staff_profiles.id
      and private.student_can_view_lesson(lesson_staff.lesson_id)
  )
);

revoke all on function private.student_can_view_lesson(uuid) from public, anon;
revoke all on function private.student_can_view_student_lesson(uuid,uuid) from public, anon;
revoke all on function private.student_can_view_feedback(uuid) from public, anon;
grant execute on function private.student_can_view_lesson(uuid) to authenticated;
grant execute on function private.student_can_view_student_lesson(uuid,uuid) to authenticated;
grant execute on function private.student_can_view_feedback(uuid) to authenticated;

commit;
