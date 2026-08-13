import Link from "next/link";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ScheduleAssignmentPicker } from "./schedule-assignment-picker";
import { StudentProfileCard } from "./student-profile-card";

type OperatorStudentDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; updated?: string; assigned?: string }>;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUS_LABELS: Record<string, string> = {
  scheduled: "예정",
  completed: "완료",
  cancelled: "취소",
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function StudentNotFound() {
  return (
    <main className="mx-auto flex min-h-[70dvh] w-full max-w-2xl items-center px-5 py-12 sm:px-8">
      <section className="w-full rounded-2xl border border-[var(--line)] bg-white p-6 sm:p-8">
        <h1 className="text-3xl font-bold tracking-[-0.04em]">학생 정보를 찾을 수 없습니다.</h1>
        <Link href="/operator/students" className="mt-8 inline-flex min-h-12 items-center rounded-xl bg-[var(--accent)] px-5 font-bold text-white">학생 목록으로 이동</Link>
      </section>
    </main>
  );
}

export default async function OperatorStudentDetailPage({ params, searchParams }: OperatorStudentDetailPageProps) {
  await requireAuthenticatedUser("/login/operator", "operator");
  const { id } = await params;
  const notices = await searchParams;
  if (!UUID_PATTERN.test(id)) return <StudentNotFound />;

  const supabase = await createSupabaseServerClient();
  const { data: student, error } = await supabase
    .from("students")
    .select("id, nickname, gender, age, phone, acquisition_source, category, joined_month, special_notes")
    .eq("id", id)
    .maybeSingle();
  if (error || !student) {
    if (error) console.error(error);
    return <StudentNotFound />;
  }

  const [{ data: assignments, error: assignmentError }, { data: allLessons, error: lessonsError }] = await Promise.all([
    supabase.from("lesson_assignments").select("lesson_id").eq("student_id", id),
    supabase.from("lessons").select("id, title, starts_at, ends_at, status").order("starts_at", { ascending: true }),
  ]);
  const assignedLessonIds = new Set(assignments?.map((assignment) => assignment.lesson_id) ?? []);
  const lessons = allLessons?.filter((lesson) => assignedLessonIds.has(lesson.id)) ?? [];
  if (assignmentError || lessonsError) console.error(assignmentError ?? lessonsError);

  const notice = notices.created === "1"
    ? "학생이 등록되었습니다."
    : notices.updated === "1"
      ? "학생 정보를 수정했습니다."
      : notices.assigned === "1"
        ? "일정을 배정했습니다."
      : null;

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <Link href="/operator/students" className="font-bold text-[var(--accent-strong)] underline-offset-4 hover:underline">학생 목록</Link>
      {notice ? <p role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 font-bold text-emerald-900">{notice}</p> : null}

      <div className="mt-6">
        <StudentProfileCard student={{
          id: student.id,
          name: student.nickname,
          gender: student.gender,
          age: student.age,
          phone: student.phone,
          acquisitionSource: student.acquisition_source,
          category: student.category,
          joinedMonth: student.joined_month,
          specialNotes: student.special_notes,
        }} />
      </div>

      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-6 sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-bold">배정된 일정</h2>
          {!lessonsError && allLessons && allLessons.length > 0 ? <ScheduleAssignmentPicker studentId={id} schedules={allLessons.filter((lesson) => lesson.status !== "cancelled").map((lesson) => ({ value: lesson.id, label: lesson.title, detail: formatDateTime(lesson.starts_at), disabled: assignedLessonIds.has(lesson.id) || lesson.status !== "scheduled", disabledLabel: assignedLessonIds.has(lesson.id) ? "배정됨" : "완료" }))} /> : null}
        </div>
        {assignmentError || lessonsError ? (
          <p role="alert" className="mt-5 text-[var(--muted)]">배정된 일정을 불러오지 못했습니다.</p>
        ) : lessons.length === 0 ? (
          <p className="mt-5 text-[var(--muted)]">아직 배정된 일정이 없습니다.</p>
        ) : (
          <ul className="mt-5 space-y-3">
            {lessons.map((lesson) => (
              <li key={lesson.id}>
                <Link href={`/operator/schedules/${lesson.id}`} className="block rounded-xl border border-[var(--line)] p-4 transition hover:border-[var(--accent)]">
                  <span className="flex flex-wrap items-center justify-between gap-2"><span className="font-bold">{lesson.title}</span><span className="text-sm font-bold text-[var(--accent-strong)]">{STATUS_LABELS[lesson.status] ?? lesson.status}</span></span>
                  <span className="mt-2 block text-sm text-[var(--muted)]">{formatDateTime(lesson.starts_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
