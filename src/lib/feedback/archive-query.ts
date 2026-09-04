export type FeedbackArchiveRange = "all" | "1m" | "3m" | "6m" | "custom";
export type FeedbackArchiveSort = "asc" | "desc";

type FeedbackArchiveParams = {
  range?: string;
  from?: string;
  to?: string;
  sort?: string;
};

export type FeedbackArchiveQuery = {
  range: FeedbackArchiveRange;
  sort: FeedbackArchiveSort;
  from: string | null;
  to: string | null;
  fromIso: string | null;
  toExclusiveIso: string | null;
  error: string | null;
};

const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const RANGES = new Set<FeedbackArchiveRange>(["all", "1m", "3m", "6m", "custom"]);

function isCalendarDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function kstDate(now: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(now);
}

function subtractCalendarMonths(value: string, months: number) {
  const [year, month, day] = value.split("-").map(Number);
  const firstOfTarget = new Date(Date.UTC(year, month - 1 - months, 1));
  const targetYear = firstOfTarget.getUTCFullYear();
  const targetMonth = firstOfTarget.getUTCMonth();
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

function toKstStartIso(value: string) {
  return new Date(`${value}T00:00:00+09:00`).toISOString();
}

function toKstNextDayIso(value: string) {
  const date = new Date(`${value}T00:00:00+09:00`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

export function parseFeedbackArchiveQuery(params: FeedbackArchiveParams, now = new Date()): FeedbackArchiveQuery {
  const sort: FeedbackArchiveSort = params.sort === "asc" ? "asc" : "desc";
  const requestedRange = params.range ?? (params.from || params.to ? "custom" : "all");
  if (!RANGES.has(requestedRange as FeedbackArchiveRange)) {
    return { range: "all", sort, from: null, to: null, fromIso: null, toExclusiveIso: null, error: "기간 조건이 올바르지 않아 전체 피드백을 표시합니다." };
  }

  const range = requestedRange as FeedbackArchiveRange;
  if (range === "all") return { range, sort, from: null, to: null, fromIso: null, toExclusiveIso: null, error: null };

  const today = kstDate(now);
  let from = params.from ?? "";
  let to = params.to ?? "";
  if (range !== "custom") {
    from = subtractCalendarMonths(today, Number(range[0]));
    to = today;
  }

  if (!isCalendarDate(from) || !isCalendarDate(to) || from > to) {
    return { range: "all", sort, from: null, to: null, fromIso: null, toExclusiveIso: null, error: "시작일과 종료일을 올바른 순서로 입력해 주세요. 전체 피드백을 표시합니다." };
  }

  return { range, sort, from, to, fromIso: toKstStartIso(from), toExclusiveIso: toKstNextDayIso(to), error: null };
}

export function feedbackArchiveHref(range: Exclude<FeedbackArchiveRange, "custom">, sort: FeedbackArchiveSort) {
  const query = new URLSearchParams({ range, sort });
  return `/student/feedback?${query.toString()}`;
}
