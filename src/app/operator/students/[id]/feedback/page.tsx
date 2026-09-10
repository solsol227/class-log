import Link from "next/link";
import { notFound } from "next/navigation";
import { OperatorFeedbackList } from "@/components/feedback/operator-feedback-list";
import { requireOperatorAccess } from "@/lib/auth/operator-access";
import { parseFeedbackArchiveQuery } from "@/lib/feedback/archive-query";
import { compareOperatorFeedbackAsc, compareOperatorFeedbackDesc, loadOperatorStudentFeedback } from "@/lib/feedback/operator-feedback";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RANGE_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "1m", label: "최근 1개월" },
  { value: "3m", label: "최근 3개월" },
  { value: "6m", label: "최근 6개월" },
] as const;

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string; from?: string; to?: string; sort?: string }>;
};

function archiveHref(studentId: string, values: Record<string, string | null | undefined>) {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => { if (value) query.set(key, value); });
  return `/operator/students/${studentId}/feedback?${query.toString()}`;
}

export default async function OperatorStudentFeedbackPage({ params, searchParams }: PageProps) {
  const access = await requireOperatorAccess();
  const [{ id }, rawQuery] = await Promise.all([params, searchParams]);
  if (!UUID_PATTERN.test(id)) notFound();

  const parsed = parseFeedbackArchiveQuery(rawQuery);
  const supabase = await createSupabaseServerClient();
  const studentResult = await supabase.from("students").select("id, nickname").eq("id", id).maybeSingle();
  if (studentResult.error) throw new Error("학생 정보를 불러오지 못했습니다.", { cause: studentResult.error });
  if (!studentResult.data) notFound();

  const allFeedback = await loadOperatorStudentFeedback(supabase, studentResult.data, access);
  const filtered = allFeedback.filter((item) => {
    if (parsed.fromIso && item.startsAt < parsed.fromIso) return false;
    if (parsed.toExclusiveIso && item.startsAt >= parsed.toExclusiveIso) return false;
    return true;
  }).sort(parsed.sort === "asc" ? compareOperatorFeedbackAsc : compareOperatorFeedbackDesc);

  const queryValues = {
    range: parsed.range,
    from: parsed.range === "custom" ? parsed.from : null,
    to: parsed.range === "custom" ? parsed.to : null,
    sort: parsed.sort,
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <Link href={`/operator/students/${id}`} className="inline-flex min-h-11 items-center font-bold text-[var(--accent-strong)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">← 학생 상세로 돌아가기</Link>
      <header className="mt-5">
        <p className="text-sm font-bold text-[var(--accent-strong)]">{studentResult.data.nickname}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">전체 피드백</h1>
      </header>

      <section className="mt-7 rounded-2xl border border-[var(--line)] bg-white p-4 sm:p-5" aria-labelledby="operator-feedback-filters">
        <h2 id="operator-feedback-filters" className="text-lg font-bold">기간 · 정렬</h2>
        <nav aria-label="피드백 빠른 기간 선택" className="mt-4 flex flex-wrap gap-2">
          {RANGE_OPTIONS.map((option) => (
            <Link key={option.value} href={archiveHref(id, { ...queryValues, range: option.value, from: null, to: null })} aria-current={parsed.range === option.value ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-xl border px-4 font-bold ${parsed.range === option.value ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--line)]"}`}>{option.label}</Link>
          ))}
        </nav>

        <form method="get" className="mt-5 grid gap-3 border-t border-[var(--line)] pt-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <input type="hidden" name="range" value="custom" />
          <input type="hidden" name="sort" value={parsed.sort} />
          <label className="grid gap-2 text-sm font-bold">시작일<input type="date" name="from" required defaultValue={parsed.range === "custom" ? parsed.from ?? "" : ""} className="min-h-11 rounded-xl border border-[var(--line)] px-3 font-normal" /></label>
          <label className="grid gap-2 text-sm font-bold">종료일<input type="date" name="to" required defaultValue={parsed.range === "custom" ? parsed.to ?? "" : ""} className="min-h-11 rounded-xl border border-[var(--line)] px-3 font-normal" /></label>
          <button className="min-h-11 rounded-xl border border-[var(--accent)] px-4 font-bold text-[var(--accent-strong)]">기간 적용</button>
        </form>

        <form method="get" className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <input type="hidden" name="range" value={parsed.range} />
          {parsed.range === "custom" ? <><input type="hidden" name="from" value={parsed.from ?? ""} /><input type="hidden" name="to" value={parsed.to ?? ""} /></> : null}
          <label className="grid gap-2 text-sm font-bold">정렬<select name="sort" defaultValue={parsed.sort} className="min-h-11 rounded-xl border border-[var(--line)] bg-white px-3 font-normal"><option value="desc">최신 수업순</option><option value="asc">오래된 수업순</option></select></label>
          <button className="min-h-11 rounded-xl bg-[var(--foreground)] px-4 font-bold text-white">필터 적용</button>
        </form>
      </section>

      {parsed.error ? <p role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 font-semibold text-amber-900">{parsed.error}</p> : null}

      <section className="mt-7 rounded-2xl border border-[var(--line)] bg-white p-5 sm:p-7" aria-labelledby="operator-feedback-results">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="operator-feedback-results" className="text-2xl font-bold">피드백 목록</h2><p className="text-sm font-semibold text-[var(--muted)]">{filtered.length}건</p></div>
        <OperatorFeedbackList items={filtered} emptyMessage={allFeedback.length ? "선택한 조건에 맞는 피드백이 없습니다." : "등록된 피드백이 없습니다."} />
        {!filtered.length && allFeedback.length ? <Link href={`/operator/students/${id}/feedback`} className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-[var(--accent)] px-4 font-bold text-[var(--accent-strong)]">필터 초기화</Link> : null}
      </section>
    </main>
  );
}
