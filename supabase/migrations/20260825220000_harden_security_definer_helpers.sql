begin;

revoke execute on function public.rls_auto_enable() from public;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

alter function public.current_student_id() set schema private;
grant execute on function private.current_student_id() to authenticated;

commit;
