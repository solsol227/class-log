begin;

do $$
declare
  operator_id uuid;
  monthly_program_id uuid;
  rental_program_id uuid;
  monthly_before_committed integer;
  monthly_after_committed integer;
  monthly_before_drafts integer;
  rental_before_committed integer;
  rental_after_committed integer;
  rental_before_remaining integer;
  rental_after_remaining integer;
  draft_lesson_id uuid;
  scheduled_lesson_id uuid;
  cancelled_lesson_id uuid;
  soft_unassigned_lesson_id uuid;
  rental_lesson_one_id uuid;
  rental_lesson_two_id uuid;
  hard_delete_blocked boolean := false;
  monthly_flow_valid boolean := false;
  cancellation_valid boolean := false;
  soft_unassign_valid boolean := false;
  rental_flow_valid boolean := false;
  makeup_source_valid boolean := false;
begin
  select users.id into operator_id
  from auth.users users
  where users.raw_app_meta_data ->> 'role' = 'operator'
  order by users.created_at
  limit 1;

  select programs.id into monthly_program_id
  from public.student_programs programs
  where programs.status = 'active'
    and programs.program_type in ('weekday_vocal', 'weekend_vocal')
    and programs.base_allowance_count is not null
  order by programs.created_at
  limit 1;

  select programs.id into rental_program_id
  from public.student_programs programs
  where programs.status = 'active'
    and programs.program_type = 'rental'
  order by programs.created_at
  limit 1;

  if operator_id is null or monthly_program_id is null or rental_program_id is null then
    raise exception 'Allowance verification requires an operator and active monthly/rental programs.';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', operator_id,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object('role', 'operator')
    )::text,
    true
  );

  begin
    perform public.add_student_program_allowance_adjustment(
      monthly_program_id,
      '2097-01-01'::date,
      20,
      'rollback verification capacity'
    );

    select coalesce(statuses.reserved_count + statuses.used_count, 0),
           coalesce(statuses.draft_count, 0)
      into monthly_before_committed, monthly_before_drafts
    from public.student_program_allowance_statuses statuses
    where statuses.student_program_id = monthly_program_id
      and statuses.period_month = '2097-01-01'::date;

    monthly_before_committed := coalesce(monthly_before_committed, 0);
    monthly_before_drafts := coalesce(monthly_before_drafts, 0);

    draft_lesson_id := public.save_lesson_with_assignments(
      null, 'rollback Draft quota verification',
      '2097-01-02 10:00+09', '2097-01-02 11:00+09',
      '', '', 'draft', array[monthly_program_id]
    );
    scheduled_lesson_id := public.save_lesson_with_assignments(
      null, 'rollback Scheduled quota verification',
      '2097-01-03 10:00+09', '2097-01-03 11:00+09',
      '', '', 'scheduled', array[monthly_program_id]
    );

    select statuses.reserved_count + statuses.used_count
      into monthly_after_committed
    from public.student_program_allowance_statuses statuses
    where statuses.student_program_id = monthly_program_id
      and statuses.period_month = '2097-01-01'::date;

    monthly_flow_valid := monthly_after_committed = monthly_before_committed + 1
      and exists (
        select 1
        from public.student_program_allowance_statuses statuses
        where statuses.student_program_id = monthly_program_id
          and statuses.period_month = '2097-01-01'::date
          and statuses.draft_count = monthly_before_drafts + 1
      );

    perform public.save_lesson_with_assignments(
      scheduled_lesson_id, 'rollback Scheduled to Draft verification',
      '2097-01-03 10:00+09', '2097-01-03 11:00+09',
      '', '', 'draft', array[monthly_program_id]
    );
    monthly_flow_valid := monthly_flow_valid and exists (
      select 1
      from public.student_program_allowance_statuses statuses
      where statuses.student_program_id = monthly_program_id
        and statuses.period_month = '2097-01-01'::date
        and statuses.reserved_count + statuses.used_count = monthly_before_committed
        and statuses.draft_count = monthly_before_drafts + 2
    );

    cancelled_lesson_id := public.save_lesson_with_assignments(
      null, 'rollback cancellation verification',
      '2097-01-04 10:00+09', '2097-01-04 11:00+09',
      '', '', 'scheduled', array[monthly_program_id]
    );
    perform public.cancel_lesson(cancelled_lesson_id);
    cancellation_valid := exists (
      select 1
      from public.lessons lessons
      join public.lesson_assignments assignments on assignments.lesson_id = lessons.id
      where lessons.id = cancelled_lesson_id
        and lessons.status = 'cancelled'
        and assignments.unassigned_at is not null
    ) and exists (
      select 1
      from public.student_program_allowance_statuses statuses
      where statuses.student_program_id = monthly_program_id
        and statuses.period_month = '2097-01-01'::date
        and statuses.reserved_count + statuses.used_count = monthly_before_committed
    );

    soft_unassigned_lesson_id := public.save_lesson_with_assignments(
      null, 'rollback soft unassign verification',
      '2097-01-05 10:00+09', '2097-01-05 11:00+09',
      '', '', 'scheduled', array[monthly_program_id]
    );
    update public.lesson_assignments
    set unassigned_at = now()
    where lesson_id = soft_unassigned_lesson_id
      and unassigned_at is null;
    soft_unassign_valid := exists (
      select 1
      from public.lesson_assignments
      where lesson_id = soft_unassigned_lesson_id
        and unassigned_at is not null
    ) and exists (
      select 1
      from public.student_program_allowance_statuses statuses
      where statuses.student_program_id = monthly_program_id
        and statuses.period_month = '2097-01-01'::date
        and statuses.reserved_count + statuses.used_count = monthly_before_committed
    );

    begin
      delete from public.lesson_assignments
      where lesson_id = soft_unassigned_lesson_id;
    exception when raise_exception then
      hard_delete_blocked := true;
    end;

    if (select base_allowance_count from public.student_programs where id = rental_program_id) is null then
      perform public.configure_rental_program_allowance(rental_program_id, 10);
    else
      perform public.add_student_program_allowance_adjustment(
        rental_program_id, null, 10, 'rollback rental verification capacity'
      );
    end if;

    select statuses.reserved_count + statuses.used_count, statuses.remaining_count
      into rental_before_committed, rental_before_remaining
    from public.student_program_allowance_statuses statuses
    where statuses.student_program_id = rental_program_id
      and statuses.period_month is null;
    rental_before_committed := coalesce(rental_before_committed, 0);

    rental_lesson_one_id := public.save_lesson_with_assignments(
      null, 'rollback rental month one',
      '2097-02-02 10:00+09', '2097-02-02 11:00+09',
      '', '', 'scheduled', array[rental_program_id]
    );
    rental_lesson_two_id := public.save_lesson_with_assignments(
      null, 'rollback rental month two',
      '2097-03-02 10:00+09', '2097-03-02 11:00+09',
      '', '', 'scheduled', array[rental_program_id]
    );

    select statuses.reserved_count + statuses.used_count, statuses.remaining_count
      into rental_after_committed, rental_after_remaining
    from public.student_program_allowance_statuses statuses
    where statuses.student_program_id = rental_program_id
      and statuses.period_month is null;
    rental_flow_valid := rental_after_committed = rental_before_committed + 2
      and rental_after_remaining = rental_before_remaining - 2;

    makeup_source_valid := not exists (
      select 1
      from public.makeup_lessons makeups
      left join public.lesson_assignments assignments
        on assignments.lesson_id = makeups.replacement_lesson_id
       and assignments.student_id = makeups.student_id
      where makeups.source_student_program_id is null
         or (
           makeups.status in ('scheduled', 'completed')
           and assignments.student_program_id is distinct from makeups.source_student_program_id
         )
    );

    raise exception 'rollback allowance verification' using errcode = 'ZX001';
  exception when sqlstate 'ZX001' then
    null;
  end;

  if not monthly_flow_valid
     or not cancellation_valid
     or not soft_unassign_valid
     or not hard_delete_blocked
     or not rental_flow_valid
     or not makeup_source_valid then
    raise exception 'Neutral lesson allowance rollback verification failed.';
  end if;
end;
$$;

commit;
