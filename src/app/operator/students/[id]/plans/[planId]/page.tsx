import Link from "next/link";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ActivityItemsForm, PublishPlanForm } from "./plan-actions-forms";

type PlanDetailPageProps = {
  params: Promise<{ id: string; planId: string }>;
  searchParams: Promise<{
    created?: string;
    itemsAdded?: string;
    published?: string;
  }>;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STATUS_LABELS: Record<string, string> = {
  draft: "초안",
  published: "게시됨",
  completed: "완료",
};

function formatMonth(month: string) {
  const [year, monthNumber] = month.split("-");
  return `${year}년 ${Number(monthNumber)}월`;
}

function PlanUnavailable({ studentId }: { studentId?: string }) {
  const href = studentId && UUID_PATTERN.test(studentId)
    ? `/operator/students/${studentId}`
    : "/operator/students";

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-2xl items-center px-5 py-12 sm:px-8">
      <section className="w-full rounded-2xl border border-[var(--line)] bg-white p-6 sm:p-8">
        <h1 className="text-3xl font-bold tracking-[-0.04em]">월간 활동 계획을 찾을 수 없습니다.</h1>
        <Link href={href} className="mt-8 inline-flex min-h-12 items-center rounded-xl bg-[var(--accent)] px-5 font-bold text-white">
          이전 화면으로 이동
        </Link>
      </section>
    </main>
  );
}

export default async function PlanDetailPage({
  params,
  searchParams,
}: PlanDetailPageProps) {
  await requireAuthenticatedUser("/login/operator", "operator");

  const { id: studentId, planId } = await params;
  const notices = await searchParams;

  if (!UUID_PATTERN.test(studentId) || !UUID_PATTERN.test(planId)) {
    return <PlanUnavailable studentId={studentId} />;
  }

  const supabase = await createSupabaseServerClient();
  const { data: plan, error: planError } = await supabase
    .from("monthly_activity_plans")
    .select("id, student_id, month, title, summary, status")
    .eq("id", planId)
    .eq("student_id", studentId)
    .maybeSingle();

  if (planError || !plan) {
    if (planError) {
      console.error(planError);
    }
    return <PlanUnavailable studentId={studentId} />;
  }

  const { data: items, error: itemsError } = await supabase
    .from("monthly_activity_items")
    .select("id, title, description, position")
    .eq("plan_id", planId)
    .eq("student_id", studentId)
    .order("position", { ascending: true });

  if (itemsError) {
    console.error(itemsError);
    return <PlanUnavailable studentId={studentId} />;
  }

  const successMessage = notices.created === "1"
    ? "월간 활동 계획을 만들었습니다."
    : notices.itemsAdded === "1"
      ? "활동 항목을 등록했습니다."
      : notices.published === "1"
        ? "월간 활동 계획을 게시했습니다."
        : null;

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <Link href={`/operator/students/${studentId}`} className="font-bold text-[var(--accent-strong)] underline-offset-4 hover:underline">
        학생 상세로 이동
      </Link>

      {successMessage ? (
        <p role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 font-bold text-emerald-900">
          {successMessage}
        </p>
      ) : null}

      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-bold text-[var(--accent-strong)]">{formatMonth(plan.month)}</p>
          <span className="rounded-full bg-[#e5f2f0] px-3 py-1 text-sm font-bold text-[var(--accent-strong)]">
            {STATUS_LABELS[plan.status] ?? plan.status}
          </span>
        </div>
        <h1 className="mt-4 text-3xl font-bold tracking-[-0.04em]">{plan.title}</h1>
        <p className="mt-4 leading-7 text-[var(--muted)]">{plan.summary || "요약이 없습니다."}</p>

        {plan.status === "draft" ? (
          <PublishPlanForm studentId={studentId} planId={planId} />
        ) : null}
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-6 sm:p-8">
        <h2 className="text-2xl font-bold">활동 항목</h2>
        {items.length === 0 ? (
          <p className="mt-5 text-[var(--muted)]">아직 등록된 활동 항목이 없습니다.</p>
        ) : (
          <ol className="mt-5 space-y-3">
            {items.map((item) => (
              <li key={item.id} className="rounded-xl border border-[var(--line)] p-4">
                <p className="font-bold">{item.position + 1}. {item.title}</p>
                {item.description ? <p className="mt-2 leading-6 text-[var(--muted)]">{item.description}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      {plan.status === "draft" ? (
        <section className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-6 sm:p-8">
          <h2 className="text-2xl font-bold">활동 항목 추가</h2>
          <ActivityItemsForm studentId={studentId} planId={planId} />
        </section>
      ) : null}
    </main>
  );
}
