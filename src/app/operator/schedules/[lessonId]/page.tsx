import Link from "next/link";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AttendanceStatus } from "../actions";
import { ScheduleDashboard } from "./schedule-dashboard";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUS_LABELS: Record<string, string> = { scheduled: "예정", completed: "완료", cancelled: "취소" };
const ATTENDANCE_STATUSES = new Set<AttendanceStatus>(["present", "absent", "excused"]);

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeZone: "Asia/Seoul" }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" }).format(new Date(value));
}

function toScheduleInput(value: string) {
  const formatted = new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" }).format(new Date(value));
  const [date, time] = formatted.split(" ");
  return { date, time };
}

function hasNotStarted(startsAt: string) {
  return new Date(startsAt).getTime() > Date.now();
}

function ScheduleUnavailable() {
  return <main className="mx-auto flex min-h-[100dvh] w-full max-w-2xl items-center px-5 py-12 sm:px-8"><section className="w-full rounded-2xl border border-[var(--line)] bg-white p-6 sm:p-8"><h1 className="text-3xl font-bold">일정을 찾을 수 없습니다.</h1><Link href="/operator/schedules" className="mt-8 inline-flex min-h-12 items-center rounded-xl bg-[var(--accent)] px-5 font-bold text-white">일정 목록</Link></section></main>;
}

export default async function ScheduleDetailPage({ params, searchParams }: { params: Promise<{ lessonId: string }>; searchParams: Promise<{ created?: string; updated?: string; assigned?: string; unassigned?: string; attendanceSaved?: string }> }) {
  await requireAuthenticatedUser("/login/operator", "operator");
  const { lessonId } = await params;
  const notices = await searchParams;
  if (!UUID_PATTERN.test(lessonId)) return <ScheduleUnavailable />;

  const supabase = await createSupabaseServerClient();
  const { data: lesson, error } = await supabase.from("lessons").select("id, title, starts_at, ends_at, location, notes, status").eq("id", lessonId).maybeSingle();
  if (error || !lesson) {
    if (error) console.error(error);
    return <ScheduleUnavailable />;
  }

  const [{ data: assignments, error: assignmentsError }, { data: students, error: studentsError }, { data: attendanceRecords, error: attendanceError }] = await Promise.all([
    supabase.from("lesson_assignments").select("student_id, assigned_at").eq("lesson_id", lessonId).is("unassigned_at", null).order("assigned_at"),
    supabase.from("students").select("id, nickname").order("nickname"),
    supabase.from("attendance_records").select("student_id, status").eq("lesson_id", lessonId),
  ]);
  if (assignmentsError || studentsError || attendanceError) {
    throw new Error("일정과 학생 정보를 불러오지 못했습니다.", { cause: assignmentsError ?? studentsError ?? attendanceError });
  }

  const assignedIds = new Set(assignments.map((assignment) => assignment.student_id));
  const attendanceByStudent = new Map<string, AttendanceStatus>();
  attendanceRecords.forEach((record) => {
    if (ATTENDANCE_STATUSES.has(record.status as AttendanceStatus)) attendanceByStudent.set(record.student_id, record.status as AttendanceStatus);
  });
  const assignedStudents = students
    .filter((student) => assignedIds.has(student.id))
    .map((student) => ({ id: student.id, name: student.nickname, attendanceStatus: attendanceByStudent.get(student.id) ?? null }));

  const notice = notices.created === "1"
    ? "일정을 등록했습니다."
    : notices.updated === "1"
      ? "일정이 저장되었습니다."
      : notices.assigned === "1"
        ? "학생을 배정했습니다."
        : notices.unassigned === "1"
          ? "학생 배정을 해제했습니다."
          : notices.attendanceSaved === "1"
            ? "출결을 저장했습니다."
            : null;
  const attendanceBlockedReason = lesson.status === "cancelled"
    ? "취소된 일정에는 출결을 저장할 수 없습니다."
    : hasNotStarted(lesson.starts_at)
      ? "아직 시작하지 않은 일정에는 출결을 저장할 수 없습니다."
      : null;
  const startsAtInput = toScheduleInput(lesson.starts_at);
  const endsAtInput = toScheduleInput(lesson.ends_at);

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
      <Link href="/operator/schedules" className="font-bold text-[var(--accent-strong)] underline-offset-4 hover:underline">일정 목록</Link>
      {notice ? <p role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 font-bold text-emerald-900">{notice}</p> : null}
      <ScheduleDashboard
        lesson={{
          id: lesson.id,
          title: lesson.title,
          dateInput: startsAtInput.date,
          startTimeInput: startsAtInput.time,
          endTimeInput: endsAtInput.time,
          dateLabel: formatDate(lesson.starts_at),
          timeLabel: `${formatTime(lesson.starts_at)} ~ ${formatTime(lesson.ends_at)}`,
          location: lesson.location,
          notes: lesson.notes,
          status: lesson.status,
          statusLabel: STATUS_LABELS[lesson.status] ?? lesson.status,
        }}
        assignedStudents={assignedStudents}
        studentOptions={students.map((student) => ({ id: student.id, name: student.nickname }))}
        attendanceBlockedReason={attendanceBlockedReason}
      />
    </main>
  );
}
