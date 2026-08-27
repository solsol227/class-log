"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function createMakeupRequest(formData: FormData) {
  await requireAuthenticatedUser("/login/operator", "operator");
  const originalLessonId = String(formData.get("original_lesson_id") ?? "");
  const studentId = String(formData.get("student_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (!UUID_PATTERN.test(originalLessonId) || !UUID_PATTERN.test(studentId)) redirect("/operator/makeup?error=save");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("makeup_lessons").insert({ original_lesson_id: originalLessonId, student_id: studentId, reason }).select("id").maybeSingle();
  if (error || !data) redirect(`/operator/makeup?error=${error?.code === "23505" ? "duplicate" : "save"}`);
  revalidatePath("/operator/makeup"); redirect("/operator/makeup?updated=1");
}

export async function scheduleMakeup(makeupId: string, formData: FormData) {
  await requireAuthenticatedUser("/login/operator", "operator");
  const replacementLessonId = String(formData.get("replacement_lesson_id") ?? "");
  if (!UUID_PATTERN.test(makeupId) || !UUID_PATTERN.test(replacementLessonId)) redirect("/operator/makeup?error=save");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("schedule_makeup_lesson", {
    target_makeup_id: makeupId,
    target_replacement_lesson_id: replacementLessonId,
  });
  if (error || !data) redirect(`/operator/makeup?error=${error?.code === "23P01" ? "conflict" : error?.code === "23514" ? "program" : "save"}`);
  revalidatePath("/operator/makeup");
  revalidatePath("/operator/schedules");
  revalidatePath(`/operator/schedules/${replacementLessonId}`);
  revalidatePath("/student/schedule");
  redirect("/operator/makeup?updated=1");
}

export async function completeMakeup(makeupId: string) {
  await requireAuthenticatedUser("/login/operator", "operator");
  if (!UUID_PATTERN.test(makeupId)) redirect("/operator/makeup?error=save");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("complete_makeup_lesson", { target_makeup_id: makeupId });
  if (error || !data) redirect(`/operator/makeup?error=${error?.code === "23514" ? "attendance" : "save"}`);
  revalidatePath("/operator/makeup"); redirect("/operator/makeup?updated=1");
}
