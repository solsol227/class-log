"use client";

import { useActionState, useEffect, useState } from "react";
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

function PasswordField({ error }: { error?: string }) {
  const [revealed, setRevealed] = useState(false);
  const errorId = "password-error";
  useEffect(() => {
    const hide = () => setRevealed(false);
    const onVisibility = () => { if (document.hidden) hide(); };
    window.addEventListener("blur", hide);
    window.addEventListener("pointerup", hide);
    window.addEventListener("pointercancel", hide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", hide);
      window.removeEventListener("pointerup", hide);
      window.removeEventListener("pointercancel", hide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  function hidePassword() {
    setRevealed(false);
  }

  return (
    <div>
      <label htmlFor="password" className="mb-2 block text-sm font-bold">
        비밀번호
      </label>
      <div className="relative">
        <input
          id="password"
          name="password"
          type={revealed ? "text" : "password"}
          autoComplete="new-password"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className="h-13 w-full rounded-xl border border-[#9badaa] bg-white px-4 pr-14 text-base outline-none transition focus:border-[var(--accent)] focus:ring-3 focus:ring-[#bce9e4] aria-invalid:border-rose-600 aria-invalid:focus:ring-rose-100"
        />
        <button
          type="button"
          aria-label="누르고 있는 동안 비밀번호 보기"
          aria-pressed={revealed}
          aria-controls="password"
          onPointerDown={(event) => { if (event.isPrimary && event.button === 0) setRevealed(true); }}
          onPointerMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) hidePassword();
          }}
          onLostPointerCapture={hidePassword}
          onContextMenu={(event) => { event.preventDefault(); hidePassword(); }}
          onPointerUp={hidePassword}
          onPointerLeave={hidePassword}
          onPointerCancel={hidePassword}
          onKeyDown={(event) => {
            if (event.key === " " || event.key === "Enter") {
              event.preventDefault();
              setRevealed(true);
            }
          }}
          onKeyUp={(event) => {
            if (event.key === " " || event.key === "Enter") { event.preventDefault(); hidePassword(); }
          }}
          onBlur={hidePassword}
          className="absolute inset-y-1 right-1 flex w-11 touch-manipulation items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-[#e5f2f0] hover:text-[var(--accent-strong)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
            <circle cx="12" cy="12" r="2.5" />
          </svg>
        </button>
      </div>
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
      <PasswordField error={state.fieldErrors.password} />
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
