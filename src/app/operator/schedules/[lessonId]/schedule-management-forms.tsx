"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";
import {
  cancelSchedule,
  confirmDraftSchedule,
  confirmDraftScheduleFromList,
  deleteSchedule,
  type ManagementActionState,
} from "../actions";

const INITIAL_STATE: ManagementActionState = {};

function PendingSubmitButton({ idleLabel, pendingLabel, className }: { idleLabel: string; pendingLabel: string; className: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} aria-disabled={pending} className={className}>{pending ? pendingLabel : idleLabel}</button>;
}

function DeleteDialogButtons({ onClose }: { onClose: () => void }) {
  const { pending } = useFormStatus();
  return (
    <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button type="submit" disabled={pending} aria-disabled={pending} className="min-h-11 rounded-xl bg-rose-700 px-5 font-bold text-white transition hover:bg-rose-800 disabled:cursor-wait disabled:opacity-70">{pending ? "삭제 중…" : "삭제"}</button>
      <button type="button" disabled={pending} onClick={onClose} className="min-h-11 rounded-xl border border-[var(--line)] bg-white px-5 font-bold text-[var(--foreground)] transition hover:bg-[#f4f8f7] disabled:cursor-wait disabled:opacity-70">닫기</button>
    </div>
  );
}

export function DeleteScheduleForm({ lessonId, lessonTitle }: { lessonId: string; lessonTitle: string }) {
  const [state, formAction] = useActionState(deleteSchedule.bind(null, lessonId), INITIAL_STATE);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = `delete-schedule-title-${lessonId}`;
  const descriptionId = `delete-schedule-description-${lessonId}`;
  const closeDialog = () => dialogRef.current?.close();

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => dialogRef.current?.showModal()} className="min-h-11 rounded-xl border border-rose-300 px-4 font-bold text-rose-800 transition hover:bg-rose-50 active:translate-y-px">일정 삭제</button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClose={() => triggerRef.current?.focus()}
        onClick={(event) => { if (event.target === event.currentTarget) closeDialog(); }}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-rose-200 bg-white p-0 text-[var(--foreground)] shadow-2xl backdrop:bg-slate-950/45"
      >
        <form action={formAction} className="p-5 sm:p-7">
          <p className="text-sm font-bold text-rose-700">완전 삭제</p>
          <h2 id={titleId} className="mt-2 break-words text-2xl font-bold">{lessonTitle}</h2>
          <p id={descriptionId} className="mt-4 break-keep leading-7 text-[var(--muted)]">이 일정을 완전히 삭제하시겠습니까? 학생 배정, 담당 직원 연결과 출결 기록도 함께 삭제되며 예약 횟수는 반환됩니다. 삭제된 출결 기록은 복구할 수 없습니다. 피드백·댓글이 작성되었거나 취소되지 않은 보강 일정이 연결된 경우에는 삭제할 수 없습니다.</p>
          {state.formError ? <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900">{state.formError}</p> : null}
          <DeleteDialogButtons onClose={closeDialog} />
        </form>
      </dialog>
    </>
  );
}

export function ConfirmDraftForm({ lessonId }: { lessonId: string }) {
  const [state, formAction] = useActionState(confirmDraftSchedule.bind(null, lessonId), INITIAL_STATE);
  return <form action={formAction}>{state.formError ? <p role="alert" className="mb-2 text-sm font-semibold text-rose-800">{state.formError}</p> : null}<PendingSubmitButton idleLabel="일정 확정" pendingLabel="확정 중…" className="min-h-11 rounded-xl bg-[var(--accent)] px-4 font-bold text-white disabled:cursor-wait disabled:opacity-70" /></form>;
}

export function QuickConfirmDraftForm({ lessonId, returnPath }: { lessonId: string; returnPath: string }) {
  const [state, formAction] = useActionState(confirmDraftScheduleFromList.bind(null, lessonId, returnPath), INITIAL_STATE);
  return (
    <form action={formAction} className="min-w-0 sm:text-right">
      {state.formError ? <p role="alert" className="mb-2 max-w-sm text-sm font-semibold text-rose-800 sm:ml-auto">{state.formError}</p> : null}
      <PendingSubmitButton idleLabel="일정 확정" pendingLabel="확정 중…" className="min-h-11 w-full rounded-xl bg-[var(--accent)] px-4 font-bold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-wait disabled:opacity-70 sm:w-auto" />
    </form>
  );
}

export function CancelScheduleForm({ lessonId }: { lessonId: string }) {
  const [state, formAction] = useActionState(cancelSchedule.bind(null, lessonId), INITIAL_STATE);
  return <form action={formAction} className="relative" onSubmit={(event) => { if (!window.confirm("이 일정을 취소하시겠습니까? 시작 전이고 기록이 없는 배정만 이용권이 반환됩니다.")) event.preventDefault(); }}>{state.formError ? <p role="alert" className="absolute right-0 top-12 z-20 w-80 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900 shadow-lg">{state.formError}</p> : null}<PendingSubmitButton idleLabel="일정 취소" pendingLabel="취소 중…" className="min-h-11 rounded-xl border border-amber-400 px-4 font-bold text-amber-900 transition hover:bg-amber-50 disabled:cursor-wait disabled:opacity-70" /></form>;
}
