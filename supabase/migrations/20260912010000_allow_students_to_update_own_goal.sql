begin;

create function public.update_my_student_goal(new_goal text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_student uuid;
  normalized_goal text;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'student' then
    raise exception 'Student access is required.' using errcode = '42501';
  end if;

  normalized_goal := nullif(btrim(replace(coalesce(new_goal, ''), chr(13) || chr(10), chr(10))), '');
  if normalized_goal is not null and char_length(normalized_goal) > 1000 then
    raise exception 'Student goal is too long.' using errcode = '23514';
  end if;

  current_student := private.current_student_id();
  if current_student is null then
    raise exception 'Student profile not found.' using errcode = 'P0002';
  end if;

  update public.students
  set goal = normalized_goal
  where id = current_student;

  if not found then
    raise exception 'Student profile not found.' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'studentId', current_student,
    'goal', normalized_goal,
    'goalUpdated', true
  );
end;
$$;

comment on function public.update_my_student_goal(text) is
  'Lets an authenticated student update only their own goal without granting row update access.';

revoke all on function public.update_my_student_goal(text) from public, anon, service_role;
grant execute on function public.update_my_student_goal(text) to authenticated;

comment on column public.students.goal is
  'Optional shared student goal. Owner edits through the profile RPC; a student edits only their own value through update_my_student_goal.';

commit;
