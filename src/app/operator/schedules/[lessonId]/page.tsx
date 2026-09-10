import Link from "next/link";
import { requireOperatorAccess } from "@/lib/auth/operator-access";
import { getLessonDisplayStatusLabel } from "@/lib/lessons/display-status";
import { syncElapsedLessonStatuses } from "@/lib/lessons/sync-status";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AttendanceStatus } from "../actions";
import { ScheduleDashboard } from "./schedule-dashboard";
import { updateLessonStaff } from "../actions";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ATTENDANCE_STATUSES = new Set<AttendanceStatus>(["present", "absent", "excused"]);

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeZone: "Asia/Seoul" }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" }).format(new Date(value));
}

function toScheduleInput(value: string) {
  const formatted = new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" }).format(new Date(value));
  const [date, time] = formatted.split(" ");
  return { date, time };
}

function hasNotStarted(startsAt: string) {
  return new Date(startsAt).getTime() > Date.now();
}

function ScheduleUnavailable() {
  return <main className="mx-auto flex min-h-[100dvh] w-full max-w-2xl items-center px-5 py-12 sm:px-8"><section className="w-full rounded-2xl border border-[var(--line)] bg-white p-6 sm:p-8"><h1 className="text-3xl font-bold">일정을 찾을 수 없습니다.</h1><Link href="/operator/schedules" className="mt-8 inline-flex min-h-12 items-center rounded-xl bg-[var(--accent)] px-5 font-bold text-white">일정 목록</Link></section></main>;
}

