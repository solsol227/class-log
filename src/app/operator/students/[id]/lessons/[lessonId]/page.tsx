import Link from "next/link";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AttendanceForm } from "./attendance-form";
import type { AttendanceStatus } from "./actions";

type LessonDetailPageProps = {
  params: Promise<{ id: string; lessonId: string }>;
  searchParams: Promise<{ created?: string; attendanceSaved?: string }>;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STATUS_LABELS: Record<string, string> = {
  scheduled: "예정",
  completed: "완료",
  cancelled: "취소",
};

const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: "출석",
  late: "지각",
  absent: "결석",
  excused: "사유결석",
};

function isAttendanceStatus(value: string): value is AttendanceStatus {
  return value in ATTENDANCE_STATUS_LABELS;
}

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
  const { created, attendanceSaved } = await searchParams;

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

  const { data: attendance, error: attendanceError } = await supabase
    .from("attendance_records")
    .select("id, status, memo, recorded_at, updated_at")
    .eq("lesson_id", lesson.id)
    .eq("student_id", lesson.student_id)
    .maybeSingle();

  if (attendanceError) {
    console.error(attendanceError);
  }

  const attendanceStatus =
    attendance && isAttendanceStatus(attendance.status)
      ? attendance.status
      : null;
  const startsAt = new Date(lesson.starts_at);
  // This Server Component evaluates once per request; the action rechecks time.
  // eslint-disable-next-line react-hooks/purity
  const requestTime = Date.now();
  const attendanceBlockedReason =
    lesson.status === "cancelled"
      ? "취소된 수업에는 출결을 등록하거나 수정할 수 없습니다."
      : Number.isNaN(startsAt.getTime())
        ? "수업 시작 시각을 확인할 수 없어 출결을 처리할 수 없습니다."
        : startsAt.getTime() > requestTime
          ? "수업 시작 시각 이후에 출결을 등록하거나 수정할 수 있습니다."
          : null;

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

      {attendanceSaved === "1" ? (
        <p
          role="status"
          className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 font-bold text-emerald-900"
        >
          출결을 저장했습니다.
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

      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-[var(--accent-strong)]">
              출결 관리
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-[-0.03em]">
              현재 출결 상태
            </h2>
          </div>
          <span className="rounded-full bg-[#e5f2f0] px-3 py-1 text-sm font-bold text-[var(--accent-strong)]">
            {attendanceStatus
              ? ATTENDANCE_STATUS_LABELS[attendanceStatus]
              : "미등록"}
          </span>
        </div>

        {attendance ? (
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-bold text-[var(--muted)]">최초 기록 시각</dt>
              <dd className="mt-1">{formatDateTime(attendance.recorded_at)}</dd>
            </div>
            <div>
              <dt className="font-bold text-[var(--muted)]">마지막 수정 시각</dt>
              <dd className="mt-1">{formatDateTime(attendance.updated_at)}</dd>
            </div>
          </dl>
        ) : null}

        {attendanceError ? (
          <p
            role="alert"
            className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 font-bold text-rose-900"
          >
            출결 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
          </p>
        ) : attendanceBlockedReason ? (
          <p className="mt-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 font-bold text-amber-950">
            {attendanceBlockedReason}
          </p>
        ) : (
          <AttendanceForm
            studentId={studentId}
            lessonId={lessonId}
            initialStatus={attendanceStatus ?? "present"}
            initialMemo={attendance?.memo ?? ""}
            hasRecord={Boolean(attendance)}
          />
        )}
      </section>
    </main>
  );
}
