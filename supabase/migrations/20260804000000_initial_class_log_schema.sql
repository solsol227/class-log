begin;

-- Class Log trusts only the signed app_metadata.role claim. User-editable
-- user_metadata must never be used for authorization decisions.
create or replace function public.is_operator()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'operator';
$$;

create table public.students (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  nickname text not null unique,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint students_nickname_not_blank check (length(btrim(nickname)) > 0),
  constraint students_nickname_normalized check (nickname = lower(btrim(nickname))),
  constraint students_display_name_not_blank check (
    display_name is null or length(btrim(display_name)) > 0
  )
);

-- SECURITY DEFINER is intentional: policies on child tables need a
-- non-recursive lookup from auth.uid() to the caller's student id.
create or replace function public.current_student_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select students.id
  from public.students
  where students.auth_user_id = auth.uid()
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'student';
$$;

create table public.monthly_activity_plans (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  month date not null,
  title text not null,
  summary text,
  status text not null default 'draft',
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_activity_plans_month_is_first_day check (
    month = date_trunc('month', month)::date
  ),
  constraint monthly_activity_plans_title_not_blank check (length(btrim(title)) > 0),
  constraint monthly_activity_plans_status_valid check (
    status in ('draft', 'published', 'completed')
  ),
  constraint monthly_activity_plans_student_month_unique unique (student_id, month),
  constraint monthly_activity_plans_id_student_unique unique (id, student_id)
);

create table public.monthly_activity_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null,
  student_id uuid not null,
  title text not null,
  description text,
  position integer not null default 0,
  is_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_activity_items_plan_student_fk
    foreign key (plan_id, student_id)
    references public.monthly_activity_plans(id, student_id)
    on delete cascade,
  constraint monthly_activity_items_title_not_blank check (length(btrim(title)) > 0),
  constraint monthly_activity_items_position_nonnegative check (position >= 0),
  constraint monthly_activity_items_position_unique unique (plan_id, position)
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text,
  notes text,
  status text not null default 'scheduled',
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lessons_title_not_blank check (length(btrim(title)) > 0),
  constraint lessons_time_order check (ends_at > starts_at),
  constraint lessons_status_valid check (
    status in ('scheduled', 'completed', 'cancelled')
  ),
  constraint lessons_id_student_unique unique (id, student_id)
);

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null,
  student_id uuid not null,
  status text not null,
  memo text,
  recorded_at timestamptz not null default now(),
  recorded_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_records_lesson_student_fk
    foreign key (lesson_id, student_id)
    references public.lessons(id, student_id)
    on delete cascade,
  constraint attendance_records_status_valid check (
    status in ('present', 'late', 'absent', 'excused')
  ),
  constraint attendance_records_lesson_unique unique (lesson_id)
);

create table public.makeup_lessons (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null,
  original_lesson_id uuid not null,
  replacement_lesson_id uuid,
  reason text,
  status text not null default 'requested',
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint makeup_lessons_original_student_fk
    foreign key (original_lesson_id, student_id)
    references public.lessons(id, student_id)
    on delete cascade,
  constraint makeup_lessons_replacement_student_fk
    foreign key (replacement_lesson_id, student_id)
    references public.lessons(id, student_id)
    on delete restrict,
  constraint makeup_lessons_different_lessons check (
    replacement_lesson_id is null or replacement_lesson_id <> original_lesson_id
  ),
  constraint makeup_lessons_status_valid check (
    status in ('requested', 'scheduled', 'completed', 'cancelled')
  ),
  constraint makeup_lessons_replacement_required check (
    status in ('requested', 'cancelled') or replacement_lesson_id is not null
  ),
  constraint makeup_lessons_replacement_unique unique (replacement_lesson_id)
);

create table public.lesson_feedback (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null,
  student_id uuid not null,
  body text not null,
  published_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lesson_feedback_lesson_student_fk
    foreign key (lesson_id, student_id)
    references public.lessons(id, student_id)
    on delete cascade,
  constraint lesson_feedback_body_not_blank check (length(btrim(body)) > 0),
  constraint lesson_feedback_lesson_unique unique (lesson_id),
  constraint lesson_feedback_id_student_unique unique (id, student_id)
);

