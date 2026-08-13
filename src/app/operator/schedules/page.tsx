import Link from "next/link";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const STATUS_LABELS: Record<string, string> = { scheduled: "예정", completed: "완료", cancelled: "취소" };
function formatDateTime(value: string) { return new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(value)); }

export default async function SchedulesPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  await requireAuthenticatedUser("/login/operator", "operator");
  const { deleted } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const [{ data: lessons, error }, { data: assignments, error: assignmentsError }] = await Promise.all([
    supabase.from("lessons").select("id, title, starts_at, ends_at, status").order("starts_at", { ascending: true }).order("ends_at", { ascending: true }),
    supabase.from("lesson_assignments").select("lesson_id"),
  ]);
  if (error || assignmentsError) throw new Error("일정 목록을 불러오지 못했습니다.", { cause: error ?? assignmentsError });

  const assignmentCounts = assignments.reduce<Record<string, number>>((counts, assignment) => {
    counts[assignment.lesson_id] = (counts[assignment.lesson_id] ?? 0) + 1;
    return counts;
  }, {});

  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
      {deleted === "1" ? <p role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 font-bold text-emerald-900">일정을 삭제했습니다.</p> : null}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm font-bold tracking-[0.12em] text-[var(--accent-strong)]">일정 관리</p><h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">공통 수업 일정</h1></div>
        <Link href="/operator/schedules/new" className="inline-flex min-h-11 items-center rounded-xl bg-[var(--accent)] px-4 font-bold text-white hover:bg-[var(--accent-strong)]">새 일정 등록</Link>
      </header>
      {lessons.length === 0 ? (
        <section className="mt-8 rounded-2xl border border-[var(--line)] bg-white p-6 sm:p-8"><p className="font-bold">등록된 일정이 없습니다.</p><Link href="/operator/schedules/new" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-[var(--accent)] px-4 font-bold text-white">새 일정 등록</Link></section>
      ) : (
        <ul className="mt-8 space-y-3">{lessons.map((lesson) => <li key={lesson.id}><Link href={`/operator/schedules/${lesson.id}`} className="block rounded-2xl border border-[var(--line)] bg-white p-5 transition hover:border-[var(--accent)]"><span className="flex flex-wrap items-center justify-between gap-3"><span className="text-lg font-bold">{lesson.title}</span><span className="rounded-full bg-[#e5f2f0] px-3 py-1 text-sm font-bold text-[var(--accent-strong)]">{STATUS_LABELS[lesson.status] ?? lesson.status}</span></span><span className="mt-3 block text-sm text-[var(--muted)]">{formatDateTime(lesson.starts_at)} – {formatDateTime(lesson.ends_at)}</span><span className="mt-2 block text-sm font-bold text-[var(--accent-strong)]">배정 학생 {assignmentCounts[lesson.id] ?? 0}명</span></Link></li>)}</ul>
      )}
    </main>
  );
}
