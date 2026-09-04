-- Run alongside confirm.sql. All changes are rolled back, including on error.
begin;
set local statement_timeout = '45s';
set local lock_timeout = '30s';
set local application_name = 'class-log-concurrency-save';
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', (select id from auth.users where raw_app_meta_data ->> 'role' = 'operator' order by created_at limit 1),
  'role', 'authenticated', 'app_metadata', jsonb_build_object('role', 'operator')
)::text, true);
set local role authenticated;
do $$
declare
  pair record;
  saved uuid;
begin
  select l.id, a.student_id, a.student_program_id as low_program, b.student_program_id as high_program
  into strict pair
  from public.lessons l
  join public.lesson_assignments a on a.lesson_id = l.id and a.unassigned_at is null
  join public.lesson_assignments b on b.lesson_id = l.id and b.unassigned_at is null
  join public.student_programs pa on pa.id = a.student_program_id
  join public.student_programs pb on pb.id = b.student_program_id
  where l.status = 'draft' and a.student_id < b.student_id
    and a.student_program_id > b.student_program_id
    and pa.status = 'active' and pb.status = 'active'
    and pa.program_type in ('weekday_vocal', 'weekend_vocal')
    and pb.program_type in ('weekday_vocal', 'weekend_vocal')
  order by l.id limit 1;

  -- Pause after the first lock in save's documented order. The old confirm
  -- order takes the other student's lock and waits here, closing a cycle.
  perform pg_advisory_xact_lock(hashtextextended(pair.student_id::text, 0));
  perform pg_sleep(20);
  saved := public.save_lesson_with_assignments(
    null, 'rollback concurrency verification',
    '2098-01-02 10:00+09', '2098-01-02 11:00+09', '', '', 'scheduled',
    array[pair.low_program, pair.high_program]
  );
  if not exists (select 1 from public.lessons where id = saved and status = 'scheduled') then
    raise exception 'Concurrent save did not create its scheduled lesson.';
  end if;
end;
$$;
rollback;
select 'save completed and rolled back' as result;
