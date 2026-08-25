"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN =
  /^([1-9]\d{3})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const SCHEDULE_ERROR =
  "일정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";

type ScheduleFieldErrors = {
  title?: string;
  date?: string;
  startsAt?: string;
  endsAt?: string;
  students?: string;
};

export type ScheduleActionState = {
  fieldErrors: ScheduleFieldErrors;
  formError?: string;
  values?: {
    title: string;
    date: string;
    startTime: string;
    endTime: string;
    location: string;
    notes: string;
    studentIds: string[];
  };
};

export type ManagementActionState = { formError?: string };
export type RosterAttendanceActionState = { formError?: string };

const ATTENDANCE_STATUSES = ["present", "absent", "excused"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function toKstTimestamp(date: string, time: string) {
  const dateMatch = DATE_PATTERN.exec(date);
  if (!dateMatch || !TIME_PATTERN.test(time)) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day > daysInMonth[month - 1]) return null;
  return `${date}T${time}:00+09:00`;
}

function readScheduleForm(formData: FormData) {
  const rawTitle = String(formData.get("title") ?? "");
  const dateInput = String(formData.get("date") ?? "").trim();
  const startTimeInput = String(formData.get("start_time") ?? "").trim();
  const endTimeInput = String(formData.get("end_time") ?? "").trim();
  const rawLocation = String(formData.get("location") ?? "");
  const rawNotes = String(formData.get("notes") ?? "");
  const rawStudentIds = [...new Set(formData.getAll("student_ids").map(String))];
  const studentIds = rawStudentIds.filter((id) => UUID_PATTERN.test(id));
  const startsAt = toKstTimestamp(dateInput, startTimeInput);
  const endsAt = toKstTimestamp(dateInput, endTimeInput);
  const fieldErrors: ScheduleFieldErrors = {};

  if (!rawTitle.trim()) fieldErrors.title = "일정 제목을 입력해 주세요.";
  if (!DATE_PATTERN.test(dateInput) || !startsAt || !endsAt) {
    const dateMatch = DATE_PATTERN.exec(dateInput);
    if (!dateMatch || !toKstTimestamp(dateInput, "00:00")) fieldErrors.date = "올바른 날짜를 입력해 주세요.";
  }
  if (!TIME_PATTERN.test(startTimeInput)) fieldErrors.startsAt = "올바른 시작 시간을 입력해 주세요.";
  if (!TIME_PATTERN.test(endTimeInput)) fieldErrors.endsAt = "올바른 종료 시간을 입력해 주세요.";
  if (startsAt && endsAt && startTimeInput >= endTimeInput) {
    fieldErrors.endsAt = "종료 시각은 시작 시각보다 늦어야 합니다.";
  }
  if (studentIds.length !== rawStudentIds.length) {
    fieldErrors.students = "배정할 학생 정보를 다시 선택해 주세요.";
  }

  return {
    fieldErrors,
    values: { title: rawTitle, date: dateInput, startTime: startTimeInput, endTime: endTimeInput, location: rawLocation, notes: rawNotes, studentIds },
    record: {
      title: rawTitle.trim(),
      starts_at: startsAt,
      ends_at: endsAt,
      location: rawLocation.trim() || null,
      notes: rawNotes.trim() || null,
    },
  };
}

export async function createSchedule(
  _previousState: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  await requireAuthenticatedUser("/login/operator", "operator");
  const parsed = readScheduleForm(formData);
  if (Object.keys(parsed.fieldErrors).length > 0) {
    return { fieldErrors: parsed.fieldErrors, values: parsed.values };
  }

  const supabase = await createSupabaseServerClient();
  if (parsed.values.studentIds.length > 0) {
    const { data: students, error: studentsError } = await supabase
      .from("students")
      .select("id")
      .in("id", parsed.values.studentIds);
    if (studentsError || students.length !== parsed.values.studentIds.length) {
      if (studentsError) console.error(studentsError);
      return { fieldErrors: { students: "배정할 학생 정보를 확인하지 못했습니다." }, values: parsed.values };
    }
  }

  const { data: lesson, error } = await supabase
    .from("lessons")
    .insert(parsed.record)
    .select("id")
    .single();

  if (error || !lesson) {
    if (error) console.error(error);
    return { fieldErrors: {}, formError: SCHEDULE_ERROR, values: parsed.values };
  }

  if (parsed.values.studentIds.length > 0) {
    const { error: assignmentError } = await supabase.from("lesson_assignments").upsert(
      parsed.values.studentIds.map((studentId) => ({ lesson_id: lesson.id, student_id: studentId, unassigned_at: null })),
      { onConflict: "lesson_id,student_id" },
    );
    if (assignmentError) {
      console.error(assignmentError);
      const { error: cleanupError } = await supabase.from("lessons").delete().eq("id", lesson.id);
      if (cleanupError) console.error("일정 생성 보상 삭제에 실패했습니다.", cleanupError);
      return { fieldErrors: {}, formError: cleanupError ? "일정은 생성되었지만 학생 배정에 실패했습니다. 일정 목록에서 상태를 확인해 주세요." : "학생 배정에 실패해 일정을 등록하지 않았습니다. 다시 시도해 주세요.", values: parsed.values };
    }
  }

  revalidatePath("/operator/schedules");
  redirect(`/operator/schedules/${lesson.id}?created=1`);
}

