"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  createStudent,
  type StudentCreateActionState,
} from "./actions";

const INITIAL_STATE: StudentCreateActionState = { fieldErrors: {} };

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-13 w-full rounded-xl bg-[var(--accent)] px-5 font-bold text-white transition hover:bg-[var(--accent-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-wait disabled:opacity-70"
    >
      {pending ? "등록 중입니다..." : "학생 등록"}
    </button>
  );
}

type FieldProps = {
  id: string;
  label: string;
  name: string;
  type?: "text" | "password";
  autoComplete: string;
  error?: string;
  defaultValue?: string;
};

function FormField({
  id,
  label,
  name,
  type = "text",
  autoComplete,
  error,
  defaultValue,
}: FieldProps) {
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
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className="h-13 w-full rounded-xl border border-[#9badaa] bg-white px-4 text-base outline-none transition focus:border-[var(--accent)] focus:ring-3 focus:ring-[#bce9e4] aria-invalid:border-rose-600 aria-invalid:focus:ring-rose-100"
      />
      {error ? (
        <p id={errorId} className="mt-2 text-sm font-semibold text-rose-800">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function StudentCreateForm() {
  const [state, formAction] = useActionState(createStudent, INITIAL_STATE);

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

      <FormField
        id="nickname"
        label="이름"
        name="nickname"
        autoComplete="username"
        error={state.fieldErrors.nickname}
        defaultValue={state.values?.nickname}
      />
      <FormField
        id="password"
        label="비밀번호"
        name="password"
        type="password"
        autoComplete="new-password"
        error={state.fieldErrors.password}
      />
      <FormField
        id="password-confirmation"
        label="비밀번호 확인"
        name="password_confirmation"
        type="password"
        autoComplete="new-password"
        error={state.fieldErrors.passwordConfirmation}
      />

      <SubmitButton />
    </form>
  );
}
