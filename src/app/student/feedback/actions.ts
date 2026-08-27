"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function addStudentComment(feedbackId: string, formData: FormData) {
  await requireAuthenticatedUser("/login/student", "student");
  const body = String(formData.get("body") ?? "").trim();
  const parentCommentId = String(formData.get("parent_comment_id") ?? "") || null;
  if (!UUID_PATTERN.test(feedbackId) || (parentCommentId && !UUID_PATTERN.test(parentCommentId)) || !body) redirect("/student/feedback?error=1");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("feedback_comments").insert({ feedback_id: feedbackId, parent_comment_id: parentCommentId, body }).select("id").maybeSingle();
  if (error || !data) redirect("/student/feedback?error=1");
  revalidatePath("/student/feedback");
  redirect("/student/feedback?commented=1");
}
