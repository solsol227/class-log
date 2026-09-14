"use server";

import { revalidatePath } from "next/cache";
import { requireOperatorAccess } from "@/lib/auth/operator-access";
import {
  addDownloadFileName,
  FEEDBACK_ATTACHMENT_BUCKET,
  type FeedbackAttachment,
  validateAttachmentFile,
} from "@/lib/feedback/attachments";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AttachmentResult =
  | { status: "success"; attachment: FeedbackAttachment }
  | { status: "error"; message: string };

type ReservationResult =
  | { status: "success"; attachmentId: string; storagePath: string }
  | { status: "error"; message: string };

function revalidateFeedbackPaths(lessonId: string, studentId: string) {
  revalidatePath(`/operator/schedules/${lessonId}`);
  revalidatePath(`/operator/students/${studentId}`);
  revalidatePath(`/operator/students/${studentId}/feedback`);
  revalidatePath(`/student/schedule/${lessonId}`);
  revalidatePath("/student/feedback");
}

async function findAttachmentContext(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  attachmentId: string,
) {
  const attachment = await supabase
    .from("feedback_attachments")
    .select("id, feedback_id")
    .eq("id", attachmentId)
    .maybeSingle();
  if (attachment.error || !attachment.data) return null;
  const feedback = await supabase
    .from("lesson_feedback")
    .select("lesson_id, student_id")
    .eq("id", attachment.data.feedback_id)
    .is("deleted_at", null)
    .maybeSingle();
  return feedback.error || !feedback.data ? null : feedback.data;
}

export async function reserveFeedbackAttachment(
  feedbackId: string,
  input: { name: string; type: string; size: number; clientRequestId: string },
): Promise<ReservationResult> {
  await requireOperatorAccess();
  if (!UUID_PATTERN.test(feedbackId) || !UUID_PATTERN.test(input.clientRequestId)) {
    return { status: "error", message: "첨부 요청을 다시 시도해 주세요." };
  }
  const validationError = validateAttachmentFile(input);
  if (validationError) return { status: "error", message: validationError };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("reserve_feedback_attachment", {
    target_feedback_id: feedbackId,
    target_original_file_name: input.name,
    target_mime_type: input.type.toLowerCase(),
    target_size_bytes: input.size,
    target_client_request_id: input.clientRequestId,
  });
  const row = data?.[0];
  if (error || !row || row.status !== "pending") {
    return { status: "error", message: "첨부 가능한 개수와 전체 용량을 확인해 주세요." };
  }
  return { status: "success", attachmentId: row.attachment_id, storagePath: row.storage_path };
}

