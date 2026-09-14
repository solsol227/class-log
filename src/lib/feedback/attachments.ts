import type { SupabaseClient } from "@supabase/supabase-js";

export const FEEDBACK_ATTACHMENT_BUCKET = "feedback-attachments";
export const MAX_FEEDBACK_ATTACHMENTS = 5;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
export const MAX_FEEDBACK_ATTACHMENT_BYTES = 150 * 1024 * 1024;

export const ALLOWED_ATTACHMENT_TYPES = new Map<string, Set<string>>([
  ["image/jpeg", new Set(["jpg", "jpeg"])],
  ["image/png", new Set(["png"])],
  ["image/webp", new Set(["webp"])],
  ["audio/mpeg", new Set(["mp3"])],
  ["audio/mp4", new Set(["m4a"])],
  ["audio/x-m4a", new Set(["m4a"])],
  ["audio/wav", new Set(["wav"])],
  ["audio/x-wav", new Set(["wav"])],
  ["audio/webm", new Set(["webm"])],
]);

export type FeedbackAttachment = {
  id: string;
  feedbackId: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  sortOrder: number;
  createdAt: string;
};

export function validateAttachmentFile(file: Pick<File, "name" | "type" | "size">) {
  const mimeType = file.type.toLowerCase();
  const allowedExtensions = ALLOWED_ATTACHMENT_TYPES.get(mimeType);
  const extension = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  if (!allowedExtensions?.has(extension)) {
    return "JPEG, PNG, WebP 이미지 또는 MP3, M4A, WAV, WebM 녹음파일만 첨부할 수 있습니다.";
  }
  if (!file.name || file.name.length > 255 || /[\\/\u0000-\u001f\u007f]/.test(file.name)) {
    return "파일 이름을 확인해 주세요.";
  }
  const maximum = mimeType.startsWith("image/") ? MAX_IMAGE_BYTES : MAX_AUDIO_BYTES;
  if (file.size <= 0 || file.size > maximum) {
    return mimeType.startsWith("image/")
      ? "이미지는 파일당 10MB까지 첨부할 수 있습니다."
      : "녹음파일은 파일당 100MB까지 첨부할 수 있습니다.";
  }
  return null;
}

export function formatAttachmentSize(bytes: number) {
  if (bytes <= 0) return "0KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)}MB`;
}

export function addDownloadFileName(signedUrl: string, originalFileName: string) {
  const downloadUrl = new URL(signedUrl);
  downloadUrl.searchParams.set("download", originalFileName);
  return downloadUrl.toString();
}

export async function loadFeedbackAttachments(supabase: SupabaseClient, feedbackIds: string[]) {
  const result = new Map<string, FeedbackAttachment[]>();
  if (!feedbackIds.length) return result;
  const { data, error } = await supabase
    .from("feedback_attachments")
    .select("id, feedback_id, original_file_name, mime_type, size_bytes, sort_order, created_at")
    .in("feedback_id", feedbackIds)
    .eq("status", "ready")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error("피드백 첨부파일을 불러오지 못했습니다.", { cause: error });
  for (const row of data ?? []) {
    const items = result.get(row.feedback_id) ?? [];
    items.push({
      id: row.id,
      feedbackId: row.feedback_id,
      originalFileName: row.original_file_name,
      mimeType: row.mime_type,
      sizeBytes: Number(row.size_bytes),
      sortOrder: row.sort_order,
      createdAt: row.created_at,
    });
    result.set(row.feedback_id, items);
  }
  return result;
}
