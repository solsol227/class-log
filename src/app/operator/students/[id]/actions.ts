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

export type StudentProgramActionState = { formError?: string };

const PROGRAM_TYPES = ["weekday_vocal", "weekend_vocal", "rental", "trial"] as const;
const STOP_REASONS = ["break", "ended", "other"] as const;
const ACQUISITION_SOURCES = ["instagram", "daangn", "referral", "naver"] as const;

function optionalText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim() || null;
}

export async function assignScheduleToStudent(
  studentId: string,
  _previousState: StudentAssignmentActionState,
  formData: FormData,
): Promise<StudentAssignmentActionState> {
  await requireAuthenticatedUser("/login/operator", "operator");
  const lessonId = String(formData.get("lesson_id") ?? "");

  if (!UUID_PATTERN.test(studentId) || !UUID_PATTERN.test(lessonId)) {
    return { formError: "배정할 학생 또는 일정을 확인해 주세요." };
  }

  const supabase = await createSupabaseServerClient();
  const [{ data: student, error: studentError }, { data: lesson, error: lessonError }] = await Promise.all([
    supabase.from("students").select("id").eq("id", studentId).maybeSingle(),
    supabase.from("lessons").select("id, status, program_type").eq("id", lessonId).maybeSingle(),
  ]);

  if (studentError || lessonError || !student || !lesson) {
    if (studentError) console.error(studentError);
    if (lessonError) console.error(lessonError);
    return { formError: "학생 또는 일정 정보를 확인하지 못했습니다." };
  }
  if (lesson.status === "cancelled") {
    return { formError: "취소된 일정에는 학생을 배정할 수 없습니다." };
  }

  const { data: program, error: programError } = await supabase.from("student_programs").select("id").eq("student_id", studentId).eq("program_type", lesson.program_type).eq("status", "active").maybeSingle();
  if (programError || !program) return { formError: "학생이 해당 프로그램을 이용 중이 아닙니다." };
  const { data: assignment, error } = await supabase.from("lesson_assignments").upsert(
    { lesson_id: lessonId, student_id: studentId, student_program_id: program.id, unassigned_at: null },
    { onConflict: "lesson_id,student_id" },
  ).select("lesson_id").maybeSingle();
  if (error || !assignment) {
    console.error(error);
    return { formError: "일정을 배정하지 못했습니다. 잠시 후 다시 시도해 주세요." };
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

  const { data: updated, error: updateError } = await supabase
    .from("students")
    .update({
      nickname: name,
      gender,
      age,
      phone,
      acquisition_source: acquisitionSource,
      joined_month: joinedMonth,
      special_notes: specialNotes,
    })
    .eq("id", studentId)
    .eq("auth_user_id", student.auth_user_id)
    .select("id")
    .maybeSingle();

  if (updateError || !updated) {
    if (updateError) console.error(updateError);
    if (nameChanged) {
      const { error: rollbackError } = await adminClient.auth.admin.updateUserById(
        student.auth_user_id,
        { email: studentNicknameToAuthEmail(student.nickname), email_confirm: true },
      );
      if (rollbackError) console.error("학생 로그인 정보 복구에 실패했습니다.", rollbackError);
    }
    return { fieldErrors: {}, formError: "학생 정보를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }

  revalidatePath("/operator/students");
  revalidatePath(`/operator/students/${studentId}`);
  revalidatePath("/operator/schedules");
  redirect(`/operator/students/${studentId}?updated=1`);
}

export async function addStudentProgram(
  studentId: string,
  _previousState: StudentProgramActionState,
  formData: FormData,
): Promise<StudentProgramActionState> {
  await requireAuthenticatedUser("/login/operator", "operator");
  const programType = String(formData.get("program_type") ?? "");
  const startedAt = String(formData.get("started_at") ?? "");
  if (!UUID_PATTERN.test(studentId) || !PROGRAM_TYPES.includes(programType as (typeof PROGRAM_TYPES)[number]) || !/^\d{4}-\d{2}-\d{2}$/.test(startedAt)) {
    return { formError: "프로그램과 시작일을 확인해 주세요." };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("student_programs").insert({ student_id: studentId, program_type: programType, started_at: startedAt }).select("id").maybeSingle();
  if (error || !data) return { formError: error?.code === "23505" ? "이미 이용 중인 프로그램입니다." : "프로그램을 추가하지 못했습니다." };
  revalidatePath(`/operator/students/${studentId}`);
  redirect(`/operator/students/${studentId}?programUpdated=1`);
}

export async function stopStudentProgram(
  studentId: string,
  programId: string,
  _previousState: StudentProgramActionState,
  formData: FormData,
): Promise<StudentProgramActionState> {
  await requireAuthenticatedUser("/login/operator", "operator");
  const stopReason = String(formData.get("stop_reason") ?? "") || null;
  if (!UUID_PATTERN.test(studentId) || !UUID_PATTERN.test(programId) || (stopReason && !STOP_REASONS.includes(stopReason as (typeof STOP_REASONS)[number]))) {
    return { formError: "프로그램 정보를 확인해 주세요." };
  }
  const endedAt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("student_programs").update({ status: "stopped", stop_reason: stopReason, ended_at: endedAt }).eq("id", programId).eq("student_id", studentId).eq("status", "active").select("id").maybeSingle();
  if (error || !data) return { formError: error?.code === "23514" ? "미래 일정 배정을 먼저 해제한 뒤 프로그램을 중단해 주세요." : "프로그램을 중단하지 못했습니다." };
  revalidatePath(`/operator/students/${studentId}`);
  redirect(`/operator/students/${studentId}?programUpdated=1`);
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
