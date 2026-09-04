begin;

create or replace function public.get_student_feedback_authors(target_feedback_ids uuid[])
returns table (
  feedback_id uuid,
  display_name text,
  role text
)
language sql
stable
security definer
set search_path = ''
as $$
  select feedback.id, staff.display_name, staff.role
  from public.lesson_feedback feedback
  join public.staff_profiles staff on staff.id = feedback.author_staff_id
  where coalesce(cardinality(target_feedback_ids), 0) between 1 and 200
    and feedback.id = any(target_feedback_ids)
    and private.student_can_view_feedback(feedback.id)
  order by feedback.published_at, feedback.id;
$$;

revoke all on function public.get_student_feedback_authors(uuid[]) from public, anon, service_role;
grant execute on function public.get_student_feedback_authors(uuid[]) to authenticated;

create or replace function public.get_student_feedback_comment_authors(target_comment_ids uuid[])
returns table (
  comment_id uuid,
  display_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    comments.id,
    coalesce(staff.display_name, student.nickname, '운영자')
  from public.feedback_comments comments
  left join public.staff_profiles staff on staff.auth_user_id = comments.author_user_id
  left join public.students student on student.auth_user_id = comments.author_user_id
  where coalesce(cardinality(target_comment_ids), 0) between 1 and 1000
    and comments.id = any(target_comment_ids)
    and comments.deleted_at is null
    and private.student_can_view_feedback(comments.feedback_id)
  order by comments.created_at, comments.id;
$$;

revoke all on function public.get_student_feedback_comment_authors(uuid[]) from public, anon, service_role;
grant execute on function public.get_student_feedback_comment_authors(uuid[]) to authenticated;

commit;
