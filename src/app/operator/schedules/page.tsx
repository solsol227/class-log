import Link from "next/link";
import { InstantListControls } from "./instant-list-controls";
import { ScheduleCategoryBadge } from "@/components/schedule-category-badge";
import { SCHEDULE_CATEGORIES, SCHEDULE_CATEGORY_LABELS, isScheduleCategory } from "@/lib/lessons/category";
import { requireOperatorAccess } from "@/lib/auth/operator-access";
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

function assignedStudentLabel(names: string[]) {
  if (names.length === 0) return "없음";
  const visibleNames = names.slice(0, 3).join(", ");
  return names.length > 3 ? `${visibleNames} 외 ${names.length - 3}명` : visibleNames;
}

export default async function SchedulesPage({ searchParams }: { searchParams: Promise<ScheduleSearchParams> }) {
  const access = await requireOperatorAccess();
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
  const requestedStaff = typeof resolvedSearchParams.staff === "string" ? resolvedSearchParams.staff : "";
  const supabase = await createSupabaseServerClient();
  const [
    categorizedLessonsResult,
    { data: assignments, error: assignmentsError },
    { data: students, error: studentsError },
    { data: lessonStaff, error: lessonStaffError },
    { data: staffProfiles, error: staffProfilesError },
  ] = await Promise.all([
    supabase.from("lessons").select("id, title, starts_at, ends_at, status, schedule_category").order("starts_at", { ascending: activeSort === "asc" }).order("ends_at", { ascending: activeSort === "asc" }).order("id", { ascending: true }),
    supabase.from("lesson_assignments").select("lesson_id, student_id, assigned_at").is("unassigned_at", null).order("assigned_at", { ascending: true }),
    supabase.from("students").select("id, nickname"),
    supabase.from("lesson_staff").select("lesson_id, staff_id, created_at").order("created_at", { ascending: true }),
    supabase.from("staff_profiles").select("id, display_name, is_active").order("display_name", { ascending: true }),
  ]);
  const legacyLessonsResult = categorizedLessonsResult.error?.code === "42703"
    ? await supabase.from("lessons").select("id, title, starts_at, ends_at, status").order("starts_at", { ascending: activeSort === "asc" }).order("ends_at", { ascending: activeSort === "asc" }).order("id", { ascending: true })
    : null;
  const lessons = categorizedLessonsResult.data
    ?? legacyLessonsResult?.data?.map((lesson) => ({ ...lesson, schedule_category: null }));
  const error = categorizedLessonsResult.error?.code === "42703"
    ? legacyLessonsResult?.error
    : categorizedLessonsResult.error;
  const relatedDataError = assignmentsError ?? studentsError ?? lessonStaffError ?? staffProfilesError;
  if (error || relatedDataError || !lessons || !assignments || !students || !lessonStaff || !staffProfiles) {
    throw new Error("일정 목록을 불러오지 못했습니다.", { cause: error ?? relatedDataError });
  }
  if (access.isOwner) await syncElapsedLessonStatuses(supabase, lessons.map((lesson) => lesson.id));

  const activeStaffOptions = staffProfiles
    .filter((member) => member.is_active)
    .map((member) => ({ id: member.id, name: member.display_name }));
  const activeStaffId = activeStaffOptions.some((member) => member.id === requestedStaff) ? requestedStaff : "";
  const hasActiveFilters = activeCategories.length > 0 || activeStatuses.length > 0 || Boolean(month) || Boolean(activeStaffId) || activeSort !== "asc";
  const normalizedSearchParams: ScheduleSearchParams = {};
  if (activeStatuses.length > 0) normalizedSearchParams.status = activeStatuses;
  if (activeCategories.length > 0) normalizedSearchParams.category = activeCategories;
  if (month) normalizedSearchParams.month = month;
  if (activeStaffId) normalizedSearchParams.staff = activeStaffId;
  if (requestedSort === "asc" || activeSort === "desc") normalizedSearchParams.sort = activeSort;

  const staffNameById = new Map(staffProfiles.map((member) => [member.id, member.display_name]));
  const studentNameById = new Map(students.map((student) => [student.id, student.nickname]));
  const staffIdsByLesson = lessonStaff.reduce<Map<string, string[]>>((idsByLesson, entry) => {
    const ids = idsByLesson.get(entry.lesson_id) ?? [];
    if (!ids.includes(entry.staff_id)) ids.push(entry.staff_id);
    idsByLesson.set(entry.lesson_id, ids);
    return idsByLesson;
  }, new Map());
  const staffNamesByLesson = new Map([...staffIdsByLesson].map(([lessonId, staffIds]) => [
    lessonId,
    staffIds.map((staffId) => staffNameById.get(staffId)).filter((name): name is string => Boolean(name)),
  ]));
  const studentNamesByLesson = assignments.reduce<Map<string, string[]>>((namesByLesson, assignment) => {
    const name = studentNameById.get(assignment.student_id);
    if (!name) return namesByLesson;
    const names = namesByLesson.get(assignment.lesson_id) ?? [];
    names.push(name);
    namesByLesson.set(assignment.lesson_id, names);
    return namesByLesson;
  }, new Map());

  // Keep filtering and counts aligned with the same time-based fallback used by status badges.
  // eslint-disable-next-line react-hooks/purity
  const requestTime = Date.now();
  const displayStatusByLesson = new Map(lessons.map((lesson) => [
    lesson.id,
    getLessonDisplayStatus(lesson.status, lesson.ends_at, requestTime),
  ]));
  const monthAndStaffLessons = lessons.filter((lesson) => {
    const kstMonth = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit" }).format(new Date(lesson.starts_at));
    return (!month || kstMonth === month)
      && (!activeStaffId || staffIdsByLesson.get(lesson.id)?.includes(activeStaffId));
  });
  const statusScopedLessons = activeStatuses.length === 0
    ? monthAndStaffLessons
    : monthAndStaffLessons.filter((lesson) => activeStatuses.includes(displayStatusByLesson.get(lesson.id) ?? "scheduled"));
  const categoryCounts = statusScopedLessons.reduce<Record<CategoryFilter, number>>((counts, lesson) => {
    counts.all += 1;
    const category = lesson.schedule_category && isScheduleCategory(lesson.schedule_category) ? lesson.schedule_category : "unclassified";
    counts[category] += 1;
    return counts;
  }, { all: 0, weekday: 0, weekend: 0, trial: 0, unclassified: 0 });
  const matchingLessons = monthAndStaffLessons.filter((lesson) => {
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

  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
      {deleted === "1" ? <p role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 font-bold text-emerald-900">일정을 삭제했습니다.</p> : null}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-[-0.04em] sm:text-4xl">일정관리</h1>
        {access.canManageSchedules ? <Link href="/operator/schedules/new" className="inline-flex min-h-11 items-center rounded-xl bg-[var(--accent)] px-4 font-bold text-white hover:bg-[var(--accent-strong)]">새 일정 등록</Link> : null}
      </header>
      <section className="mt-6 space-y-5">
        <div>
          <h2 className="text-sm font-bold">일정 카테고리</h2>
          <nav aria-label="일정 카테고리 필터" className="mt-2 flex flex-wrap gap-2">
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
          <nav aria-label="일정 상태 필터" className="mt-2 flex flex-wrap gap-2">
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
        staff={activeStaffId}
        staffOptions={activeStaffOptions}
        sort={activeSort}
        statuses={activeStatuses}
      />
      {hasActiveFilters ? <Link href="/operator/schedules" className="mt-3 inline-flex min-h-12 items-center rounded-xl border border-[var(--line)] bg-white px-4 font-bold text-[var(--accent-strong)]">필터 초기화</Link> : null}
      {lessons.length === 0 ? (
        <section className="mt-8 rounded-2xl border border-[var(--line)] bg-white p-6 sm:p-8"><p className="font-bold">등록된 일정이 없습니다.</p>{access.canManageSchedules ? <Link href="/operator/schedules/new" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-[var(--accent)] px-4 font-bold text-white">새 일정 등록</Link> : null}</section>
      ) : filteredLessons.length === 0 ? (
        <section className="mt-8 rounded-2xl border border-dashed border-[var(--line)] bg-white p-6 sm:p-8">
          <p className="font-bold">조건에 맞는 일정이 없습니다.</p>
          <p className="mt-2 text-sm text-[var(--muted)]">카테고리·상태·월·담당자 조건을 변경해 주세요.</p>
          <Link href="/operator/schedules" className="mt-5 inline-flex min-h-11 items-center rounded-xl border border-[var(--accent)] bg-white px-4 font-bold text-[var(--accent-strong)]">필터 초기화</Link>
        </section>
      ) : (
        <ul className="mt-8 space-y-3">{filteredLessons.map((lesson) => {
          const assignedStaffNames = staffNamesByLesson.get(lesson.id) ?? [];
          const assignedStudentNames = studentNamesByLesson.get(lesson.id) ?? [];
          return <li key={lesson.id}><Link href={`/operator/schedules/${lesson.id}`} className="block rounded-2xl border border-[var(--line)] bg-white p-5 transition hover:border-[var(--accent)]"><span className="flex flex-wrap items-center justify-between gap-3"><span className="min-w-0 break-words text-lg font-bold">{lesson.title}</span><ScheduleCategoryBadge category={lesson.schedule_category} /><span className="rounded-full bg-[#e5f2f0] px-3 py-1 text-sm font-bold text-[var(--accent-strong)]">{getLessonDisplayStatusLabel(lesson.status, lesson.ends_at, requestTime)}</span></span><span className="mt-3 block text-sm text-[var(--muted)]">{formatDateTime(lesson.starts_at)} - {formatDateTime(lesson.ends_at)}</span><span className="mt-3 block break-words text-sm text-[var(--muted)]"><span className="font-bold text-[var(--foreground)]">담당자:</span> {assignedStaffNames.length > 0 ? assignedStaffNames.join(", ") : "미배정"}</span><span className="mt-2 block break-words text-sm text-[var(--muted)]"><span className="font-bold text-[var(--foreground)]">배정학생:</span> {assignedStudentLabel(assignedStudentNames)}</span></Link></li>;
        })}</ul>
      )}
    </main>
  );
}
