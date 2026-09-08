"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { OperatorFeedbackItem } from "@/lib/feedback/operator-feedback";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeZone: "Asia/Seoul" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" }).format(new Date(value));
}

export function OperatorFeedbackList({ items, emptyMessage }: { items: OperatorFeedbackItem[]; emptyMessage: string }) {
  const [selected, setSelected] = useState<OperatorFeedbackItem | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (selected && !dialogRef.current?.open) dialogRef.current?.showModal();
  }, [selected]);

  function open(item: OperatorFeedbackItem, trigger: HTMLButtonElement) {
    triggerRef.current = trigger;
    setSelected(item);
  }

  function close() {
    dialogRef.current?.close();
  }

  function finishClose() {
    setSelected(null);
    triggerRef.current?.focus();
  }

  if (!items.length) return <p className="mt-5 text-[var(--muted)]">{emptyMessage}</p>;

  return (
    <>
      <ol className="mt-5 space-y-3">
        {items.map((item) => (
          <li key={item.id}>
            <article className="rounded-xl border border-[var(--line)] p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <time className="font-bold text-[var(--accent-strong)]" dateTime={item.startsAt}>{formatDate(item.startsAt)}</time>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${item.publishedAt ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>{item.publishedAt ? "게시" : "미게시"}</span>
              </div>
              <h3 className="mt-3 truncate text-lg font-bold">{item.lessonTitle}</h3>
              <p className="mt-2 truncate text-[var(--foreground)]">{item.body}</p>
              <p className="mt-2 text-sm text-[var(--muted)]">{item.authorName} · 댓글 {item.commentCount}개</p>
              <button type="button" onClick={(event) => open(item, event.currentTarget)} className="mt-4 min-h-11 rounded-xl border border-[var(--accent)] px-4 font-bold text-[var(--accent-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">더보기</button>
            </article>
          </li>
        ))}
      </ol>

      <dialog
        ref={dialogRef}
        aria-labelledby="operator-feedback-dialog-title"
        onCancel={(event) => { event.preventDefault(); close(); }}
        onClose={finishClose}
        onClick={(event) => { if (event.target === event.currentTarget) close(); }}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl rounded-2xl border border-[var(--line)] bg-white p-0 text-[var(--foreground)] shadow-2xl backdrop:bg-[#102927]/55"
      >
        {selected ? (
          <article className="flex max-h-[calc(100dvh-2rem)] min-h-[min(36rem,calc(100dvh-2rem))] flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-7">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${selected.publishedAt ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>{selected.publishedAt ? "게시" : "미게시"}</span>
                <span className="font-bold text-[var(--accent-strong)]">{selected.studentName}</span>
              </div>
              <h2 id="operator-feedback-dialog-title" className="mt-3 text-2xl font-bold tracking-[-0.03em]">{selected.lessonTitle}</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">{formatDate(selected.startsAt)} · {formatTime(selected.startsAt)} ~ {formatTime(selected.endsAt)}</p>
              <dl className="mt-5 grid gap-3 rounded-xl bg-[#f4f8f7] p-4 text-sm sm:grid-cols-2">
                <div><dt className="font-bold text-[var(--muted)]">피드백 제공자</dt><dd className="mt-1">{selected.authorName}{selected.authorRole ? ` · ${selected.authorRole}` : ""}</dd></div>
                <div><dt className="font-bold text-[var(--muted)]">작성 시각</dt><dd className="mt-1">{formatDateTime(selected.createdAt)}</dd></div>
                <div><dt className="font-bold text-[var(--muted)]">수정 시각</dt><dd className="mt-1">{formatDateTime(selected.updatedAt)}</dd></div>
              </dl>
              <p className="mt-5 whitespace-pre-wrap break-words leading-7">{selected.body}</p>

              <section className="mt-7 border-t border-[var(--line)] pt-5" aria-label="댓글과 답글">
                <h3 className="text-lg font-bold">댓글 {selected.commentCount}개</h3>
                {selected.comments.length ? <div className="mt-3 space-y-2">{selected.comments.map((comment) => (
                  <article key={comment.id} className={`rounded-xl bg-[#f4f8f7] p-3 ${comment.parentCommentId ? "ml-3 border-l-2 border-[var(--line)] sm:ml-6" : ""}`}>
                    {comment.deletedAt ? <p className="text-sm text-[var(--muted)]">삭제된 댓글입니다.</p> : <><p className="text-sm font-bold">{comment.authorName}<span className="ml-2 font-normal text-[var(--muted)]">{formatDateTime(comment.createdAt)}</span></p><p className="mt-1 whitespace-pre-wrap break-words">{comment.body}</p></>}
                  </article>
                ))}</div> : <p className="mt-2 text-sm text-[var(--muted)]">아직 댓글이 없습니다.</p>}
              </section>
            </div>
            <footer className="flex shrink-0 items-center justify-center gap-3 border-t border-[var(--line)] bg-white p-4 sm:p-5">
              <Link href={`/operator/schedules/${selected.lessonId}/students/${selected.studentId}/feedback#feedback-${selected.id}`} className="inline-flex min-h-11 min-w-24 items-center justify-center rounded-xl bg-[var(--accent)] px-5 font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">수정</Link>
              <button type="button" onClick={close} className="min-h-11 min-w-24 rounded-xl border border-[var(--line)] px-5 font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">닫기</button>
            </footer>
          </article>
        ) : null}
      </dialog>
    </>
  );
}
