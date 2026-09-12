"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { AutoResizeTextarea } from "@/components/auto-resize-textarea";
import {
  deleteOwnFeedbackComment,
  updateFeedbackFromDialog,
  updateOwnFeedbackComment,
  type CommentDialogActionState,
  type FeedbackDialogActionState,
} from "@/app/operator/students/feedback-actions";
import type { OperatorFeedbackItem } from "@/lib/feedback/operator-feedback";

const FEEDBACK_INITIAL_STATE: FeedbackDialogActionState = { status: "idle", message: "" };
const COMMENT_INITIAL_STATE: CommentDialogActionState = { status: "idle", message: "" };

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeZone: "Asia/Seoul" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" }).format(new Date(value));
}

function SubmitButton({ label, pendingLabel, className }: { label: string; pendingLabel: string; className: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className={`${className} disabled:cursor-wait disabled:opacity-60`}>{pending ? pendingLabel : label}</button>;
}

type FeedbackComment = OperatorFeedbackItem["comments"][number];

function FeedbackCommentEditor({ studentId, feedbackId, comment, onChange }: {
  studentId: string;
  feedbackId: string;
  comment: FeedbackComment;
  onChange: (comment: FeedbackComment) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(comment.body);
  const [updateState, updateAction] = useActionState(async (previousState: CommentDialogActionState, formData: FormData) => {
    const result = await updateOwnFeedbackComment(studentId, feedbackId, comment.id, previousState, formData);
    if (result.status === "success" && result.body) {
      setBody(result.body);
      setEditing(false);
      onChange({ ...comment, body: result.body });
    }
    return result;
  }, COMMENT_INITIAL_STATE);
  const [deleteState, deleteAction] = useActionState(async (previousState: CommentDialogActionState, formData: FormData) => {
    const result = await deleteOwnFeedbackComment(studentId, feedbackId, comment.id, previousState, formData);
    if (result.status === "success" && result.deletedAt) onChange({ ...comment, body: "", deletedAt: result.deletedAt, canEdit: false });
    return result;
  }, COMMENT_INITIAL_STATE);

  if (comment.deletedAt) return <article className={`rounded-xl bg-[#f4f8f7] p-3 ${comment.parentCommentId ? "ml-3 border-l-2 border-[var(--line)] sm:ml-6" : ""}`}><p className="text-sm text-[var(--muted)]">삭제된 댓글입니다.</p></article>;

  return (
    <article className={`rounded-xl bg-[#f4f8f7] p-3 ${comment.parentCommentId ? "ml-3 border-l-2 border-[var(--line)] sm:ml-6" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-sm font-bold">{comment.authorName}<span className="ml-2 font-normal text-[var(--muted)]">{formatDateTime(comment.createdAt)}</span></p>
        {comment.canEdit && !editing ? <div className="flex shrink-0 items-center gap-1 text-xs font-semibold text-[var(--muted)]">
          <button type="button" onClick={() => setEditing(true)} className="rounded-md px-2 py-1 hover:bg-white hover:text-[var(--foreground)]">수정</button>
          <form action={deleteAction} onSubmit={(event) => { if (!window.confirm("이 댓글을 삭제하시겠습니까?")) event.preventDefault(); }}><SubmitButton label="삭제" pendingLabel="삭제 중" className="rounded-md px-2 py-1 hover:bg-white hover:text-rose-700" /></form>
        </div> : null}
      </div>
      {editing ? <form action={updateAction} className="mt-2 grid gap-2">
        <AutoResizeTextarea name="body" required maxLength={2000} value={body} onChange={(event) => setBody(event.target.value)} className="w-full rounded-lg border border-[var(--line)] bg-white p-2 leading-6 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]" />
        <div className="flex items-center justify-end gap-2"><button type="button" onClick={() => { setBody(comment.body); setEditing(false); }} className="rounded-md px-2 py-1 text-xs font-semibold text-[var(--muted)]">취소</button><SubmitButton label="저장" pendingLabel="저장 중" className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-white" /></div>
      </form> : <p className="mt-1 whitespace-pre-wrap break-words">{body}</p>}
      {updateState.status === "error" ? <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">{updateState.message}</p> : null}
      {deleteState.status === "error" ? <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">{deleteState.message}</p> : null}
    </article>
  );
}

function FeedbackDialogContent({ selected, onChange, close }: { selected: OperatorFeedbackItem; onChange: (item: OperatorFeedbackItem) => void; close: () => void }) {
  const [body, setBody] = useState(selected.body);
  const formId = `feedback-dialog-form-${selected.id}`;
  const [state, formAction] = useActionState(async (previousState: FeedbackDialogActionState, formData: FormData) => {
    const result = await updateFeedbackFromDialog(selected.studentId, selected.id, previousState, formData);
    if (result.status === "success" && result.body && result.updatedAt) {
      setBody(result.body);
      onChange({ ...selected, body: result.body, updatedAt: result.updatedAt });
    }
    return result;
  }, FEEDBACK_INITIAL_STATE);

  function updateComment(updatedComment: FeedbackComment) {
    const comments = selected.comments.map((comment) => comment.id === updatedComment.id ? updatedComment : comment);
    onChange({ ...selected, comments, commentCount: comments.filter((comment) => !comment.deletedAt).length });
  }

  return <article className="flex max-h-[calc(100dvh-2rem)] min-h-[min(36rem,calc(100dvh-2rem))] flex-col">
    <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-7">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0"><p className="text-sm font-bold text-[var(--accent-strong)]">{selected.studentName}</p><h2 id="operator-feedback-dialog-title" className="mt-2 text-2xl font-bold tracking-[-0.03em]">{selected.lessonTitle}</h2><p className="mt-2 text-sm text-[var(--muted)]">{formatDate(selected.startsAt)} · {formatTime(selected.startsAt)} ~ {formatTime(selected.endsAt)} · {selected.authorName}</p></div>
        <button type="button" onClick={close} aria-label="피드백 팝업 닫기" className="-mr-2 -mt-2 flex size-11 shrink-0 items-center justify-center rounded-full text-2xl font-bold hover:bg-[#eef4f3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">×</button>
      </header>
      {selected.canEdit ? <AutoResizeTextarea form={formId} name="body" required maxLength={10000} value={body} onChange={(event) => setBody(event.target.value)} aria-label="피드백 내용" className="mt-7 w-full rounded-xl border border-transparent bg-transparent p-2 text-base leading-8 hover:border-[var(--line)] focus:border-[var(--accent)] focus:bg-white focus-visible:outline-none" /> : <p className="mt-7 whitespace-pre-wrap break-words leading-8">{selected.body}</p>}
      {state.status !== "idle" ? <p role={state.status === "error" ? "alert" : "status"} className={`mt-3 rounded-xl px-4 py-3 text-sm font-bold ${state.status === "error" ? "bg-rose-50 text-rose-900" : "bg-emerald-50 text-emerald-900"}`}>{state.message}</p> : null}
      <section className="mt-7 border-t border-[var(--line)] pt-5" aria-label="댓글과 답글"><h3 className="text-lg font-bold">댓글 {selected.commentCount}개</h3>{selected.comments.length ? <div className="mt-3 space-y-2">{selected.comments.map((comment) => <FeedbackCommentEditor key={comment.id} studentId={selected.studentId} feedbackId={selected.id} comment={comment} onChange={updateComment} />)}</div> : <p className="mt-2 text-sm text-[var(--muted)]">아직 댓글이 없습니다.</p>}</section>
    </div>
    {selected.canEdit ? <footer className="shrink-0 border-t border-[var(--line)] bg-white p-4 sm:p-5"><form id={formId} action={formAction} className="flex justify-center"><SubmitButton label="수정" pendingLabel="수정 중" className="min-h-12 min-w-32 rounded-xl bg-[var(--accent)] px-6 font-bold text-white" /></form></footer> : null}
  </article>;
}

export function OperatorFeedbackList({ items, emptyMessage }: { items: OperatorFeedbackItem[]; emptyMessage: string }) {
  const [selected, setSelected] = useState<OperatorFeedbackItem | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { if (selected && !dialogRef.current?.open) dialogRef.current?.showModal(); }, [selected]);
  function close() { dialogRef.current?.close(); }
  function finishClose() { setSelected(null); triggerRef.current?.focus(); }
  if (!items.length) return <p className="mt-5 text-[var(--muted)]">{emptyMessage}</p>;
  return <>
    <ol className="mt-5 space-y-3">{items.map((item) => <li key={item.id}><article className="rounded-xl border border-[var(--line)] p-4 sm:p-5"><div className="flex min-w-0 items-center justify-between gap-3"><time className="min-w-0 truncate text-sm font-bold text-[var(--accent-strong)]" dateTime={item.startsAt}>{formatDate(item.startsAt)}</time><button type="button" onClick={(event) => { triggerRef.current = event.currentTarget; setSelected(item); }} className="min-h-10 shrink-0 rounded-xl border border-[var(--accent)] px-3 text-sm font-bold text-[var(--accent-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">더보기</button></div><h3 className="mt-2 truncate text-lg font-bold">{item.lessonTitle}</h3><p className="mt-2 truncate">{item.body}</p><p className="mt-2 text-sm text-[var(--muted)]">{item.authorName} · 댓글 {item.commentCount}개</p></article></li>)}</ol>
    <dialog ref={dialogRef} aria-labelledby="operator-feedback-dialog-title" aria-modal="true" onCancel={(event) => { event.preventDefault(); close(); }} onClose={finishClose} className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl overflow-hidden rounded-2xl border border-[var(--line)] bg-white p-0 text-[var(--foreground)] shadow-2xl backdrop:bg-[#102927]/55">{selected ? <FeedbackDialogContent key={selected.id} selected={selected} onChange={setSelected} close={close} /> : null}</dialog>
  </>;
}
