"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import {
  InvalidStudentNicknameError,
  normalizeStudentNickname,
  studentNicknameToAuthEmail,
} from "@/lib/auth/student-identity";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PHONE_PATTERN = /^010[0-9]{8}$/;

type ProfileFieldErrors = {
  name?: string;
  gender?: string;
  age?: string;
  acquisitionSource?: string;
  phone?: string;
  joinedMonth?: string;
  programs?: string;
};

export type StudentProfileActionState = {
  fieldErrors: ProfileFieldErrors;
  formError?: string;
};

export type DeleteStudentActionState = {
  formError?: string;
};

export type StudentAssignmentActionState = {
  formError?: string;
};

export async function addAllowanceAdjustment(studentId: string, studentProgramId: string, formData: FormData) {
  await requireAuthenticatedUser("/login/operator", "operator");
  const targetMonthInput = String(formData.get("target_month") ?? "");
  const delta = Number(formData.get("delta"));
  const reason = String(formData.get("reason") ?? "").trim();
  if (!UUID_PATTERN.test(studentId) || !UUID_PATTERN.test(studentProgramId) || !Number.isInteger(delta) || delta === 0 || !reason) {
    redirect(`/operator/students/${studentId}?allowanceError=1`);
  }
  const targetMonth = targetMonthInput ? `${targetMonthInput}-01` : null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("add_student_program_allowance_adjustment", {
    target_student_program_id: studentProgramId,
    adjustment_month: targetMonth,
    adjustment_delta: delta,
    adjustment_reason: reason,
  });
  if (error || !data) redirect(`/operator/students/${studentId}?allowanceError=1`);
  revalidatePath(`/operator/students/${studentId}`);
  redirect(`/operator/students/${studentId}?allowanceUpdated=1`);
}

