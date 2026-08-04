import Link from "next/link";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type OperatorStudentDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function StudentNotFound() {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-2xl items-center px-5 py-12 sm:px-8">
      <section className="w-full rounded-2xl border border-[var(--line)] bg-white p-6 shadow-[0_24px_70px_rgba(23,64,60,0.09)] sm:p-8">
        <h1 className="text-3xl font-bold tracking-[-0.04em] sm:text-4xl">
          학생 정보를 찾을 수 없습니다.
        </h1>
        <Link
          href="/operator/students"
          className="mt-8 inline-flex min-h-12 items-center justify-center rounded-xl bg-[var(--accent)] px-5 font-bold text-white transition hover:bg-[var(--accent-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          학생 목록으로 이동
        </Link>
      </section>
    </main>
  );
}

function formatCreatedAt(createdAt: string) {
  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) {
    return "확인할 수 없음";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(date);
}

function formatPlanMonth(month: string) {
  const [year, monthNumber] = month.split("-");
  return `${year}년 ${Number(monthNumber)}월`;
}

const PLAN_STATUS_LABELS: Record<string, string> = {
  draft: "초안",
  published: "게시됨",
  completed: "완료",
};

export default async function OperatorStudentDetailPage({
  params,
  searchParams,
}: OperatorStudentDetailPageProps) {
  await requireAuthenticatedUser("/login/operator", "operator");

  const { id } = await params;
  const { created } = await searchParams;

  if (!UUID_PATTERN.test(id)) {
    return <StudentNotFound />;
  }

  const supabase = await createSupabaseServerClient();
  const { data: student, error } = await supabase
    .from("students")
    .select("id, nickname, display_name, created_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error(error);
    return <StudentNotFound />;
  }

  if (!student) {
    return <StudentNotFound />;
  }

  const { data: plans, error: plansError } = await supabase
    .from("monthly_activity_plans")
    .select("id, month, title, status")
    .eq("student_id", id)
    .order("month", { ascending: false });

  if (plansError) {
    console.error(plansError);
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8 sm:py-14">
      <Link
        href="/operator/students"
        className="font-bold text-[var(--accent-strong)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        학생 목록
      </Link>

      {created === "1" ? (
        <p
          role="status"
          className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 font-bold text-emerald-900"
        >
          학생이 등록되었습니다.
        </p>
      ) : null}

      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-6 shadow-[0_24px_70px_rgba(23,64,60,0.09)] sm:p-8">
        <p className="text-sm font-bold tracking-[0.12em] text-[var(--accent-strong)]">
          학생 정보
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">
          {student.display_name || student.nickname}
        </h1>
        <dl className="mt-8 space-y-5">
          <div>
            <dt className="text-sm font-bold text-[var(--muted)]">닉네임</dt>
            <dd className="mt-1 text-lg">{student.nickname}</dd>
          </div>
          <div>
            <dt className="text-sm font-bold text-[var(--muted)]">등록일</dt>
            <dd className="mt-1 text-lg">
              {formatCreatedAt(student.created_at)}
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-6 shadow-[0_24px_70px_rgba(23,64,60,0.09)] sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-2xl font-bold">월간 활동 계획</h2>
          <Link
            href={`/operator/students/${id}/plans/new`}
            className="inline-flex min-h-11 items-center rounded-xl bg-[var(--accent)] px-4 font-bold text-white hover:bg-[var(--accent-strong)]"
          >
            새 월간 계획 만들기
          </Link>
        </div>

        {plansError ? (
          <p role="alert" className="mt-5 text-[var(--muted)]">월간 활동 계획을 불러오지 못했습니다.</p>
        ) : plans.length === 0 ? (
          <p className="mt-5 text-[var(--muted)]">아직 등록된 월간 활동 계획이 없습니다.</p>
        ) : (
          <ul className="mt-5 space-y-3">
            {plans.map((plan) => (
              <li key={plan.id}>
                <Link
                  href={`/operator/students/${id}/plans/${plan.id}`}
                  className="block rounded-xl border border-[var(--line)] p-4 hover:border-[var(--accent)]"
                >
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold">{plan.title}</span>
                    <span className="text-sm font-bold text-[var(--accent-strong)]">{PLAN_STATUS_LABELS[plan.status] ?? plan.status}</span>
                  </span>
                  <span className="mt-2 block text-sm text-[var(--muted)]">{formatPlanMonth(plan.month)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
