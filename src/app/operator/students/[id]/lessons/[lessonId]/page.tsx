import Link from "next/link";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type LessonDetailPageProps = {
  params: Promise<{ id: string; lessonId: string }>;
  searchParams: Promise<{ created?: string }>;
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

function LessonUnavailable({ studentId }: { studentId?: string }) {
  const href = studentId && UUID_PATTERN.test(studentId)
    ? `/operator/students/${studentId}/lessons`
    : "/operator/students";

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-2xl items-center px-5 py-12 sm:px-8">
      <section className="w-full rounded-2xl border border-[var(--line)] bg-white p-6 sm:p-8">
        <h1 className="text-3xl font-bold tracking-[-0.04em]">
          수업을 찾을 수 없습니다.
        </h1>
        <Link
          href={href}
          className="mt-8 inline-flex min-h-12 items-center rounded-xl bg-[var(--accent)] px-5 font-bold text-white"
        >
          이전 화면으로 이동
        </Link>
      </section>
    </main>
  );
}

export default async function LessonDetailPage({
  params,
  searchParams,
}: LessonDetailPageProps) {
  await requireAuthenticatedUser("/login/operator", "operator");

  const { id: studentId, lessonId } = await params;
  const { created } = await searchParams;

  if (!UUID_PATTERN.test(studentId) || !UUID_PATTERN.test(lessonId)) {
    return <LessonUnavailable studentId={studentId} />;
  }

  const supabase = await createSupabaseServerClient();
  const { data: lesson, error } = await supabase
    .from("lessons")
    .select("id, student_id, title, starts_at, ends_at, location, notes, status")
    .eq("id", lessonId)
    .eq("student_id", studentId)
    .maybeSingle();

  if (error || !lesson) {
    if (error) {
      console.error(error);
    }
    return <LessonUnavailable studentId={studentId} />;
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8 sm:py-14">
      <Link
        href={`/operator/students/${studentId}/lessons`}
        className="font-bold text-[var(--accent-strong)] underline-offset-4 hover:underline"
      >
        수업 일정으로 이동
      </Link>

      {created === "1" ? (
        <p
          role="status"
          className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 font-bold text-emerald-900"
        >
          수업을 등록했습니다.
        </p>
      ) : null}

      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-bold text-[var(--accent-strong)]">수업 정보</p>
          <span className="rounded-full bg-[#e5f2f0] px-3 py-1 text-sm font-bold text-[var(--accent-strong)]">
            {STATUS_LABELS[lesson.status] ?? lesson.status}
          </span>
        </div>
        <h1 className="mt-4 text-3xl font-bold tracking-[-0.04em]">
          {lesson.title}
        </h1>
        <dl className="mt-8 space-y-5">
          <div>
            <dt className="text-sm font-bold text-[var(--muted)]">시작 시각</dt>
            <dd className="mt-1 text-lg">{formatDateTime(lesson.starts_at)}</dd>
          </div>
          <div>
            <dt className="text-sm font-bold text-[var(--muted)]">종료 시각</dt>
            <dd className="mt-1 text-lg">{formatDateTime(lesson.ends_at)}</dd>
          </div>
          <div>
            <dt className="text-sm font-bold text-[var(--muted)]">장소</dt>
            <dd className="mt-1 text-lg">{lesson.location || "등록된 장소가 없습니다."}</dd>
          </div>
          <div>
            <dt className="text-sm font-bold text-[var(--muted)]">메모</dt>
            <dd className="mt-1 whitespace-pre-wrap leading-7">{lesson.notes || "등록된 메모가 없습니다."}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
