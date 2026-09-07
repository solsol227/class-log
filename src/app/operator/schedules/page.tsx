import Link from "next/link";
import { InstantListControls } from "./instant-list-controls";
import { ScheduleCategoryBadge } from "@/components/schedule-category-badge";
import { SCHEDULE_CATEGORIES, SCHEDULE_CATEGORY_LABELS, isScheduleCategory } from "@/lib/lessons/category";
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

const CATEGORY_FILTERS = [
  { value: "all", label: "전체" },
  ...SCHEDULE_CATEGORIES.map((category) => ({ value: category, label: SCHEDULE_CATEGORY_LABELS[category] })),
  { value: "unclassified", label: "미분류" },
] as const;

type CategoryFilter = (typeof CATEGORY_FILTERS)[number]["value"];
type SelectedCategory = Exclude<CategoryFilter, "all">;
type SortDirection = "asc" | "desc";
type ScheduleSearchParams = Record<string, string | string[] | undefined>;

function getQueryValues(value: string | string[] | undefined) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function scheduleListHref(searchParams: ScheduleSearchParams, updates: Record<string, string | string[] | null>) {
  const nextParams = new URLSearchParams();
  Object.entries(searchParams).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach((item) => nextParams.append(key, item));
    else if (value !== undefined) nextParams.set(key, value);
  });
  Object.entries(updates).forEach(([key, value]) => {
    nextParams.delete(key);
    if (Array.isArray(value)) value.forEach((item) => nextParams.append(key, item));
    else if (value) nextParams.set(key, value);
  });
  const query = nextParams.toString();
  return query ? `/operator/schedules?${query}` : "/operator/schedules";
}

function filterButtonClassName(selected: boolean) {
  return `inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${selected ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--line)] bg-white text-[var(--accent-strong)] hover:border-[var(--accent)] hover:bg-[#e5f2f0]"}`;
}

