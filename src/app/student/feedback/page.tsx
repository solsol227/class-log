import Link from "next/link";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import { feedbackArchiveHref, parseFeedbackArchiveQuery } from "@/lib/feedback/archive-query";
import {
  countCommentsByFeedback,
  loadStudentFeedbackAuthors,
  loadStudentLessonPrograms,
  PROGRAM_LABELS,
  STAFF_ROLE_LABELS,
  STUDENT_COMMENT_LIMIT,
  STUDENT_FEEDBACK_LIMIT,
} from "@/lib/feedback/student-feedback";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type StudentFeedbackPageProps = {
  searchParams: Promise<{ range?: string; from?: string; to?: string; sort?: string }>;
};

const RANGE_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "1m", label: "최근 1개월" },
  { value: "3m", label: "최근 3개월" },
  { value: "6m", label: "최근 6개월" },
] as const;

function formatLessonDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeZone: "Asia/Seoul" }).format(new Date(value));
}

function formatFeedbackDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" }).format(new Date(value));
}

export default async function StudentFeedbackPage({ searchParams }: StudentFeedbackPageProps) {
  await requireAuthenticatedUser("/login/student", "student");
  const parsed = parseFeedbackArchiveQuery(await searchParams);
  const supabase = await createSupabaseServerClient();

  let lessonsQuery = supabase
    .from("lessons")
    .select("id, title, starts_at")
    .neq("status", "draft")
    .order("starts_at", { ascending: parsed.sort === "asc" })
    .limit(STUDENT_FEEDBACK_LIMIT);
  if (parsed.fromIso) lessonsQuery = lessonsQuery.gte("starts_at", parsed.fromIso);
  if (parsed.toExclusiveIso) lessonsQuery = lessonsQuery.lt("starts_at", parsed.toExclusiveIso);

  const { data: lessons, error: lessonsError } = await lessonsQuery;
  if (lessonsError) throw new Error("피드백 기간의 일정을 불러오지 못했습니다.", { cause: lessonsError });

  const lessonIds = (lessons ?? []).map((lesson) => lesson.id);
  const feedbackResult = lessonIds.length
    ? await supabase
        .from("lesson_feedback")
        .select("id, lesson_id, body, created_at")
        .in("lesson_id", lessonIds)
        .is("deleted_at", null)
        .limit(STUDENT_FEEDBACK_LIMIT)
    : { data: [], error: null };
  if (feedbackResult.error) throw new Error("피드백을 불러오지 못했습니다.", { cause: feedbackResult.error });

  const feedback = feedbackResult.data ?? [];
  const feedbackIds = feedback.map((item) => item.id);
  const [commentsResult, feedbackAuthors, lessonPrograms] = await Promise.all([
    feedbackIds.length
      ? supabase.from("feedback_comments").select("feedback_id").in("feedback_id", feedbackIds).is("deleted_at", null).limit(STUDENT_COMMENT_LIMIT)
      : Promise.resolve({ data: [], error: null }),
    loadStudentFeedbackAuthors(supabase, feedbackIds),
    loadStudentLessonPrograms(supabase, lessonIds),
  ]);
  if (commentsResult.error) throw new Error("피드백 댓글 수를 불러오지 못했습니다.", { cause: commentsResult.error });

  const lessonById = new Map((lessons ?? []).map((lesson) => [lesson.id, lesson]));
  const lessonOrder = new Map((lessons ?? []).map((lesson, index) => [lesson.id, index]));
  const commentCounts = countCommentsByFeedback(commentsResult.data ?? []);
  const sortedFeedback = [...feedback].sort((left, right) => {
    const lessonDifference = (lessonOrder.get(left.lesson_id) ?? Number.MAX_SAFE_INTEGER) - (lessonOrder.get(right.lesson_id) ?? Number.MAX_SAFE_INTEGER);
    if (lessonDifference !== 0) return lessonDifference;
    return left.created_at.localeCompare(right.created_at) * (parsed.sort === "asc" ? 1 : -1);
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <header>
        <p className="text-sm font-bold tracking-[0.12em] text-[var(--accent-strong)]">클래스로그</p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">내 피드백</h1>
        <p className="mt-3 text-[var(--muted)]">수업별 공식 피드백을 확인하세요.</p>
      </header>

      <section className="mt-7 rounded-2xl border border-[var(--line)] bg-white p-4 sm:p-5" aria-labelledby="feedback-filters">
        <h2 id="feedback-filters" className="text-lg font-bold">기간과 정렬</h2>
        <nav aria-label="피드백 빠른 기간 선택" className="mt-4 flex flex-wrap gap-2">
          {RANGE_OPTIONS.map((option) => (
            <Link key={option.value} href={feedbackArchiveHref(option.value, parsed.sort)} aria-current={parsed.range === option.value ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-xl border px-4 font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${parsed.range === option.value ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--line)] hover:border-[var(--accent)]"}`}>{option.label}</Link>
          ))}
        </nav>

        <form method="get" className="mt-5 grid gap-3 border-t border-[var(--line)] pt-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <input type="hidden" name="range" value="custom" />
          <input type="hidden" name="sort" value={parsed.sort} />
          <label className="grid gap-2 text-sm font-bold">시작일<input type="date" name="from" required defaultValue={parsed.range === "custom" ? parsed.from ?? "" : ""} className="min-h-11 rounded-xl border border-[var(--line)] px-3 font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]" /></label>
          <label className="grid gap-2 text-sm font-bold">종료일<input type="date" name="to" required defaultValue={parsed.range === "custom" ? parsed.to ?? "" : ""} className="min-h-11 rounded-xl border border-[var(--line)] px-3 font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]" /></label>
          <button className="min-h-11 rounded-xl border border-[var(--accent)] px-4 font-bold text-[var(--accent-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">기간 적용</button>
        </form>

        <form method="get" className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input type="hidden" name="range" value={parsed.range} />
          {parsed.range === "custom" ? <><input type="hidden" name="from" value={parsed.from ?? ""} /><input type="hidden" name="to" value={parsed.to ?? ""} /></> : null}
          <label htmlFor="feedback-sort" className="text-sm font-bold">정렬</label>
          <select id="feedback-sort" name="sort" defaultValue={parsed.sort} className="min-h-11 rounded-xl border border-[var(--line)] bg-white px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"><option value="desc">최신 수업순</option><option value="asc">오래된 수업순</option></select>
          <button className="min-h-11 rounded-xl bg-[var(--foreground)] px-4 font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">정렬 적용</button>
        </form>
      </section>

      {parsed.error ? <p role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 font-semibold text-amber-900">{parsed.error}</p> : null}

      {sortedFeedback.length ? (
        <ol className="mt-7 space-y-5">
          {sortedFeedback.map((item) => {
            const lesson = lessonById.get(item.lesson_id);
            if (!lesson) return null;
            const author = feedbackAuthors.get(item.id);
            return (
              <li key={item.id}>
                <article className="rounded-2xl border border-[var(--line)] bg-white p-5 sm:p-7">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="rounded-lg bg-[#e5f2f0] px-2.5 py-1 font-bold text-[var(--accent-strong)]">{PROGRAM_LABELS[lessonPrograms.get(lesson.id) ?? ""] ?? "이용권 확인 중"}</span>
                    <time className="font-bold text-[var(--accent-strong)]" dateTime={lesson.starts_at}>{formatLessonDate(lesson.starts_at)}</time>
                  </div>
                  <h2 className="mt-3 text-xl font-bold tracking-[-0.02em]">{lesson.title}</h2>
                  <p className="mt-2 text-sm text-[var(--muted)]">{author ? `${author.display_name} · ${STAFF_ROLE_LABELS[author.role] ?? author.role}` : "피드백 제공자"} · {formatFeedbackDate(item.created_at)}</p>
                  <p className="mt-5 whitespace-pre-wrap break-words text-[1.05rem] leading-8">{item.body}</p>
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
                    <span className="text-sm font-semibold text-[var(--muted)]">댓글 {commentCounts.get(item.id) ?? 0}개</span>
                    <Link href={`/student/schedule/${lesson.id}#feedback-${item.id}`} className="inline-flex min-h-11 items-center rounded-xl border border-[var(--accent)] px-4 font-bold text-[var(--accent-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">일정에서 대화 보기 <span aria-hidden="true" className="ml-1">→</span></Link>
                  </div>
                </article>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="mt-7 rounded-2xl border border-[var(--line)] bg-white p-6">
          <p className="font-bold">선택한 기간에 피드백이 없습니다.</p>
          <Link href="/student/feedback" className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-[var(--accent)] px-4 font-bold text-[var(--accent-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">필터 초기화</Link>
        </div>
      )}
    </main>
  );
}
