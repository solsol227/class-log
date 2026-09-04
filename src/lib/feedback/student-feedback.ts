import type { SupabaseClient } from "@supabase/supabase-js";
import { buildVisibleCommentAuthorNames } from "@/lib/feedback/comment-authors";

export const STUDENT_FEEDBACK_LIMIT = 200;
export const STUDENT_COMMENT_LIMIT = 1000;

export type StudentFeedbackComment = {
  id: string;
  feedback_id: string;
  parent_comment_id: string | null;
  body: string;
  created_at: string;
};

export type StudentFeedbackAuthor = {
  feedback_id: string;
  display_name: string;
  role: string;
};

export const STAFF_ROLE_LABELS: Record<string, string> = {
  manager: "매니저",
  vocal_trainer: "보컬트레이너",
};

export const PROGRAM_LABELS: Record<string, string> = {
  rental: "대여",
  weekday_vocal: "평일보컬",
  weekend_vocal: "주말보컬",
  trial: "체험",
};

export async function loadStudentLessonPrograms(supabase: SupabaseClient, lessonIds: string[]) {
  if (!lessonIds.length) return new Map<string, string>();
  const assignments = await supabase.from("lesson_assignments").select("lesson_id, student_program_id").in("lesson_id", lessonIds).is("unassigned_at", null);
  if (assignments.error) throw new Error("이용권 정보를 불러오지 못했습니다.", { cause: assignments.error });
  const programIds = [...new Set((assignments.data ?? []).map((row) => row.student_program_id).filter(Boolean))];
  const programs = programIds.length
    ? await supabase.from("student_programs").select("id, program_type").in("id", programIds)
    : { data: [], error: null };
  if (programs.error) throw new Error("이용권 정보를 불러오지 못했습니다.", { cause: programs.error });
  const types = new Map((programs.data ?? []).map((program) => [program.id, program.program_type]));
  return new Map((assignments.data ?? []).map((assignment) => [assignment.lesson_id, types.get(assignment.student_program_id) ?? ""]));
}

export async function loadStudentFeedbackAuthors(supabase: SupabaseClient, feedbackIds: string[]) {
  if (feedbackIds.length === 0) return new Map<string, StudentFeedbackAuthor>();

  const { data, error } = await supabase.rpc("get_student_feedback_authors", {
    target_feedback_ids: feedbackIds.slice(0, STUDENT_FEEDBACK_LIMIT),
  });
  if (error) throw new Error("피드백 제공자 정보를 불러오지 못했습니다.", { cause: error });

  return new Map(
    ((data ?? []) as StudentFeedbackAuthor[]).map((author) => [author.feedback_id, author]),
  );
}

export async function loadStudentCommentAuthorNames(
  supabase: SupabaseClient,
  comments: StudentFeedbackComment[],
) {
  if (comments.length === 0) return new Map<string, string>();
  const { data, error } = await supabase.rpc("get_student_feedback_comment_authors", {
    target_comment_ids: comments.slice(0, STUDENT_COMMENT_LIMIT).map((comment) => comment.id),
  });
  if (error) throw new Error("댓글 작성자 정보를 불러오지 못했습니다.", { cause: error });

  return buildVisibleCommentAuthorNames(comments, (data ?? []) as { comment_id: string; display_name: string }[]);
}

export function countCommentsByFeedback(comments: { feedback_id: string }[]) {
  const counts = new Map<string, number>();
  for (const comment of comments) counts.set(comment.feedback_id, (counts.get(comment.feedback_id) ?? 0) + 1);
  return counts;
}