export async function updateSchedule(
  lessonId: string,
  _previousState: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  await requireAuthenticatedUser("/login/operator", "operator");
  const parsed = readScheduleForm(formData);

  if (!UUID_PATTERN.test(lessonId)) return { fieldErrors: {}, formError: "일정을 찾을 수 없습니다." };
  if (Object.keys(parsed.fieldErrors).length > 0) {
    return { fieldErrors: parsed.fieldErrors, values: parsed.values };
  }

  const supabase = await createSupabaseServerClient();
  const [{ data: lesson, error: lookupError }, { data: currentAssignments, error: assignmentsError }] = await Promise.all([
    supabase.from("lessons").select("id, status").eq("id", lessonId).maybeSingle(),
    supabase.from("lesson_assignments").select("student_id, unassigned_at").eq("lesson_id", lessonId),
  ]);

  if (lookupError || assignmentsError || !lesson) {
    if (lookupError) console.error(lookupError);
    if (assignmentsError) console.error(assignmentsError);
    return { fieldErrors: {}, formError: "일정과 배정 정보를 확인하지 못했습니다." };
  }
  if (lesson.status === "cancelled") {
    return { fieldErrors: {}, formError: "취소된 일정은 수정할 수 없습니다.", values: parsed.values };
  }

  if (parsed.values.studentIds.length > 0) {
    const { data: students, error: studentsError } = await supabase
      .from("students")
      .select("id")
      .in("id", parsed.values.studentIds);
    if (studentsError || students.length !== parsed.values.studentIds.length) {
      if (studentsError) console.error(studentsError);
      return { fieldErrors: { students: "배정할 학생 정보를 확인하지 못했습니다." }, values: parsed.values };
    }
  }

  const { data: updated, error } = await supabase
    .from("lessons")
    .update(parsed.record)
    .eq("id", lessonId)
    .neq("status", "cancelled")
    .select("id")
    .maybeSingle();

  if (error || !updated) {
    if (error) console.error(error);
    return { fieldErrors: {}, formError: SCHEDULE_ERROR, values: parsed.values };
  }

  const selectedIds = new Set(parsed.values.studentIds);
  const removedIds = currentAssignments
    .filter((assignment) => assignment.unassigned_at === null && !selectedIds.has(assignment.student_id))
    .map((assignment) => assignment.student_id);

  if (parsed.values.studentIds.length > 0) {
    const { error: assignmentError } = await supabase.from("lesson_assignments").upsert(
      parsed.values.studentIds.map((studentId) => ({ lesson_id: lessonId, student_id: studentId, unassigned_at: null })),
      { onConflict: "lesson_id,student_id" },
    );
    if (assignmentError) {
      console.error(assignmentError);
      return { fieldErrors: {}, formError: "일정 정보는 저장했지만 학생 배정을 저장하지 못했습니다. 화면을 새로고침해 확인해 주세요.", values: parsed.values };
    }
  }

  if (removedIds.length > 0) {
    const { error: unassignError } = await supabase
      .from("lesson_assignments")
      .update({ unassigned_at: new Date().toISOString() })
      .eq("lesson_id", lessonId)
      .in("student_id", removedIds)
      .is("unassigned_at", null);
    if (unassignError) {
      console.error(unassignError);
      return { fieldErrors: {}, formError: "일정 정보는 저장했지만 일부 학생 배정을 해제하지 못했습니다. 화면을 새로고침해 확인해 주세요.", values: parsed.values };
    }
  }

  revalidatePath("/operator/schedules");
  revalidatePath(`/operator/schedules/${lessonId}`);
  for (const studentId of new Set([...parsed.values.studentIds, ...removedIds])) {
    revalidatePath(`/operator/students/${studentId}`);
    revalidatePath(`/operator/students/${studentId}/lessons`);
  }
  redirect(`/operator/schedules/${lessonId}?updated=1`);
}

function isAttendanceStatus(value: string): value is AttendanceStatus {
  return ATTENDANCE_STATUSES.includes(value as AttendanceStatus);
}

