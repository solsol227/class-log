begin;
set local statement_timeout = '45s';
set local lock_timeout = '30s';
set local application_name = 'class-log-concurrency-confirm';
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', (select id from auth.users where raw_app_meta_data ->> 'role' = 'operator' order by created_at limit 1),
  'role', 'authenticated', 'app_metadata', jsonb_build_object('role', 'operator')
)::text, true);
set local role authenticated;
do $$
declare
  draft_id uuid;
  confirmed uuid;
begin
  select l.id into strict draft_id
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

  confirmed := public.confirm_draft_lesson(draft_id);
  if confirmed is distinct from draft_id or not exists (
    select 1 from public.lessons where id = draft_id and status in ('scheduled', 'completed')
  ) then
    raise exception 'Concurrent confirmation did not confirm its Draft.';
  end if;
end;
$$;
rollback;
select 'confirmation completed and rolled back' as result;