export default async function SchedulesPage({ searchParams }: { searchParams: Promise<ScheduleSearchParams> }) {
  await requireAuthenticatedUser("/login/operator", "operator");
  const resolvedSearchParams = await searchParams;
  const deleted = typeof resolvedSearchParams.deleted === "string" ? resolvedSearchParams.deleted : undefined;
  const activeStatuses = [...new Set(getQueryValues(resolvedSearchParams.status).filter(
    (value): value is LessonDisplayStatus => STATUS_FILTERS.some((filter) => filter.value === value && value !== "all"),
  ))];
  const activeCategories = [...new Set(getQueryValues(resolvedSearchParams.category).filter(
    (value): value is SelectedCategory => isScheduleCategory(value) || value === "unclassified",
  ))];
  const requestedSort = typeof resolvedSearchParams.sort === "string" ? resolvedSearchParams.sort : "asc";
  const activeSort: SortDirection = requestedSort === "desc" ? "desc" : "asc";
  const monthInput = typeof resolvedSearchParams.month === "string" ? resolvedSearchParams.month : "";
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(monthInput) ? monthInput : "";
  const hasActiveFilters = activeCategories.length > 0 || activeStatuses.length > 0 || Boolean(month) || activeSort !== "asc";
  const normalizedSearchParams: ScheduleSearchParams = {};
  if (activeStatuses.length > 0) normalizedSearchParams.status = activeStatuses;
  if (activeCategories.length > 0) normalizedSearchParams.category = activeCategories;
  if (month) normalizedSearchParams.month = month;
  if (requestedSort === "asc" || activeSort === "desc") normalizedSearchParams.sort = activeSort;
  const supabase = await createSupabaseServerClient();
  const [categorizedLessonsResult, { data: assignments, error: assignmentsError }] = await Promise.all([
    supabase.from("lessons").select("id, title, starts_at, ends_at, status, schedule_category").order("starts_at", { ascending: activeSort === "asc" }).order("ends_at", { ascending: activeSort === "asc" }).order("id", { ascending: true }),
    supabase.from("lesson_assignments").select("lesson_id").is("unassigned_at", null),
  ]);
  const legacyLessonsResult = categorizedLessonsResult.error?.code === "42703"
    ? await supabase.from("lessons").select("id, title, starts_at, ends_at, status").order("starts_at", { ascending: activeSort === "asc" }).order("ends_at", { ascending: activeSort === "asc" }).order("id", { ascending: true })
    : null;
  const lessons = categorizedLessonsResult.data
    ?? legacyLessonsResult?.data?.map((lesson) => ({ ...lesson, schedule_category: null }));
  const error = categorizedLessonsResult.error?.code === "42703"
    ? legacyLessonsResult?.error
    : categorizedLessonsResult.error;
  if (error || assignmentsError || !lessons) throw new Error("일정 목록을 불러오지 못했습니다.", { cause: error ?? assignmentsError });
  await syncElapsedLessonStatuses(supabase, lessons.map((lesson) => lesson.id));

  // Keep filtering and counts aligned with the same time-based fallback used by status badges.
  // eslint-disable-next-line react-hooks/purity
  const requestTime = Date.now();
  const displayStatusByLesson = new Map(lessons.map((lesson) => [
    lesson.id,
    getLessonDisplayStatus(lesson.status, lesson.ends_at, requestTime),
  ]));
  const monthLessons = lessons.filter((lesson) => {
    const kstMonth = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit" }).format(new Date(lesson.starts_at));
    return !month || kstMonth === month;
  });
  const statusScopedLessons = activeStatuses.length === 0
    ? monthLessons
    : monthLessons.filter((lesson) => activeStatuses.includes(displayStatusByLesson.get(lesson.id) ?? "scheduled"));
  const categoryCounts = statusScopedLessons.reduce<Record<CategoryFilter, number>>((counts, lesson) => {
    counts.all += 1;
    const category = lesson.schedule_category && isScheduleCategory(lesson.schedule_category) ? lesson.schedule_category : "unclassified";
    counts[category] += 1;
    return counts;
  }, { all: 0, weekday: 0, weekend: 0, trial: 0, unclassified: 0 });
  const matchingLessons = monthLessons.filter((lesson) => {
    if (activeCategories.length === 0) return true;
    const category = lesson.schedule_category && isScheduleCategory(lesson.schedule_category) ? lesson.schedule_category : "unclassified";
    return activeCategories.includes(category);
  });
  const statusCounts = matchingLessons.reduce<Record<"all" | LessonDisplayStatus, number>>((counts, lesson) => {
    counts.all += 1;
    counts[displayStatusByLesson.get(lesson.id) ?? "scheduled"] += 1;
    return counts;
  }, { all: 0, scheduled: 0, completed: 0, draft: 0, cancelled: 0 });
  const filteredLessons = activeStatuses.length === 0
    ? matchingLessons
    : matchingLessons.filter((lesson) => activeStatuses.includes(displayStatusByLesson.get(lesson.id) ?? "scheduled"));

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
      <section className="mt-6 space-y-5">
        <div>
          <h2 className="text-sm font-bold">일정 카테고리</h2>
          <nav aria-label="일정 카테고리 필터" className="-mx-5 mt-2 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:px-0">
            {CATEGORY_FILTERS.map((filter) => {
              const selected = filter.value === "all"
                ? activeCategories.length === 0
                : activeCategories.includes(filter.value);
              const nextCategories = filter.value === "all"
                ? null
                : selected
                  ? activeCategories.filter((category) => category !== filter.value)
                  : [...activeCategories, filter.value];
              return (
                <Link
                  key={filter.value}
                  href={scheduleListHref(normalizedSearchParams, { category: nextCategories })}
                  aria-current={selected ? "page" : undefined}
                  className={filterButtonClassName(selected)}
                >
                  <span>{filter.label}</span>
                  <span aria-label={`${categoryCounts[filter.value]}개`} className={selected ? "text-white/80" : "text-[var(--muted)]"}>{categoryCounts[filter.value]}</span>
                </Link>
              );
            })}
          </nav>
        </div>
        <div>
          <h2 className="text-sm font-bold">일정 상태</h2>
          <nav aria-label="일정 상태 필터" className="-mx-5 mt-2 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:px-0">
            {STATUS_FILTERS.map((filter) => {
              const selected = filter.value === "all"
                ? activeStatuses.length === 0
                : activeStatuses.includes(filter.value);
              const nextStatuses = filter.value === "all"
                ? null
                : selected
                  ? activeStatuses.filter((status) => status !== filter.value)
                  : [...activeStatuses, filter.value];
              return (
                <Link
                  key={filter.value}
                  href={scheduleListHref(normalizedSearchParams, { status: nextStatuses })}
                  aria-current={selected ? "page" : undefined}
                  className={filterButtonClassName(selected)}
                >
                  <span>{filter.label}</span>
                  <span aria-label={`${statusCounts[filter.value]}개`} className={selected ? "text-white/80" : "text-[var(--muted)]"}>{statusCounts[filter.value]}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </section>
      <InstantListControls
        categories={activeCategories}
        month={month}
        sort={activeSort}
        statuses={activeStatuses}
      />
      {hasActiveFilters ? <Link href="/operator/schedules" className="mt-3 inline-flex min-h-12 items-center rounded-xl border border-[var(--line)] bg-white px-4 font-bold text-[var(--accent-strong)]">필터 초기화</Link> : null}
      {lessons.length === 0 ? (
        <section className="mt-8 rounded-2xl border border-[var(--line)] bg-white p-6 sm:p-8"><p className="font-bold">등록된 일정이 없습니다.</p><Link href="/operator/schedules/new" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-[var(--accent)] px-4 font-bold text-white">새 일정 등록</Link></section>
      ) : filteredLessons.length === 0 ? (
        <section className="mt-8 rounded-2xl border border-dashed border-[var(--line)] bg-white p-6 sm:p-8">
          <p className="font-bold">조건에 맞는 일정이 없습니다.</p>
          <p className="mt-2 text-sm text-[var(--muted)]">카테고리·상태·월 조건을 변경해 주세요.</p>
          <Link href="/operator/schedules" className="mt-5 inline-flex min-h-11 items-center rounded-xl border border-[var(--accent)] bg-white px-4 font-bold text-[var(--accent-strong)]">필터 초기화</Link>
        </section>
      ) : (
        <ul className="mt-8 space-y-3">{filteredLessons.map((lesson) => <li key={lesson.id}><Link href={`/operator/schedules/${lesson.id}`} className="block rounded-2xl border border-[var(--line)] bg-white p-5 transition hover:border-[var(--accent)]"><span className="flex flex-wrap items-center justify-between gap-3"><span className="min-w-0 break-words text-lg font-bold">{lesson.title}</span><ScheduleCategoryBadge category={lesson.schedule_category} /><span className="rounded-full bg-[#e5f2f0] px-3 py-1 text-sm font-bold text-[var(--accent-strong)]">{getLessonDisplayStatusLabel(lesson.status, lesson.ends_at, requestTime)}</span></span><span className="mt-3 block text-sm text-[var(--muted)]">{formatDateTime(lesson.starts_at)} - {formatDateTime(lesson.ends_at)}</span><span className="mt-2 block text-sm font-bold text-[var(--accent-strong)]">배정 학생 {assignmentCounts[lesson.id] ?? 0}명</span></Link></li>)}</ul>
      )}
    </main>
  );
}
