import { addStudentComment } from "@/app/student/feedback/actions";
import type { StudentFeedbackComment } from "@/lib/feedback/student-feedback";

type FeedbackThreadProps = {
  feedbackId: string;
  lessonId: string;
  comments: StudentFeedbackComment[];
  authorNames: Map<string, string>;
};

function formatCommentTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function ReplyForm({ feedbackId, lessonId, parentCommentId }: { feedbackId: string; lessonId: string; parentCommentId: string }) {
  return (
    <details className="mt-2">
      <summary className="min-h-10 cursor-pointer py-2 text-sm font-bold text-[var(--accent-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">답글 달기</summary>
      <form action={addStudentComment.bind(null, feedbackId, lessonId)} className="flex min-w-0 flex-col gap-2 sm:flex-row">
        <input type="hidden" name="parent_comment_id" value={parentCommentId} />
        <label className="sr-only" htmlFor={`reply-${parentCommentId}`}>답글 내용</label>
        <input id={`reply-${parentCommentId}`} name="body" required maxLength={2000} placeholder="답글을 입력하세요" className="min-h-11 min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-white px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]" />
        <button className="min-h-11 rounded-xl border border-[var(--accent)] px-4 font-bold text-[var(--accent-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">답글 등록</button>
      </form>
    </details>
  );
}

function CommentCard({ comment, feedbackId, lessonId, authorNames, reply }: { comment: StudentFeedbackComment; feedbackId: string; lessonId: string; authorNames: Map<string, string>; reply?: boolean }) {
  return (
    <article className={`rounded-xl bg-[#f4f8f7] p-3 sm:p-4 ${reply ? "ml-3 border-l-2 border-[var(--line)] sm:ml-6" : ""}`}>
      <p className="text-sm font-bold">
        {authorNames.get(comment.id) ?? "작성자 확인 불가"}
        <span className="ml-2 font-normal text-[var(--muted)]">{formatCommentTime(comment.created_at)}</span>
      </p>
      <p className="mt-1 whitespace-pre-wrap break-words leading-6">{comment.body}</p>
      <ReplyForm feedbackId={feedbackId} lessonId={lessonId} parentCommentId={comment.id} />
    </article>
  );
}

export function StudentFeedbackThread({ feedbackId, lessonId, comments, authorNames }: FeedbackThreadProps) {
  const commentById = new Map(comments.map((comment) => [comment.id, comment]));
  const roots = comments.filter((comment) => !comment.parent_comment_id);
  const repliesByRoot = new Map<string, StudentFeedbackComment[]>();
  const orphanGroups = new Map<string, StudentFeedbackComment[]>();

  for (const comment of comments) {
    if (!comment.parent_comment_id) continue;
    let current = comment;
    const visited = new Set([comment.id]);
    let missingParentId: string | null = null;
    while (current.parent_comment_id) {
      const parent = commentById.get(current.parent_comment_id);
      if (!parent) {
        missingParentId = current.parent_comment_id;
        break;
      }
      if (visited.has(parent.id)) {
        missingParentId = parent.id;
        break;
      }
      visited.add(parent.id);
      current = parent;
    }

    if (!missingParentId) {
      const replies = repliesByRoot.get(current.id) ?? [];
      replies.push(comment);
      repliesByRoot.set(current.id, replies);
    } else {
      const replies = orphanGroups.get(missingParentId) ?? [];
      replies.push(comment);
      orphanGroups.set(missingParentId, replies);
    }
  }

  return (
    <section className="mt-6 border-t border-[var(--line)] pt-5" aria-label="댓글과 답글">
      <h3 className="text-lg font-bold">댓글 {comments.length}개</h3>
      {comments.length ? (
        <div className="mt-3 space-y-3">
          {roots.map((comment) => (
            <div key={comment.id} className="space-y-2">
              <CommentCard comment={comment} feedbackId={feedbackId} lessonId={lessonId} authorNames={authorNames} />
              {(repliesByRoot.get(comment.id) ?? []).map((reply) => <CommentCard key={reply.id} comment={reply} feedbackId={feedbackId} lessonId={lessonId} authorNames={authorNames} reply />)}
            </div>
          ))}
          {[...orphanGroups.entries()].map(([missingParentId, replies]) => (
            <div key={missingParentId} className="space-y-2">
              <p className="rounded-xl bg-[#f4f8f7] p-3 text-sm text-[var(--muted)] sm:p-4">삭제된 댓글입니다.</p>
              {replies.map((reply) => <CommentCard key={reply.id} comment={reply} feedbackId={feedbackId} lessonId={lessonId} authorNames={authorNames} reply />)}
            </div>
          ))}
        </div>
      ) : <p className="mt-2 text-sm text-[var(--muted)]">아직 댓글이 없습니다.</p>}

      <form action={addStudentComment.bind(null, feedbackId, lessonId)} className="mt-4 flex min-w-0 flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor={`comment-${feedbackId}`}>댓글 내용</label>
        <input id={`comment-${feedbackId}`} name="body" required maxLength={2000} placeholder="댓글을 입력하세요" className="min-h-12 min-w-0 flex-1 rounded-xl border border-[var(--line)] px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]" />
        <button className="min-h-12 rounded-xl bg-[var(--accent)] px-5 font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">댓글 등록</button>
      </form>
    </section>
  );
}
