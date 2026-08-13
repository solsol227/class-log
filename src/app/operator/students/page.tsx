import Link from "next/link";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function OperatorStudentsPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  await requireAuthenticatedUser("/login/operator", "operator");
  const { deleted } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const { data: students, error } = await supabase
    .from("students")
    .select("id, nickname")
    .order("nickname", { ascending: true });

  if (error) {
    throw new Error("학생 목록을 불러오지 못했습니다.", { cause: error });
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold tracking-[0.12em] text-[var(--accent-strong)]">
            클래스로그
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">
            학생 목록
          </h1>
        </div>
        <Link
          href="/operator/students/new"
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] px-4 font-bold text-white transition hover:bg-[var(--accent-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          학생 등록
        </Link>
      </header>

      {deleted === "1" ? <p role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 font-bold text-emerald-900">학생과 로그인 계정을 삭제했습니다.</p> : null}

      {students.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-[var(--line)] bg-white p-6 text-[var(--muted)]">
          등록된 학생이 없습니다.
        </p>
      ) : (
        <ul className="mt-8 space-y-3">
          {students.map((student) => (
            <li key={student.id}>
              <Link
                href={`/operator/students/${student.id}`}
                className="block rounded-2xl border border-[var(--line)] bg-white p-5 shadow-[0_16px_45px_rgba(23,64,60,0.06)] transition hover:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                <span className="block text-lg font-bold">{student.nickname}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
