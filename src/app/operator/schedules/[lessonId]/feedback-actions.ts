"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function createFeedback(lessonId: string, formData: FormData) {
  await requireAuthenticatedUser("/login/operator", "operator");
  const body = String(formData.get("body") ?? "").trim();
  const studentId = String(formData.get("student_id") ?? "");
  const authorStaffId = String(formData.get("author_staff_id") ?? "");
  const publishedAt = formData.get("published") === "on" ? new Date().toISOString() : null;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("lesson_feedback").insert({ lesson_id: lessonId, student_id: studentId, author_staff_id: authorStaffId, body, published_at: publishedAt });
  if (error) redirect(`/operator/schedules/${lessonId}?feedbackError=1`);
  revalidatePath(`/operator/schedules/${lessonId}`);
  redirect(`/operator/schedules/${lessonId}?feedbackUpdated=1`);
}

export async function updateFeedback(lessonId: string, feedbackId: string, formData: FormData) {
  await requireAuthenticatedUser("/login/operator", "operator");
  const body = String(formData.get("body") ?? "").trim();
  const publishedAt = formData.get("published") === "on" ? new Date().toISOString() : null;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("lesson_feedback").update({ body, published_at: publishedAt }).eq("id", feedbackId).eq("lesson_id", lessonId).is("deleted_at", null);
  if (error) redirect(`/operator/schedules/${lessonId}?feedbackError=1`);
  revalidatePath(`/operator/schedules/${lessonId}`);
  redirect(`/operator/schedules/${lessonId}?feedbackUpdated=1`);
}

export async function deleteFeedback(lessonId: string, feedbackId: string) {
  await requireAuthenticatedUser("/login/operator", "operator");
  const supabase = await createSupabaseServerClient();
  await supabase.from("lesson_feedback").update({ deleted_at: new Date().toISOString() }).eq("id", feedbackId).eq("lesson_id", lessonId);
  revalidatePath(`/operator/schedules/${lessonId}`);
  redirect(`/operator/schedules/${lessonId}?feedbackUpdated=1`);
}

export async function addOperatorComment(lessonId: string, feedbackId: string, formData: FormData) {
  await requireAuthenticatedUser("/login/operator", "operator");
  const body = String(formData.get("body") ?? "").trim();
  const parentCommentId = String(formData.get("parent_comment_id") ?? "") || null;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("feedback_comments").insert({ feedback_id: feedbackId, parent_comment_id: parentCommentId, body });
  if (error) redirect(`/operator/schedules/${lessonId}?feedbackError=1`);
  revalidatePath(`/operator/schedules/${lessonId}`);
  redirect(`/operator/schedules/${lessonId}?feedbackUpdated=1`);
}