export async function saveRosterAttendance(
  lessonId: string,
  _previousState: RosterAttendanceActionState,
  formData: FormData,
): Promise<RosterAttendanceActionState> {
  await requireAuthenticatedUser("/login/operator", "operator");
  if (!UUID_PATTERN.test(lessonId)) return { formError: "일정을 찾을 수 없습니다." };

  const selected = new Map<string, AttendanceStatus>();
  for (const [key, entry] of formData.entries()) {
    if (!key.startsWith("attendance_")) continue;
    const studentId = key.slice("attendance_".length);
    const status = String(entry);
    if (!UUID_PATTERN.test(studentId) || !isAttendanceStatus(status)) {
      return { formError: "출결 선택 정보를 다시 확인해 주세요." };
    }
    selected.set(studentId, status);
  }
  if (selected.size === 0) {
    return { formError: "저장할 학생의 출결 상태를 한 명 이상 선택해 주세요." };
  }

  const studentIds = [...selected.keys()];
  const supabase = await createSupabaseServerClient();
  const [{ data: lesson, error: lessonError }, { data: assignments, error: assignmentError }] = await Promise.all([
    supabase.from("lessons").select("id, starts_at, status").eq("id", lessonId).maybeSingle(),
    supabase.from("lesson_assignments").select("student_id").eq("lesson_id", lessonId).in("student_id", studentIds).is("unassigned_at", null),
  ]);

  if (lessonError || !lesson) {
    if (lessonError) console.error(lessonError);
    return { formError: "일정을 찾을 수 없습니다." };
  }
  if (assignmentError || assignments.length !== studentIds.length) {
    if (assignmentError) console.error(assignmentError);
    return { formError: "배정된 학생 정보를 확인하지 못해 출결을 저장하지 않았습니다." };
  }
  if (lesson.status === "cancelled") {
    return { formError: "취소된 일정에는 출결을 기록할 수 없습니다." };
  }

  const startsAt = new Date(lesson.starts_at);
  if (Number.isNaN(startsAt.getTime())) return { formError: "일정 시작 시각을 확인할 수 없습니다." };
  if (startsAt.getTime() > Date.now()) {
    return { formError: "일정 시작 시각 이후에 출결을 기록할 수 있습니다." };
  }

  const { error: attendanceError } = await supabase.from("attendance_records").upsert(
    studentIds.map((studentId) => ({ lesson_id: lessonId, student_id: studentId, status: selected.get(studentId)! })),
    { onConflict: "lesson_id,student_id" },
  );
  if (attendanceError) {
    console.error(attendanceError);
    return { formError: "출결을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }

  if (lesson.status !== "completed") {
    const { data: completed, error: completeError } = await supabase
      .from("lessons")
      .update({ status: "completed" })
      .eq("id", lessonId)
      .eq("status", "scheduled")
      .select("id")
      .maybeSingle();
    if (completeError || !completed) {
      if (completeError) console.error(completeError);
      return { formError: "출결은 저장했지만 일정을 완료 상태로 변경하지 못했습니다. 화면을 새로고침해 확인해 주세요." };
    }
  }

  revalidatePath("/operator/schedules");
  revalidatePath(`/operator/schedules/${lessonId}`);
  for (const studentId of studentIds) revalidatePath(`/operator/students/${studentId}`);
  redirect(`/operator/schedules/${lessonId}?attendanceSaved=1`);
}

export async function deleteSchedule(
  lessonId: string,
  _previousState: ManagementActionState,
): Promise<ManagementActionState> {
  void _previousState;
  await requireAuthenticatedUser("/login/operator", "operator");
  if (!UUID_PATTERN.test(lessonId)) return { formError: "일정을 찾을 수 없습니다." };

  const supabase = await createSupabaseServerClient();
  const { data: replacementMakeups, error: lookupError } = await supabase
    .from("makeup_lessons")
    .select("id")
    .eq("replacement_lesson_id", lessonId)
    .limit(1);
  if (lookupError) {
    console.error(lookupError);
    return { formError: "관련 기록을 확인하지 못해 일정을 삭제하지 않았습니다." };
  }
  if (replacementMakeups.length > 0) {
    return { formError: "이 일정이 보강 수업으로 연결되어 있어 삭제할 수 없습니다. 보강 기록을 먼저 확인해 주세요." };
  }

  const { data: deleted, error } = await supabase.from("lessons").delete().eq("id", lessonId).select("id").maybeSingle();
  if (error || !deleted) {
    if (error) console.error(error);
    return { formError: error?.code === "23503" ? "연결된 기록이 있어 일정을 삭제할 수 없습니다. 관련 기록을 먼저 확인해 주세요." : "일정을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }

  revalidatePath("/operator/schedules");
  redirect("/operator/schedules?deleted=1");
}