export async function configureRentalAllowance(studentId: string, studentProgramId: string, formData: FormData) {
  await requireAuthenticatedUser("/login/operator", "operator");
  const allowanceCount = Number(formData.get("allowance_count"));
  if (!UUID_PATTERN.test(studentId) || !UUID_PATTERN.test(studentProgramId) || !Number.isInteger(allowanceCount) || allowanceCount <= 0) {
    redirect(`/operator/students/${studentId}?allowanceError=1`);
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("configure_rental_program_allowance", {
    target_student_program_id: studentProgramId,
    allowance_count: allowanceCount,
  });
  if (error || !data) redirect(`/operator/students/${studentId}?allowanceError=1`);
  revalidatePath(`/operator/students/${studentId}`);
  revalidatePath("/operator/schedules/new");
  redirect(`/operator/students/${studentId}?allowanceUpdated=1`);
}

const PROGRAM_TYPES = ["weekday_vocal", "weekend_vocal", "rental", "trial"] as const;
const STOP_REASONS = ["break", "ended", "other"] as const;
const ACQUISITION_SOURCES = ["instagram", "daangn", "referral", "naver"] as const;

function optionalText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim() || null;
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

type ProgramChanges = {
  stop: Array<{ id: string; endedAt: string; stopReason: string | null }>;
  start: Array<{ programType: string; startedAt: string; baseAllowanceCount?: number }>;
  reasonUpdates: Array<{ id: string; stopReason: string | null }>;
};

function parseProgramChanges(value: FormDataEntryValue | null): ProgramChanges | null {
  try {
    const parsed = JSON.parse(String(value ?? "")) as Partial<ProgramChanges>;
    if (!Array.isArray(parsed.stop) || !Array.isArray(parsed.start) || !Array.isArray(parsed.reasonUpdates)) return null;
    if (parsed.stop.length > 4 || parsed.start.length > 4 || parsed.reasonUpdates.length > 100) return null;

    const stop = parsed.stop.map((item) => ({
      id: String(item?.id ?? ""),
      endedAt: String(item?.endedAt ?? ""),
      stopReason: item?.stopReason ? String(item.stopReason) : null,
    }));
    const start = parsed.start.map((item) => ({
      programType: String(item?.programType ?? ""),
      startedAt: String(item?.startedAt ?? ""),
      baseAllowanceCount: item?.baseAllowanceCount === undefined ? undefined : Number(item.baseAllowanceCount),
    }));
    const reasonUpdates = parsed.reasonUpdates.map((item) => ({
      id: String(item?.id ?? ""),
      stopReason: item?.stopReason ? String(item.stopReason) : null,
    }));

    if (stop.some((item) => !UUID_PATTERN.test(item.id) || !isValidDate(item.endedAt) || (item.stopReason && !STOP_REASONS.includes(item.stopReason as (typeof STOP_REASONS)[number])))) return null;
    if (start.some((item) => !PROGRAM_TYPES.includes(item.programType as (typeof PROGRAM_TYPES)[number]) || !isValidDate(item.startedAt) || (item.programType === "rental" && (!Number.isInteger(item.baseAllowanceCount) || (item.baseAllowanceCount ?? 0) <= 0)))) return null;
    if (reasonUpdates.some((item) => !UUID_PATTERN.test(item.id) || (item.stopReason && !STOP_REASONS.includes(item.stopReason as (typeof STOP_REASONS)[number])))) return null;

    const stopIds = stop.map((item) => item.id);
    const reasonIds = reasonUpdates.map((item) => item.id);
    const startTypes = start.map((item) => item.programType);
    if (new Set(stopIds).size !== stopIds.length || new Set(reasonIds).size !== reasonIds.length || new Set(startTypes).size !== startTypes.length) return null;
    if (stopIds.some((id) => reasonIds.includes(id))) return null;
    return { stop, start, reasonUpdates };
  } catch {
    return null;
  }
}

export async function assignScheduleToStudent(
  studentId: string,
  _previousState: StudentAssignmentActionState,
  formData: FormData,
): Promise<StudentAssignmentActionState> {
  await requireAuthenticatedUser("/login/operator", "operator");
  const lessonId = String(formData.get("lesson_id") ?? "");
  const studentProgramId = String(formData.get("student_program_id") ?? "");

  if (!UUID_PATTERN.test(studentId) || !UUID_PATTERN.test(lessonId) || !UUID_PATTERN.test(studentProgramId)) {
    return { formError: "배정할 학생 또는 일정을 확인해 주세요." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: assignment, error } = await supabase.rpc("assign_student_to_lesson", {
    target_lesson_id: lessonId,
    target_student_id: studentId,
    target_student_program_id: studentProgramId,
  });
  if (error || !assignment) {
    console.error(error);
    return { formError: error?.code === "23514" ? "이용권의 남은 횟수 또는 상태를 확인해 주세요." : "일정을 배정하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }

  revalidatePath("/operator/schedules");
  revalidatePath(`/operator/schedules/${lessonId}`);
  revalidatePath(`/operator/students/${studentId}`);
  redirect(`/operator/students/${studentId}?assigned=1`);
}

export async function updateStudentProfile(
  studentId: string,
  _previousState: StudentProfileActionState,
  formData: FormData,
): Promise<StudentProfileActionState> {
  await requireAuthenticatedUser("/login/operator", "operator");
  const fieldErrors: ProfileFieldErrors = {};

  if (!UUID_PATTERN.test(studentId)) {
    return { fieldErrors: {}, formError: "학생 정보를 찾을 수 없습니다." };
  }

  const rawName = String(formData.get("name") ?? "");
  const genderInput = String(formData.get("gender") ?? "");
  const ageInput = String(formData.get("age") ?? "").trim();
  const age = ageInput ? Number(ageInput) : null;
  const phoneDigits = String(formData.get("phone") ?? "").replace(/\D/g, "");
  const acquisitionSource = optionalText(formData.get("acquisition_source"));
  const joinedMonthInput = String(formData.get("joined_month") ?? "").trim();
  const specialNotes = optionalText(formData.get("special_notes"));
  const programChanges = parseProgramChanges(formData.get("program_changes"));
  let name = "";

  try {
    name = normalizeStudentNickname(rawName);
  } catch (error) {
    fieldErrors.name =
      error instanceof InvalidStudentNicknameError
        ? error.message
        : "이름을 확인해 주세요.";
  }

  const gender = genderInput === "" ? null : genderInput;
  if (gender && gender !== "male" && gender !== "female") {
    fieldErrors.gender = "성별을 다시 선택해 주세요.";
  }

  const phone = phoneDigits || null;
  if (phone && !PHONE_PATTERN.test(phone)) {
    fieldErrors.phone = "연락처는 010으로 시작하는 휴대전화 번호 11자리로 입력해 주세요.";
  }
  if (age !== null && (!Number.isInteger(age) || age < 1 || age > 119)) {
    fieldErrors.age = "나이는 1~119 사이의 숫자로 입력해 주세요.";
  }
  if (acquisitionSource && !ACQUISITION_SOURCES.includes(acquisitionSource as (typeof ACQUISITION_SOURCES)[number])) {
    fieldErrors.acquisitionSource = "유입경로를 다시 선택해 주세요.";
  }
  if (!programChanges) {
    fieldErrors.programs = "이용프로그램 변경 내용을 다시 확인해 주세요.";
  }

  let joinedMonth: string | null = null;
  if (joinedMonthInput) {
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(joinedMonthInput)) {
      fieldErrors.joinedMonth = "올바른 유입 연월을 입력해 주세요.";
    } else {
      joinedMonth = `${joinedMonthInput}-01`;
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  const supabase = await createSupabaseServerClient();
  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id, auth_user_id, nickname")
    .eq("id", studentId)
    .maybeSingle();

  if (studentError || !student) {
    if (studentError) console.error(studentError);
    return { fieldErrors: {}, formError: "학생 정보를 찾을 수 없습니다." };
  }

  const { data: duplicate, error: duplicateError } = await supabase
    .from("students")
    .select("id")
    .eq("nickname", name)
    .neq("id", studentId)
    .maybeSingle();

  if (duplicateError) {
    console.error(duplicateError);
    return { fieldErrors: {}, formError: "학생 정보를 확인하지 못했습니다." };
  }
  if (duplicate) {
    return { fieldErrors: { name: "이미 사용 중인 이름입니다." } };
  }

  let adminClient;
  try {
    adminClient = createSupabaseAdminClient();
  } catch {
    return { fieldErrors: {}, formError: "학생 정보를 저장하지 못했습니다." };
  }

  const { data: authData, error: authError } = await adminClient.auth.admin.getUserById(
    student.auth_user_id,
  );
  if (
    authError ||
    !authData.user ||
    authData.user.app_metadata?.role !== "student"
  ) {
    if (authError) console.error(authError);
    return { fieldErrors: {}, formError: "학생 로그인 계정을 안전하게 확인하지 못했습니다." };
  }

  const nameChanged = student.nickname !== name;
  if (nameChanged) {
    const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(
      student.auth_user_id,
      { email: studentNicknameToAuthEmail(name), email_confirm: true },
    );
    if (authUpdateError) {
      console.error(authUpdateError);
      return { fieldErrors: {}, formError: "이름과 로그인 정보를 변경하지 못했습니다." };
    }
  }

  const { data: updated, error: updateError } = await supabase.rpc(
    "save_student_profile_and_programs",
    {
      target_student_id: studentId,
      profile_nickname: name,
      profile_gender: gender,
      profile_age: age,
      profile_phone: phone,
      profile_acquisition_source: acquisitionSource,
      profile_joined_month: joinedMonth,
      profile_special_notes: specialNotes,
      program_changes: programChanges,
    },
  );

  const result = updated && typeof updated === "object" && !Array.isArray(updated)
    ? updated as Record<string, unknown>
    : null;
  if (updateError || result?.studentId !== studentId || result.profileUpdated !== true) {
    if (updateError) console.error(updateError);
    if (nameChanged) {
      const { error: rollbackError } = await adminClient.auth.admin.updateUserById(
        student.auth_user_id,
        { email: studentNicknameToAuthEmail(student.nickname), email_confirm: true },
      );
      if (rollbackError) console.error("학생 로그인 정보 복구에 실패했습니다.", rollbackError);
    }
    const formError = updateError?.code === "23505"
      ? "이미 이용 중인 프로그램이 있거나 같은 이름의 학생이 있습니다. 내용을 다시 확인해 주세요."
      : updateError?.code === "23514"
        ? "프로그램 중단일을 확인해 주세요. 미래 일정 배정이 남아 있다면 해당 배정을 먼저 해제해야 합니다."
        : updateError?.code === "P0002"
          ? "학생 또는 프로그램 정보가 변경되었습니다. 새로고침 후 다시 시도해 주세요."
          : "학생정보와 이용프로그램을 저장하지 못했습니다. 변경 내용은 반영되지 않았습니다.";
    return { fieldErrors: {}, formError };
  }

  revalidatePath("/operator/students");
  revalidatePath(`/operator/students/${studentId}`);
  revalidatePath("/operator/schedules");
  revalidatePath("/operator/schedules/new");
  revalidatePath("/student/schedule");
  redirect(`/operator/students/${studentId}?updated=1`);
}

export async function deleteStudent(
  studentId: string,
  _previousState: DeleteStudentActionState,
): Promise<DeleteStudentActionState> {
  void _previousState;
  await requireAuthenticatedUser("/login/operator", "operator");

  if (!UUID_PATTERN.test(studentId)) {
    return { formError: "학생 정보를 찾을 수 없습니다." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id, auth_user_id")
    .eq("id", studentId)
    .maybeSingle();
  if (studentError || !student) {
    if (studentError) console.error(studentError);
    return { formError: "학생 정보를 찾을 수 없습니다." };
  }

  let adminClient;
  try {
    adminClient = createSupabaseAdminClient();
  } catch {
    return { formError: "학생 로그인 계정을 확인하지 못해 삭제하지 않았습니다." };
  }

  const { data: authData, error: authError } = await adminClient.auth.admin.getUserById(
    student.auth_user_id,
  );
  if (authError || !authData.user) {
    if (authError) console.error(authError);
    return { formError: "학생 로그인 계정을 확인하지 못해 삭제하지 않았습니다." };
  }
  if (authData.user.app_metadata?.role !== "student") {
    return { formError: "학생 역할의 계정만 삭제할 수 있습니다. 삭제를 중단했습니다." };
  }

  const { data: deleted, error: deleteError } = await supabase
    .from("students")
    .delete()
    .eq("id", studentId)
    .eq("auth_user_id", student.auth_user_id)
    .select("id")
    .maybeSingle();

  if (deleteError || !deleted) {
    if (deleteError) console.error(deleteError);
    return {
      formError:
        deleteError?.code === "23503"
          ? "연결된 기록 또는 로그인 계정을 안전하게 정리할 수 없어 삭제하지 않았습니다."
          : "학생을 삭제하지 못했습니다. 관련 기록을 확인한 뒤 다시 시도해 주세요.",
    };
  }

  revalidatePath("/operator/students");
  revalidatePath("/operator/schedules");
  redirect("/operator/students?deleted=1");
}
