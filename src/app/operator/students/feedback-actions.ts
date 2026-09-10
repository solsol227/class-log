"use server";

import { revalidatePath } from "next/cache";
import { requireOperatorAccess } from "@/lib/auth/operator-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type FeedbackDialogActionState = {
  status: "idle" | "success" | "error";
  message: string;
  body?: string;
  updatedAt?: string;
};

export type CommentDialogActionState = FeedbackDialogActionState & {
  deletedAt?: string;
};

export type FeedbackDeleteActionState = FeedbackDialogActionState & {
  deletedId?: string;
};

const isUuid = (value: string) => UUID_PATTERN.test(value);

function revalidateFeedbackPaths(lessonId: string, studentId: string) {
  revalidatePath(`/operator/schedules/${lessonId}`);
  revalidatePath(`/operator/students/${studentId}`);
  revalidatePath(`/operator/students/${studentId}/feedback`);
  revalidatePath(`/student/schedule/${lessonId}`);
  revalidatePath("/student/feedback");
}

async function findFeedback(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  studentId: string,
  feedbackId: string,
) {
  if (!isUuid(studentId) || !isUuid(feedbackId)) return null;
  const result = await supabase
    .from("lesson_feedback")
    .select("id, lesson_id, student_id, author_staff_id, created_by")
    .eq("id", feedbackId)
    .eq("student_id", studentId)
    .is("deleted_at", null)
    .maybeSingle();
  return result.error ? null : result.data;
}

async function canUpdateFeedback(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  access: Awaited<ReturnType<typeof requireOperatorAccess>>,
  feedback: NonNullable<Awaited<ReturnType<typeof findFeedback>>>,
) {
  if (access.isOwner) return true;
  if (feedback.created_by !== access.authUserId && feedback.author_staff_id !== access.staffProfileId) return false;
  const assignment = await supabase.from("lesson_staff").select("lesson_id").eq("lesson_id", feedback.lesson_id).eq("staff_id", access.staffProfileId!).maybeSingle();
  return !assignment.error && Boolean(assignment.data);
}

export async function updateFeedbackFromDialog(
  studentId: string,
  feedbackId: string,
  _previousState: FeedbackDialogActionState,
  formData: FormData,
): Promise<FeedbackDialogActionState> {
  const access = await requireOperatorAccess();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { status: "error", message: "피드백 내용을 입력해 주세요." };
  if (body.length > 10000) return { status: "error", message: "피드백은 10,000자 이하로 입력해 주세요." };

  const supabase = await createSupabaseServerClient();
  const feedback = await findFeedback(supabase, studentId, feedbackId);
  if (!feedback || !await canUpdateFeedback(supabase, access, feedback)) {
    return { status: "error", message: "이 피드백을 수정할 수 없습니다." };
  }

  const result = await supabase
    .from("lesson_feedback")
    .update({ body })
    .eq("id", feedbackId)
    .eq("lesson_id", feedback.lesson_id)
    .eq("student_id", studentId)
    .is("deleted_at", null)
    .select("body, updated_at")
    .maybeSingle();
  if (result.error || !result.data) return { status: "error", message: "피드백을 수정하지 못했습니다. 잠시 후 다시 시도해 주세요." };

  revalidateFeedbackPaths(feedback.lesson_id, studentId);
  return { status: "success", message: "피드백을 수정했습니다.", body: result.data.body, updatedAt: result.data.updated_at };
}

export async function deleteFeedbackFromDialog(
  studentId: string,
  feedbackId: string,
  _previousState: FeedbackDeleteActionState,
  _formData: FormData,
): Promise<FeedbackDeleteActionState> {
  void _previousState;
  void _formData;
  await requireOperatorAccess({ owner: true });

  const supabase = await createSupabaseServerClient();
  const feedback = await findFeedback(supabase, studentId, feedbackId);
  if (!feedback) return { status: "error", message: "삭제할 피드백을 찾을 수 없습니다." };

  const result = await supabase
    .from("lesson_feedback")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", feedbackId)
    .eq("lesson_id", feedback.lesson_id)
    .eq("student_id", studentId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (result.error || !result.data) return { status: "error", message: "피드백을 삭제하지 못했습니다." };

  revalidateFeedbackPaths(feedback.lesson_id, studentId);
  return { status: "success", message: "피드백을 삭제했습니다.", deletedId: result.data.id };
}

async function findOwnedComment(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  access: Awaited<ReturnType<typeof requireOperatorAccess>>,
  studentId: string,
  feedbackId: string,
  commentId: string,
) {
  if (!isUuid(commentId)) return null;
  const feedback = await findFeedback(supabase, studentId, feedbackId);
  if (!feedback) return null;
  if (!access.isOwner) {
    const assignment = await supabase.from("lesson_staff").select("lesson_id").eq("lesson_id", feedback.lesson_id).eq("staff_id", access.staffProfileId!).maybeSingle();
    if (assignment.error || !assignment.data) return null;
  }
  const comment = await supabase
    .from("feedback_comments")
    .select("id, author_user_id")
    .eq("id", commentId)
    .eq("feedback_id", feedbackId)
    .eq("author_user_id", access.authUserId)
    .is("deleted_at", null)
    .maybeSingle();
  return comment.error || !comment.data ? null : { feedback, comment: comment.data };
}

export async function updateOwnFeedbackComment(
  studentId: string,
  feedbackId: string,
  commentId: string,
  _previousState: CommentDialogActionState,
  formData: FormData,
): Promise<CommentDialogActionState> {
  const access = await requireOperatorAccess();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { status: "error", message: "댓글 내용을 입력해 주세요." };
  if (body.length > 2000) return { status: "error", message: "댓글은 2,000자 이하로 입력해 주세요." };

  const supabase = await createSupabaseServerClient();
  const context = await findOwnedComment(supabase, access, studentId, feedbackId, commentId);
  if (!context) return { status: "error", message: "본인이 작성한 댓글만 수정할 수 있습니다." };
  const result = await supabase.from("feedback_comments").update({ body }).eq("id", commentId).eq("feedback_id", feedbackId).eq("author_user_id", access.authUserId).is("deleted_at", null).select("body, updated_at").maybeSingle();
  if (result.error || !result.data) return { status: "error", message: "댓글을 수정하지 못했습니다." };

  revalidateFeedbackPaths(context.feedback.lesson_id, studentId);
  return { status: "success", message: "댓글을 수정했습니다.", body: result.data.body, updatedAt: result.data.updated_at };
}

export async function deleteOwnFeedbackComment(
  studentId: string,
  feedbackId: string,
  commentId: string,
  _previousState: CommentDialogActionState,
  _formData: FormData,
): Promise<CommentDialogActionState> {
  void _previousState;
  void _formData;
  const access = await requireOperatorAccess();
  const supabase = await createSupabaseServerClient();
  const context = await findOwnedComment(supabase, access, studentId, feedbackId, commentId);
  if (!context) return { status: "error", message: "본인이 작성한 댓글만 삭제할 수 있습니다." };

  const deletedAt = new Date().toISOString();
  const result = await supabase.from("feedback_comments").update({ deleted_at: deletedAt }).eq("id", commentId).eq("feedback_id", feedbackId).eq("author_user_id", access.authUserId).is("deleted_at", null).select("id").maybeSingle();
  if (result.error || !result.data) return { status: "error", message: "댓글을 삭제하지 못했습니다." };

  revalidateFeedbackPaths(context.feedback.lesson_id, studentId);
  return { status: "success", message: "댓글을 삭제했습니다.", deletedAt };
}
