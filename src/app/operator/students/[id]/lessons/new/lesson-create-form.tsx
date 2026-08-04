"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createLesson, type LessonCreateActionState } from "../actions";

const INITIAL_STATE: LessonCreateActionState = { fieldErrors: {} };

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-13 w-full rounded-xl bg-[var(--accent)] px-5 font-bold text-white transition hover:bg-[var(--accent-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-wait disabled:opacity-70"
    >
      {pending ? "수업을 등록하는 중입니다..." : "수업 등록"}
    </button>
  );
}

type InputFieldProps = {
  id: string;
  label: string;
  name: string;
  type?: "text" | "datetime-local";
  defaultValue?: string;
  error?: string;
};

function InputField({
  id,
  label,
  name,
  type = "text",
  defaultValue,
  error,
}: InputFieldProps) {
  const errorId = `${id}-error`;

  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-bold">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        step={type === "datetime-local" ? 60 : undefined}
        defaultValue={defaultValue}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className="h-13 w-full rounded-xl border border-[#9badaa] bg-white px-4 text-base outline-none transition focus:border-[var(--accent)] focus:ring-3 focus:ring-[#bce9e4] aria-invalid:border-rose-600"
      />
      {error ? (
        <p id={errorId} className="mt-2 text-sm font-semibold text-rose-800">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function LessonCreateForm({ studentId }: { studentId: string }) {
  const action = createLesson.bind(null, studentId);
  const [state, formAction] = useActionState(action, INITIAL_STATE);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.formError ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900"
        >
          {state.formError}
        </p>
      ) : null}

      <InputField
        id="title"
        label="수업 제목"
        name="title"
        defaultValue={state.values?.title}
        error={state.fieldErrors.title}
      />
      <InputField
        id="starts-at"
        label="시작 시각"
        name="starts_at"
        type="datetime-local"
        defaultValue={state.values?.startsAt}
        error={state.fieldErrors.startsAt}
      />
      <InputField
        id="ends-at"
        label="종료 시각"
        name="ends_at"
        type="datetime-local"
        defaultValue={state.values?.endsAt}
        error={state.fieldErrors.endsAt}
      />
      <InputField
        id="location"
        label="장소 (선택)"
        name="location"
        defaultValue={state.values?.location}
      />

      <div>
        <label htmlFor="notes" className="mb-2 block text-sm font-bold">
          메모 (선택)
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={5}
          defaultValue={state.values?.notes}
          className="w-full rounded-xl border border-[#9badaa] bg-white px-4 py-3 text-base outline-none transition focus:border-[var(--accent)] focus:ring-3 focus:ring-[#bce9e4]"
        />
      </div>

      <SubmitButton />
    </form>
  );
}
