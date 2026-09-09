"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOperatorAccess } from "@/lib/auth/operator-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ATTENDANCE_STATUSES = ["present", "absent", "excused"] as const;
const MEMO_MAX_LENGTH = 1000;
const GENERIC_ERROR =
  "출결을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
const LESSON_NOT_FOUND_ERROR = "해당 학생의 수업을 찾을 수 없습니다.";

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

type AttendanceFieldErrors = {
  status?: string;
  memo?: string;
};

export type AttendanceActionState = {
  fieldErrors: AttendanceFieldErrors;
  formError?: string;
  values?: {
    status: string;
    memo: string;
  };
};

function isAttendanceStatus(value: string): value is AttendanceStatus {
  return ATTENDANCE_STATUSES.includes(value as AttendanceStatus);
}

export async function saveAttendance(
  studentId: string,
  lessonId: string,
  _previousState: AttendanceActionState,
  formData: FormData,
): Promise<AttendanceActionState> {
  const access = await requireOperatorAccess();

  const rawStatus = String(formData.get("status") ?? "").trim();
  const rawMemo = String(formData.get("memo") ?? "");
  const memo = rawMemo.trim() || null;
  const fieldErrors: AttendanceFieldErrors = {};
  const values = { status: rawStatus, memo: rawMemo };

  if (!UUID_PATTERN.test(studentId) || !UUID_PATTERN.test(lessonId)) {
    return { fieldErrors: {}, formError: LESSON_NOT_FOUND_ERROR, values };
  }

  if (!isAttendanceStatus(rawStatus)) {
    fieldErrors.status = "올바른 출결 상태를 선택해 주세요.";
  }

  if (memo && memo.length > MEMO_MAX_LENGTH) {
    fieldErrors.memo = `메모는 ${MEMO_MAX_LENGTH}자 이하로 입력해 주세요.`;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, values };
  }

  const status = rawStatus as AttendanceStatus;
  const supabase = await createSupabaseServerClient();
  if (!access.isOwner) {
    const { data: staffAssignment, error: staffAssignmentError } = await supabase
      .from("lesson_staff")
      .select("lesson_id")
      .eq("lesson_id", lessonId)
      .eq("staff_id", access.staffProfileId!)
      .maybeSingle();
    if (staffAssignmentError || !staffAssignment) {
      return { fieldErrors: {}, formError: "본인이 담당자로 배정된 수업에서만 출결을 저장할 수 있습니다.", values };
    }
  }
  const { data: lesson, error: lessonError } = await supabase
    .from("lessons")
    .select("id, starts_at, status")
    .eq("id", lessonId)
    .maybeSingle();

  if (lessonError || !lesson) {
    if (lessonError) {
      console.error(lessonError);
    }
    return { fieldErrors: {}, formError: LESSON_NOT_FOUND_ERROR, values };
  }

  const { data: assignment, error: assignmentError } = await supabase
    .from("lesson_assignments")
    .select("lesson_id")
    .eq("lesson_id", lessonId)
    .eq("student_id", studentId)
    .is("unassigned_at", null)
    .maybeSingle();

  if (assignmentError || !assignment) {
    if (assignmentError) console.error(assignmentError);
    return { fieldErrors: {}, formError: LESSON_NOT_FOUND_ERROR, values };
  }

  if (lesson.status === "draft") {
    return {
      fieldErrors: {},
      formError: "Draft 수업에는 출결을 기록할 수 없습니다. 일정을 먼저 확정해 주세요.",
      values,
    };
  }

  if (lesson.status === "cancelled") {
    return {
      fieldErrors: {},
      formError: "취소된 수업에는 출결을 기록할 수 없습니다.",
      values,
    };
  }

  const startsAt = new Date(lesson.starts_at);

  if (Number.isNaN(startsAt.getTime())) {
    return { fieldErrors: {}, formError: GENERIC_ERROR, values };
  }

  if (startsAt.getTime() > Date.now()) {
    return {
      fieldErrors: {},
      formError: "수업 시작 시각 이후에 출결을 기록할 수 있습니다.",
      values,
    };
  }

  const { data: existingAttendance, error: attendanceLookupError } =
    await supabase
      .from("attendance_records")
      .select("id, student_id")
      .eq("lesson_id", lesson.id)
      .eq("student_id", studentId)
      .maybeSingle();

  if (attendanceLookupError) {
    console.error(attendanceLookupError);
    return { fieldErrors: {}, formError: GENERIC_ERROR, values };
  }

  if (existingAttendance && existingAttendance.student_id !== studentId) {
    return { fieldErrors: {}, formError: GENERIC_ERROR, values };
  }

  let attendanceSaved = false;
  let attendanceFailureCode: string | undefined;

  if (existingAttendance) {
    const { data: updatedAttendance, error: updateError } = await supabase
      .from("attendance_records")
      .update({ status, memo })
      .eq("id", existingAttendance.id)
      .eq("lesson_id", lesson.id)
      .eq("student_id", studentId)
      .select("id")
      .maybeSingle();

    if (updateError) {
      console.error(updateError);
      attendanceFailureCode = updateError.code;
    }

    attendanceSaved = !updateError && Boolean(updatedAttendance);
  } else {
    const { error: insertError } = await supabase
      .from("attendance_records")
      .insert({
        lesson_id: lesson.id,
        student_id: studentId,
        status,
        memo,
      });

    if (!insertError) {
      attendanceSaved = true;
    } else if (insertError.code === "23505") {
      const { data: updatedAttendance, error: retryError } = await supabase
        .from("attendance_records")
        .update({ status, memo })
        .eq("lesson_id", lesson.id)
        .eq("student_id", studentId)
        .select("id")
        .maybeSingle();

      if (retryError) {
        console.error(retryError);
        attendanceFailureCode = retryError.code;
      }

      attendanceSaved = !retryError && Boolean(updatedAttendance);
    } else {
      console.error(insertError);
      attendanceFailureCode = insertError.code;
    }
  }

  if (!attendanceSaved) {
    return {
      fieldErrors: {},
      formError: attendanceFailureCode === "P0001"
        ? "대체 일정에 보존해야 할 출결 또는 피드백 기록이 있어 원 출결을 변경할 수 없습니다. 연결된 기록을 확인해 주세요."
        : attendanceFailureCode === "23514"
          ? "완료된 보강과 연결된 원 출결은 변경할 수 없습니다."
        : GENERIC_ERROR,
      values,
    };
  }

  revalidatePath("/operator/makeup");
  revalidatePath(`/operator/schedules/${lessonId}`);
  revalidatePath(`/operator/students/${studentId}`);
  redirect(
    `/operator/students/${studentId}/lessons/${lessonId}?attendanceSaved=1`,
  );
}
