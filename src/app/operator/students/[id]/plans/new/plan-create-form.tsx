"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  createMonthlyPlan,
  type PlanCreateActionState,
} from "../actions";

const INITIAL_STATE: PlanCreateActionState = { fieldErrors: {} };

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-13 w-full rounded-xl bg-[var(--accent)] px-5 font-bold text-white transition hover:bg-[var(--accent-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-wait disabled:opacity-70"
    >
      {pending ? "계획을 만드는 중입니다..." : "월간 계획 만들기"}
    </button>
  );
}

export function PlanCreateForm({ studentId }: { studentId: string }) {
  const action = createMonthlyPlan.bind(null, studentId);
  const [state, formAction] = useActionState(action, INITIAL_STATE);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.formError ? (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900">
          {state.formError}
        </p>
      ) : null}

      <div>
        <label htmlFor="month" className="mb-2 block text-sm font-bold">계획 월</label>
        <input
          id="month"
          name="month"
          type="month"
          defaultValue={state.values?.month}
          aria-invalid={Boolean(state.fieldErrors.month)}
          aria-describedby={state.fieldErrors.month ? "month-error" : undefined}
          className="h-13 w-full rounded-xl border border-[#9badaa] bg-white px-4 text-base outline-none transition focus:border-[var(--accent)] focus:ring-3 focus:ring-[#bce9e4] aria-invalid:border-rose-600"
        />
        {state.fieldErrors.month ? <p id="month-error" className="mt-2 text-sm font-semibold text-rose-800">{state.fieldErrors.month}</p> : null}
      </div>

      <div>
        <label htmlFor="title" className="mb-2 block text-sm font-bold">제목</label>
        <input
          id="title"
          name="title"
          type="text"
          defaultValue={state.values?.title}
          aria-invalid={Boolean(state.fieldErrors.title)}
          aria-describedby={state.fieldErrors.title ? "title-error" : undefined}
          className="h-13 w-full rounded-xl border border-[#9badaa] bg-white px-4 text-base outline-none transition focus:border-[var(--accent)] focus:ring-3 focus:ring-[#bce9e4] aria-invalid:border-rose-600"
        />
        {state.fieldErrors.title ? <p id="title-error" className="mt-2 text-sm font-semibold text-rose-800">{state.fieldErrors.title}</p> : null}
      </div>

      <div>
        <label htmlFor="summary" className="mb-2 block text-sm font-bold">요약 (선택)</label>
        <textarea
          id="summary"
          name="summary"
          rows={4}
          defaultValue={state.values?.summary}
          className="w-full rounded-xl border border-[#9badaa] bg-white px-4 py-3 text-base outline-none transition focus:border-[var(--accent)] focus:ring-3 focus:ring-[#bce9e4]"
        />
      </div>

      <SubmitButton />
    </form>
  );
}
