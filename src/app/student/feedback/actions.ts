"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function feedbackDetailPath(lessonId: string, feedbackId: string, error = false) {
  return `/student/schedule/${lessonId}${error ? "?feedbackError=1" : ""}#feedback-${feedbackId}`;
}

export async function addStudentComment(feedbackId: string, lessonId: string, formData: FormData) {
  await requireAuthenticatedUser("/login/student", "student");
  const body = String(formData.get("body") ?? "").trim();
  const parentCommentId = String(formData.get("parent_comment_id") ?? "") || null;
  if (!UUID_PATTERN.test(feedbackId) || !UUID_PATTERN.test(lessonId) || (parentCommentId && !UUID_PATTERN.test(parentCommentId)) || !body || body.length > 2000) {
    redirect(UUID_PATTERN.test(feedbackId) && UUID_PATTERN.test(lessonId) ? feedbackDetailPath(lessonId, feedbackId, true) : "/student/schedule");
  }
  const supabase = await createSupabaseServerClient();
  const { data: feedback, error: feedbackError } = await supabase
    .from("lesson_feedback")
    .select("id")
    .eq("id", feedbackId)
    .eq("lesson_id", lessonId)
    .is("deleted_at", null)
    .maybeSingle();
  if (feedbackError || !feedback) redirect(feedbackDetailPath(lessonId, feedbackId, true));
  const { data, error } = await supabase.from("feedback_comments").insert({ feedback_id: feedbackId, parent_comment_id: parentCommentId, body }).select("id").maybeSingle();
  if (error || !data) redirect(feedbackDetailPath(lessonId, feedbackId, true));
  revalidatePath("/student/feedback");
  revalidatePath(`/student/schedule/${lessonId}`);
  revalidatePath("/operator/schedules/[lessonId]", "page");
  redirect(feedbackDetailPath(lessonId, feedbackId));
}
