"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function createMakeupRequest(formData: FormData) {
  await requireAuthenticatedUser("/login/operator", "operator");
  const originalLessonId = String(formData.get("original_lesson_id") ?? "");
  const studentId = String(formData.get("student_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("makeup_lessons").insert({ original_lesson_id: originalLessonId, student_id: studentId, reason });
  if (error) redirect(`/operator/makeup?error=${error.code === "23505" ? "duplicate" : "save"}`);
  revalidatePath("/operator/makeup"); redirect("/operator/makeup?updated=1");
}

export async function scheduleMakeup(makeupId: string, formData: FormData) {
  await requireAuthenticatedUser("/login/operator", "operator");
  const replacementLessonId = String(formData.get("replacement_lesson_id") ?? "");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("schedule_makeup_lesson", {
    target_makeup_id: makeupId,
    target_replacement_lesson_id: replacementLessonId,
  });
  if (error) redirect(`/operator/makeup?error=${error.code === "23P01" ? "conflict" : error.code === "23514" ? "program" : "save"}`);
  revalidatePath("/operator/makeup"); redirect("/operator/makeup?updated=1");
}

export async function completeMakeup(makeupId: string) {
  await requireAuthenticatedUser("/login/operator", "operator");
  const supabase = await createSupabaseServerClient();
  const { data: makeup } = await supabase.from("makeup_lessons").select("replacement_lesson_id, student_id").eq("id", makeupId).eq("status", "scheduled").maybeSingle();
  if (!makeup?.replacement_lesson_id) redirect("/operator/makeup?error=save");
  const { count } = await supabase.from("attendance_records").select("id", { count: "exact", head: true }).eq("lesson_id", makeup.replacement_lesson_id).eq("student_id", makeup.student_id);
  if (!count) redirect("/operator/makeup?error=attendance");
  await supabase.from("makeup_lessons").update({ status: "completed" }).eq("id", makeupId);
  revalidatePath("/operator/makeup"); redirect("/operator/makeup?updated=1");
}
