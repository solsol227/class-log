"use client";

import { useActionState } from "react";
import { cancelSchedule, confirmDraftSchedule, deleteSchedule, type ManagementActionState } from "../actions";

const INITIAL_STATE: ManagementActionState = {};

export function DeleteScheduleForm({ lessonId }: { lessonId: string }) {
  const [state, formAction] = useActionState(deleteSchedule.bind(null, lessonId), INITIAL_STATE);
  return <form action={formAction} className="relative" onSubmit={(event) => { if (!window.confirm("이 일정을 삭제하시겠습니까? 배정 정보와 관련 데이터도 영향을 받을 수 있습니다.")) event.preventDefault(); }}>{state.formError ? <p role="alert" className="absolute right-0 top-12 z-20 w-80 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900 shadow-lg">{state.formError}</p> : null}<button type="submit" className="min-h-11 rounded-xl border border-rose-300 px-4 font-bold text-rose-800 transition hover:bg-rose-50 active:translate-y-px">삭제</button></form>;
}

export function ConfirmDraftForm({ lessonId }: { lessonId: string }) {
  const [state, formAction] = useActionState(confirmDraftSchedule.bind(null, lessonId), INITIAL_STATE);
  return <form action={formAction}>{state.formError ? <p role="alert" className="mb-2 text-sm font-semibold text-rose-800">{state.formError}</p> : null}<button className="min-h-11 rounded-xl bg-[var(--accent)] px-4 font-bold text-white">일정 확정</button></form>;
}

export function CancelScheduleForm({ lessonId }: { lessonId: string }) {
  const [state, formAction] = useActionState(cancelSchedule.bind(null, lessonId), INITIAL_STATE);
  return <form action={formAction} className="relative" onSubmit={(event) => { if (!window.confirm("이 일정을 취소하시겠습니까? 시작 전이고 기록이 없는 배정만 이용권이 반환됩니다.")) event.preventDefault(); }}>{state.formError ? <p role="alert" className="absolute right-0 top-12 z-20 w-80 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900 shadow-lg">{state.formError}</p> : null}<button type="submit" className="min-h-11 rounded-xl border border-amber-400 px-4 font-bold text-amber-900 transition hover:bg-amber-50">취소</button></form>;
}
