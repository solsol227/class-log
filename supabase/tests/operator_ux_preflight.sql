-- Read-only metadata and aggregate counts; no user identifiers.
begin read only;
select jsonb_build_object(
'check1', (select jsonb_agg(r) from (select 'lessons' as subject, count(*)::text as value from public.lessons
union all select 'lessons.' || status, count(*)::text from public.lessons group by status
union all select 'assignments', count(*)::text from public.lesson_assignments
union all select 'programs', count(*)::text from public.student_programs
union all select 'makeups', count(*)::text from public.makeup_lessons) r),
'check2', (select jsonb_agg(r) from (
select column_name, data_type, is_nullable from information_schema.columns
where table_schema = 'public' and table_name = 'lessons' order by ordinal_position) r),
'check3', (select jsonb_agg(r) from (
select c.relname, t.tgname, pg_get_triggerdef(t.oid) as definition
from pg_trigger t join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal and c.relnamespace = 'public'::regnamespace
and c.relname in ('lessons', 'student_programs')) r),
'check4', (select jsonb_agg(r) from (
select p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef, p.proconfig,
       md5(pg_get_functiondef(p.oid)) as definition_hash
from pg_proc p where p.pronamespace = 'public'::regnamespace
and p.proname in ('save_lesson_with_assignments', 'save_student_profile_and_programs')) r),
'check5', (select jsonb_agg(r) from (
select tablename, policyname, roles, cmd, qual, with_check from pg_policies
where schemaname = 'public' and tablename in ('lessons', 'students', 'student_programs')) r)
) as preflight;
rollback;
