import Link from "next/link";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import { getLessonDisplayStatus, getLessonDisplayStatusLabel, type LessonDisplayStatus } from "@/lib/lessons/display-status";
import { syncElapsedLessonStatuses } from "@/lib/lessons/sync-status";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function formatDateTime(value: string) { return new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(value)); }

const STATUS_FILTERS: { value: "all" | LessonDisplayStatus; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "scheduled", label: "예정" },
  { value: "completed", label: "완료" },
  { value: "draft", label: "Draft" },
  { value: "cancelled", label: "취소" },
];

type ScheduleSearchParams = Record<string, string | string[] | undefined>;

function statusHref(searchParams: ScheduleSearchParams, status: "all" | LessonDisplayStatus) {
  const nextParams = new URLSearchParams();
  Object.entries(searchParams).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach((item) => nextParams.append(key, item));
    else if (value !== undefined) nextParams.set(key, value);
  });
  nextParams.delete("status");
  if (status !== "all") nextParams.set("status", status);
  const query = nextParams.toString();
  return query ? `/operator/schedules?${query}` : "/operator/schedules";
}

export default async function SchedulesPage({ searchParams }: { searchParams: Promise<ScheduleSearchParams> }) {
  await requireAuthenticatedUser("/login/operator", "operator");
  const resolvedSearchParams = await searchParams;
  const deleted = typeof resolvedSearchParams.deleted === "string" ? resolvedSearchParams.deleted : undefined;
  const requestedStatus = typeof resolvedSearchParams.status === "string" ? resolvedSearchParams.status : "all";
  const activeStatus = STATUS_FILTERS.some((filter) => filter.value === requestedStatus)
    ? requestedStatus as "all" | LessonDisplayStatus
    : "all";
  const supabase = await createSupabaseServerClient();
  const [{ data: lessons, error }, { data: assignments, error: assignmentsError }] = await Promise.all([
    supabase.from("lessons").select("id, title, starts_at, ends_at, status").order("starts_at", { ascending: true }).order("ends_at", { ascending: true }),
    supabase.from("lesson_assignments").select("lesson_id").is("unassigned_at", null),
  ]);
  if (error || assignmentsError) throw new Error("일정 목록을 불러오지 못했습니다.", { cause: error ?? assignmentsError });
  await syncElapsedLessonStatuses(supabase, lessons.map((lesson) => lesson.id));

  // Keep filtering and counts aligned with the same time-based fallback used by status badges.
  // eslint-disable-next-line react-hooks/purity
  const requestTime = Date.now();
  const displayStatusByLesson = new Map(lessons.map((lesson) => [
    lesson.id,
    getLessonDisplayStatus(lesson.status, lesson.ends_at, requestTime),
  ]));
  const statusCounts = lessons.reduce<Record<"all" | LessonDisplayStatus, number>>((counts, lesson) => {
    counts.all += 1;
    counts[displayStatusByLesson.get(lesson.id) ?? "scheduled"] += 1;
    return counts;
  }, { all: 0, scheduled: 0, completed: 0, draft: 0, cancelled: 0 });
  const filteredLessons = activeStatus === "all"
    ? lessons
    : lessons.filter((lesson) => displayStatusByLesson.get(lesson.id) === activeStatus);

  const assignmentCounts = assignments.reduce<Record<string, number>>((counts, assignment) => {
    counts[assignment.lesson_id] = (counts[assignment.lesson_id] ?? 0) + 1;
    return counts;
  }, {});

  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
      {deleted === "1" ? <p role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 font-bold text-emerald-900">일정을 삭제했습니다.</p> : null}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-[-0.04em] sm:text-4xl">일정관리</h1>
        <Link href="/operator/schedules/new" className="inline-flex min-h-11 items-center rounded-xl bg-[var(--accent)] px-4 font-bold text-white hover:bg-[var(--accent-strong)]">새 일정 등록</Link>
      </header>
      <nav aria-label="일정 상태 필터" className="mt-6 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((filter) => {
          const selected = filter.value === activeStatus;
          return (
            <Link
              key={filter.value}
              href={statusHref(resolvedSearchParams, filter.value)}
              aria-current={selected ? "page" : undefined}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${selected ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--line)] bg-white text-[var(--accent-strong)] hover:border-[var(--accent)] hover:bg-[#e5f2f0]"}`}
            >
              <span>{filter.label}</span>
              <span aria-label={`${statusCounts[filter.value]}개`} className={selected ? "text-white/80" : "text-[var(--muted)]"}>{statusCounts[filter.value]}</span>
            </Link>
          );
        })}
      </nav>
      {lessons.length === 0 ? (
        <section className="mt-8 rounded-2xl border border-[var(--line)] bg-white p-6 sm:p-8"><p className="font-bold">등록된 일정이 없습니다.</p><Link href="/operator/schedules/new" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-[var(--accent)] px-4 font-bold text-white">새 일정 등록</Link></section>
      ) : filteredLessons.length === 0 ? (
        <section className="mt-8 rounded-2xl border border-dashed border-[var(--line)] bg-white p-6 sm:p-8">
          <p className="font-bold">{STATUS_FILTERS.find((filter) => filter.value === activeStatus)?.label} 상태의 일정이 없습니다.</p>
          <p className="mt-2 text-sm text-[var(--muted)]">다른 상태를 선택하거나 새 일정을 등록해 주세요.</p>
          <Link href="/operator/schedules/new" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-[var(--accent)] px-4 font-bold text-white">새 일정 등록</Link>
        </section>
      ) : (
        <ul className="mt-8 space-y-3">{filteredLessons.map((lesson) => <li key={lesson.id}><Link href={`/operator/schedules/${lesson.id}`} className="block rounded-2xl border border-[var(--line)] bg-white p-5 transition hover:border-[var(--accent)]"><span className="flex flex-wrap items-center justify-between gap-3"><span className="text-lg font-bold">{lesson.title}</span><span className="rounded-full bg-[#e5f2f0] px-3 py-1 text-sm font-bold text-[var(--accent-strong)]">{getLessonDisplayStatusLabel(lesson.status, lesson.ends_at, requestTime)}</span></span><span className="mt-3 block text-sm text-[var(--muted)]">{formatDateTime(lesson.starts_at)} - {formatDateTime(lesson.ends_at)}</span><span className="mt-2 block text-sm font-bold text-[var(--accent-strong)]">배정 학생 {assignmentCounts[lesson.id] ?? 0}명</span></Link></li>)}</ul>
      )}
    </main>
  );
}
