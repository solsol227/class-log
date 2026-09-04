select application_name, wait_event_type, wait_event,
  (select count(*) from pg_locks where pid = a.pid and locktype = 'advisory' and granted) as held_student_locks,
  (select count(*) from pg_locks where pid = a.pid and locktype = 'advisory' and not granted) as waiting_student_locks
from pg_stat_activity a
where application_name in ('class-log-concurrency-save', 'class-log-concurrency-confirm')
order by application_name;
