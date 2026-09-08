import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCommentAuthorNames, collectCommentAuthorIds } from "@/lib/feedback/comment-authors";
import { STAFF_ROLE_LABELS } from "@/lib/feedback/student-feedback";

export type OperatorFeedbackItem = {
  id: string;
  lessonId: string;
  studentId: string;
  studentName: string;
  lessonTitle: string;
  startsAt: string;
  endsAt: string;
  body: string;
  authorName: string;
  authorRole: string;
  authorStaffId: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  commentCount: number;
  comments: Array<{
    id: string;
    parentCommentId: string | null;
    body: string;
    createdAt: string;
    deletedAt: string | null;
    authorName: string;
  }>;
};

type FeedbackRow = {
  id: string;
  lesson_id: string;
  student_id: string;
  author_staff_id: string;
  body: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function loadOperatorStudentFeedback(
  supabase: SupabaseClient,
  student: { id: string; nickname: string },
) {
  const feedbackResult = await supabase
    .from("lesson_feedback")
    .select("id, lesson_id, student_id, author_staff_id, body, published_at, created_at, updated_at")
    .eq("student_id", student.id)
    .is("deleted_at", null);
  if (feedbackResult.error) {
    throw new Error("학생 피드백을 불러오지 못했습니다.", { cause: feedbackResult.error });
  }

  const feedback = (feedbackResult.data ?? []) as FeedbackRow[];
  if (!feedback.length) return [];

  const lessonIds = [...new Set(feedback.map((item) => item.lesson_id))];
  const feedbackIds = feedback.map((item) => item.id);
  const staffIds = [...new Set(feedback.map((item) => item.author_staff_id))];
  const [lessonsResult, staffResult, commentsResult] = await Promise.all([
    supabase.from("lessons").select("id, title, starts_at, ends_at").in("id", lessonIds),
    supabase.from("staff_profiles").select("id, display_name, role").in("id", staffIds),
    supabase
      .from("feedback_comments")
      .select("id, feedback_id, parent_comment_id, author_user_id, body, created_at, deleted_at")
      .in("feedback_id", feedbackIds)
      .order("created_at", { ascending: true }),
  ]);
  const loadError = lessonsResult.error ?? staffResult.error ?? commentsResult.error;
  if (loadError) throw new Error("피드백 상세 정보를 불러오지 못했습니다.", { cause: loadError });

  const comments = commentsResult.data ?? [];
  const authorUserIds = collectCommentAuthorIds(comments);
  const [commentStaffResult, commentStudentsResult] = authorUserIds.length
    ? await Promise.all([
        supabase.from("staff_profiles").select("auth_user_id, display_name").in("auth_user_id", authorUserIds),
        supabase.from("students").select("auth_user_id, nickname").in("auth_user_id", authorUserIds),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (commentStaffResult.error || commentStudentsResult.error) {
    throw new Error("댓글 작성자 정보를 불러오지 못했습니다.", { cause: commentStaffResult.error ?? commentStudentsResult.error });
  }

  const lessonById = new Map((lessonsResult.data ?? []).map((lesson) => [lesson.id, lesson]));
  const staffById = new Map((staffResult.data ?? []).map((member) => [member.id, member]));
  const commentAuthorNames = buildCommentAuthorNames(comments, commentStaffResult.data ?? [], commentStudentsResult.data ?? []);

  return feedback.flatMap<OperatorFeedbackItem>((item) => {
    const lesson = lessonById.get(item.lesson_id);
    if (!lesson) return [];
    const author = staffById.get(item.author_staff_id);
    const itemComments = comments.filter((comment) => comment.feedback_id === item.id);
    return [{
      id: item.id,
      lessonId: item.lesson_id,
      studentId: item.student_id,
      studentName: student.nickname,
      lessonTitle: lesson.title,
      startsAt: lesson.starts_at,
      endsAt: lesson.ends_at,
      body: item.body,
      authorName: author?.display_name ?? "작성자 확인 불가",
      authorRole: author ? STAFF_ROLE_LABELS[author.role] ?? author.role : "",
      authorStaffId: item.author_staff_id,
      publishedAt: item.published_at,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      commentCount: itemComments.filter((comment) => !comment.deleted_at).length,
      comments: itemComments.map((comment) => ({
        id: comment.id,
        parentCommentId: comment.parent_comment_id,
        body: comment.body,
        createdAt: comment.created_at,
        deletedAt: comment.deleted_at,
        authorName: commentAuthorNames.get(comment.author_user_id) ?? "작성자 확인 불가",
      })),
    }];
  }).sort(compareOperatorFeedbackDesc);
}

export function compareOperatorFeedbackDesc(left: OperatorFeedbackItem, right: OperatorFeedbackItem) {
  return right.startsAt.localeCompare(left.startsAt)
    || right.createdAt.localeCompare(left.createdAt)
    || right.id.localeCompare(left.id);
}

export function compareOperatorFeedbackAsc(left: OperatorFeedbackItem, right: OperatorFeedbackItem) {
  return left.startsAt.localeCompare(right.startsAt)
    || left.createdAt.localeCompare(right.createdAt)
    || left.id.localeCompare(right.id);
}
