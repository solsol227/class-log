"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function feedbackError(lessonId: string): never {
  redirect(`/operator/schedules/${lessonId}?feedbackError=1`);
}

export async function createFeedback(lessonId: string, formData: FormData) {
  await requireAuthenticatedUser("/login/operator", "operator");
  const body = String(formData.get("body") ?? "").trim();
  const studentId = String(formData.get("student_id") ?? "");
  const authorStaffId = String(formData.get("author_staff_id") ?? "");
  const publishedAt = formData.get("published") === "on" ? new Date().toISOString() : null;
  if (!UUID_PATTERN.test(lessonId) || !UUID_PATTERN.test(studentId) || !UUID_PATTERN.test(authorStaffId) || !body) feedbackError(lessonId);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("lesson_feedback").insert({ lesson_id: lessonId, student_id: studentId, author_staff_id: authorStaffId, body, published_at: publishedAt }).select("id").maybeSingle();
  if (error || !data) feedbackError(lessonId);
  revalidatePath(`/operator/schedules/${lessonId}`);
  revalidatePath("/student/feedback");
  redirect(`/operator/schedules/${lessonId}?feedbackUpdated=1`);
}

export async function updateFeedback(lessonId: string, feedbackId: string, formData: FormData) {
  await requireAuthenticatedUser("/login/operator", "operator");
  const body = String(formData.get("body") ?? "").trim();
  const publishedAt = formData.get("published") === "on" ? new Date().toISOString() : null;
  if (!UUID_PATTERN.test(lessonId) || !UUID_PATTERN.test(feedbackId) || !body) feedbackError(lessonId);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("lesson_feedback").update({ body, published_at: publishedAt }).eq("id", feedbackId).eq("lesson_id", lessonId).is("deleted_at", null).select("id").maybeSingle();
  if (error || !data) feedbackError(lessonId);
  revalidatePath(`/operator/schedules/${lessonId}`);
  revalidatePath("/student/feedback");
  redirect(`/operator/schedules/${lessonId}?feedbackUpdated=1`);
}

export async function deleteFeedback(lessonId: string, feedbackId: string) {
  await requireAuthenticatedUser("/login/operator", "operator");
  if (!UUID_PATTERN.test(lessonId) || !UUID_PATTERN.test(feedbackId)) feedbackError(lessonId);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("lesson_feedback").update({ deleted_at: new Date().toISOString() }).eq("id", feedbackId).eq("lesson_id", lessonId).is("deleted_at", null).select("id").maybeSingle();
  if (error || !data) feedbackError(lessonId);
  revalidatePath(`/operator/schedules/${lessonId}`);
  revalidatePath("/student/feedback");
  redirect(`/operator/schedules/${lessonId}?feedbackUpdated=1`);
}

export async function addOperatorComment(lessonId: string, feedbackId: string, formData: FormData) {
  await requireAuthenticatedUser("/login/operator", "operator");
  const body = String(formData.get("body") ?? "").trim();
  const parentCommentId = String(formData.get("parent_comment_id") ?? "") || null;
  if (!UUID_PATTERN.test(lessonId) || !UUID_PATTERN.test(feedbackId) || (parentCommentId && !UUID_PATTERN.test(parentCommentId)) || !body) feedbackError(lessonId);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("feedback_comments").insert({ feedback_id: feedbackId, parent_comment_id: parentCommentId, body }).select("id").maybeSingle();
  if (error || !data) feedbackError(lessonId);
  revalidatePath(`/operator/schedules/${lessonId}`);
  revalidatePath("/student/feedback");
  redirect(`/operator/schedules/${lessonId}?feedbackUpdated=1`);
}
