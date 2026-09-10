begin;

-- Deleted feedback is recoverable for seven days. The scheduled cleanup runs as
-- the database owner and is intentionally unavailable through PostgREST.
create or replace function private.purge_deleted_feedback(
  retention_period interval default interval '7 days'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_feedback_ids uuid[];
  expired_comment_ids uuid[];
  deleted_feedback_count integer := 0;
  deleted_comment_count integer := 0;
  detached_reply_count integer := 0;
  affected_count integer := 0;
begin
  if retention_period < interval '0 seconds' then
    raise exception 'Retention period cannot be negative.' using errcode = '22023';
  end if;

  select coalesce(pg_catalog.array_agg(feedback.id order by feedback.id), '{}'::uuid[])
  into expired_feedback_ids
  from public.lesson_feedback feedback
  where feedback.deleted_at is not null
    and feedback.deleted_at <= pg_catalog.now() - retention_period;

  -- A deleted feedback owns its whole conversation. Remove those comments
  -- explicitly before the feedback so self-referencing reply constraints never
  -- make cascade order ambiguous.
  delete from public.feedback_comments comments
  where comments.feedback_id = any(expired_feedback_ids);
  get diagnostics affected_count = row_count;
  deleted_comment_count := deleted_comment_count + affected_count;

  delete from public.lesson_feedback feedback
  where feedback.id = any(expired_feedback_ids);
  get diagnostics deleted_feedback_count = row_count;

  select coalesce(pg_catalog.array_agg(comments.id order by comments.id), '{}'::uuid[])
  into expired_comment_ids
  from public.feedback_comments comments
  where comments.deleted_at is not null
    and comments.deleted_at <= pg_catalog.now() - retention_period;

  -- Keep replies that were not deleted. Once the deleted parent leaves the
  -- retention window, surviving replies become top-level comments.
  update public.feedback_comments comments
  set parent_comment_id = null
  where comments.parent_comment_id = any(expired_comment_ids);
  get diagnostics detached_reply_count = row_count;

  delete from public.feedback_comments comments
  where comments.id = any(expired_comment_ids);
  get diagnostics affected_count = row_count;
  deleted_comment_count := deleted_comment_count + affected_count;

  return pg_catalog.jsonb_build_object(
    'feedbackDeleted', deleted_feedback_count,
    'commentsDeleted', deleted_comment_count,
    'repliesDetached', detached_reply_count
  );
end;
$$;

revoke all on function private.purge_deleted_feedback(interval)
  from public, anon, authenticated, service_role;

-- The user explicitly approved removing all rows already marked as deleted,
-- even though they have not yet reached the new seven-day retention window.
select private.purge_deleted_feedback(interval '0 seconds');

do $$
begin
  if exists (
    select 1
    from public.lesson_feedback
    where deleted_at is null and published_at is null
  ) then
    raise exception 'Active unpublished feedback exists; publication removal stopped.';
  end if;
end;
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
    join public.lesson_assignments assignments
      on assignments.lesson_id = feedback.lesson_id
     and assignments.student_id = feedback.student_id
    where feedback.id = target_feedback_id
      and feedback.student_id = private.current_student_id()
      and feedback.deleted_at is null
      and assignments.unassigned_at is null
      and lessons.status <> 'draft'
  );
$$;

revoke all on function private.student_can_view_feedback(uuid) from public, anon;
grant execute on function private.student_can_view_feedback(uuid) to authenticated;

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
  where coalesce(pg_catalog.cardinality(target_feedback_ids), 0) between 1 and 200
    and feedback.id = any(target_feedback_ids)
    and private.student_can_view_feedback(feedback.id)
  order by feedback.created_at, feedback.id;
$$;

revoke all on function public.get_student_feedback_authors(uuid[])
  from public, anon, service_role;
grant execute on function public.get_student_feedback_authors(uuid[]) to authenticated;

alter table public.lesson_feedback drop column published_at;

create index lesson_feedback_deleted_at_idx
  on public.lesson_feedback(deleted_at)
  where deleted_at is not null;
create index feedback_comments_deleted_at_idx
  on public.feedback_comments(deleted_at)
  where deleted_at is not null;

do $$
begin
  if pg_catalog.to_regprocedure('cron.schedule(text,text,text)') is null
     and exists (
       select 1 from pg_catalog.pg_available_extensions where name = 'pg_cron'
     ) then
    execute 'create extension if not exists pg_cron with schema pg_catalog';
  end if;
  if pg_catalog.to_regprocedure('cron.schedule(text,text,text)') is null then
    raise exception 'pg_cron is required for deleted feedback retention.';
  end if;
end;
$$;

select cron.schedule(
  'class-log-purge-deleted-feedback',
  '17 * * * *',
  'select private.purge_deleted_feedback();'
);

commit;
