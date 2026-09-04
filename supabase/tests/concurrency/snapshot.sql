select
  (select md5(coalesce(jsonb_agg(to_jsonb(l) order by id)::text, '[]')) from public.lessons l) as lessons,
  (select md5(coalesce(jsonb_agg(to_jsonb(a) order by lesson_id, student_id)::text, '[]')) from public.lesson_assignments a) as assignments,
  (select md5(coalesce(jsonb_agg(to_jsonb(a) order by id)::text, '[]')) from public.student_program_allowance_adjustments a) as adjustments;
