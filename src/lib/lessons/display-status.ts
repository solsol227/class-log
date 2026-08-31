export const LESSON_DISPLAY_STATUS_LABELS = {
  draft: "Draft",
  scheduled: "예정",
  completed: "완료",
  cancelled: "취소",
} as const;

export type LessonDisplayStatus = keyof typeof LESSON_DISPLAY_STATUS_LABELS;

export function getLessonDisplayStatus(status: string, endsAt: string, now = Date.now()): LessonDisplayStatus {
  if (status === "draft") return "draft";
  if (status === "cancelled") return "cancelled";

  const endTime = new Date(endsAt).getTime();
  if (Number.isNaN(endTime)) return status === "completed" ? "completed" : "scheduled";
  return endTime > now ? "scheduled" : "completed";
}

export function getLessonDisplayStatusLabel(status: string, endsAt: string, now = Date.now()) {
  return LESSON_DISPLAY_STATUS_LABELS[getLessonDisplayStatus(status, endsAt, now)];
}
