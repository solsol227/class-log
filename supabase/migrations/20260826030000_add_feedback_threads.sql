begin;

do $$
begin
  if exists (select 1 from public.lesson_feedback) then
    raise exception 'lesson_feedback must be empty before author_staff_id becomes required.';
  end if;
  if exists (select 1 from public.feedback_responses) then
    raise exception 'feedback_responses must be empty before replacement.';
  end if;
end;
$$;

alter table public.lesson_feedback
  drop constraint lesson_feedback_lesson_student_unique,
  add column author_staff_id uuid not null references public.staff_profiles(id) on delete restrict,
  add column deleted_at timestamptz;
create index lesson_feedback_lesson_student_created_idx
  on public.lesson_feedback(lesson_id, student_id, created_at);

drop policy lesson_feedback_student_select on public.lesson_feedback;
create policy lesson_feedback_student_select on public.lesson_feedback
for select to authenticated
using (
  student_id = (select private.current_student_id())
  and published_at is not null
  and deleted_at is null
  and exists (
    select 1 from public.lessons
    where lessons.id = lesson_feedback.lesson_id and lessons.status <> 'draft'
  )
);

create table public.feedback_comments (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.lesson_feedback(id) on delete cascade,
  author_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  parent_comment_id uuid,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint feedback_comments_body_not_blank check (length(btrim(body)) > 0),
  constraint feedback_comments_id_feedback_unique unique (id, feedback_id),
  constraint feedback_comments_parent_same_feedback_fk
    foreign key (parent_comment_id, feedback_id)
    references public.feedback_comments(id, feedback_id)
    on delete restrict
);
create index feedback_comments_feedback_created_idx
  on public.feedback_comments(feedback_id, created_at);
create trigger feedback_comments_set_updated_at
before update on public.feedback_comments
for each row execute function public.set_updated_at();

create or replace function public.protect_feedback_comment_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_operator() then return new; end if;
  if tg_op = 'INSERT' then
    new.author_user_id = auth.uid();
    new.created_at = now();
    new.updated_at = now();
  elsif new.feedback_id is distinct from old.feedback_id
    or new.author_user_id is distinct from old.author_user_id
    or new.parent_comment_id is distinct from old.parent_comment_id
    or new.created_at is distinct from old.created_at then
    raise exception 'Comment ownership fields cannot be changed.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger feedback_comments_protect_write
before insert or update on public.feedback_comments
for each row execute function public.protect_feedback_comment_write();

alter table public.feedback_comments enable row level security;
alter table public.feedback_comments force row level security;
create policy feedback_comments_operator_all on public.feedback_comments
for all to authenticated using ((select public.is_operator())) with check ((select public.is_operator()));
create policy feedback_comments_student_select on public.feedback_comments
for select to authenticated
using (
  deleted_at is null
  and exists (
    select 1 from public.lesson_feedback feedback
    join public.lessons lessons on lessons.id = feedback.lesson_id
    where feedback.id = feedback_comments.feedback_id
      and feedback.student_id = (select private.current_student_id())
      and feedback.published_at is not null
      and feedback.deleted_at is null
      and lessons.status <> 'draft'
  )
);
create policy feedback_comments_student_insert on public.feedback_comments
for insert to authenticated
with check (
  author_user_id = auth.uid()
  and deleted_at is null
  and exists (
    select 1 from public.lesson_feedback feedback
    join public.lessons lessons on lessons.id = feedback.lesson_id
    where feedback.id = feedback_comments.feedback_id
      and feedback.student_id = (select private.current_student_id())
      and feedback.published_at is not null
      and feedback.deleted_at is null
      and lessons.status <> 'draft'
  )
);
create policy feedback_comments_student_update on public.feedback_comments
for update to authenticated
using (author_user_id = auth.uid())
with check (author_user_id = auth.uid());

revoke all on table public.feedback_comments from public, anon;
grant select, insert, update, delete on table public.feedback_comments to authenticated;
revoke all on function public.protect_feedback_comment_write() from public, anon, authenticated;

drop table public.feedback_responses;
drop function public.protect_feedback_response_student_write();

commit;
