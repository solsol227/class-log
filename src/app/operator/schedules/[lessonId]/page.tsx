import Link from "next/link";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AttendanceStatus } from "../actions";
import { ScheduleDashboard } from "./schedule-dashboard";
import { updateLessonStaff } from "../actions";
import { addOperatorComment, createFeedback, deleteFeedback, updateFeedback } from "./feedback-actions";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUS_LABELS: Record<string, string> = { draft: "Draft", scheduled: "예정", completed: "완료", cancelled: "취소" };
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
  const { data: lesson, error } = await supabase.from("lessons").select("id, title, starts_at, ends_at, location, notes, status, program_type").eq("id", lessonId).maybeSingle();
  if (error || !lesson) {
    if (error) console.error(error);
    return <ScheduleUnavailable />;
  }

  const [{ data: assignments, error: assignmentsError }, { data: students, error: studentsError }, { data: attendanceRecords, error: attendanceError }, { data: programs, error: programsError }, { data: staff }, { data: lessonStaff }, { data: feedback }, { data: comments }] = await Promise.all([
    supabase.from("lesson_assignments").select("student_id, assigned_at").eq("lesson_id", lessonId).is("unassigned_at", null).order("assigned_at"),
    supabase.from("students").select("id, nickname").order("nickname"),
    supabase.from("attendance_records").select("student_id, status").eq("lesson_id", lessonId),
    supabase.from("student_programs").select("student_id, program_type").eq("status", "active"),
    supabase.from("staff_profiles").select("id, display_name, role").eq("is_active", true).order("display_name"),
    supabase.from("lesson_staff").select("staff_id").eq("lesson_id", lessonId),
    supabase.from("lesson_feedback").select("id, student_id, author_staff_id, body, published_at, created_at").eq("lesson_id", lessonId).is("deleted_at", null).order("created_at"),
    supabase.from("feedback_comments").select("id, feedback_id, parent_comment_id, body, created_at").order("created_at"),
  ]);
  if (assignmentsError || studentsError || attendanceError || programsError) {
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
          programType: lesson.program_type,
        }}
        assignedStudents={assignedStudents}
        studentOptions={students.map((student) => ({ id: student.id, name: student.nickname, programTypes: programs.filter((program) => program.student_id === student.id).map((program) => program.program_type) }))}
        attendanceBlockedReason={attendanceBlockedReason}
      />
      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-6"><h2 className="text-2xl font-bold">담당 직원</h2><form action={updateLessonStaff.bind(null, lessonId)} className="mt-4 space-y-3">{(staff ?? []).length === 0 ? <p className="text-[var(--muted)]">등록된 직원이 없습니다.</p> : (staff ?? []).map((member) => <label key={member.id} className="flex items-center gap-3"><input type="checkbox" name="staff_ids" value={member.id} defaultChecked={(lessonStaff ?? []).some((entry) => entry.staff_id === member.id)}/><span className="font-bold">{member.display_name}</span><span className="text-sm text-[var(--muted)]">{member.role === "manager" ? "매니저" : "보컬트레이너"}</span></label>)}<button className="mt-3 h-11 rounded-xl border border-[var(--accent)] px-4 font-bold">담당 저장</button></form></section>
      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-6"><h2 className="text-2xl font-bold">피드백</h2>{assignedStudents.length && (staff ?? []).length ? <form action={createFeedback.bind(null, lessonId)} className="mt-4 grid gap-3"><select name="student_id" required className="h-11 rounded-xl border px-3">{assignedStudents.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select><select name="author_staff_id" required className="h-11 rounded-xl border px-3">{(staff ?? []).map((member) => <option key={member.id} value={member.id}>{member.display_name}</option>)}</select><textarea name="body" required placeholder="피드백 내용" className="rounded-xl border p-3"/><label><input type="checkbox" name="published"/> 학생에게 게시</label><button className="h-11 rounded-xl bg-[var(--accent)] font-bold text-white">피드백 추가</button></form> : <p className="mt-3 text-[var(--muted)]">배정 학생과 직원을 등록하면 피드백을 추가할 수 있습니다.</p>}<ul className="mt-6 space-y-4">{(feedback ?? []).map((item) => <li key={item.id} className="rounded-xl border p-4"><form action={updateFeedback.bind(null, lessonId, item.id)} className="space-y-2"><textarea name="body" defaultValue={item.body} required className="w-full rounded-xl border p-3"/><label><input type="checkbox" name="published" defaultChecked={Boolean(item.published_at)}/> 게시</label><div className="flex gap-2"><button className="rounded-lg border px-3 py-2 font-bold">수정</button><button formAction={deleteFeedback.bind(null, lessonId, item.id)} className="rounded-lg border border-rose-300 px-3 py-2 font-bold text-rose-800">삭제</button></div></form><ul className="mt-3 space-y-2">{(comments ?? []).filter((comment) => comment.feedback_id === item.id).map((comment) => <li key={comment.id} className="rounded-lg bg-[#f4f8f7] p-3 text-sm"><p>{comment.body}</p><form action={addOperatorComment.bind(null, lessonId, item.id)} className="mt-2 flex gap-2"><input type="hidden" name="parent_comment_id" value={comment.id}/><input name="body" required placeholder="답글" className="h-9 flex-1 rounded-lg border px-2"/><button className="rounded-lg border px-3 font-bold">답글</button></form></li>)}</ul><form action={addOperatorComment.bind(null, lessonId, item.id)} className="mt-3 flex gap-2"><input name="body" required placeholder="댓글" className="h-10 flex-1 rounded-lg border px-3"/><button className="rounded-lg border px-3 font-bold">댓글</button></form></li>)}</ul></section>
    </main>
  );
}
