"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_TIME_PATTERN =
  /^([1-9]\d{3})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):([0-5]\d)$/;
const SCHEDULE_ERROR =
  "일정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";

type ScheduleFieldErrors = {
  title?: string;
  startsAt?: string;
  endsAt?: string;
};

export type ScheduleActionState = {
  fieldErrors: ScheduleFieldErrors;
  formError?: string;
  values?: {
    title: string;
    startsAt: string;
    endsAt: string;
    location: string;
    notes: string;
  };
};

export type ManagementActionState = { formError?: string };

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function toKstTimestamp(value: string) {
  const match = DATE_TIME_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day > daysInMonth[month - 1]) return null;
  return `${value}:00+09:00`;
}

function readScheduleForm(formData: FormData) {
  const rawTitle = String(formData.get("title") ?? "");
  const startsAtInput = String(formData.get("starts_at") ?? "").trim();
  const endsAtInput = String(formData.get("ends_at") ?? "").trim();
  const rawLocation = String(formData.get("location") ?? "");
  const rawNotes = String(formData.get("notes") ?? "");
  const startsAt = toKstTimestamp(startsAtInput);
  const endsAt = toKstTimestamp(endsAtInput);
  const fieldErrors: ScheduleFieldErrors = {};

  if (!rawTitle.trim()) fieldErrors.title = "일정 제목을 입력해 주세요.";
  if (!startsAt) fieldErrors.startsAt = "올바른 시작 시각을 입력해 주세요.";
  if (!endsAt) fieldErrors.endsAt = "올바른 종료 시각을 입력해 주세요.";
  if (startsAt && endsAt && startsAtInput >= endsAtInput) {
    fieldErrors.endsAt = "종료 시각은 시작 시각보다 늦어야 합니다.";
  }

  return {
    fieldErrors,
    values: { title: rawTitle, startsAt: startsAtInput, endsAt: endsAtInput, location: rawLocation, notes: rawNotes },
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
  const { data: lesson, error } = await supabase
    .from("lessons")
    .insert(parsed.record)
    .select("id")
    .single();

  if (error || !lesson) {
    if (error) console.error(error);
    return { fieldErrors: {}, formError: SCHEDULE_ERROR, values: parsed.values };
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
  const { data: lesson, error: lookupError } = await supabase
    .from("lessons")
    .select("id, status")
    .eq("id", lessonId)
    .maybeSingle();

  if (lookupError || !lesson) {
    if (lookupError) console.error(lookupError);
    return { fieldErrors: {}, formError: "일정을 찾을 수 없습니다." };
  }
  if (lesson.status !== "scheduled") {
    return { fieldErrors: {}, formError: "완료되었거나 취소된 일정은 기본 정보를 수정할 수 없습니다.", values: parsed.values };
  }

  const { data: updated, error } = await supabase
    .from("lessons")
    .update(parsed.record)
    .eq("id", lessonId)
    .eq("status", "scheduled")
    .select("id")
    .maybeSingle();

  if (error || !updated) {
    if (error) console.error(error);
    return { fieldErrors: {}, formError: SCHEDULE_ERROR, values: parsed.values };
  }

  revalidatePath("/operator/schedules");
  revalidatePath(`/operator/schedules/${lessonId}`);
  redirect(`/operator/schedules/${lessonId}?updated=1`);
}

export async function assignStudents(
  lessonId: string,
  _previousState: ManagementActionState,
  formData: FormData,
): Promise<ManagementActionState> {
  await requireAuthenticatedUser("/login/operator", "operator");
  if (!UUID_PATTERN.test(lessonId)) return { formError: "일정을 찾을 수 없습니다." };

  const studentIds = [...new Set(formData.getAll("student_ids").map(String).filter((id) => UUID_PATTERN.test(id)))];
  if (studentIds.length === 0) return { formError: "배정할 학생을 한 명 이상 선택해 주세요." };

  const supabase = await createSupabaseServerClient();
  const [{ data: lesson, error: lessonError }, { data: students, error: studentsError }] = await Promise.all([
    supabase.from("lessons").select("id, status").eq("id", lessonId).maybeSingle(),
    supabase.from("students").select("id").in("id", studentIds),
  ]);

  if (lessonError || studentsError || !lesson || students.length !== studentIds.length) {
    if (lessonError) console.error(lessonError);
    if (studentsError) console.error(studentsError);
    return { formError: "학생 배정 정보를 확인하지 못했습니다." };
  }
  if (lesson.status !== "scheduled") return { formError: "완료되었거나 취소된 일정에는 학생을 배정할 수 없습니다." };

  const { error } = await supabase.from("lesson_assignments").upsert(
    studentIds.map((studentId) => ({ lesson_id: lessonId, student_id: studentId })),
    { onConflict: "lesson_id,student_id", ignoreDuplicates: true },
  );
  if (error) {
    console.error(error);
    return { formError: "학생을 배정하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }

  revalidatePath("/operator/schedules");
  revalidatePath(`/operator/schedules/${lessonId}`);
  redirect(`/operator/schedules/${lessonId}?assigned=1`);
}

export async function unassignStudent(
  lessonId: string,
  studentId: string,
  _previousState: ManagementActionState,
): Promise<ManagementActionState> {
  void _previousState;
  await requireAuthenticatedUser("/login/operator", "operator");
  if (!UUID_PATTERN.test(lessonId) || !UUID_PATTERN.test(studentId)) return { formError: "배정 정보를 찾을 수 없습니다." };

  const supabase = await createSupabaseServerClient();
  const [attendance, makeup, feedback] = await Promise.all([
    supabase.from("attendance_records").select("id").eq("lesson_id", lessonId).eq("student_id", studentId).limit(1),
    supabase.from("makeup_lessons").select("id").eq("student_id", studentId).or(`original_lesson_id.eq.${lessonId},replacement_lesson_id.eq.${lessonId}`).limit(1),
    supabase.from("lesson_feedback").select("id").eq("lesson_id", lessonId).eq("student_id", studentId).limit(1),
  ]);

  if (attendance.error || makeup.error || feedback.error) {
    if (attendance.error) console.error(attendance.error);
    if (makeup.error) console.error(makeup.error);
    if (feedback.error) console.error(feedback.error);
    return { formError: "관련 기록을 확인하지 못해 배정을 해제하지 않았습니다." };
  }
  if (attendance.data.length || makeup.data.length || feedback.data.length) {
    return { formError: "출결, 보강 또는 피드백 기록이 있어 배정을 해제할 수 없습니다. 관련 기록을 먼저 확인해 주세요." };
  }

  const { data: deleted, error } = await supabase
    .from("lesson_assignments")
    .delete()
    .eq("lesson_id", lessonId)
    .eq("student_id", studentId)
    .select("student_id")
    .maybeSingle();
  if (error || !deleted) {
    if (error) console.error(error);
    return { formError: "학생 배정을 해제하지 못했습니다." };
  }

  revalidatePath("/operator/schedules");
  revalidatePath(`/operator/schedules/${lessonId}`);
  revalidatePath(`/operator/students/${studentId}/lessons`);
  redirect(`/operator/schedules/${lessonId}?unassigned=1`);
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