export async function finalizeFeedbackAttachment(attachmentId: string): Promise<AttachmentResult> {
  await requireOperatorAccess();
  if (!UUID_PATTERN.test(attachmentId)) return { status: "error", message: "첨부 요청이 올바르지 않습니다." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("finalize_feedback_attachment", { target_attachment_id: attachmentId });
  const row = data?.[0];
  if (error || !row) {
    const failed = await supabase.rpc("fail_feedback_attachment", { target_attachment_id: attachmentId });
    if (!failed.error && failed.data) {
      const removed = await createSupabaseAdminClient().storage.from(FEEDBACK_ATTACHMENT_BUCKET).remove([failed.data]);
      if (removed.error) console.error("feedback attachment compensation remove failed", { attachmentId, code: removed.error.name });
    } else {
      console.error("feedback attachment compensation metadata failed", { attachmentId, code: failed.error?.code });
    }
    return { status: "error", message: "파일 검증에 실패했습니다. 파일을 다시 선택해 주세요." };
  }
  const context = await supabase.from("lesson_feedback").select("lesson_id, student_id").eq("id", row.feedback_id).maybeSingle();
  if (!context.error && context.data) revalidateFeedbackPaths(context.data.lesson_id, context.data.student_id);
  return {
    status: "success",
    attachment: {
      id: row.attachment_id,
      feedbackId: row.feedback_id,
      originalFileName: row.original_file_name,
      mimeType: row.mime_type,
      sizeBytes: Number(row.size_bytes),
      sortOrder: row.sort_order,
      createdAt: row.created_at,
    },
  };
}

export async function abortFeedbackAttachment(attachmentId: string) {
  await requireOperatorAccess();
  if (!UUID_PATTERN.test(attachmentId)) return;
  const supabase = await createSupabaseServerClient();
  const failed = await supabase.rpc("fail_feedback_attachment", { target_attachment_id: attachmentId });
  if (failed.error || !failed.data) {
    console.error("feedback attachment abort metadata failed", { attachmentId, code: failed.error?.code });
    return;
  }
  const removed = await createSupabaseAdminClient().storage.from(FEEDBACK_ATTACHMENT_BUCKET).remove([failed.data]);
  if (removed.error) console.error("feedback attachment abort remove failed", { attachmentId, code: removed.error.name });
}

export async function deleteFeedbackAttachment(attachmentId: string) {
  await requireOperatorAccess();
  if (!UUID_PATTERN.test(attachmentId)) return { status: "error" as const, message: "첨부 요청이 올바르지 않습니다." };
  const supabase = await createSupabaseServerClient();
  const context = await findAttachmentContext(supabase, attachmentId);
  const begun = await supabase.rpc("begin_delete_feedback_attachment", { target_attachment_id: attachmentId });
  if (begun.error || !begun.data) return { status: "error" as const, message: "이 첨부파일을 삭제할 수 없습니다." };

  const removed = await createSupabaseAdminClient().storage.from(FEEDBACK_ATTACHMENT_BUCKET).remove([begun.data]);
  if (removed.error) {
    console.error("feedback attachment object delete failed", { attachmentId, code: removed.error.name });
    return { status: "error" as const, hidden: true, message: "첨부 접근은 차단했지만 파일 정리가 지연되고 있습니다. 관리자에게 문의해 주세요." };
  }
  const finished = await supabase.rpc("finish_delete_feedback_attachment", { target_attachment_id: attachmentId });
  if (finished.error) {
    console.error("feedback attachment metadata cleanup failed", { attachmentId, code: finished.error.code });
    return { status: "error" as const, hidden: true, message: "파일은 삭제했지만 목록 정리가 지연되고 있습니다. 새로고침 후 확인해 주세요." };
  }
  if (context) revalidateFeedbackPaths(context.lesson_id, context.student_id);
  return { status: "success" as const, deletedId: attachmentId };
}

export async function getFeedbackAttachmentSignedUrl(
  attachmentId: string,
  disposition: "inline" | "download",
) {
  if (!UUID_PATTERN.test(attachmentId)) return { status: "error" as const, message: "첨부파일을 찾을 수 없습니다." };
  const supabase = await createSupabaseServerClient();
  const attachment = await supabase
    .from("feedback_attachments")
    .select("storage_path, original_file_name, mime_type, size_bytes")
    .eq("id", attachmentId)
    .eq("status", "ready")
    .maybeSingle();
  if (attachment.error || !attachment.data || validateAttachmentFile({
    name: attachment.data.original_file_name,
    type: attachment.data.mime_type,
    size: Number(attachment.data.size_bytes),
  })) {
    return { status: "error" as const, message: "이 첨부파일에 접근할 수 없습니다." };
  }
  const storage = supabase.storage.from(FEEDBACK_ATTACHMENT_BUCKET);
  const objectInfo = await storage.info(attachment.data.storage_path);
  const objectSize = Number(objectInfo.data?.size ?? 0);
  const objectMimeType = objectInfo.data?.contentType?.toLowerCase();
  if (
    objectInfo.error
    || objectSize <= 0
    || objectSize !== Number(attachment.data.size_bytes)
    || objectMimeType !== attachment.data.mime_type.toLowerCase()
  ) {
    return { status: "error" as const, message: "첨부파일 원본을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요." };
  }
  const signed = await storage.createSignedUrl(attachment.data.storage_path, 120);
  if (signed.error || !signed.data?.signedUrl) return { status: "error" as const, message: "첨부파일을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." };
  let url = signed.data.signedUrl;
  if (disposition === "download") {
    try {
      url = addDownloadFileName(url, attachment.data.original_file_name);
    } catch {
      return { status: "error" as const, message: "다운로드 주소를 만들지 못했습니다. 잠시 후 다시 시도해 주세요." };
    }
  }
  return {
    status: "success" as const,
    url,
    originalFileName: attachment.data.original_file_name,
    mimeType: attachment.data.mime_type,
    sizeBytes: Number(attachment.data.size_bytes),
    expiresAt: Date.now() + 110_000,
  };
}
