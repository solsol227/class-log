import Link from "next/link";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ScheduleForm } from "../schedule-form";
import { DeleteScheduleForm, NoStudentsNotice, StudentAssignmentPicker, UnassignStudentForm } from "./schedule-management-forms";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUS_LABELS: Record<string, string> = { scheduled: "예정", completed: "완료", cancelled: "취소" };
function formatDateTime(value: string) { return new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(value)); }
function toDateTimeLocal(value: string) { return new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" }).format(new Date(value)).replace(" ", "T"); }

function ScheduleUnavailable() {
  return <main className="mx-auto flex min-h-[100dvh] w-full max-w-2xl items-center px-5 py-12 sm:px-8"><section className="w-full rounded-2xl border border-[var(--line)] bg-white p-6 sm:p-8"><h1 className="text-3xl font-bold">일정을 찾을 수 없습니다.</h1><Link href="/operator/schedules" className="mt-8 inline-flex min-h-12 items-center rounded-xl bg-[var(--accent)] px-5 font-bold text-white">일정 목록</Link></section></main>;
}

export default async function ScheduleDetailPage({ params, searchParams }: { params: Promise<{ lessonId: string }>; searchParams: Promise<{ created?: string; updated?: string; assigned?: string; unassigned?: string }> }) {
  await requireAuthenticatedUser("/login/operator", "operator");
  const { lessonId } = await params;
  const notices = await searchParams;
  if (!UUID_PATTERN.test(lessonId)) return <ScheduleUnavailable />;

  const supabase = await createSupabaseServerClient();
  const { data: lesson, error } = await supabase.from("lessons").select("id, title, starts_at, ends_at, location, notes, status").eq("id", lessonId).maybeSingle();
  if (error || !lesson) { if (error) console.error(error); return <ScheduleUnavailable />; }
  const [{ data: assignments, error: assignmentsError }, { data: students, error: studentsError }] = await Promise.all([
    supabase.from("lesson_assignments").select("student_id, assigned_at").eq("lesson_id", lessonId).order("assigned_at"),
    supabase.from("students").select("id, nickname").order("nickname"),
  ]);
  if (assignmentsError || studentsError) throw new Error("학생 배정 정보를 불러오지 못했습니다.", { cause: assignmentsError ?? studentsError });

  const assignedIds = new Set(assignments.map((assignment) => assignment.student_id));
  const assignedStudents = students.filter((student) => assignedIds.has(student.id));
  const notice = notices.created === "1" ? "일정을 등록했습니다." : notices.updated === "1" ? "일정을 수정했습니다." : notices.assigned === "1" ? "학생을 배정했습니다." : notices.unassigned === "1" ? "학생 배정을 해제했습니다." : null;

  return <main className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
    <Link href="/operator/schedules" className="font-bold text-[var(--accent-strong)] underline-offset-4 hover:underline">일정 목록</Link>
    {notice ? <p role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 font-bold text-emerald-900">{notice}</p> : null}
    <section className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-6 sm:p-8"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-bold text-[var(--accent-strong)]">일정 정보</p><span className="rounded-full bg-[#e5f2f0] px-3 py-1 text-sm font-bold text-[var(--accent-strong)]">{STATUS_LABELS[lesson.status] ?? lesson.status}</span></div><h1 className="mt-4 text-3xl font-bold tracking-[-0.04em]">{lesson.title}</h1><dl className="mt-8 grid gap-5 sm:grid-cols-2"><div><dt className="text-sm font-bold text-[var(--muted)]">시작 일시</dt><dd className="mt-1 text-lg">{formatDateTime(lesson.starts_at)}</dd></div><div><dt className="text-sm font-bold text-[var(--muted)]">종료 일시</dt><dd className="mt-1 text-lg">{formatDateTime(lesson.ends_at)}</dd></div><div><dt className="text-sm font-bold text-[var(--muted)]">장소</dt><dd className="mt-1 text-lg">{lesson.location || "등록된 장소가 없습니다."}</dd></div><div className="sm:col-span-2"><dt className="text-sm font-bold text-[var(--muted)]">메모</dt><dd className="mt-1 whitespace-pre-wrap leading-7">{lesson.notes || "등록된 메모가 없습니다."}</dd></div></dl></section>
    <section className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-6 sm:p-8"><h2 className="text-2xl font-bold">일정 수정</h2>{lesson.status === "scheduled" ? <div className="mt-6"><ScheduleForm mode="edit" lessonId={lessonId} initialValues={{ title: lesson.title, startsAt: toDateTimeLocal(lesson.starts_at), endsAt: toDateTimeLocal(lesson.ends_at), location: lesson.location ?? "", notes: lesson.notes ?? "" }} /></div> : <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 font-bold text-amber-950">완료되었거나 취소된 일정은 기본 정보를 수정할 수 없습니다.</p>}</section>
    <section className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-6 sm:p-8">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-bold">배정된 학생</h2>
        {students.length > 0 && lesson.status === "scheduled" ? <StudentAssignmentPicker lessonId={lessonId} students={students.map((student) => ({ value: student.id, label: student.nickname, disabled: assignedIds.has(student.id), disabledLabel: "배정됨" }))} /> : null}
      </div>
      {students.length === 0 ? <NoStudentsNotice /> : lesson.status !== "scheduled" ? <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 font-bold text-amber-950">완료되었거나 취소된 일정에는 학생을 추가로 배정할 수 없습니다.</p> : null}
      {assignedStudents.length === 0 ? <p className="mt-4 text-[var(--muted)]">아직 배정된 학생이 없습니다.</p> : <ul className="mt-5 grid gap-3 sm:grid-cols-2">{assignedStudents.map((student) => <li key={student.id} className="rounded-xl border border-[var(--line)] p-4"><p className="font-bold">{student.nickname}</p><UnassignStudentForm lessonId={lessonId} studentId={student.id} /></li>)}</ul>}
    </section>
    <section className="mt-6 rounded-2xl border border-rose-200 bg-white p-6 sm:p-8"><h2 className="text-2xl font-bold text-rose-900">일정 삭제</h2><p className="mt-3 leading-7 text-[var(--muted)]">삭제하면 학생 배정과 연결된 일부 데이터가 함께 삭제될 수 있습니다. 보강 수업으로 연결된 일정은 삭제되지 않습니다.</p><div className="mt-5"><DeleteScheduleForm lessonId={lessonId} /></div></section>
  </main>;
}
