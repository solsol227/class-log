import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import { buildCommentAuthorNames, collectCommentAuthorIds } from "@/lib/feedback/comment-authors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { addStudentComment } from "./actions";

function formatCommentTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

export default async function StudentFeedbackPage({ searchParams }: { searchParams: Promise<{ error?: string; commented?: string }> }) {
  await requireAuthenticatedUser("/login/student", "student");
  const notices = await searchParams;
  const supabase = await createSupabaseServerClient();
  const [feedbackResult, commentsResult] = await Promise.all([
    supabase.from("lesson_feedback").select("id, lesson_id, author_staff_id, body, published_at").order("published_at", { ascending: false }),
    supabase.from("feedback_comments").select("id, feedback_id, parent_comment_id, author_user_id, body, created_at").order("created_at"),
  ]);
  if (feedbackResult.error || commentsResult.error) {
    throw new Error("피드백을 불러오지 못했습니다.", { cause: feedbackResult.error ?? commentsResult.error });
  }

  const feedback = feedbackResult.data;
  const comments = commentsResult.data;
  const lessonIds = [...new Set(feedback.map((item) => item.lesson_id))];
  const feedbackStaffIds = [...new Set(feedback.map((item) => item.author_staff_id))];
  const commentAuthorIds = collectCommentAuthorIds(comments);
  const [lessonsResult, feedbackStaffResult, commentStaffResult, commentStudentsResult] = await Promise.all([
    lessonIds.length ? supabase.from("lessons").select("id, title").in("id", lessonIds) : Promise.resolve({ data: [], error: null }),
    feedbackStaffIds.length ? supabase.from("staff_profiles").select("id, display_name").in("id", feedbackStaffIds) : Promise.resolve({ data: [], error: null }),
    commentAuthorIds.length ? supabase.from("staff_profiles").select("auth_user_id, display_name").in("auth_user_id", commentAuthorIds) : Promise.resolve({ data: [], error: null }),
    commentAuthorIds.length ? supabase.from("students").select("auth_user_id, nickname").in("auth_user_id", commentAuthorIds) : Promise.resolve({ data: [], error: null }),
  ]);
  const relatedError = lessonsResult.error ?? feedbackStaffResult.error ?? commentStaffResult.error ?? commentStudentsResult.error;
  if (relatedError) throw new Error("피드백 작성자 정보를 불러오지 못했습니다.", { cause: relatedError });

  const lessonTitles = new Map((lessonsResult.data ?? []).map((lesson) => [lesson.id, lesson.title]));
  const feedbackStaffNames = new Map((feedbackStaffResult.data ?? []).map((member) => [member.id, member.display_name]));
  const commentAuthorNames = buildCommentAuthorNames(comments, commentStaffResult.data ?? [], commentStudentsResult.data ?? []);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10">
      <h1 className="text-3xl font-bold">내 피드백</h1>
      {notices.error ? <p className="mt-4 text-rose-800">댓글을 저장하지 못했습니다.</p> : null}
      {feedback.length ? (
        <ul className="mt-6 space-y-5">
          {feedback.map((item) => (
            <li key={item.id} className="rounded-2xl border border-[var(--line)] bg-white p-6">
              <p className="text-sm font-bold text-[var(--accent-strong)]">{lessonTitles.get(item.lesson_id) ?? "일정"}</p>
              <p className="mt-3 whitespace-pre-wrap leading-7">{item.body}</p>
              <p className="mt-2 text-sm text-[var(--muted)]">제공: {feedbackStaffNames.get(item.author_staff_id) ?? "담당자"}</p>
              <ul className="mt-4 space-y-2">
                {comments.filter((comment) => comment.feedback_id === item.id).map((comment) => (
                  <li key={comment.id} className="rounded-lg bg-[#f4f8f7] p-3">
                    <p className="text-sm font-bold">{commentAuthorNames.get(comment.author_user_id) ?? "작성자 확인 불가"}<span className="ml-2 font-normal text-[var(--muted)]">{formatCommentTime(comment.created_at)}</span></p>
                    <p className="mt-1">{comment.body}</p>
                    <form action={addStudentComment.bind(null, item.id)} className="mt-2 flex gap-2">
                      <input type="hidden" name="parent_comment_id" value={comment.id} />
                      <input name="body" required placeholder="답글" className="h-9 flex-1 rounded-lg border px-2" />
                      <button className="rounded-lg border px-3 text-sm font-bold">답글</button>
                    </form>
                  </li>
                ))}
              </ul>
              <form action={addStudentComment.bind(null, item.id)} className="mt-4 flex gap-2">
                <input name="body" required placeholder="댓글을 입력하세요" className="h-10 flex-1 rounded-lg border px-3" />
                <button className="rounded-lg bg-[var(--accent)] px-4 font-bold text-white">등록</button>
              </form>
            </li>
          ))}
        </ul>
      ) : <p className="mt-6 rounded-2xl border bg-white p-6 text-[var(--muted)]">게시된 피드백이 없습니다.</p>}
    </main>
  );
}
