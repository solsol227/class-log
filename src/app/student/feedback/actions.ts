"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function addStudentComment(feedbackId: string, formData: FormData) {
  await requireAuthenticatedUser("/login/student", "student");
  const body = String(formData.get("body") ?? "").trim();
  const parentCommentId = String(formData.get("parent_comment_id") ?? "") || null;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("feedback_comments").insert({ feedback_id: feedbackId, parent_comment_id: parentCommentId, body });
  if (error) redirect("/student/feedback?error=1");
  revalidatePath("/student/feedback");
  redirect("/student/feedback?commented=1");
}
