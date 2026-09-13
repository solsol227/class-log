"use client";

import {
  abortFeedbackAttachment,
  finalizeFeedbackAttachment,
  reserveFeedbackAttachment,
} from "@/app/feedback-attachment-actions";
import { FEEDBACK_ATTACHMENT_BUCKET, type FeedbackAttachment } from "@/lib/feedback/attachments";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export async function uploadFeedbackAttachments(
  feedbackId: string,
  files: File[],
  onProgress: (completed: number, total: number) => void,
) {
  const supabase = createSupabaseBrowserClient();
  const uploaded: FeedbackAttachment[] = [];
  const failed: Array<{ file: File; message: string }> = [];

  for (const file of files) {
    const clientRequestId = crypto.randomUUID();
    const reserved = await reserveFeedbackAttachment(feedbackId, {
      name: file.name,
      type: file.type,
      size: file.size,
      clientRequestId,
    });
    if (reserved.status === "error") {
      failed.push({ file, message: reserved.message });
      onProgress(uploaded.length + failed.length, files.length);
      continue;
    }

    const stored = await supabase.storage.from(FEEDBACK_ATTACHMENT_BUCKET).upload(
      reserved.storagePath,
      file,
      { contentType: file.type, cacheControl: "3600", upsert: false },
    );
    if (stored.error) {
      await abortFeedbackAttachment(reserved.attachmentId);
      failed.push({ file, message: "파일 업로드에 실패했습니다." });
      onProgress(uploaded.length + failed.length, files.length);
      continue;
    }

    const finalized = await finalizeFeedbackAttachment(reserved.attachmentId);
    if (finalized.status === "success") uploaded.push(finalized.attachment);
    else failed.push({ file, message: finalized.message });
    onProgress(uploaded.length + failed.length, files.length);
  }

  return { uploaded, failed };
}
