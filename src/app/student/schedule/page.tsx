import Link from "next/link";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type StudentSchedulePageProps = {
  searchParams: Promise<{ month?: string }>;
};

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const STATUS_LABELS: Record<string, string> = {
  scheduled: "예정",
  completed: "완료",
  cancelled: "취소",
};

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

export default async function StudentSchedulePage({ searchParams }: StudentSchedulePageProps) {
  await requireAuthenticatedUser("/login/student", "student");
  const { month } = await searchParams;
  const selectedMonth = month && MONTH_PATTERN.test(month) ? month : null;
  const supabase = await createSupabaseServerClient();
  const { data: assignments, error: assignmentError } = await supabase
    .from("lesson_assignments")
    .select("lesson_id");

  if (assignmentError) {
    throw new Error("배정된 일정을 불러오지 못했습니다.", { cause: assignmentError });
  }

  const lessonIds = assignments.map((assignment) => assignment.lesson_id);
  const { data: lessons, error: lessonsError } = lessonIds.length
    ? await supabase
        .from("lessons")
        .select("id, title, starts_at, ends_at, location, status")
        .in("id", lessonIds)
        .order("starts_at", { ascending: true })
    : { data: [], error: null };

  if (lessonsError) {
    throw new Error("배정된 일정을 불러오지 못했습니다.", { cause: lessonsError });
  }

  const months = [...new Set(lessons.map((lesson) => monthKey(lesson.starts_at)).filter(Boolean))];
  const years = new Set(months.map((key) => key.slice(0, 4)));
  const visibleLessons = selectedMonth
    ? lessons.filter((lesson) => monthKey(lesson.starts_at) === selectedMonth)
    : lessons;

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <header>
        <p className="text-sm font-bold tracking-[0.12em] text-[var(--accent-strong)]">클래스로그</p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">내 일정</h1>
      </header>

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
                <span className="rounded-lg bg-[#e5f2f0] px-3 py-1 text-sm font-bold text-[var(--accent-strong)]">{STATUS_LABELS[lesson.status] ?? lesson.status}</span>
              </div>
              {lesson.location ? <p className="mt-3 text-sm text-[var(--muted)]">장소: {lesson.location}</p> : null}
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
