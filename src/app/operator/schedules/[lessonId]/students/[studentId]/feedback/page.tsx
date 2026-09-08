import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import { loadOperatorStudentFeedback } from "@/lib/feedback/operator-feedback";
import { STAFF_ROLE_LABELS } from "@/lib/feedback/student-feedback";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { addStudentFeedbackComment, createStudentFeedback, deleteStudentFeedback, updateStudentFeedback } from "../../../feedback-actions";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ATTENDANCE_LABELS: Record<string, string> = { present: "출석", absent: "결석", excused: "사유결석" };

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeZone: "Asia/Seoul" }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" }).format(new Date(value));
}

function formatDateTime(value: string | number) {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(value));
}

export default async function StudentFeedbackEditorPage({ params, searchParams }: {
  params: Promise<{ lessonId: string; studentId: string }>;
  searchParams: Promise<{ feedbackUpdated?: string; feedbackError?: string; saved?: string }>;
}) {
  await requireAuthenticatedUser("/login/operator", "operator");
  const [{ lessonId, studentId }, notices] = await Promise.all([params, searchParams]);
  if (!UUID_PATTERN.test(lessonId) || !UUID_PATTERN.test(studentId)) notFound();

  const supabase = await createSupabaseServerClient();
  const [lessonResult, studentResult, assignmentResult, attendanceResult, staffResult] = await Promise.all([
    supabase.from("lessons").select("id, title, starts_at, ends_at, status").eq("id", lessonId).maybeSingle(),
    supabase.from("students").select("id, nickname").eq("id", studentId).maybeSingle(),
    supabase.from("lesson_assignments").select("lesson_id, student_id").eq("lesson_id", lessonId).eq("student_id", studentId).is("unassigned_at", null).maybeSingle(),
    supabase.from("attendance_records").select("status").eq("lesson_id", lessonId).eq("student_id", studentId).maybeSingle(),
    supabase.from("staff_profiles").select("id, display_name, role, is_active").order("display_name"),
  ]);
  const loadError = lessonResult.error ?? studentResult.error ?? assignmentResult.error ?? attendanceResult.error ?? staffResult.error;
  if (loadError) throw new Error("학생별 피드백 작성 정보를 불러오지 못했습니다.", { cause: loadError });
  if (!lessonResult.data || !studentResult.data || !assignmentResult.data) notFound();

  const lesson = lessonResult.data;
  const student = studentResult.data;
  const feedback = (await loadOperatorStudentFeedback(supabase, student)).filter((item) => item.lessonId === lessonId);
  const staff = staffResult.data ?? [];
  const activeStaff = staff.filter((member) => member.is_active);
  const staffById = new Map(staff.map((member) => [member.id, member]));
  const savedAt = notices.feedbackUpdated === "1" && /^\d{10,16}$/.test(notices.saved ?? "") ? Number(notices.saved) : null;
  const blockedReason = lesson.status === "draft" ? "Draft 일정은 확정한 뒤 피드백을 작성할 수 있습니다." : activeStaff.length ? null : "피드백 제공자로 선택할 수 있는 활성 직원이 없습니다.";

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <Link href={`/operator/schedules/${lessonId}`} className="inline-flex min-h-11 items-center font-bold text-[var(--accent-strong)] underline-offset-4 hover:underline">← 일정 상세로 돌아가기</Link>
      <header className="mt-5">
        <p className="text-sm font-bold text-[var(--accent-strong)]">학생별 피드백</p>
        <h1 className="mt-2 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">{student.nickname}</h1>
        <p className="mt-3 text-lg font-semibold">{lesson.title}</p>
        <p className="mt-1 text-[var(--muted)]">{formatDate(lesson.starts_at)} · {formatTime(lesson.starts_at)} ~ {formatTime(lesson.ends_at)}</p>
        <p className="mt-2 text-sm font-bold text-[var(--accent-strong)]">출결: {attendanceResult.data ? ATTENDANCE_LABELS[attendanceResult.data.status] ?? "확인 중" : "미기록"}</p>
      </header>

      {notices.feedbackUpdated === "1" ? <p role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 font-bold text-emerald-900">피드백을 저장했습니다.{savedAt ? ` 마지막 저장 ${formatDateTime(savedAt)}` : ""}</p> : null}
      {notices.feedbackError === "1" ? <p role="alert" className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 font-bold text-rose-900">피드백을 저장하지 못했습니다. 학생·일정 연결과 입력 내용을 확인해 주세요.</p> : null}

      <section className="mt-7 rounded-2xl border border-[var(--line)] bg-white p-5 sm:p-7" aria-labelledby="new-feedback-heading">
        <h2 id="new-feedback-heading" className="text-2xl font-bold">새 피드백 작성</h2>
        {blockedReason ? <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 font-semibold text-amber-900">{blockedReason}</p> : (
          <form action={createStudentFeedback.bind(null, lessonId, studentId)} className="mt-5 grid gap-4">
            <label className="grid gap-2 font-bold">제공 직원<select name="author_staff_id" required className="min-h-11 rounded-xl border border-[var(--line)] bg-white px-3 font-normal">{activeStaff.map((member) => <option key={member.id} value={member.id}>{member.display_name} · {STAFF_ROLE_LABELS[member.role] ?? member.role}</option>)}</select></label>
            <label className="grid gap-2 font-bold">피드백 내용<textarea name="body" required maxLength={10000} rows={7} className="rounded-xl border border-[var(--line)] p-3 font-normal" /></label>
            <label className="flex min-h-11 items-center gap-3 font-bold"><input type="checkbox" name="published" /> 학생에게 게시</label>
            <button className="min-h-12 rounded-xl bg-[var(--accent)] px-5 font-bold text-white">피드백 추가</button>
          </form>
        )}
      </section>

      <section className="mt-7" aria-labelledby="existing-feedback-heading">
        <h2 id="existing-feedback-heading" className="text-2xl font-bold">기존 피드백</h2>
        {feedback.length ? <div className="mt-5 space-y-5">{feedback.map((item) => {
          const currentAuthor = staffById.get(item.authorStaffId);
          const authorOptions = staff.filter((member) => member.is_active || member.id === item.authorStaffId);
          return (
            <article key={item.id} id={`feedback-${item.id}`} className="scroll-mt-8 rounded-2xl border border-[var(--line)] bg-white p-5 sm:p-7">
              <form action={updateStudentFeedback.bind(null, lessonId, studentId, item.id)} className="grid gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-bold">{formatDateTime(item.createdAt)} 작성</p><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${item.publishedAt ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>{item.publishedAt ? "게시" : "미게시"}</span></div>
                <label className="grid gap-2 font-bold">제공 직원<select name="author_staff_id" required defaultValue={item.authorStaffId} className="min-h-11 rounded-xl border border-[var(--line)] bg-white px-3 font-normal">{authorOptions.map((member) => <option key={member.id} value={member.id}>{member.display_name} · {STAFF_ROLE_LABELS[member.role] ?? member.role}{member.is_active ? "" : " (삭제된 직원)"}</option>)}</select></label>
                {!currentAuthor?.is_active ? <p className="text-sm text-amber-800">삭제된 직원은 기존 제공자 기록으로만 유지됩니다. 내용을 저장하려면 활성 직원을 선택해 주세요.</p> : null}
                <label className="grid gap-2 font-bold">피드백 내용<textarea name="body" required maxLength={10000} rows={7} defaultValue={item.body} className="rounded-xl border border-[var(--line)] p-3 font-normal" /></label>
                <label className="flex min-h-11 items-center gap-3 font-bold"><input type="checkbox" name="published" defaultChecked={Boolean(item.publishedAt)} /> 학생에게 게시</label>
                <div className="flex flex-wrap gap-2"><button className="min-h-11 rounded-xl bg-[var(--accent)] px-4 font-bold text-white">수정 저장</button><button formAction={deleteStudentFeedback.bind(null, lessonId, studentId, item.id)} className="min-h-11 rounded-xl border border-rose-300 px-4 font-bold text-rose-800">삭제</button></div>
              </form>

              <section className="mt-6 border-t border-[var(--line)] pt-5" aria-label="댓글과 답글">
                <h3 className="text-lg font-bold">댓글 {item.commentCount}개</h3>
                {item.comments.length ? <div className="mt-3 space-y-2">{item.comments.map((comment) => <article key={comment.id} className={`rounded-xl bg-[#f4f8f7] p-3 ${comment.parentCommentId ? "ml-3 border-l-2 border-[var(--line)] sm:ml-6" : ""}`}>{comment.deletedAt ? <p className="text-sm text-[var(--muted)]">삭제된 댓글입니다.</p> : <><p className="text-sm font-bold">{comment.authorName}<span className="ml-2 font-normal text-[var(--muted)]">{formatDateTime(comment.createdAt)}</span></p><p className="mt-1 whitespace-pre-wrap break-words">{comment.body}</p><form action={addStudentFeedbackComment.bind(null, lessonId, studentId, item.id)} className="mt-3 flex min-w-0 gap-2"><input type="hidden" name="parent_comment_id" value={comment.id} /><input name="body" required maxLength={2000} placeholder="답글" className="min-h-10 min-w-0 flex-1 rounded-lg border border-[var(--line)] px-3" /><button className="rounded-lg border border-[var(--accent)] px-3 font-bold text-[var(--accent-strong)]">답글</button></form></>}</article>)}</div> : <p className="mt-2 text-sm text-[var(--muted)]">아직 댓글이 없습니다.</p>}
                <form action={addStudentFeedbackComment.bind(null, lessonId, studentId, item.id)} className="mt-4 flex min-w-0 flex-col gap-2 sm:flex-row"><input name="body" required maxLength={2000} placeholder="댓글을 입력하세요" className="min-h-11 min-w-0 flex-1 rounded-xl border border-[var(--line)] px-3" /><button className="min-h-11 rounded-xl border border-[var(--accent)] px-4 font-bold text-[var(--accent-strong)]">댓글 등록</button></form>
              </section>
            </article>
          );
        })}</div> : <div className="mt-5 rounded-2xl border border-[var(--line)] bg-white p-6"><p className="font-bold">등록된 피드백이 없습니다.</p></div>}
      </section>
    </main>
  );
}
