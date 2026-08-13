"use server";

import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_TIME_PATTERN =
  /^([1-9]\d{3})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):([0-5]\d)$/;
const GENERIC_ERROR =
  "수업을 등록하지 못했습니다. 잠시 후 다시 시도해 주세요.";

type LessonCreateFieldErrors = {
  title?: string;
  startsAt?: string;
  endsAt?: string;
};

export type LessonCreateActionState = {
  fieldErrors: LessonCreateFieldErrors;
  formError?: string;
  values?: {
    title: string;
    startsAt: string;
    endsAt: string;
    location: string;
    notes: string;
  };
};

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function toKstTimestamp(value: string) {
  const match = DATE_TIME_PATTERN.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const daysInMonth = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  if (day > daysInMonth[month - 1]) {
    return null;
  }

  return `${value}:00+09:00`;
}

export async function createLesson(
  studentId: string,
  _previousState: LessonCreateActionState,
  formData: FormData,
): Promise<LessonCreateActionState> {
  await requireAuthenticatedUser("/login/operator", "operator");

  const rawTitle = String(formData.get("title") ?? "");
  const startsAtInput = String(formData.get("starts_at") ?? "").trim();
  const endsAtInput = String(formData.get("ends_at") ?? "").trim();
  const rawLocation = String(formData.get("location") ?? "");
  const rawNotes = String(formData.get("notes") ?? "");
  const title = rawTitle.trim();
  const startsAt = toKstTimestamp(startsAtInput);
  const endsAt = toKstTimestamp(endsAtInput);
  const location = rawLocation.trim() || null;
  const notes = rawNotes.trim() || null;
  const fieldErrors: LessonCreateFieldErrors = {};
  const values = {
    title: rawTitle,
    startsAt: startsAtInput,
    endsAt: endsAtInput,
    location: rawLocation,
    notes: rawNotes,
  };

  if (!UUID_PATTERN.test(studentId)) {
    return { fieldErrors: {}, formError: GENERIC_ERROR, values };
  }

  if (!title) {
    fieldErrors.title = "수업 제목을 입력해 주세요.";
  }

  if (!startsAt) {
    fieldErrors.startsAt = "올바른 시작 시각을 입력해 주세요.";
  }

  if (!endsAt) {
    fieldErrors.endsAt = "올바른 종료 시각을 입력해 주세요.";
  }

  if (startsAt && endsAt && startsAtInput >= endsAtInput) {
    fieldErrors.endsAt = "종료 시각은 시작 시각보다 늦어야 합니다.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, values };
  }

  const supabase = await createSupabaseServerClient();
  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id")
    .eq("id", studentId)
    .maybeSingle();

  if (studentError || !student) {
    if (studentError) {
      console.error(studentError);
    }
    return { fieldErrors: {}, formError: GENERIC_ERROR, values };
  }

  const { data: lesson, error: insertError } = await supabase
    .from("lessons")
    .insert({
      title,
      starts_at: startsAt,
      ends_at: endsAt,
      location,
      notes,
    })
    .select("id")
    .single();

  if (insertError) {
    console.error(insertError);
    return { fieldErrors: {}, formError: GENERIC_ERROR, values };
  }

  const { error: assignmentError } = await supabase
    .from("lesson_assignments")
    .insert({ lesson_id: lesson.id, student_id: studentId });

  if (assignmentError) {
    console.error(assignmentError);
    const { error: cleanupError } = await supabase
      .from("lessons")
      .delete()
      .eq("id", lesson.id);
    if (cleanupError) console.error(cleanupError);
    return { fieldErrors: {}, formError: GENERIC_ERROR, values };
  }

  redirect(`/operator/schedules/${lesson.id}?created=1`);
}
