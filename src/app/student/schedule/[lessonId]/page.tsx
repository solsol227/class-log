import Link from "next/link";
import { notFound } from "next/navigation";
import { StudentFeedbackThread } from "@/components/feedback/student-feedback-thread";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import {
  loadStudentCommentAuthorNames,
  loadStudentFeedbackAuthors,
  loadStudentLessonPrograms,
  PROGRAM_LABELS,
  STAFF_ROLE_LABELS,
  STUDENT_COMMENT_LIMIT,
  STUDENT_FEEDBACK_LIMIT,
  type StudentFeedbackComment,
} from "@/lib/feedback/student-feedback";
import { getLessonDisplayStatus, getLessonDisplayStatusLabel } from "@/lib/lessons/display-status";
import { getSafeStudentReturnPath, isStudentFeedbackReturnPath } from "@/lib/navigation/student-return-path";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ATTENDANCE_LABELS: Record<string, string> = { present: "출석", absent: "결석", excused: "사유결석" };

function formatDate(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Seoul" }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}.${part("month")}.${part("day")}`;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" }).format(new Date(value));
}

function attendanceLabel(status: string | null, endsAt: string) {
  if (status) return ATTENDANCE_LABELS[status] ?? "출결 확인 중";
  return new Date(endsAt).getTime() > Date.now() ? "수업 전" : "출결 확인 중";
}

