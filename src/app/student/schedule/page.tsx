import Link from "next/link";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import { getLessonDisplayStatusLabel } from "@/lib/lessons/display-status";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type StudentSchedulePageProps = {
  searchParams: Promise<{ month?: string }>;
};

type StudentAllowanceStatus = {
  student_program_id: string;
  program_type: string;
  period_month: string | null;
  remaining_count: number | null;
  reserved_count: number;
  used_count: number;
  makeup_available_count: number;
  makeup_reserved_count: number;
};

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
function monthKey(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone: "Asia/Seoul",
  }).formatToParts(new Date(value));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return year && month ? `${year}-${month}` : "";
}

function formatMonthLabel(key: string, showYear: boolean) {
  const [year, month] = key.split("-");
  return showYear ? `${year.slice(2)}년 ${month}월` : `${Number(month)}월`;
}

function formatScheduleDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

const PROGRAM_LABELS: Record<string, string> = {
  weekday_vocal: "평일보컬",
  weekend_vocal: "주말보컬",
  trial: "체험",
  rental: "대여",
};

export default async function StudentSchedulePage({ searchParams }: StudentSchedulePageProps) {
  await requireAuthenticatedUser("/login/student", "student");
  const { month } = await searchParams;
  const selectedMonth = month && MONTH_PATTERN.test(month) ? month : null;
  const supabase = await createSupabaseServerClient();
  const [assignmentsResult, allowancesResult, programsResult] = await Promise.all([
    supabase.from("lesson_assignments").select("lesson_id, student_program_id").is("unassigned_at", null),
    supabase.rpc("get_my_student_program_allowance_statuses"),
    supabase.from("student_programs").select("id, program_type"),
  ]);
  const assignments = assignmentsResult.data ?? [];
  const allowanceStatuses = (allowancesResult.data ?? []) as StudentAllowanceStatus[];

  if (assignmentsResult.error || allowancesResult.error || programsResult.error) {
    throw new Error("일정과 이용 횟수를 불러오지 못했습니다.", { cause: assignmentsResult.error ?? allowancesResult.error ?? programsResult.error });
  }

  const lessonIds = assignments.map((assignment) => assignment.lesson_id);
  const [lessonsResult, lessonStaffResult] = lessonIds.length
    ? await Promise.all([
        supabase
          .from("lessons")
          .select("id, title, starts_at, ends_at, location, status")
          .in("id", lessonIds)
          .order("starts_at", { ascending: true }),
        supabase
          .from("lesson_staff")
          .select("lesson_id, staff_id, created_at")
          .in("lesson_id", lessonIds)
          .order("created_at", { ascending: true }),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  const lessons = lessonsResult.data ?? [];
  const lessonStaff = lessonStaffResult.data ?? [];
  const staffIds = [...new Set(lessonStaff.map((entry) => entry.staff_id))];
  const { data: staff, error: staffError } = staffIds.length
    ? await supabase.from("staff_profiles").select("id, display_name").in("id", staffIds)
    : { data: [], error: null };

  if (lessonsResult.error || lessonStaffResult.error || staffError) {
    throw new Error("배정된 일정을 불러오지 못했습니다.", { cause: lessonsResult.error ?? lessonStaffResult.error ?? staffError });
  }

  const staffById = new Map((staff ?? []).map((member) => [member.id, member.display_name]));
  const programIdByLesson = new Map(assignments.map((assignment) => [assignment.lesson_id, assignment.student_program_id]));
  const programTypeById = new Map((programsResult.data ?? []).map((program) => [program.id, program.program_type]));
  const staffNamesByLesson = lessonStaff.reduce<Map<string, string[]>>((namesByLesson, entry) => {
    const name = staffById.get(entry.staff_id);
    if (!name) return namesByLesson;
    const names = namesByLesson.get(entry.lesson_id) ?? [];
    if (!names.includes(name)) names.push(name);
    namesByLesson.set(entry.lesson_id, names);
    return namesByLesson;
  }, new Map());

  const months = [...new Set(lessons.map((lesson) => monthKey(lesson.starts_at)).filter(Boolean))];
  const years = new Set(months.map((key) => key.slice(0, 4)));
  const visibleLessons = selectedMonth
    ? lessons.filter((lesson) => monthKey(lesson.starts_at) === selectedMonth)
    : lessons;
  const allowanceMonth = selectedMonth ?? monthKey(new Date().toISOString());
  const visibleAllowances = allowanceStatuses.filter((status) => !status.period_month || status.period_month.slice(0, 7) === allowanceMonth);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <header>
        <p className="text-sm font-bold tracking-[0.12em] text-[var(--accent-strong)]">클래스로그</p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">내 일정</h1>
      </header>

      {visibleAllowances.length > 0 ? (
        <section aria-labelledby="student-allowance-heading" className="mt-7 rounded-2xl border border-[var(--line)] bg-white p-5 sm:p-6">
          <h2 id="student-allowance-heading" className="text-xl font-bold">내 이용권</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {visibleAllowances.map((status) => (
              <li key={`${status.student_program_id}-${status.period_month ?? "enrollment"}`} className="rounded-xl bg-[#f4f8f7] p-4">
                <div className="flex items-center justify-between gap-3"><p className="font-bold">{PROGRAM_LABELS[status.program_type] ?? status.program_type}</p><p className="font-bold text-[var(--accent-strong)]">일반 {status.remaining_count ?? "미설정"}회</p></div>
                <p className="mt-2 text-sm text-[var(--muted)]">예약 {status.reserved_count} · 사용 {status.used_count}</p>
                <p className="mt-1 text-sm text-[var(--muted)]">보강 대기 {status.makeup_available_count} · 예약 {status.makeup_reserved_count}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {months.length > 0 ? (
        <nav aria-label="일정 월 필터" className="mt-7 flex flex-wrap gap-2">
          <Link href="/student/schedule" aria-current={!selectedMonth ? "page" : undefined} className={`rounded-xl border px-4 py-2 font-bold transition ${!selectedMonth ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--line)] bg-white text-[var(--foreground)] hover:border-[var(--accent)]"}`}>전체</Link>
          {months.map((key) => (
            <Link key={key} href={`/student/schedule?month=${key}`} aria-current={selectedMonth === key ? "page" : undefined} className={`rounded-xl border px-4 py-2 font-bold transition ${selectedMonth === key ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--line)] bg-white text-[var(--foreground)] hover:border-[var(--accent)]"}`}>{formatMonthLabel(key, years.size > 1)}</Link>
          ))}
        </nav>
      ) : null}

      {lessons.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-[var(--line)] bg-white p-6 text-[var(--muted)]">아직 등록된 일정이 없습니다.</p>
      ) : visibleLessons.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-[var(--line)] bg-white p-6 text-[var(--muted)]">선택한 월에 등록된 일정이 없습니다.</p>
      ) : (
        <ol className="mt-8 space-y-3">
          {visibleLessons.map((lesson) => (
            <li key={lesson.id} className="rounded-2xl border border-[var(--line)] bg-white p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-[var(--accent-strong)]">{formatScheduleDate(lesson.starts_at)}</p>
                  <h2 className="mt-2 text-xl font-bold tracking-[-0.02em]">{lesson.title}</h2>
                </div>
                <span className="rounded-lg bg-[#e5f2f0] px-3 py-1 text-sm font-bold text-[var(--accent-strong)]">{getLessonDisplayStatusLabel(lesson.status, lesson.ends_at)}</span>
              </div>
              {lesson.location ? <p className="mt-3 text-sm text-[var(--muted)]">장소: {lesson.location}</p> : null}
              <p className="mt-2 text-sm font-bold text-[var(--accent-strong)]">사용 이용권 · {PROGRAM_LABELS[programTypeById.get(programIdByLesson.get(lesson.id) ?? "") ?? ""] ?? "확인 불가"}</p>
              {(staffNamesByLesson.get(lesson.id)?.length ?? 0) > 0 ? <p className="mt-2 text-sm text-[var(--muted)]">담당 · {staffNamesByLesson.get(lesson.id)?.join(", ")}</p> : null}
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
