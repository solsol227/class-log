"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  deleteFeedbackFromDialog,
  updateFeedbackFromDialog,
  type FeedbackDeleteActionState,
  type FeedbackDialogActionState,
} from "@/app/operator/students/feedback-actions";
import { createModalFeedback, type FeedbackModalActionState } from "./feedback-actions";

export type FeedbackAuthorOption = { id: string; name: string };

export type StudentFeedbackModalItem = {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
  commentCount: number;
  canEdit: boolean;
  canDelete: boolean;
};

export type StudentFeedbackModalData = {
  studentId: string;
  studentName: string;
  items: StudentFeedbackModalItem[];
};

const INITIAL_STATE: FeedbackModalActionState = { status: "idle", message: "" };
const EDIT_INITIAL_STATE: FeedbackDialogActionState = { status: "idle", message: "" };
const DELETE_INITIAL_STATE: FeedbackDeleteActionState = { status: "idle", message: "" };

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date(value)).replace(/\. /g, ".").replace(/\.$/, "");
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="min-h-12 rounded-xl bg-[var(--accent)] px-5 font-bold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-wait disabled:opacity-70">
      {pending ? "피드백을 저장하는 중입니다..." : "피드백 저장"}
    </button>
  );
}

function ExistingFeedbackEditor({ studentId, item, onDeleted }: {
  studentId: string;
  item: StudentFeedbackModalItem;
  onDeleted: (feedbackId: string) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState(item.body);
  const [editState, editAction] = useActionState(async (previous: FeedbackDialogActionState, formData: FormData) => {
    const result = await updateFeedbackFromDialog(studentId, item.id, previous, formData);
    if (result.status === "success" && result.body) setBody(result.body);
    return result;
  }, EDIT_INITIAL_STATE);
  const [deleteState, deleteAction] = useActionState(async (previous: FeedbackDeleteActionState, formData: FormData) => {
    const result = await deleteFeedbackFromDialog(studentId, item.id, previous, formData);
    if (result.status === "success" && result.deletedId) onDeleted(result.deletedId);
    return result;
  }, DELETE_INITIAL_STATE);

  return <article>
    <p className="flex flex-wrap items-center gap-1.5 text-sm text-[var(--muted)]">
      <time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>
      <span aria-hidden="true">·</span>
      <span>{item.authorName}</span>
      {item.commentCount > 0 ? <><span aria-hidden="true">·</span><span className="rounded-full bg-[#e5f2f0] px-2.5 py-1 text-xs font-bold text-[var(--accent-strong)]">댓글 {item.commentCount}</span></> : null}
    </p>
    <div
      className={`mt-2 rounded-xl border border-[var(--line)] p-3 transition ${item.canEdit ? "cursor-text hover:border-[var(--accent)] focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[#bce9e4]" : "bg-[#f8faf9]"}`}
      onClick={(event) => { if (item.canEdit && !(event.target instanceof HTMLButtonElement)) textareaRef.current?.focus(); }}
    >
      <form action={editAction}>
        <textarea
          ref={textareaRef}
          name="body"
          required
          readOnly={!item.canEdit}
          maxLength={10000}
          rows={2}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          aria-label={`${item.authorName} 피드백 내용`}
          className="min-h-16 w-full resize-y border-0 bg-transparent p-0 leading-7 outline-none read-only:resize-none"
        />
        {editState.status !== "idle" ? <p role={editState.status === "error" ? "alert" : "status"} className={`mt-2 text-sm font-bold ${editState.status === "error" ? "text-rose-800" : "text-[var(--accent-strong)]"}`}>{editState.message}</p> : null}
        {item.canEdit || item.canDelete ? <div className="mt-2 flex justify-end gap-2">
          {item.canEdit ? <button type="submit" className="min-h-9 rounded-lg bg-[var(--accent)] px-4 text-sm font-bold text-white hover:bg-[var(--accent-strong)]">저장</button> : null}
          {item.canDelete ? <button type="submit" form={`delete-feedback-${item.id}`} className="min-h-9 rounded-lg border border-rose-200 px-4 text-sm font-bold text-rose-800 hover:bg-rose-50">삭제</button> : null}
        </div> : null}
      </form>
      {item.canDelete ? <form id={`delete-feedback-${item.id}`} action={deleteAction} onSubmit={(event) => { if (!window.confirm("이 피드백을 삭제하시겠습니까? 삭제 후 7일 동안 복구 유예 상태로 보관됩니다.")) event.preventDefault(); }} /> : null}
      {deleteState.status === "error" ? <p role="alert" className="mt-2 text-sm font-bold text-rose-800">{deleteState.message}</p> : null}
    </div>
  </article>;
}

export function StudentFeedbackModal({ lessonId, data, authorOptions, blockedReason, isOwner, onClosed }: {
  lessonId: string;
  data: StudentFeedbackModalData;
  authorOptions: FeedbackAuthorOption[];
  blockedReason: string | null;
  isOwner: boolean;
  onClosed: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState("");
  const [createdItems, setCreatedItems] = useState<StudentFeedbackModalItem[]>([]);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set());
  const [state, formAction] = useActionState(async (previousState: FeedbackModalActionState, formData: FormData) => {
    const result = await createModalFeedback(lessonId, data.studentId, previousState, formData);
    if (result.status === "success" && result.feedback) {
      setBody("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      setCreatedItems((current) => [{ ...result.feedback!, canEdit: true, canDelete: isOwner }, ...current.filter((item) => item.id !== result.feedback!.id)]);
    }
    return result;
  }, INITIAL_STATE);
  const itemMap = new Map(data.items.map((item) => [item.id, item]));
  createdItems.forEach((item) => itemMap.set(item.id, item));
  const items = [...itemMap.values()].filter((item) => !deletedIds.has(item.id)).sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (!dialog?.open) dialog?.showModal();
    requestAnimationFrame(() => textareaRef.current?.focus());
    return () => { document.body.style.overflow = previousBodyOverflow; };
  }, []);

  function resizeTextarea(value: string) {
    setBody(value);
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  function requestClose() {
    if (body.length > 0 && !window.confirm("작성 중인 피드백이 있습니다. 저장하지 않고 닫으시겠습니까?")) return;
    dialogRef.current?.close();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="schedule-feedback-dialog-title"
      aria-modal="true"
      onCancel={(event) => { event.preventDefault(); requestClose(); }}
      onClose={onClosed}
      className="m-auto max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-2xl overflow-y-auto rounded-2xl border border-[var(--line)] bg-white p-0 text-[var(--foreground)] shadow-2xl backdrop:bg-[#102927]/55"
    >
      <article className="p-5 pt-0 sm:p-7 sm:pt-0">
        <header className="sticky top-0 z-10 -mx-5 flex items-start justify-between gap-4 bg-white px-5 pb-3 pt-5 sm:-mx-7 sm:px-7 sm:pt-7">
          <h2 id="schedule-feedback-dialog-title" className="min-w-0 text-2xl font-bold tracking-[-0.03em] sm:text-3xl">{data.studentName}</h2>
          <button type="button" onClick={requestClose} aria-label="피드백 팝업 닫기" className="-mr-2 -mt-2 flex size-11 shrink-0 items-center justify-center rounded-full text-2xl font-bold hover:bg-[#eef4f3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">×</button>
        </header>

        <section className="mt-6" aria-labelledby="new-modal-feedback-heading">
          <h3 id="new-modal-feedback-heading" className="text-lg font-bold">새 피드백</h3>
          {blockedReason ? <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 font-semibold text-amber-950">{blockedReason}</p> : (
            <form action={formAction} className="mt-3 grid gap-3" noValidate>
              {isOwner && authorOptions.length > 1 ? (
                <label className="grid gap-2 text-sm font-bold">제공 직원
                  <select name="author_staff_id" required className="min-h-11 rounded-xl border border-[var(--line)] bg-white px-3 font-normal">
                    {authorOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                  </select>
                </label>
              ) : null}
              {isOwner && authorOptions.length === 1 ? <input type="hidden" name="author_staff_id" value={authorOptions[0].id} /> : null}
              <label htmlFor="new-modal-feedback-body" className="sr-only">새 피드백 내용</label>
              <textarea
                ref={textareaRef}
                id="new-modal-feedback-body"
                name="body"
                required
                maxLength={10000}
                rows={4}
                value={body}
                onChange={(event) => resizeTextarea(event.target.value)}
                placeholder="피드백 내용을 입력하세요"
                className="max-h-72 min-h-32 w-full resize-none overflow-y-auto rounded-xl border border-[var(--line)] p-3 leading-7 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              />
              {state.status !== "idle" ? <p role={state.status === "error" ? "alert" : "status"} className={`rounded-xl px-4 py-3 text-sm font-bold ${state.status === "error" ? "border border-rose-200 bg-rose-50 text-rose-900" : "border border-emerald-200 bg-emerald-50 text-emerald-900"}`}>{state.message}</p> : null}
              <SaveButton />
            </form>
          )}
        </section>

        <section className="mt-8 border-t border-[var(--line)] pt-7" aria-labelledby="existing-modal-feedback-heading">
          <h3 id="existing-modal-feedback-heading" className="text-lg font-bold">기존 피드백</h3>
          {items.length ? <div className="mt-5 space-y-5">{items.map((item) => <ExistingFeedbackEditor key={item.id} studentId={data.studentId} item={item} onDeleted={(feedbackId) => setDeletedIds((current) => new Set(current).add(feedbackId))} />)}</div> : <p className="mt-4 text-[var(--muted)]">아직 작성된 피드백이 없습니다.</p>}
        </section>
      </article>
    </dialog>
  );
}
