const ALLOWED_STUDENT_RETURN_PATHS = new Set([
  "/student/schedule",
  "/student/feedback",
]);

export function getSafeStudentReturnPath(value: string | string[] | undefined) {
  if (typeof value !== "string" || !value.startsWith("/")) return "/student/schedule";

  try {
    const url = new URL(value, "https://class-log.local");
    if (url.origin !== "https://class-log.local" || !ALLOWED_STUDENT_RETURN_PATHS.has(url.pathname) || url.hash) {
      return "/student/schedule";
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return "/student/schedule";
  }
}

export function isStudentFeedbackReturnPath(value: string) {
  return value === "/student/feedback" || value.startsWith("/student/feedback?");
}
