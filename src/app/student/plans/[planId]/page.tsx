import Link from "next/link";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type StudentPlanDetailPageProps = {
  params: Promise<{ planId: string }>;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STATUS_LABELS: Record<string, string> = {
  published: "게시됨",
  completed: "완료",
};

function formatMonth(month: string) {
  const [year, monthNumber] = month.split("-");
  return `${year}년 ${Number(monthNumber)}월`;
}

function PlanUnavailable() {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-2xl items-center px-5 py-12 sm:px-8">
      <section className="w-full rounded-2xl border border-[var(--line)] bg-white p-6 shadow-[0_24px_70px_rgba(23,64,60,0.09)] sm:p-8">
        <h1 className="text-3xl font-bold tracking-[-0.04em] sm:text-4xl">
          월간 활동 계획을 찾을 수 없습니다.
        </h1>
        <Link
          href="/student/plans"
          className="mt-8 inline-flex min-h-12 items-center rounded-xl bg-[var(--accent)] px-5 font-bold text-white transition hover:bg-[var(--accent-strong)]"
        >
          월간 계획 목록으로 이동
        </Link>
      </section>
    </main>
  );
}

export default async function StudentPlanDetailPage({
  params,
}: StudentPlanDetailPageProps) {
  await requireAuthenticatedUser("/login/student", "student");

  const { planId } = await params;

  if (!UUID_PATTERN.test(planId)) {
    return <PlanUnavailable />;
  }

  const supabase = await createSupabaseServerClient();
  const { data: plan, error: planError } = await supabase
    .from("monthly_activity_plans")
    .select("id, student_id, month, title, summary, status")
    .eq("id", planId)
    .maybeSingle();

  if (planError || !plan) {
    if (planError) {
      console.error(planError);
    }
    return <PlanUnavailable />;
  }

  const { data: items, error: itemsError } = await supabase
    .from("monthly_activity_items")
    .select("id, title, description, position")
    .eq("plan_id", planId)
    .eq("student_id", plan.student_id)
    .order("position", { ascending: true });

  if (itemsError) {
    console.error(itemsError);
    return <PlanUnavailable />;
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <Link
        href="/student/plans"
        className="font-bold text-[var(--accent-strong)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        월간 계획 목록으로 이동
      </Link>

      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-6 shadow-[0_24px_70px_rgba(23,64,60,0.09)] sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-bold text-[var(--accent-strong)]">
            {formatMonth(plan.month)}
          </p>
          <span className="rounded-full bg-[#e5f2f0] px-3 py-1 text-sm font-bold text-[var(--accent-strong)]">
            {STATUS_LABELS[plan.status] ?? plan.status}
          </span>
        </div>
        <h1 className="mt-4 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">
          {plan.title}
        </h1>
        <p className="mt-4 leading-7 text-[var(--muted)]">
          {plan.summary || "요약이 없습니다."}
        </p>
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-6 shadow-[0_24px_70px_rgba(23,64,60,0.09)] sm:p-8">
        <h2 className="text-2xl font-bold">활동 항목</h2>
        {items.length === 0 ? (
          <p className="mt-5 text-[var(--muted)]">등록된 활동 항목이 없습니다.</p>
        ) : (
          <ol className="mt-5 space-y-3">
            {items.map((item) => (
              <li key={item.id} className="rounded-xl border border-[var(--line)] p-4">
                <p className="font-bold">
                  {item.position + 1}. {item.title}
                </p>
                {item.description ? (
                  <p className="mt-2 leading-6 text-[var(--muted)]">
                    {item.description}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