export default async function ScheduleDetailPage({ params, searchParams }: { params: Promise<{ lessonId: string }>; searchParams: Promise<{ created?: string; updated?: string; assigned?: string; unassigned?: string; attendanceSaved?: string; staffUpdated?: string; staffError?: string; feedbackError?: string }> }) {
  const access = await requireOperatorAccess();
  const { lessonId } = await params;
  const notices = await searchParams;
  if (!UUID_PATTERN.test(lessonId)) return <ScheduleUnavailable />;

  const supabase = await createSupabaseServerClient();
  const categorizedLessonResult = await supabase.from("lessons").select("id, title, starts_at, ends_at, location, notes, status, schedule_category").eq("id", lessonId).maybeSingle();
  const legacyLessonResult = categorizedLessonResult.error?.code === "42703"
    ? await supabase.from("lessons").select("id, title, starts_at, ends_at, location, notes, status").eq("id", lessonId).maybeSingle()
    : null;
  const lesson = categorizedLessonResult.data
    ?? (legacyLessonResult?.data ? { ...legacyLessonResult.data, schedule_category: null } : null);
  const error = categorizedLessonResult.error?.code === "42703"
    ? legacyLessonResult?.error
    : categorizedLessonResult.error;
  if (error || !lesson) {
    if (error) console.error(error);
    return <ScheduleUnavailable />;
  }
  if (access.isOwner) await syncElapsedLessonStatuses(supabase, [lesson.id]);

  const [{ data: assignments, error: assignmentsError }, { data: students, error: studentsError }, { data: attendanceRecords, error: attendanceError }, { data: programs, error: programsError }, { data: staff, error: staffError }, { data: lessonStaff, error: lessonStaffError }, { data: feedback, error: feedbackError }] = await Promise.all([
    supabase.from("lesson_assignments").select("student_id, student_program_id, assigned_at").eq("lesson_id", lessonId).is("unassigned_at", null).order("assigned_at"),
    supabase.from("students").select("id, nickname").order("nickname"),
    supabase.from("attendance_records").select("id, student_id, status").eq("lesson_id", lessonId),
    supabase.from("student_programs").select("id, student_id, program_type, status, base_allowance_count"),
    supabase.from("staff_profiles").select("id, display_name, role, is_active").order("display_name"),
    supabase.from("lesson_staff").select("staff_id, role").eq("lesson_id", lessonId),
    supabase.from("lesson_feedback").select("id, student_id, author_staff_id, body, published_at, created_at, feedback_comments(count)").eq("lesson_id", lessonId).is("deleted_at", null).is("feedback_comments.deleted_at", null).order("created_at", { ascending: false }),
  ]);
  if (assignmentsError || studentsError || attendanceError || programsError || staffError || lessonStaffError || feedbackError) {
    throw new Error("일정과 학생 정보를 불러오지 못했습니다.", { cause: assignmentsError ?? studentsError ?? attendanceError ?? programsError ?? staffError ?? lessonStaffError ?? feedbackError });
  }

  const attendanceIds = attendanceRecords.map((record) => record.id);
  const { data: linkedMakeups, error: linkedMakeupsError } = attendanceIds.length
    ? await supabase
        .from("makeup_lessons")
        .select("attendance_record_id, status")
        .in("attendance_record_id", attendanceIds)
    : { data: [], error: null };
  if (linkedMakeupsError) {
    throw new Error("출결과 연결된 보강 정보를 불러오지 못했습니다.", { cause: linkedMakeupsError });
  }

  const assignedIds = new Set(assignments.map((assignment) => assignment.student_id));
  const attendanceByStudent = new Map<string, { id: string; status: AttendanceStatus }>();
  attendanceRecords.forEach((record) => {
    if (ATTENDANCE_STATUSES.has(record.status as AttendanceStatus)) {
      attendanceByStudent.set(record.student_id, { id: record.id, status: record.status as AttendanceStatus });
    }
  });
  const makeupStatusByAttendance = new Map((linkedMakeups ?? []).map((makeup) => [makeup.attendance_record_id, makeup.status]));
  const assignedStudents = students
    .filter((student) => assignedIds.has(student.id))
    .map((student) => {
      const attendance = attendanceByStudent.get(student.id);
      const assignment = assignments.find((item) => item.student_id === student.id);
      const program = programs.find((item) => item.id === assignment?.student_program_id);
      return {
        id: student.id,
        name: student.nickname,
        studentProgramId: assignment?.student_program_id ?? "",
        programType: program?.program_type ?? "unknown",
        attendanceStatus: attendance?.status ?? null,
        makeupStatus: attendance ? makeupStatusByAttendance.get(attendance.id) ?? null : null,
      };
    });
  const staffProfiles = staff ?? [];
  const activeStaff = staffProfiles.filter((member) => member.is_active);
  const assignedStaffIds = new Set((lessonStaff ?? []).map((entry) => entry.staff_id));
  const isAssignedStaff = access.isOwner || Boolean(access.staffProfileId && assignedStaffIds.has(access.staffProfileId));
  const assignedActiveStaff = activeStaff.filter((member) => assignedStaffIds.has(member.id));
  const assignedStaffRoles = new Map((lessonStaff ?? []).map((entry) => [entry.staff_id, entry.role]));
  const staffAssignmentOptions = staffProfiles.filter((member) => member.is_active || assignedStaffIds.has(member.id));
  const staffNames = new Map(staffProfiles.map((member) => [member.id, member.display_name]));
  const feedbackByStudent = assignedStudents.map((student) => ({
    studentId: student.id,
    studentName: student.name,
    items: (feedback ?? []).filter((item) => item.student_id === student.id).map((item) => ({
      id: item.id,
      body: item.body,
      authorName: staffNames.get(item.author_staff_id) ?? "작성자 확인 불가",
      publishedAt: item.published_at,
      createdAt: item.created_at,
      commentCount: item.feedback_comments?.[0]?.count ?? 0,
    })),
  }));

  const notice = notices.created === "1"
    ? "일정을 등록했습니다."
    : notices.updated === "1"
      ? "일정이 저장되었습니다."
      : notices.assigned === "1"
        ? "학생을 배정했습니다."
        : notices.unassigned === "1"
          ? "학생 배정을 해제했습니다."
          : notices.attendanceSaved === "1"
            ? "출결을 저장했습니다."
            : notices.staffUpdated === "1"
              ? "담당직원이 저장되었습니다."
              : null;
  const errorNotice = notices.staffError === "1"
    ? "담당 직원 정보를 저장하지 못했습니다. 선택 항목을 확인해 주세요."
    : notices.feedbackError === "1"
      ? "피드백 정보를 처리하지 못했습니다. 대상과 입력 내용을 확인해 주세요."
      : null;
  const attendanceBlockedReason = lesson.status === "draft"
    ? "Draft 일정에는 출결을 저장할 수 없습니다. 일정을 먼저 확정해 주세요."
    : lesson.status === "cancelled"
    ? "취소된 일정에는 출결을 저장할 수 없습니다."
    : hasNotStarted(lesson.starts_at)
      ? "아직 시작하지 않은 일정에는 출결을 저장할 수 없습니다."
      : null;
  const startsAtInput = toScheduleInput(lesson.starts_at);
  const endsAtInput = toScheduleInput(lesson.ends_at);

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
      <nav aria-label="일정 상세 이동" className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/operator/schedules" className="font-bold text-[var(--accent-strong)] underline-offset-4 hover:underline">일정 목록</Link>
        {access.canManageSchedules ? <Link href="/operator/schedules/new" className="inline-flex min-h-11 items-center rounded-xl border border-[var(--accent)] bg-white px-4 font-bold text-[var(--accent-strong)] transition hover:bg-[#e5f2f0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">새 일정 등록</Link> : null}
      </nav>
      {notice ? <p role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 font-bold text-emerald-900">{notice}</p> : null}
      {errorNotice ? <p role="alert" className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 font-bold text-rose-900">{errorNotice}</p> : null}
      <ScheduleDashboard
        lesson={{
          id: lesson.id,
          title: lesson.title,
          category: lesson.schedule_category,
          dateInput: startsAtInput.date,
          startTimeInput: startsAtInput.time,
          endTimeInput: endsAtInput.time,
          dateLabel: formatDate(lesson.starts_at),
          timeLabel: `${formatTime(lesson.starts_at)} ~ ${formatTime(lesson.ends_at)}`,
          location: lesson.location,
          notes: lesson.notes,
          status: lesson.status,
          statusLabel: getLessonDisplayStatusLabel(lesson.status, lesson.ends_at),
        }}
        assignedStudents={assignedStudents}
        studentOptions={students.map((student) => ({ id: student.id, name: student.nickname, programs: programs.filter((program) => program.student_id === student.id && (program.status === "active" || assignments.some((assignment) => assignment.student_program_id === program.id))).map((program) => ({ id: program.id, programType: program.program_type, status: program.status, allowanceConfigured: program.base_allowance_count !== null })) }))}
        attendanceBlockedReason={attendanceBlockedReason}
        canManageSchedules={access.canManageSchedules}
        canRecordAttendance={isAssignedStaff}
        feedbackByStudent={feedbackByStudent}
        feedbackAuthorOptions={assignedActiveStaff.map((member) => ({ id: member.id, name: member.display_name }))}
        feedbackBlockedReason={lesson.status === "draft"
          ? "Draft 일정은 확정한 뒤 피드백을 작성할 수 있습니다."
          : !isAssignedStaff
            ? "담당자로 배정된 일정에서만 피드백을 작성할 수 있습니다."
            : access.isOwner && assignedActiveStaff.length === 0
              ? "피드백을 작성하려면 먼저 일정에 담당 직원을 배정해주세요."
              : null}
        isOwner={access.isOwner}
      />
      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-6"><h2 className="text-2xl font-bold">담당 직원</h2>{access.canManageAssignments ? <form action={updateLessonStaff.bind(null, lessonId)} className="mt-4 space-y-3">{staffAssignmentOptions.length === 0 ? <p className="text-[var(--muted)]">등록된 직원이 없습니다.</p> : staffAssignmentOptions.map((member) => <label key={member.id} className="flex items-center gap-3"><input type="checkbox" name="staff_ids" value={member.id} defaultChecked={assignedStaffIds.has(member.id)}/><span className="font-bold">{member.display_name}{member.is_active ? "" : " (삭제된 직원)"}</span><span className="text-sm text-[var(--muted)]">{(assignedStaffRoles.get(member.id) ?? member.role) === "manager" ? "매니저" : "보컬트레이너"}</span></label>)}<button className="mt-3 h-11 rounded-xl border border-[var(--accent)] px-4 font-bold">담당 저장</button></form> : <p className="mt-4 text-[var(--muted)]">{staffAssignmentOptions.filter((member) => assignedStaffIds.has(member.id)).map((member) => member.display_name).join(", ") || "미배정"}</p>}</section>
    </main>
  );
}
