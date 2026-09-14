"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  deleteFeedbackAttachment,
  getFeedbackAttachmentSignedUrl,
} from "@/app/feedback-attachment-actions";
import {
  formatAttachmentSize,
  MAX_FEEDBACK_ATTACHMENTS,
  MAX_FEEDBACK_ATTACHMENT_BYTES,
  type FeedbackAttachment,
  validateAttachmentFile,
} from "@/lib/feedback/attachments";
import { uploadFeedbackAttachments } from "./attachment-upload";

function PendingImage({ file }: { file: File }) {
  const [url] = useState(() => URL.createObjectURL(file));
  useEffect(() => {
    return () => URL.revokeObjectURL(url);
  }, [url]);
  return <Image unoptimized width={48} height={48} src={url} alt={`${file.name} 선택 미리보기`} className="size-12 rounded-lg object-cover" />;
}

export function AttachmentFilePicker({ files, onChange, disabled = false }: {
  files: File[];
  onChange: (files: File[], message: string | null) => void;
  disabled?: boolean;
}) {
  function select(fileList: FileList | null) {
    const selected = [...(fileList ?? [])];
    if (!selected.length) return;
    const next = [...files, ...selected];
    if (next.length > MAX_FEEDBACK_ATTACHMENTS) return onChange(files, "피드백당 첨부파일은 최대 5개입니다.");
    const validationError = selected.map(validateAttachmentFile).find(Boolean);
    if (validationError) return onChange(files, validationError);
    if (next.reduce((sum, file) => sum + file.size, 0) > MAX_FEEDBACK_ATTACHMENT_BYTES) return onChange(files, "피드백 첨부파일 전체 용량은 150MB까지입니다.");
    onChange(next, null);
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  return (
    <div className="rounded-xl border border-dashed border-[var(--line)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold">첨부파일</p>
        <label className={`inline-flex min-h-10 cursor-pointer items-center rounded-lg border border-[var(--accent)] px-3 text-sm font-bold text-[var(--accent-strong)] ${disabled ? "pointer-events-none opacity-60" : ""}`}>
          + 이미지/녹음파일 선택
          <input type="file" multiple accept="image/jpeg,image/png,image/webp,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav,audio/webm" className="sr-only" disabled={disabled} onChange={(event) => { select(event.target.files); event.currentTarget.value = ""; }} />
        </label>
      </div>
      {files.length ? <ul className="mt-3 space-y-2">{files.map((file, index) => <li key={`${file.name}-${file.size}-${file.lastModified}-${index}`} className="flex items-center gap-3 rounded-lg bg-[#f4f8f7] p-2">{file.type.startsWith("image/") ? <PendingImage file={file} /> : <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-lg bg-[#e5f2f0] text-xl">♪</span>}<span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{file.name}</span><span className="block text-xs text-[var(--muted)]">{formatAttachmentSize(file.size)}</span></span><button type="button" disabled={disabled} onClick={() => onChange(files.filter((_, itemIndex) => itemIndex !== index), null)} className="min-h-9 rounded-lg px-2 text-sm font-bold text-rose-700">제거</button></li>)}</ul> : null}
      <p className="mt-2 text-xs text-[var(--muted)]">{files.length}/5개 · {formatAttachmentSize(totalBytes)}/150MB · 이미지 10MB, 녹음파일 100MB 이하</p>
    </div>
  );
}

function AttachmentMedia({ attachment }: { attachment: FeedbackAttachment }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const downloadInFlightRef = useRef(false);
  const previewRef = useRef<HTMLDialogElement>(null);

  async function loadUrl() {
    setError(null);
    const result = await getFeedbackAttachmentSignedUrl(attachment.id, "inline");
    if (result.status === "success") setUrl(result.url);
    else setError(result.message);
  }

  useEffect(() => {
    let cancelled = false;
    void getFeedbackAttachmentSignedUrl(attachment.id, "inline").then((result) => {
      if (cancelled) return;
      if (result.status === "success") setUrl(result.url);
      else setError(result.message);
    });
    return () => { cancelled = true; };
  }, [attachment.id]);

  async function download() {
    if (downloadInFlightRef.current) return;
    downloadInFlightRef.current = true;
    setDownloading(true);
    setError(null);
    try {
      const result = await getFeedbackAttachmentSignedUrl(attachment.id, "download");
      if (result.status === "success") {
        const link = document.createElement("a");
        link.href = result.url;
        link.download = result.originalFileName;
        link.hidden = true;
        document.body.appendChild(link);
        link.click();
        link.remove();
      } else {
        setError(result.message);
      }
    } catch {
      setError("다운로드를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      downloadInFlightRef.current = false;
      setDownloading(false);
    }
  }

  const isImage = attachment.mimeType.startsWith("image/");
  return (
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 items-center gap-3">
        {isImage ? (
          <button type="button" disabled={!url} onClick={() => previewRef.current?.showModal()} aria-label={`${attachment.originalFileName} 이미지 크게 보기`} className="relative size-16 shrink-0 overflow-hidden rounded-lg border border-[var(--line)] bg-[#f4f8f7] disabled:cursor-wait">
            {url ? <Image unoptimized fill sizes="64px" src={url} alt={`${attachment.originalFileName} 미리보기`} className="object-cover" onError={() => void loadUrl()} /> : <span className="text-xs text-[var(--muted)]">로딩</span>}
          </button>
        ) : <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-[#e5f2f0] text-xl">♪</span>}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold" title={attachment.originalFileName}>{attachment.originalFileName}</p>
          <p className="text-sm text-[var(--muted)]">{formatAttachmentSize(attachment.sizeBytes)}</p>
        </div>
      </div>
      {!isImage && url ? <audio controls preload="metadata" src={url} onError={() => void loadUrl()} className="mt-3 h-10 w-full">이 브라우저에서는 음성 재생을 지원하지 않습니다.</audio> : null}
      {error ? <p role="alert" className="mt-2 text-sm font-semibold text-rose-700">{error} <button type="button" onClick={() => void loadUrl()} className="underline">다시 시도</button></p> : null}
      <button type="button" disabled={downloading} onClick={() => void download()} className="mt-2 min-h-9 rounded-lg border border-[var(--line)] px-3 text-sm font-bold text-[var(--accent-strong)] disabled:cursor-wait disabled:opacity-60">{downloading ? "다운로드 준비 중..." : "다운로드"}</button>
      {isImage ? (
        <dialog ref={previewRef} aria-label={`${attachment.originalFileName} 이미지 미리보기`} onClick={(event) => { if (event.target === previewRef.current) previewRef.current?.close(); }} className="m-auto max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] rounded-2xl border border-[var(--line)] bg-white p-3 shadow-2xl backdrop:bg-[#102927]/70">
          <div className="flex justify-end"><button type="button" onClick={() => previewRef.current?.close()} aria-label="이미지 미리보기 닫기" className="flex size-11 items-center justify-center rounded-full text-2xl">×</button></div>
          {url ? <Image unoptimized width={1400} height={1000} src={url} alt={attachment.originalFileName} className="max-h-[calc(100dvh-7rem)] h-auto w-auto max-w-full object-contain" onError={() => void loadUrl()} /> : null}
        </dialog>
      ) : null}
    </div>
  );
}

export function FeedbackAttachments({ feedbackId, initialItems, canManage = false, compact = false }: {
  feedbackId: string;
  initialItems: FeedbackAttachment[];
  canManage?: boolean;
  compact?: boolean;
}) {
  const [items, setItems] = useState(initialItems);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  if (compact) return items.length ? <span className="rounded-full bg-[#e5f2f0] px-2.5 py-1 text-xs font-bold text-[var(--accent-strong)]">첨부 {items.length}개</span> : null;

  async function addFiles(fileList: FileList | null) {
    const files = [...(fileList ?? [])];
    if (!files.length) return;
    setMessage(null);
    if (items.length + files.length > MAX_FEEDBACK_ATTACHMENTS) {
      setMessage("피드백당 첨부파일은 최대 5개입니다.");
      return;
    }
    const validationError = files.map(validateAttachmentFile).find(Boolean);
    if (validationError) { setMessage(validationError); return; }
    const total = items.reduce((sum, item) => sum + item.sizeBytes, 0) + files.reduce((sum, file) => sum + file.size, 0);
    if (total > MAX_FEEDBACK_ATTACHMENT_BYTES) { setMessage("피드백 첨부파일 전체 용량은 150MB까지입니다."); return; }

    setBusy(true);
    setProgress(0);
    const result = await uploadFeedbackAttachments(feedbackId, files, (completed) => setProgress(completed));
    setItems((current) => [...current, ...result.uploaded].sort((a, b) => a.sortOrder - b.sortOrder));
    setBusy(false);
    setMessage(result.failed.length ? `${result.failed.length}개 파일을 첨부하지 못했습니다. 다시 선택해 주세요.` : "첨부파일을 저장했습니다.");
  }

  async function remove(attachmentId: string) {
    if (!window.confirm("이 첨부파일을 삭제하시겠습니까?")) return;
    setBusy(true);
    setMessage(null);
    const result = await deleteFeedbackAttachment(attachmentId);
    if (result.status === "success" || ("hidden" in result && result.hidden)) setItems((current) => current.filter((item) => item.id !== attachmentId));
    setMessage(result.status === "success" ? "첨부파일을 삭제했습니다." : result.message);
    setBusy(false);
  }

  return (
    <section className="mt-4" aria-label="피드백 첨부파일">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-bold">첨부파일{items.length ? ` ${items.length}개` : ""}</h4>
        {canManage && items.length < MAX_FEEDBACK_ATTACHMENTS ? (
          <label className={`inline-flex min-h-10 cursor-pointer items-center rounded-lg border border-[var(--accent)] px-3 text-sm font-bold text-[var(--accent-strong)] ${busy ? "pointer-events-none opacity-60" : ""}`}>
            + 이미지/녹음파일 선택
            <input type="file" multiple accept="image/jpeg,image/png,image/webp,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav,audio/webm" className="sr-only" disabled={busy} onChange={(event) => { void addFiles(event.target.files); event.currentTarget.value = ""; }} />
          </label>
        ) : null}
      </div>
      {items.length ? <ul className="mt-3 space-y-3">{items.map((attachment) => <li key={attachment.id} className="flex gap-3 rounded-xl border border-[var(--line)] p-3"><AttachmentMedia attachment={attachment} />{canManage ? <button type="button" disabled={busy} onClick={() => void remove(attachment.id)} className="h-9 shrink-0 rounded-lg px-2 text-sm font-bold text-rose-700 disabled:opacity-50">제거</button> : null}</li>)}</ul> : <p className="mt-2 text-sm text-[var(--muted)]">첨부파일이 없습니다.</p>}
      {busy ? <p role="status" className="mt-2 text-sm font-semibold text-[var(--accent-strong)]">첨부 처리 중{progress ? ` (${progress}개 완료)` : ""}...</p> : null}
      {message ? <p role="status" className={`mt-2 text-sm font-semibold ${message.includes("못했") || message.includes("최대") || message.includes("실패") ? "text-rose-700" : "text-[var(--accent-strong)]"}`}>{message}</p> : null}
    </section>
  );
}
