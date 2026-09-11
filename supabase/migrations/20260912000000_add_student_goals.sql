begin;

alter table public.students
  add column goal text null,
  add constraint students_goal_length_check
    check (goal is null or char_length(goal) <= 1000);

comment on column public.students.goal is
  'Optional student goal. Read through existing owner, staff, and self-student RLS; owner-only mutation is unchanged.';

drop function if exists public.save_student_profile(uuid, text, text, integer, text, text, date, text);

create function public.save_student_profile(
  target_student_id uuid,
  profile_nickname text,
  profile_gender text,
  profile_age integer,
  profile_phone text,
  profile_acquisition_source text,
  profile_joined_month date,
  profile_special_notes text,
  profile_goal text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved_id uuid;
begin
  if not coalesce(public.is_operator(), false) then
    raise exception 'Operator access is required.' using errcode = '42501';
  end if;
  if target_student_id is null
     or profile_nickname is null
     or btrim(profile_nickname) = ''
     or (profile_goal is not null and char_length(profile_goal) > 1000) then
    raise exception 'Student profile values are invalid.' using errcode = '23514';
  end if;

  update public.students
  set nickname = btrim(profile_nickname),
      gender = profile_gender,
      age = profile_age,
      phone = profile_phone,
      acquisition_source = profile_acquisition_source,
      joined_month = profile_joined_month,
      special_notes = profile_special_notes,
      goal = profile_goal
  where id = target_student_id
  returning id into saved_id;

  if saved_id is null then
    raise exception 'Student not found.' using errcode = 'P0002';
  end if;

  return jsonb_build_object('studentId', saved_id, 'profileUpdated', true);
end;
$$;

revoke all on function public.save_student_profile(uuid, text, text, integer, text, text, date, text, text) from public, anon;
grant execute on function public.save_student_profile(uuid, text, text, integer, text, text, date, text, text) to authenticated;

commit;
