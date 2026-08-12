import Link from "next/link";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function OperatorStudentsPage() {
  await requireAuthenticatedUser("/login/operator", "operator");

  const supabase = await createSupabaseServerClient();
  const { data: students, error } = await supabase
    .from("students")
    .select("id, nickname, display_name")
    .order("nickname", { ascending: true });

  if (error) {
    throw new Error("학생 목록을 불러오지 못했습니다.", { cause: error });
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <header>
        <p className="text-sm font-bold tracking-[0.12em] text-[var(--accent-strong)]">
          클래스로그
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">
          학생 목록
        </h1>
      </header>

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
                <span className="block text-lg font-bold">
                  {student.display_name || student.nickname}
                </span>
                <span className="mt-1 block text-sm text-[var(--muted)]">
                  닉네임: {student.nickname}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
