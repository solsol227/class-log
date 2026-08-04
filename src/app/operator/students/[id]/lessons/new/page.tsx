import Link from "next/link";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LessonCreateForm } from "./lesson-create-form";

type LessonCreatePageProps = {
  params: Promise<{ id: string }>;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function StudentUnavailable() {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-2xl items-center px-5 py-12 sm:px-8">
      <section className="w-full rounded-2xl border border-[var(--line)] bg-white p-6 sm:p-8">
        <h1 className="text-3xl font-bold tracking-[-0.04em]">
          학생 정보를 찾을 수 없습니다.
        </h1>
        <Link
          href="/operator/students"
          className="mt-8 inline-flex min-h-12 items-center rounded-xl bg-[var(--accent)] px-5 font-bold text-white"
        >
          학생 목록으로 이동
        </Link>
      </section>
    </main>
  );
}

export default async function LessonCreatePage({
  params,
}: LessonCreatePageProps) {
  await requireAuthenticatedUser("/login/operator", "operator");

  const { id: studentId } = await params;

  if (!UUID_PATTERN.test(studentId)) {
    return <StudentUnavailable />;
  }

  const supabase = await createSupabaseServerClient();
  const { data: student, error } = await supabase
    .from("students")
    .select("id, nickname, display_name")
    .eq("id", studentId)
    .maybeSingle();

  if (error || !student) {
    if (error) {
      console.error(error);
    }
    return <StudentUnavailable />;
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8 sm:py-14">
      <Link
        href={`/operator/students/${studentId}/lessons`}
        className="font-bold text-[var(--accent-strong)] underline-offset-4 hover:underline"
      >
        수업 일정으로 이동
      </Link>

      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-6 sm:p-8">
        <p className="text-sm font-bold text-[var(--accent-strong)]">
          {student.display_name || student.nickname}
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em]">
          새 수업 등록
        </h1>
        <div className="mt-8">
          <LessonCreateForm studentId={studentId} />
        </div>
      </section>
    </main>
  );
}
