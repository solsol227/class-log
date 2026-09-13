"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AutoResizeTextarea } from "@/components/auto-resize-textarea";
import { AttachmentFilePicker, FeedbackAttachments } from "@/components/feedback/feedback-attachments";
import { uploadFeedbackAttachments } from "@/components/feedback/attachment-upload";
import type { FeedbackAttachment } from "@/lib/feedback/attachments";
import { createModalFeedback, type FeedbackModalActionState } from "./feedback-actions";

export type FeedbackAuthorOption = { id: string; name: string };

export type StudentFeedbackModalItem = {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
  commentCount: number;
  attachments: FeedbackAttachment[];
  canEdit: boolean;
  canDelete: boolean;
};

export type StudentFeedbackModalData = {
  studentId: string;
  studentName: string;
  items: StudentFeedbackModalItem[];
};

const INITIAL_STATE: FeedbackModalActionState = { status: "idle", message: "" };

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date(value)).replace(/\. /g, ".").replace(/\.$/, "");
}

function SaveButton({ pending }: { pending: boolean }) {
  return (
    <button type="submit" disabled={pending} className="min-h-12 rounded-xl bg-[var(--accent)] px-5 font-bold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-wait disabled:opacity-70">
      {pending ? "피드백을 저장하는 중입니다..." : "피드백 저장"}
    </button>
  );
}

function ExistingFeedbackItem({ item }: {
  item: StudentFeedbackModalItem;
}) {
  return <article>
    <p className="flex flex-wrap items-center gap-1.5 text-sm text-[var(--muted)]">
      <time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>
      <span aria-hidden="true">·</span>
      <span>{item.authorName}</span>
      {item.commentCount > 0 ? <><span aria-hidden="true">·</span><span className="rounded-full bg-[#e5f2f0] px-2.5 py-1 text-xs font-bold text-[var(--accent-strong)]">댓글 {item.commentCount}</span></> : null}
    </p>
    <div className="mt-2 rounded-xl border border-[var(--line)] bg-[#f8faf9] p-3">
      <p className="whitespace-pre-wrap break-words leading-7">{item.body}</p>
      {item.attachments.length ? <FeedbackAttachments feedbackId={item.id} initialItems={item.attachments} /> : null}
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
  const [files, setFiles] = useState<File[]>([]);
  const [fileMessage, setFileMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [state, setState] = useState<FeedbackModalActionState>(INITIAL_STATE);
  const [createdItems, setCreatedItems] = useState<StudentFeedbackModalItem[]>([]);
  async function submitFeedback(formData: FormData) {
    setSaving(true);
    setProgress(0);
    setFileMessage(null);
    const result = await createModalFeedback(lessonId, data.studentId, state, formData);
    setState(result);
    if (result.status === "success" && result.feedback) {
      setBody("");
      const createdId = result.feedback.id;
      setCreatedItems((current) => [{ ...result.feedback!, attachments: [], canEdit: true, canDelete: isOwner }, ...current.filter((item) => item.id !== createdId)]);
      if (files.length) {
        const uploaded = await uploadFeedbackAttachments(createdId, files, (completed) => setProgress(completed));
        setCreatedItems((current) => current.map((item) => item.id === createdId ? { ...item, attachments: uploaded.uploaded } : item));
        setFiles(uploaded.failed.map((item) => item.file));
        setFileMessage(uploaded.failed.length
          ? `피드백은 저장했지만 ${uploaded.failed.length}개 첨부에 실패했습니다. 아래 기존 피드백 관리 화면에서 다시 추가할 수 있습니다.`
          : "첨부파일까지 저장했습니다.");
      } else {
        setFiles([]);
      }
    }
    setSaving(false);
  }
  const itemMap = new Map(data.items.map((item) => [item.id, item]));
  createdItems.forEach((item) => itemMap.set(item.id, item));
  const items = [...itemMap.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (!dialog?.open) dialog?.showModal();
    requestAnimationFrame(() => textareaRef.current?.focus());
    return () => { document.body.style.overflow = previousBodyOverflow; };
  }, []);

  function requestClose() {
    if (saving) return;
    if ((body.length > 0 || files.length > 0) && !window.confirm("작성 중인 피드백이나 선택한 첨부파일이 있습니다. 저장하지 않고 닫으시겠습니까?")) return;
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
            <form action={submitFeedback} className="mt-3 grid gap-3" noValidate>
              {isOwner && authorOptions.length > 1 ? (
                <label className="grid gap-2 text-sm font-bold">제공 직원
                  <select name="author_staff_id" required className="min-h-11 rounded-xl border border-[var(--line)] bg-white px-3 font-normal">
                    {authorOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                  </select>
                </label>
              ) : null}
              {isOwner && authorOptions.length === 1 ? <input type="hidden" name="author_staff_id" value={authorOptions[0].id} /> : null}
              <label htmlFor="new-modal-feedback-body" className="sr-only">새 피드백 내용</label>
              <AutoResizeTextarea
                ref={textareaRef}
                id="new-modal-feedback-body"
                name="body"
                required
                maxLength={10000}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="피드백 내용을 입력하세요"
                className="w-full rounded-xl border border-[var(--line)] p-3 leading-7 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              />
              <AttachmentFilePicker files={files} disabled={saving} onChange={(nextFiles, message) => { setFiles(nextFiles); setFileMessage(message); }} />
              {saving && files.length ? <p role="status" className="text-sm font-semibold text-[var(--accent-strong)]">첨부 업로드 중 {progress}/{files.length}개</p> : null}
              {fileMessage ? <p role="status" className={`rounded-xl px-4 py-3 text-sm font-bold ${fileMessage.includes("실패") || fileMessage.includes("최대") ? "border border-rose-200 bg-rose-50 text-rose-900" : "border border-emerald-200 bg-emerald-50 text-emerald-900"}`}>{fileMessage}</p> : null}
              {state.status !== "idle" ? <p role={state.status === "error" ? "alert" : "status"} className={`rounded-xl px-4 py-3 text-sm font-bold ${state.status === "error" ? "border border-rose-200 bg-rose-50 text-rose-900" : "border border-emerald-200 bg-emerald-50 text-emerald-900"}`}>{state.message}</p> : null}
              <SaveButton pending={saving} />
            </form>
          )}
        </section>

        <section className="mt-8 border-t border-[var(--line)] pt-7" aria-labelledby="existing-modal-feedback-heading">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 id="existing-modal-feedback-heading" className="text-lg font-bold">기존 피드백</h3><Link href={`/operator/students/${data.studentId}`} className="text-sm font-bold text-[var(--accent-strong)] underline">수정·첨부 관리</Link></div>
          {items.length ? <div className="mt-5 space-y-5">{items.map((item) => <ExistingFeedbackItem key={item.id} item={item} />)}</div> : <p className="mt-4 text-[var(--muted)]">아직 작성된 피드백이 없습니다.</p>}
        </section>
      </article>
    </dialog>
  );
}
