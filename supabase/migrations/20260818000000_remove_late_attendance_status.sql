begin;

do $$
begin
  if exists (select 1 from public.attendance_records) then
    raise exception 'attendance_records must be empty before removing late status.'
      using errcode = '23514';
  end if;
end;
$$;

alter table public.attendance_records
  drop constraint attendance_records_status_valid,
  add constraint attendance_records_status_valid check (
    status in ('present', 'absent', 'excused')
  );

commit;
