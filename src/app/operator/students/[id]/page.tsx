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
    </main>
  );
}
