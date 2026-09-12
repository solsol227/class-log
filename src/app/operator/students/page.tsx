import Link from "next/link";
import { requireOperatorAccess } from "@/lib/auth/operator-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const STATUS_FILTERS = [
  { value: "all", label: "전체" },
  { value: "active", label: "진행중" },
  { value: "break", label: "휴식" },
  { value: "ended", label: "이용종료" },
] as const;

const PROGRAM_OPTIONS = [
  { value: "all", label: "전체 프로그램" },
  { value: "weekday_vocal", label: "평일보컬" },
  { value: "weekend_vocal", label: "주말보컬" },
  { value: "rental", label: "대여" },
  { value: "trial", label: "체험" },
] as const;

const PROGRAM_LABELS: Record<string, string> = {
  weekday_vocal: "평일보컬",
  weekend_vocal: "주말보컬",
  rental: "대여",
  trial: "체험",
};

const BADGE_LABELS = {
  active: "진행중",
  inactive: "장기 미배정",
  break: "휴식",
  ended: "이용종료",
  none: "프로그램 미등록",
} as const;

const BADGE_STYLES = {
  active: "bg-emerald-50 text-emerald-800",
  inactive: "bg-amber-50 text-amber-900",
  break: "bg-sky-50 text-sky-800",
  ended: "bg-slate-100 text-slate-700",
  none: "bg-slate-100 text-slate-600",
} as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]["value"];
type ProgramFilter = (typeof PROGRAM_OPTIONS)[number]["value"];
type BadgeStatus = keyof typeof BADGE_LABELS;
type ProgramStatus = {
  student_program_id: string;
  student_id: string;
  program_type: string;
  stored_status: string;
  effective_status: string;
  ended_at: string | null;
  stop_reason: string | null;
  last_lesson_at: string | null;
};
type AllowanceStatus = {
  student_program_id: string;
  period_month: string | null;
  remaining_count: number | null;
};

function getLatestStoppedPrograms(programs: ProgramStatus[]) {
  const stopped = programs.filter((program) => program.stored_status === "stopped");
  const latestEndedAt = stopped.reduce<string | null>((latest, program) => {
    if (!program.ended_at) return latest;
    return !latest || program.ended_at > latest ? program.ended_at : latest;
  }, null);
  return latestEndedAt ? stopped.filter((program) => program.ended_at === latestEndedAt) : stopped;
}

function classifyStudent(programs: ProgramStatus[]) {
  const activePrograms = programs.filter((program) => program.stored_status === "active");
  if (activePrograms.length > 0) {
    const hasEffectiveActive = activePrograms.some((program) => program.effective_status === "active");
    return {
      filterStatus: "active" as const,
      badgeStatus: (hasEffectiveActive ? "active" : "inactive") as BadgeStatus,
      relevantPrograms: activePrograms,
    };
  }

  const latestStopped = getLatestStoppedPrograms(programs);
  if (latestStopped.some((program) => program.stop_reason === "break")) {
    return { filterStatus: "break" as const, badgeStatus: "break" as BadgeStatus, relevantPrograms: latestStopped };
  }

  return {
    filterStatus: "ended" as const,
    badgeStatus: (latestStopped.length > 0 ? "ended" : "none") as BadgeStatus,
    relevantPrograms: latestStopped,
  };
}

function normalizeSearch(value: string | undefined) {
  return value?.normalize("NFKC").trim().slice(0, 50) ?? "";
}

function buildStudentsHref(status: StatusFilter, program: ProgramFilter, query: string) {
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  if (program !== "all") params.set("program", program);
  if (query) params.set("q", query);
  const search = params.toString();
  return search ? `/operator/students?${search}` : "/operator/students";
}

function getProgramLabels(programs: ProgramStatus[]) {
  const types = new Set(programs.map((program) => program.program_type));
  return PROGRAM_OPTIONS
    .filter((option) => option.value !== "all" && types.has(option.value))
    .map((option) => PROGRAM_LABELS[option.value]);
}

function getCurrentKstMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone: "Asia/Seoul",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}-01`;
}

function getAllowanceLabels(programs: ProgramStatus[], allowances: AllowanceStatus[]) {
  const currentMonth = getCurrentKstMonth();
  const activePrograms = programs.filter((program) => program.stored_status === "active");
  return PROGRAM_OPTIONS.flatMap((option) => {
    if (option.value === "all") return [];
    const program = activePrograms.find((item) => item.program_type === option.value);
    if (!program) return [];
    const allowance = allowances.find((item) =>
      item.student_program_id === program.student_program_id
      && (program.program_type === "weekday_vocal" || program.program_type === "weekend_vocal"
        ? item.period_month === currentMonth
        : item.period_month === null),
    );
    if (allowance?.remaining_count === null || allowance?.remaining_count === undefined) return [];
    return [`${PROGRAM_LABELS[program.program_type] ?? program.program_type} · 남은 ${allowance.remaining_count}회`];
  });
}

function getLastAssignmentLabel(programs: ProgramStatus[]) {
  const lastLessonAt = programs.reduce<string | null>((latest, program) => {
    if (!program.last_lesson_at) return latest;
    return !latest || program.last_lesson_at > latest ? program.last_lesson_at : latest;
  }, null);
  if (!lastLessonAt) return "배정 이력 없음";
  const elapsedDays = Math.max(0, Math.floor((Date.now() - new Date(lastLessonAt).getTime()) / 86_400_000));
  return `마지막 배정 ${elapsedDays}일 경과`;
}

export default async function OperatorStudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string; status?: string; program?: string; q?: string }>;
}) {
  const access = await requireOperatorAccess();
  const { deleted, status, program, q } = await searchParams;
  const selectedStatus: StatusFilter = STATUS_FILTERS.some((filter) => filter.value === status) ? status as StatusFilter : "all";
  const selectedProgram: ProgramFilter = PROGRAM_OPTIONS.some((option) => option.value === program) ? program as ProgramFilter : "all";
  const query = normalizeSearch(q);
  const normalizedQuery = query.toLocaleLowerCase("ko-KR");

  const supabase = await createSupabaseServerClient();
  const [{ data: students, error }, { data: programStatuses, error: programError }, { data: allowanceStatuses, error: allowanceError }] = await Promise.all([
    supabase.from("students").select("id, nickname").order("nickname", { ascending: true }),
    supabase.from("student_program_statuses").select("student_program_id, student_id, program_type, stored_status, effective_status, ended_at, stop_reason, last_lesson_at"),
    supabase.from("student_program_allowance_statuses").select("student_program_id, period_month, remaining_count"),
  ]);
  if (error || programError || allowanceError) throw new Error("학생 목록을 불러오지 못했습니다.", { cause: error ?? programError ?? allowanceError });

  const programsByStudent = programStatuses.reduce<Map<string, ProgramStatus[]>>((map, item) => {
    const items = map.get(item.student_id) ?? [];
    items.push(item);
    map.set(item.student_id, items);
    return map;
  }, new Map());
  const classified = students.map((student) => {
    const listState = classifyStudent(programsByStudent.get(student.id) ?? []);
    return { ...student, ...listState };
  });
  const showTrialOption = classified.some((student) => student.relevantPrograms.some((item) => item.program_type === "trial"));
  const visibleProgramOptions = PROGRAM_OPTIONS.filter((option) => option.value !== "trial" || showTrialOption);
  const effectiveProgram = selectedProgram === "trial" && !showTrialOption ? "all" : selectedProgram;
  const searchAndProgramMatches = classified.filter((student) => {
    const matchesSearch = !normalizedQuery || student.nickname.normalize("NFKC").toLocaleLowerCase("ko-KR").includes(normalizedQuery);
    const matchesProgram = effectiveProgram === "all" || student.relevantPrograms.some((item) => item.program_type === effectiveProgram);
    return matchesSearch && matchesProgram;
  });
  const counts = Object.fromEntries(STATUS_FILTERS.map((filter) => [
    filter.value,
    filter.value === "all" ? searchAndProgramMatches.length : searchAndProgramMatches.filter((student) => student.filterStatus === filter.value).length,
  ]));
  const filteredStudents = selectedStatus === "all"
    ? searchAndProgramMatches
    : searchAndProgramMatches.filter((student) => student.filterStatus === selectedStatus);
  const hasActiveFilters = query.length > 0 || effectiveProgram !== "all" || selectedStatus !== "all";

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold tracking-[0.12em] text-[var(--accent-strong)]">클래스로그</p>
          <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">학생 목록</h1>
        </div>
        {access.canManageStudents ? <Link href="/operator/students/new" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] px-4 font-bold text-white transition hover:bg-[var(--accent-strong)]">학생 등록</Link> : null}
      </header>

      {deleted === "1" ? <p role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 font-bold text-emerald-900">학생과 로그인 계정을 삭제했습니다.</p> : null}

      <form action="/operator/students" method="get" className="mt-7 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        {selectedStatus !== "all" ? <input type="hidden" name="status" value={selectedStatus} /> : null}
        <label className="sr-only" htmlFor="student-search">학생 이름 검색</label>
        <input id="student-search" name="q" type="search" defaultValue={query} maxLength={50} placeholder="학생 이름 검색" className="min-h-11 w-full rounded-xl border border-[var(--line)] bg-white px-4 outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15" />
        <label className="sr-only" htmlFor="program-filter">이용프로그램</label>
        <select id="program-filter" name="program" defaultValue={effectiveProgram} className="min-h-11 rounded-xl border border-[var(--line)] bg-white px-3 font-bold outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15">
          {visibleProgramOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <button type="submit" className="min-h-11 rounded-xl border border-[var(--accent)] px-4 font-bold text-[var(--accent-strong)] transition hover:bg-[#f4f8f7]">검색</button>
      </form>

      <nav aria-label="학생 상태 필터" className="mt-4 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((filter) => {
          const selected = selectedStatus === filter.value;
          return (
            <Link key={filter.value} href={buildStudentsHref(filter.value, effectiveProgram, query)} aria-current={selected ? "page" : undefined} className={`inline-flex min-h-10 items-center gap-1 rounded-full border px-3 text-sm font-bold ${selected ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--line)] bg-white"}`}>
              {filter.label}<span className={selected ? "text-white/80" : "text-[var(--muted)]"}>{counts[filter.value]}</span>
            </Link>
          );
        })}
      </nav>

      {filteredStudents.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-[var(--line)] bg-white p-6">
          <p className="text-[var(--muted)]">{classified.length === 0 ? "등록된 학생이 없습니다." : "조건에 맞는 학생이 없습니다."}</p>
          {hasActiveFilters ? <Link href="/operator/students" className="mt-3 inline-flex font-bold text-[var(--accent-strong)] underline-offset-4 hover:underline">필터 초기화</Link> : null}
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {filteredStudents.map((student) => {
            const programLabels = getProgramLabels(student.relevantPrograms);
            const allowanceLabels = getAllowanceLabels(student.relevantPrograms, allowanceStatuses);
            return (
              <li key={student.id}>
                <Link href={`/operator/students/${student.id}`} className="block rounded-2xl border border-[var(--line)] bg-white p-5 shadow-[0_16px_45px_rgba(23,64,60,0.06)] transition hover:border-[var(--accent)]">
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 break-words text-lg font-bold">{student.nickname}</span>
                    <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${BADGE_STYLES[student.badgeStatus]}`}>{BADGE_LABELS[student.badgeStatus]}</span>
                  </div>
                  <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--muted)]">
                    {allowanceLabels.length > 0 ? allowanceLabels.map((label, index) => <span key={label} className="inline-flex items-center gap-2">{index > 0 ? <span aria-hidden="true" className="text-[var(--line)]">|</span> : null}<span>{label}</span></span>) : <span>{programLabels.length > 0 ? programLabels.join(" · ") : "이용프로그램 없음"}</span>}
                    {student.badgeStatus === "inactive" ? <><span aria-hidden="true">·</span><span>{getLastAssignmentLabel(student.relevantPrograms)}</span></> : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