export default async function StudentScheduleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ lessonId: string }>;
  searchParams: Promise<{ feedbackError?: string; returnTo?: string | string[] }>;
}) {
  await requireAuthenticatedUser("/login/student", "student");
  const [{ lessonId }, notices] = await Promise.all([params, searchParams]);
  if (!UUID_PATTERN.test(lessonId)) notFound();

  const supabase = await createSupabaseServerClient();
  const [lessonResult, assignmentResult] = await Promise.all([
    supabase.from("lessons").select("id, title, starts_at, ends_at, status").eq("id", lessonId).maybeSingle(),
    supabase.from("lesson_assignments").select("lesson_id").eq("lesson_id", lessonId).is("unassigned_at", null).maybeSingle(),
  ]);
  if (lessonResult.error || assignmentResult.error) {
    throw new Error("일정을 불러오지 못했습니다.", { cause: lessonResult.error ?? assignmentResult.error });
  }
  const lesson = lessonResult.data;
  if (!lesson || !assignmentResult.data || lesson.status === "draft") notFound();

  const [attendanceResult, lessonStaffResult, feedbackResult] = await Promise.all([
    supabase.from("attendance_records").select("status").eq("lesson_id", lessonId).maybeSingle(),
    supabase.from("lesson_staff").select("staff_id, created_at").eq("lesson_id", lessonId).order("created_at"),
    supabase
      .from("lesson_feedback")
      .select("id, lesson_id, body, created_at")
      .eq("lesson_id", lessonId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(STUDENT_FEEDBACK_LIMIT),
  ]);
  const primaryError = attendanceResult.error ?? lessonStaffResult.error ?? feedbackResult.error;
  if (primaryError) throw new Error("일정 상세 정보를 불러오지 못했습니다.", { cause: primaryError });

  const feedback = feedbackResult.data ?? [];
  const feedbackIds = feedback.map((item) => item.id);
  const staffIds = [...new Set((lessonStaffResult.data ?? []).map((item) => item.staff_id))];
  const [staffResult, commentsResult, feedbackAuthors, lessonPrograms] = await Promise.all([
    staffIds.length
      ? supabase.from("staff_profiles").select("id, display_name").in("id", staffIds)
      : Promise.resolve({ data: [], error: null }),
    feedbackIds.length
      ? supabase
          .from("feedback_comments")
          .select("id, feedback_id, parent_comment_id, body, created_at")
          .in("feedback_id", feedbackIds)
          .is("deleted_at", null)
          .order("created_at")
          .limit(STUDENT_COMMENT_LIMIT)
      : Promise.resolve({ data: [], error: null }),
    loadStudentFeedbackAuthors(supabase, feedbackIds),
    loadStudentLessonPrograms(supabase, [lessonId]),
  ]);
  if (staffResult.error || commentsResult.error) {
    throw new Error("일정 담당자와 댓글을 불러오지 못했습니다.", { cause: staffResult.error ?? commentsResult.error });
  }

  const comments = (commentsResult.data ?? []) as StudentFeedbackComment[];
  const commentAuthorNames = await loadStudentCommentAuthorNames(supabase, comments);
  const staffNames = new Map((staffResult.data ?? []).map((member) => [member.id, member.display_name]));
  const staff = (lessonStaffResult.data ?? []).flatMap((entry) => {
    const name = staffNames.get(entry.staff_id);
    return name ? [name] : [];
  });
  const displayStatus = getLessonDisplayStatus(lesson.status, lesson.ends_at);
  const attendance = attendanceResult.data;
  const returnPath = getSafeStudentReturnPath(notices.returnTo);
  const returnLabel = isStudentFeedbackReturnPath(returnPath) ? "내 피드백으로 돌아가기" : "내 일정으로 돌아가기";

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <Link href={returnPath} className="inline-flex min-h-11 items-center font-bold text-[var(--accent-strong)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">← {returnLabel}</Link>

      <header className="mt-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-[#e5f2f0] px-3 py-1 text-sm font-bold text-[var(--accent-strong)]">{PROGRAM_LABELS[lessonPrograms.get(lessonId) ?? ""] ?? "이용권 확인 중"}</span>
          <span className={`rounded-lg px-3 py-1 text-sm font-bold ${displayStatus === "cancelled" ? "bg-rose-100 text-rose-800" : "bg-white text-[var(--muted)]"}`}>{getLessonDisplayStatusLabel(lesson.status, lesson.ends_at)}</span>
        </div>
        <h1 className="mt-4 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">{lesson.title}</h1>
      </header>

      <section className="mt-6 overflow-x-auto rounded-2xl border border-[var(--line)] bg-white p-4 sm:p-5" aria-labelledby="lesson-information">
        <h2 id="lesson-information" className="sr-only">일정 정보</h2>
        <dl className="grid min-w-[34rem] grid-cols-4">
          <div className="border-r border-[var(--line)] pr-4"><dt className="text-sm font-bold text-[var(--muted)]">날짜</dt><dd className="mt-1 whitespace-nowrap font-semibold">{formatDate(lesson.starts_at)}</dd></div>
          <div className="border-r border-[var(--line)] px-4"><dt className="text-sm font-bold text-[var(--muted)]">시간</dt><dd className="mt-1 whitespace-nowrap font-semibold">{formatTime(lesson.starts_at)}~{formatTime(lesson.ends_at)}</dd></div>
          <div className="border-r border-[var(--line)] px-4"><dt className="text-sm font-bold text-[var(--muted)]">내 출결</dt><dd className="mt-1 whitespace-nowrap font-semibold">{attendanceLabel(attendance?.status ?? null, lesson.ends_at)}</dd></div>
          <div className="pl-4"><dt className="text-sm font-bold text-[var(--muted)]">담당</dt><dd className="mt-1 whitespace-nowrap font-semibold">{staff.length ? staff.join(", ") : "미정"}</dd></div>
        </dl>
      </section>

      <section className="mt-8" aria-labelledby="lesson-feedback">
        <h2 id="lesson-feedback" className="text-2xl font-bold">피드백</h2>
        {notices.feedbackError === "1" ? <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 font-bold text-rose-900">댓글을 저장하지 못했습니다. 내용을 확인한 뒤 다시 시도해 주세요.</p> : null}
        {feedback.length ? (
          <div className="mt-5 space-y-5">
            {feedback.map((item) => {
              const author = feedbackAuthors.get(item.id);
              const itemComments = comments.filter((comment) => comment.feedback_id === item.id);
              return (
                <article key={item.id} id={`feedback-${item.id}`} tabIndex={-1} className="scroll-mt-24 rounded-2xl border border-[var(--line)] bg-white p-5 outline-none target:border-[var(--accent)] target:ring-2 target:ring-[#bce9e4] sm:p-6">
                  <time className="text-sm font-bold text-[var(--accent-strong)]" dateTime={lesson.starts_at}>{formatDate(lesson.starts_at)}</time>
                  <h3 className="mt-2 text-lg font-bold">{lesson.title}</h3>
                  <p className="mt-1 text-sm text-[var(--muted)]">{author ? `${author.display_name} · ${STAFF_ROLE_LABELS[author.role] ?? author.role}` : "피드백 제공자"}</p>
                  <p className="mt-4 whitespace-pre-wrap break-words text-[1.05rem] leading-8">{item.body}</p>
                  <StudentFeedbackThread feedbackId={item.id} lessonId={lessonId} returnTo={returnPath} comments={itemComments} authorNames={commentAuthorNames} />
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-[var(--line)] bg-white p-6">
            <p className="font-bold">아직 피드백이 없습니다.</p>
            <p className="mt-2 text-[var(--muted)]">피드백이 작성되면 이 화면에서 확인할 수 있어요.</p>
          </div>
        )}
      </section>
    </main>
  );
}
