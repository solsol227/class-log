import Link from "next/link";
import { OperatorFeedbackList } from "@/components/feedback/operator-feedback-list";
import { requireOperatorAccess } from "@/lib/auth/operator-access";
import { loadOperatorStudentFeedback } from "@/lib/feedback/operator-feedback";
import { getLessonDisplayStatusLabel } from "@/lib/lessons/display-status";
import { syncElapsedLessonStatuses } from "@/lib/lessons/sync-status";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ScheduleAssignmentPicker } from "./schedule-assignment-picker";
import { StudentProfileCard } from "./student-profile-card";
import { StudentProgramsCard } from "./student-programs-card";

type OperatorStudentDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; updated?: string; assigned?: string; allowanceUpdated?: string; allowanceError?: string }>;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
  const access = await requireOperatorAccess();
  const { id } = await params;
  const notices = await searchParams;
  if (!UUID_PATTERN.test(id)) return <StudentNotFound />;

  const supabase = await createSupabaseServerClient();
  const { data: student, error } = await supabase
    .from("students")
    .select("id, nickname, gender, age, phone, acquisition_source, joined_month, special_notes")
    .eq("id", id)
    .maybeSingle();
  if (error || !student) {
    if (error) console.error(error);
    return <StudentNotFound />;
  }

  const [{ data: assignments, error: assignmentError }, { data: allLessons, error: lessonsError }, { data: programs, error: programsError }, { data: activePrograms, error: activeProgramsError }, { data: allowanceStatuses, error: allowanceError }, { data: adjustments, error: adjustmentsError }] = await Promise.all([
    supabase.from("lesson_assignments").select("lesson_id, student_program_id").eq("student_id", id).is("unassigned_at", null),
    supabase.from("lessons").select("id, title, starts_at, ends_at, status").order("starts_at", { ascending: true }),
    supabase.from("student_program_statuses").select("student_program_id, program_type, stored_status, effective_status, started_at, ended_at, stop_reason, base_allowance_count").eq("student_id", id).order("started_at", { ascending: false }),
    supabase.from("student_programs").select("id, program_type, base_allowance_count").eq("student_id", id).eq("status", "active").not("base_allowance_count", "is", null),
    supabase.from("student_program_allowance_statuses").select("student_program_id, program_type, period_month, base_allowance_count, operator_adjustment_count, draft_count, reserved_count, used_count, remaining_count, makeup_available_count, makeup_reserved_count, makeup_used_count").eq("student_id", id),
    supabase.from("student_program_allowance_adjustments").select("id, student_program_id, target_month, delta, reason, created_at").order("created_at", { ascending: false }),
  ]);
  const assignedLessonIds = new Set(assignments?.map((assignment) => assignment.lesson_id) ?? []);
  const lessons = allLessons?.filter((lesson) => assignedLessonIds.has(lesson.id)) ?? [];
  if (assignmentError || lessonsError) console.error(assignmentError ?? lessonsError);
  if (programsError) console.error(programsError);
  if (activeProgramsError) console.error(activeProgramsError);
  if (allowanceError || adjustmentsError) console.error(allowanceError ?? adjustmentsError);
  if (access.isOwner && !lessonsError && allLessons) {
    await syncElapsedLessonStatuses(supabase, allLessons.map((lesson) => lesson.id));
  }
  const recentFeedback = (await loadOperatorStudentFeedback(supabase, student, access)).slice(0, 4);

  const notice = notices.created === "1"
    ? "학생이 등록되었습니다."
    : notices.updated === "1"
      ? "학생정보와 이용프로그램을 저장했습니다."
      : notices.assigned === "1"
        ? "일정을 배정했습니다."
      : notices.allowanceUpdated === "1"
        ? "이용 횟수 설정을 저장했습니다."
      : null;

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <Link href="/operator/students" className="font-bold text-[var(--accent-strong)] underline-offset-4 hover:underline">학생 목록</Link>
      {notice ? <p role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 font-bold text-emerald-900">{notice}</p> : null}

      <div className="mt-6">
      <StudentProfileCard canManage={access.canManageStudents} student={{
          id: student.id,
          name: student.nickname,
          gender: student.gender,
          age: student.age,
          phone: student.phone,
          acquisitionSource: student.acquisition_source,
          joinedMonth: student.joined_month,
          specialNotes: student.special_notes,
        }} />
      </div>

      <div className="mt-6">
        {notices.allowanceError === "1" ? <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-3 font-bold text-rose-900">이용 횟수를 저장하지 못했습니다. 현재 사용량과 입력값을 확인해 주세요.</p> : null}
        {allowanceError ? <p role="alert" className="mb-4 text-[var(--muted)]">이용 횟수를 불러오지 못했습니다.</p> : null}
        <StudentProgramsCard
          studentId={id}
          canManage={access.canManageStudentPrograms}
          programs={(programs ?? []).map((program) => ({ id: program.student_program_id, programType: program.program_type, storedStatus: program.stored_status, effectiveStatus: program.effective_status, startedAt: program.started_at, endedAt: program.ended_at, stopReason: program.stop_reason, baseAllowanceCount: program.base_allowance_count }))}
          allowanceStatuses={(allowanceStatuses ?? []).map((status) => ({ studentProgramId: status.student_program_id, programType: status.program_type, periodMonth: status.period_month, baseAllowanceCount: status.base_allowance_count, operatorAdjustmentCount: status.operator_adjustment_count, draftCount: status.draft_count, reservedCount: status.reserved_count, usedCount: status.used_count, remainingCount: status.remaining_count, makeupAvailableCount: status.makeup_available_count, makeupReservedCount: status.makeup_reserved_count, makeupUsedCount: status.makeup_used_count }))}
          adjustments={(adjustments ?? []).filter((item) => (programs ?? []).some((program) => program.student_program_id === item.student_program_id)).map((item) => ({ id: item.id, studentProgramId: item.student_program_id, targetMonth: item.target_month, delta: item.delta, reason: item.reason, createdAt: item.created_at }))}
        />
      </div>

      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-6 sm:p-8" aria-labelledby="recent-feedback-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="recent-feedback-heading" className="text-2xl font-bold">최근 피드백</h2>
          <Link href={`/operator/students/${id}/feedback`} className="inline-flex min-h-11 items-center rounded-xl border border-[var(--accent)] px-4 font-bold text-[var(--accent-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">전체 피드백 보기</Link>
        </div>
        <OperatorFeedbackList items={recentFeedback} emptyMessage="등록된 피드백이 없습니다." />
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-6 sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-bold">배정된 일정</h2>
          {access.canManageAssignments && !lessonsError && !activeProgramsError && allLessons && allLessons.length > 0 && activePrograms?.length ? <ScheduleAssignmentPicker studentId={id} schedules={allLessons.filter((lesson) => lesson.status !== "cancelled" && !assignedLessonIds.has(lesson.id)).map((lesson) => ({ value: lesson.id, label: lesson.title, detail: formatDateTime(lesson.starts_at) }))} programs={activePrograms.map((program) => ({ value: program.id, label: ({ weekday_vocal: "평일보컬", weekend_vocal: "주말보컬", trial: "체험", rental: "대여" } as Record<string, string>)[program.program_type] ?? program.program_type }))} /> : null}
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
                  <span className="flex flex-wrap items-center justify-between gap-2"><span className="font-bold">{lesson.title}</span><span className="text-sm font-bold text-[var(--accent-strong)]">{getLessonDisplayStatusLabel(lesson.status, lesson.ends_at)}</span></span>
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
