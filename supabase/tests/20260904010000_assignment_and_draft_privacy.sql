begin;
set local statement_timeout = '30s';
create temporary table review_context as
select operators.id as operator_id, p.id as program_id, p.student_id, s.auth_user_id
from auth.users operators
cross join public.student_programs p
join public.students s on s.id = p.student_id
where operators.raw_app_meta_data ->> 'role' = 'operator'
  and p.status = 'active' and p.program_type in ('weekday_vocal', 'weekend_vocal')
  and s.auth_user_id is not null
order by operators.created_at, p.student_id;
create temporary table review_lesson(id uuid);
grant select on review_context to authenticated;
grant select, insert on review_lesson to authenticated;
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', (select operator_id from review_context limit 1),
  'role', 'authenticated', 'app_metadata', jsonb_build_object('role', 'operator')
)::text, true);
set local role authenticated;
do $$
declare
  fixture uuid;
  item record;
  added integer := 0;
begin
  fixture := public.save_lesson_with_assignments(null, 'rollback assignment preservation',
    '2096-02-02 10:00+09', '2096-02-02 11:00+09', '', '', 'draft', '{}'::uuid[], 'weekend');
  insert into review_lesson values (fixture);
  for item in select distinct on (student_id) * from review_context order by student_id limit 2 loop
    perform public.assign_student_to_lesson(fixture, item.student_id, item.program_id);
    added := added + 1;
    if (select count(*) from public.lesson_assignments where lesson_id = fixture and unassigned_at is null) <> added then
      raise exception 'Adding a student replaced an existing assignment.';
    end if;
  end loop;
  if added <> 2 then raise exception 'Two authenticated student fixtures are required.'; end if;
  begin
    perform public.assign_student_to_lesson(fixture, item.student_id, item.program_id);
    raise exception 'Duplicate assignment was accepted.' using errcode = 'ZX001';
  exception when sqlstate 'P0001' then null;
  end;
end;
$$;
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', (select auth_user_id from review_context order by student_id limit 1),
  'role', 'authenticated', 'app_metadata', jsonb_build_object('role', 'student')
)::text, true);
do $$
begin
  if not exists (select 1 from public.get_my_student_program_allowance_statuses()) then
    raise exception 'Student allowance results unexpectedly empty.';
  end if;
  if exists (
    select 1 from public.get_my_student_program_allowance_statuses()
    where draft_count <> 0 or period_month = '2096-02-01'
      or student_id <> (select student_id from review_context order by student_id limit 1)
  ) then raise exception 'Draft counts/months or another student leaked.'; end if;
  if exists (select 1 from public.lessons where id in (select id from review_lesson))
    or exists (select 1 from public.lesson_assignments where lesson_id in (select id from review_lesson)) then
    raise exception 'Draft lesson or assignment leaked through RLS.';
  end if;
  begin
    perform public.assign_student_to_lesson((select id from review_lesson),
      (select student_id from review_context limit 1), (select program_id from review_context limit 1));
    raise exception 'Student mutation was accepted.' using errcode = 'ZX001';
  exception when insufficient_privilege then null;
  end;
  if has_function_privilege('anon', 'public.assign_student_to_lesson(uuid,uuid,uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.get_my_student_program_allowance_statuses()', 'EXECUTE') then
    raise exception 'Anonymous RPC access must be denied.';
  end if;
end;
$$;
rollback;
select 'operator append, duplicate rejection, student privacy/RLS, mutation and anon denial passed; rolled back' as result;
