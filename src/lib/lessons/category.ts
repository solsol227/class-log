export const SCHEDULE_CATEGORIES = ["weekday", "weekend", "trial"] as const;
export type ScheduleCategory = (typeof SCHEDULE_CATEGORIES)[number];
export const SCHEDULE_CATEGORY_LABELS: Record<ScheduleCategory, string> = {
  weekday: "평일",
  weekend: "주말",
  trial: "체험",
};
export function isScheduleCategory(value: string): value is ScheduleCategory {
  return SCHEDULE_CATEGORIES.includes(value as ScheduleCategory);
}
export function scheduleCategoryLabel(value: string | null) {
  return value && isScheduleCategory(value) ? SCHEDULE_CATEGORY_LABELS[value] : "미분류";
}
