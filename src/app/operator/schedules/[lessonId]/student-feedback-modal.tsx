"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AutoResizeTextarea } from "@/components/auto-resize-textarea";
import { AttachmentFilePicker } from "@/components/feedback/feedback-attachments";
import { uploadFeedbackAttachments } from "@/components/feedback/attachment-upload";
import { OperatorFeedbackSummaryCard } from "@/components/feedback/operator-feedback-summary-card";
import {
  compareOperatorFeedbackDesc,
  type OperatorFeedbackSummary,
} from "@/lib/feedback/operator-feedback";
import {
  createModalFeedback,
  loadModalFeedbackHistory,
  type FeedbackModalActionState,
} from "./feedback-actions";

export type FeedbackAuthorOption = { id: string; name: string };

export type StudentFeedbackModalData = {
  studentId: string;
  studentName: string;
};

const INITIAL_STATE: FeedbackModalActionState = { status: "idle", message: "" };

function SaveButton({ pending }: { pending: boolean }) {
  return (
    <button type="submit" disabled={pending} className="min-h-12 rounded-xl bg-[var(--accent)] px-5 font-bold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-wait disabled:opacity-70">
      {pending ? "피드백을 저장하는 중입니다..." : "피드백 저장"}
    </button>
  );
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
  const [items, setItems] = useState<OperatorFeedbackSummary[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  async function refreshHistory() {
    setHistoryLoading(true);
    setHistoryError(null);
    const result = await loadModalFeedbackHistory(lessonId, data.studentId);
    if (result.status === "success") {
      setItems((current) => {
        const itemMap = new Map(result.items.map((item) => [item.id, item]));
        current.forEach((item) => itemMap.set(item.id, item));
        return [...itemMap.values()].sort(compareOperatorFeedbackDesc).slice(0, 3);
      });
      setHasMore((current) => current || result.hasMore);
    } else {
      setHistoryError(result.message);
    }
    setHistoryLoading(false);
  }

  async function submitFeedback(formData: FormData) {
    setSaving(true);
    setProgress(0);
    setFileMessage(null);
    const result = await createModalFeedback(lessonId, data.studentId, state, formData);
    setState(result);
    if (result.status === "success" && result.feedback) {
      setBody("");
      const createdId = result.feedback.id;
      const createdFeedback = { ...result.feedback, studentName: data.studentName };
      setItems((current) => {
        const merged = [createdFeedback, ...current.filter((item) => item.id !== createdId)].sort(compareOperatorFeedbackDesc);
        if (merged.length > 3) setHasMore(true);
        return merged.slice(0, 3);
      });
      if (files.length) {
        const uploaded = await uploadFeedbackAttachments(createdId, files, (completed) => setProgress(completed));
        setItems((current) => current.map((item) => item.id === createdId ? { ...item, attachments: uploaded.uploaded } : item));
        setFiles(uploaded.failed.map((item) => item.file));
        setFileMessage(uploaded.failed.length
          ? `피드백은 저장했지만 ${uploaded.failed.length}개 첨부에 실패했습니다. 학생 피드백 화면에서 다시 추가할 수 있습니다.`
          : "첨부파일까지 저장했습니다.");
      } else {
        setFiles([]);
      }
    }
    setSaving(false);
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousBodyOverflow = document.body.style.overflow;
    let cancelled = false;
    document.body.style.overflow = "hidden";
    if (!dialog?.open) dialog?.showModal();
    requestAnimationFrame(() => textareaRef.current?.focus());
    void loadModalFeedbackHistory(lessonId, data.studentId).then((result) => {
      if (cancelled) return;
      if (result.status === "success") {
        setItems((current) => {
          const itemMap = new Map(result.items.map((item) => [item.id, item]));
          current.forEach((item) => itemMap.set(item.id, item));
          const merged = [...itemMap.values()].sort(compareOperatorFeedbackDesc);
          if (merged.length > 3) setHasMore(true);
          return merged.slice(0, 3);
        });
        setHasMore((current) => current || result.hasMore);
      } else {
        setHistoryError(result.message);
      }
      setHistoryLoading(false);
    });
    return () => {
      cancelled = true;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [data.studentId, lessonId]);

  function confirmDiscard(message: string) {
    return !(body.length > 0 || files.length > 0) || window.confirm(message);
  }

  function requestClose() {
    if (saving || !confirmDiscard("작성 중인 피드백이나 선택한 첨부파일이 있습니다. 저장하지 않고 닫으시겠습니까?")) return;
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

        <section className="mt-8 border-t border-[var(--line)] pt-7" aria-labelledby="recent-modal-feedback-heading">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="recent-modal-feedback-heading" className="text-lg font-bold">기존 피드백</h3>
            {hasMore ? (
              <Link
                href={`/operator/students/${data.studentId}/feedback`}
                onClick={(event) => {
                  if (saving || !confirmDiscard("작성 중인 피드백이나 선택한 첨부파일이 있습니다. 저장하지 않고 전체 피드백으로 이동하시겠습니까?")) event.preventDefault();
                }}
                className="inline-flex min-h-10 items-center text-sm font-bold text-[var(--accent-strong)] underline"
              >
                전체 보기
              </Link>
            ) : null}
          </div>
          {historyLoading ? <p role="status" className="mt-4 text-[var(--muted)]">기존 피드백을 불러오는 중입니다...</p> : null}
          {historyError ? <p role="alert" className="mt-4 text-sm font-semibold text-rose-700">{historyError} <button type="button" onClick={() => void refreshHistory()} className="underline">다시 시도</button></p> : null}
          {!historyLoading && !historyError && items.length ? <div className="mt-5 space-y-3">{items.map((item) => <OperatorFeedbackSummaryCard key={item.id} item={item} />)}</div> : null}
          {!historyLoading && !historyError && !items.length ? <p className="mt-4 text-[var(--muted)]">아직 작성된 피드백이 없습니다.</p> : null}
        </section>
      </article>
    </dialog>
  );
}
