"use client";

import { FeedbackAttachments } from "@/components/feedback/feedback-attachments";
import type { OperatorFeedbackSummary } from "@/lib/feedback/operator-feedback";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "long",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

export function OperatorFeedbackSummaryCard({
  item,
  onOpen,
}: {
  item: OperatorFeedbackSummary;
  onOpen?: (trigger: HTMLButtonElement) => void;
}) {
  return (
    <article className="rounded-xl border border-[var(--line)] p-4 sm:p-5">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <time className="min-w-0 truncate text-sm font-bold text-[var(--accent-strong)]" dateTime={item.startsAt}>
          {formatDate(item.startsAt)}
        </time>
        {onOpen ? (
          <button
            type="button"
            onClick={(event) => onOpen(event.currentTarget)}
            className="min-h-10 shrink-0 rounded-xl border border-[var(--accent)] px-3 text-sm font-bold text-[var(--accent-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            더보기
          </button>
        ) : null}
      </div>
      <h3 className="mt-2 truncate text-lg font-bold">{item.lessonTitle}</h3>
      <p className="mt-2 truncate">{item.body}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
        <span>
          {item.authorName}
          {item.authorRole ? ` · ${item.authorRole}` : ""}
          {item.commentCount > 0 ? ` · 댓글 ${item.commentCount}` : ""}
        </span>
        <FeedbackAttachments feedbackId={item.id} initialItems={item.attachments} compact />
      </div>
    </article>
  );
}
