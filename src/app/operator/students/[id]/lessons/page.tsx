import Link from "next/link";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type LessonsPageProps = {
  params: Promise<{ id: string }>;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STATUS_LABELS: Record<string, string> = {
  scheduled: "예정",
  completed: "완료",
  cancelled: "취소",
};

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "확인할 수 없음";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(date);
}

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

export default async function LessonsPage({ params }: LessonsPageProps) {
  await requireAuthenticatedUser("/login/operator", "operator");

  const { id: studentId } = await params;

  if (!UUID_PATTERN.test(studentId)) {
    return <StudentUnavailable />;
  }

  const supabase = await createSupabaseServerClient();
  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id, nickname, display_name")
    .eq("id", studentId)
    .maybeSingle();

  if (studentError || !student) {
    if (studentError) {
      console.error(studentError);
    }
    return <StudentUnavailable />;
  }

  const { data: lessons, error: lessonsError } = await supabase
    .from("lessons")
    .select("id, title, starts_at, ends_at, status")
    .eq("student_id", studentId)
    .order("starts_at", { ascending: true });

  if (lessonsError) {
    console.error(lessonsError);
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <Link
        href={`/operator/students/${studentId}`}
        className="font-bold text-[var(--accent-strong)] underline-offset-4 hover:underline"
      >
        학생 상세로 이동
      </Link>

      <header className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-[var(--accent-strong)]">
            {student.display_name || student.nickname}
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">
            수업 일정
          </h1>
        </div>
        <Link
          href={`/operator/students/${studentId}/lessons/new`}
          className="inline-flex min-h-11 items-center rounded-xl bg-[var(--accent)] px-4 font-bold text-white hover:bg-[var(--accent-strong)]"
        >
          새 수업 등록
        </Link>
      </header>

      {lessonsError ? (
        <p
          role="alert"
          className="mt-8 rounded-2xl border border-[var(--line)] bg-white p-6 text-[var(--muted)]"
        >
          수업 일정을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
        </p>
      ) : lessons.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-[var(--line)] bg-white p-6 text-[var(--muted)]">
          아직 등록된 수업이 없습니다.
        </p>
      ) : (
        <ul className="mt-8 space-y-3">
          {lessons.map((lesson) => (
            <li key={lesson.id}>
              <Link
                href={`/operator/students/${studentId}/lessons/${lesson.id}`}
                className="block rounded-2xl border border-[var(--line)] bg-white p-5 transition hover:border-[var(--accent)]"
              >
                <span className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-lg font-bold">{lesson.title}</span>
                  <span className="rounded-full bg-[#e5f2f0] px-3 py-1 text-sm font-bold text-[var(--accent-strong)]">
                    {STATUS_LABELS[lesson.status] ?? lesson.status}
                  </span>
                </span>
                <span className="mt-3 block text-sm text-[var(--muted)]">
                  {formatDateTime(lesson.starts_at)} – {formatDateTime(lesson.ends_at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