create table public.feedback_responses (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null,
  student_id uuid not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feedback_responses_feedback_student_fk
    foreign key (feedback_id, student_id)
    references public.lesson_feedback(id, student_id)
    on delete cascade,
  constraint feedback_responses_body_not_blank check (length(btrim(body)) > 0),
  constraint feedback_responses_feedback_unique unique (feedback_id)
);

create index monthly_activity_plans_month_idx
  on public.monthly_activity_plans(month);
create index monthly_activity_items_student_id_idx
  on public.monthly_activity_items(student_id);
create index lessons_student_starts_at_idx
  on public.lessons(student_id, starts_at);
create index lessons_starts_at_idx
  on public.lessons(starts_at);
create index attendance_records_student_id_idx
  on public.attendance_records(student_id);
create index makeup_lessons_student_id_idx
  on public.makeup_lessons(student_id);
create index makeup_lessons_original_lesson_id_idx
  on public.makeup_lessons(original_lesson_id);
create index lesson_feedback_student_id_idx
  on public.lesson_feedback(student_id);
create index feedback_responses_student_id_idx
  on public.feedback_responses(student_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.protect_feedback_response_student_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_operator() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.created_at = now();
    new.updated_at = now();
  elsif new.feedback_id is distinct from old.feedback_id
    or new.student_id is distinct from old.student_id
    or new.created_at is distinct from old.created_at then
    raise exception 'Feedback response ownership fields cannot be changed.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger students_set_updated_at
before update on public.students
for each row execute function public.set_updated_at();
create trigger monthly_activity_plans_set_updated_at
before update on public.monthly_activity_plans
for each row execute function public.set_updated_at();
create trigger monthly_activity_items_set_updated_at
before update on public.monthly_activity_items
for each row execute function public.set_updated_at();
create trigger lessons_set_updated_at
before update on public.lessons
for each row execute function public.set_updated_at();
create trigger attendance_records_set_updated_at
before update on public.attendance_records
for each row execute function public.set_updated_at();
create trigger makeup_lessons_set_updated_at
before update on public.makeup_lessons
for each row execute function public.set_updated_at();
create trigger lesson_feedback_set_updated_at
before update on public.lesson_feedback
for each row execute function public.set_updated_at();
create trigger feedback_responses_set_updated_at
before update on public.feedback_responses
for each row execute function public.set_updated_at();
create trigger feedback_responses_protect_student_write
before insert or update on public.feedback_responses
for each row execute function public.protect_feedback_response_student_write();

alter table public.students enable row level security;
alter table public.students force row level security;
alter table public.monthly_activity_plans enable row level security;
alter table public.monthly_activity_plans force row level security;
alter table public.monthly_activity_items enable row level security;
alter table public.monthly_activity_items force row level security;
alter table public.lessons enable row level security;
alter table public.lessons force row level security;
alter table public.attendance_records enable row level security;
alter table public.attendance_records force row level security;
alter table public.makeup_lessons enable row level security;
alter table public.makeup_lessons force row level security;
alter table public.lesson_feedback enable row level security;
alter table public.lesson_feedback force row level security;
alter table public.feedback_responses enable row level security;
alter table public.feedback_responses force row level security;

-- Operators can manage every business row. The role comes from signed JWT
-- app_metadata, matching the application's existing route authorization.
create policy students_operator_all on public.students
for all to authenticated
using ((select public.is_operator()))
with check ((select public.is_operator()));
create policy monthly_activity_plans_operator_all on public.monthly_activity_plans
for all to authenticated
using ((select public.is_operator()))
with check ((select public.is_operator()));
create policy monthly_activity_items_operator_all on public.monthly_activity_items
for all to authenticated
using ((select public.is_operator()))
with check ((select public.is_operator()));
create policy lessons_operator_all on public.lessons
for all to authenticated
using ((select public.is_operator()))
with check ((select public.is_operator()));
create policy attendance_records_operator_all on public.attendance_records
for all to authenticated
using ((select public.is_operator()))
with check ((select public.is_operator()));
create policy makeup_lessons_operator_all on public.makeup_lessons
for all to authenticated
using ((select public.is_operator()))
with check ((select public.is_operator()));
create policy lesson_feedback_operator_all on public.lesson_feedback
for all to authenticated
using ((select public.is_operator()))
with check ((select public.is_operator()));
create policy feedback_responses_operator_all on public.feedback_responses
for all to authenticated
using ((select public.is_operator()))
with check ((select public.is_operator()));

-- Students can read only rows attached to their auth user. Draft plans and
-- unpublished feedback remain operator-only.
create policy students_student_select on public.students
for select to authenticated
using (id = (select public.current_student_id()));

create policy monthly_activity_plans_student_select on public.monthly_activity_plans
for select to authenticated
using (
  student_id = (select public.current_student_id())
  and status in ('published', 'completed')
);

create policy monthly_activity_items_student_select on public.monthly_activity_items
for select to authenticated
using (
  student_id = (select public.current_student_id())
  and exists (
    select 1
    from public.monthly_activity_plans plans
    where plans.id = monthly_activity_items.plan_id
      and plans.student_id = monthly_activity_items.student_id
      and plans.status in ('published', 'completed')
  )
);

create policy lessons_student_select on public.lessons
for select to authenticated
using (student_id = (select public.current_student_id()));

create policy attendance_records_student_select on public.attendance_records
for select to authenticated
using (student_id = (select public.current_student_id()));

create policy makeup_lessons_student_select on public.makeup_lessons
for select to authenticated
using (student_id = (select public.current_student_id()));

create policy lesson_feedback_student_select on public.lesson_feedback
for select to authenticated
using (
  student_id = (select public.current_student_id())
  and published_at is not null
);

create policy feedback_responses_student_select on public.feedback_responses
for select to authenticated
using (
  student_id = (select public.current_student_id())
  and exists (
    select 1
    from public.lesson_feedback feedback
    where feedback.id = feedback_responses.feedback_id
      and feedback.student_id = feedback_responses.student_id
      and feedback.published_at is not null
  )
);

-- A student may create and revise one response to their own published
-- feedback. They cannot write any other business table.
create policy feedback_responses_student_insert on public.feedback_responses
for insert to authenticated
with check (
  student_id = (select public.current_student_id())
  and exists (
    select 1
    from public.lesson_feedback feedback
    where feedback.id = feedback_responses.feedback_id
      and feedback.student_id = feedback_responses.student_id
      and feedback.published_at is not null
  )
);

create policy feedback_responses_student_update on public.feedback_responses
for update to authenticated
using (student_id = (select public.current_student_id()))
with check (
  student_id = (select public.current_student_id())
  and exists (
    select 1
    from public.lesson_feedback feedback
    where feedback.id = feedback_responses.feedback_id
      and feedback.student_id = feedback_responses.student_id
      and feedback.published_at is not null
  )
);

revoke all on table public.students from public, anon;
revoke all on table public.monthly_activity_plans from public, anon;
revoke all on table public.monthly_activity_items from public, anon;
revoke all on table public.lessons from public, anon;
revoke all on table public.attendance_records from public, anon;
revoke all on table public.makeup_lessons from public, anon;
revoke all on table public.lesson_feedback from public, anon;
revoke all on table public.feedback_responses from public, anon;

grant select, insert, update, delete on table public.students to authenticated;
grant select, insert, update, delete on table public.monthly_activity_plans to authenticated;
grant select, insert, update, delete on table public.monthly_activity_items to authenticated;
grant select, insert, update, delete on table public.lessons to authenticated;
grant select, insert, update, delete on table public.attendance_records to authenticated;
grant select, insert, update, delete on table public.makeup_lessons to authenticated;
grant select, insert, update, delete on table public.lesson_feedback to authenticated;
grant select, insert, update, delete on table public.feedback_responses to authenticated;

revoke all on function public.is_operator() from public, anon;
revoke all on function public.current_student_id() from public, anon;
revoke all on function public.set_updated_at() from public, anon;
revoke all on function public.protect_feedback_response_student_write() from public, anon;
grant execute on function public.is_operator() to authenticated;
grant execute on function public.current_student_id() to authenticated;

commit;
