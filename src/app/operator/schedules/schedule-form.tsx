"use client";

import { useActionState, useLayoutEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { createSchedule, updateSchedule, type ScheduleActionState } from "./actions";

const INITIAL_STATE: ScheduleActionState = { fieldErrors: {} };
type ScheduleValues = { title: string; startsAt: string; endsAt: string; location: string; notes: string };

function SubmitButton({ mode }: { mode: "create" | "edit" }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="min-h-12 w-full rounded-xl bg-[var(--accent)] px-5 font-bold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-wait disabled:opacity-70">{pending ? "저장하는 중입니다..." : mode === "create" ? "일정 등록" : "일정 수정"}</button>;
}

export function ScheduleForm({ mode, lessonId, initialValues }: { mode: "create" | "edit"; lessonId?: string; initialValues?: ScheduleValues }) {
  const action = mode === "edit" && lessonId ? updateSchedule.bind(null, lessonId) : createSchedule;
  const [state, formAction] = useActionState(action, INITIAL_STATE);
  const values = state.values ?? initialValues;

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.formError ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900">{state.formError}</p> : null}
      <FormInput id="schedule-title" label="제목" name="title" defaultValue={values?.title} error={state.fieldErrors.title} />
      <FormInput id="schedule-starts-at" label="시작 일시" name="starts_at" type="datetime-local" defaultValue={values?.startsAt} error={state.fieldErrors.startsAt} />
      <FormInput id="schedule-ends-at" label="종료 일시" name="ends_at" type="datetime-local" defaultValue={values?.endsAt} error={state.fieldErrors.endsAt} />
      <div>
        <label htmlFor="schedule-location" className="mb-2 block text-sm font-bold">장소 선택 (선택)</label>
        <input id="schedule-location" name="location" list="schedule-location-options" defaultValue={values?.location} placeholder="장소를 선택하거나 직접 입력하세요" className="h-13 w-full rounded-xl border border-[#9badaa] bg-white px-4 text-base outline-none focus:border-[var(--accent)] focus:ring-3 focus:ring-[#bce9e4]" />
        <datalist id="schedule-location-options"><option value="교실" /><option value="온라인" /><option value="외부" /></datalist>
      </div>
      <div>
        <label htmlFor="schedule-notes" className="mb-2 block text-sm font-bold">메모 (선택)</label>
        <AutoResizeTextarea id="schedule-notes" name="notes" defaultValue={values?.notes} />
      </div>
      <SubmitButton mode={mode} />
    </form>
  );
}

function AutoResizeTextarea({ id, name, defaultValue }: { id: string; name: string; defaultValue?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function resize() {
    const textarea = ref.current;
    if (!textarea) return;
    textarea.style.height = "52px";
    textarea.style.height = `${Math.max(52, textarea.scrollHeight)}px`;
  }

  useLayoutEffect(resize, [defaultValue]);

  return (
    <textarea
      ref={ref}
      id={id}
      name={name}
      rows={1}
      defaultValue={defaultValue}
      onInput={resize}
      className="min-h-13 w-full resize-none overflow-hidden rounded-xl border border-[#9badaa] bg-white px-4 py-3 text-base leading-7 outline-none focus:border-[var(--accent)] focus:ring-3 focus:ring-[#bce9e4]"
    />
  );
}

function FormInput({ id, label, name, type = "text", defaultValue, error }: { id: string; label: string; name: string; type?: "text" | "datetime-local"; defaultValue?: string; error?: string }) {
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-bold">{label}</label>
      <input id={id} name={name} type={type} step={type === "datetime-local" ? 60 : undefined} defaultValue={defaultValue} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} className="h-13 w-full rounded-xl border border-[#9badaa] bg-white px-4 text-base outline-none focus:border-[var(--accent)] focus:ring-3 focus:ring-[#bce9e4] aria-invalid:border-rose-600" />
      {error ? <p id={errorId} className="mt-2 text-sm font-semibold text-rose-800">{error}</p> : null}
    </div>
  );
}
