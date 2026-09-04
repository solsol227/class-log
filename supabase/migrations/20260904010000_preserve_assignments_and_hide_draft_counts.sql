begin;

-- Adding one student must not replace a roster read before another request.
create function public.assign_student_to_lesson(
  target_lesson_id uuid, target_student_id uuid, target_student_program_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  assigned_id uuid;
begin
  if not public.is_operator() then
    raise exception 'Operator access is required.' using errcode = '42501';
  end if;
  perform 1 from public.lessons
  where id = target_lesson_id and status <> 'cancelled' for update;
  if not found then
    raise exception 'Assignable lesson was not found.' using errcode = 'P0002';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_student_id::text, 0));
  perform 1 from public.student_programs
  where id = target_student_program_id and student_id = target_student_id
    and status = 'active' and base_allowance_count is not null;
  if not found then
    raise exception 'An active, configured student program is required.' using errcode = '23514';
  end if;
  insert into public.lesson_assignments(lesson_id, student_id, student_program_id, unassigned_at)
  values (target_lesson_id, target_student_id, target_student_program_id, null)
  on conflict on constraint lesson_assignments_pkey do update
    set student_program_id = excluded.student_program_id, unassigned_at = null
    where lesson_assignments.unassigned_at is not null
  returning lesson_id into assigned_id;
  if assigned_id is null then
    raise exception 'The student is already assigned.' using errcode = 'P0001';
  end if;
  return assigned_id;
end;
$$;
revoke all on function public.assign_student_to_lesson(uuid, uuid, uuid) from public, anon;
grant execute on function public.assign_student_to_lesson(uuid, uuid, uuid) to authenticated;

-- Keep the existing return signature while hiding operator-only Draft counts
-- and months introduced solely by Draft assignments.
create or replace function public.get_my_student_program_allowance_statuses()
returns table (
  student_program_id uuid, student_id uuid, program_type text, period_month date,
  base_allowance_count integer, operator_adjustment_count integer, draft_count integer,
  reserved_count integer, used_count integer, remaining_count integer,
  makeup_available_count integer, makeup_reserved_count integer, makeup_used_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select statuses.student_program_id, statuses.student_id, statuses.program_type,
         statuses.period_month, statuses.base_allowance_count, statuses.operator_adjustment_count,
         0::integer as draft_count,
         statuses.reserved_count, statuses.used_count, statuses.remaining_count,
         statuses.makeup_available_count, statuses.makeup_reserved_count, statuses.makeup_used_count
  from public.student_program_allowance_statuses statuses
  join public.student_programs programs on programs.id = statuses.student_program_id
  where statuses.student_id = private.current_student_id()
    and (programs.status = 'active' or statuses.makeup_available_count > 0 or statuses.makeup_reserved_count > 0)
    and (
      statuses.period_month is null
      or statuses.period_month = date_trunc('month', now() at time zone 'Asia/Seoul')::date
      or exists (
        select 1 from public.lesson_assignments assignments
        join public.lessons lessons on lessons.id = assignments.lesson_id
        where assignments.student_program_id = statuses.student_program_id
          and lessons.status <> 'draft'
          and date_trunc('month', lessons.starts_at at time zone 'Asia/Seoul')::date = statuses.period_month
      )
      or exists (
        select 1 from public.student_program_allowance_adjustments adjustments
        where adjustments.student_program_id = statuses.student_program_id
          and adjustments.target_month = statuses.period_month
      )
    );
$$;
revoke all on function public.get_my_student_program_allowance_statuses() from public, anon;
grant execute on function public.get_my_student_program_allowance_statuses() to authenticated;

commit;
