import Link from "next/link";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const STATUS_LABELS: Record<string, string> = {
  published: "게시됨",
  completed: "완료",
};

function formatMonth(month: string) {
  const [year, monthNumber] = month.split("-");
  return `${year}년 ${Number(monthNumber)}월`;
}

export default async function StudentPlansPage() {
  await requireAuthenticatedUser("/login/student", "student");

  const supabase = await createSupabaseServerClient();
  const { data: plans, error } = await supabase
    .from("monthly_activity_plans")
    .select("id, month, title, status")
    .order("month", { ascending: false });

  if (error) {
    console.error(error);
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <Link
        href="/student"
        className="font-bold text-[var(--accent-strong)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        학생 홈으로 이동
      </Link>

      <header className="mt-6">
        <p className="text-sm font-bold tracking-[0.12em] text-[var(--accent-strong)]">
          클래스로그
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">
          내 월간 계획
        </h1>
      </header>

      {error ? (
        <p
          role="alert"
          className="mt-8 rounded-2xl border border-[var(--line)] bg-white p-6 text-[var(--muted)]"
        >
          월간 활동 계획을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
        </p>
      ) : plans.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-[var(--line)] bg-white p-6 text-[var(--muted)]">
          아직 게시된 월간 계획이 없습니다.
        </p>
      ) : (
        <ul className="mt-8 space-y-3">
          {plans.map((plan) => (
            <li key={plan.id}>
              <Link
                href={`/student/plans/${plan.id}`}
                className="block rounded-2xl border border-[var(--line)] bg-white p-5 shadow-[0_16px_45px_rgba(23,64,60,0.06)] transition hover:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                <span className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-lg font-bold">{plan.title}</span>
                  <span className="rounded-full bg-[#e5f2f0] px-3 py-1 text-sm font-bold text-[var(--accent-strong)]">
                    {STATUS_LABELS[plan.status] ?? plan.status}
                  </span>
                </span>
                <span className="mt-2 block text-sm text-[var(--muted)]">
                  {formatMonth(plan.month)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
