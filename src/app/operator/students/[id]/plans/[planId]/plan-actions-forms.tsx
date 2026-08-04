"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  addActivityItems,
  publishMonthlyPlan,
  type ActivityItemsActionState,
  type PublishPlanActionState,
} from "../actions";

function PendingButton({ idle, pending }: { idle: string; pending: string }) {
  const { pending: isPending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={isPending}
      className="min-h-12 rounded-xl bg-[var(--accent)] px-5 font-bold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-wait disabled:opacity-70"
    >
      {isPending ? pending : idle}
    </button>
  );
}

export function ActivityItemsForm({
  studentId,
  planId,
}: {
  studentId: string;
  planId: string;
}) {
  const [rowCount, setRowCount] = useState(2);
  const action = addActivityItems.bind(null, studentId, planId);
  const [state, formAction] = useActionState<ActivityItemsActionState, FormData>(
    action,
    {},
  );

  return (
    <form action={formAction} className="mt-6 space-y-4" noValidate>
      {state.formError ? (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900">
          {state.formError}
        </p>
      ) : null}

      {Array.from({ length: rowCount }, (_, index) => (
        <fieldset key={index} className="rounded-xl border border-[var(--line)] p-4">
          <legend className="px-1 text-sm font-bold">활동 {index + 1}</legend>
          <label htmlFor={`item-title-${index}`} className="mt-2 block text-sm font-bold">제목</label>
          <input
            id={`item-title-${index}`}
            name="item_title"
            type="text"
            className="mt-2 h-12 w-full rounded-xl border border-[#9badaa] bg-white px-4 outline-none focus:border-[var(--accent)]"
          />
          <label htmlFor={`item-description-${index}`} className="mt-4 block text-sm font-bold">설명 (선택)</label>
          <textarea
            id={`item-description-${index}`}
            name="item_description"
            rows={3}
            className="mt-2 w-full rounded-xl border border-[#9badaa] bg-white px-4 py-3 outline-none focus:border-[var(--accent)]"
          />
        </fieldset>
      ))}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => setRowCount((current) => current + 1)}
          className="min-h-12 rounded-xl border border-[var(--line)] px-5 font-bold text-[var(--accent-strong)]"
        >
          입력 행 추가
        </button>
        <PendingButton idle="활동 항목 저장" pending="저장 중입니다..." />
      </div>
    </form>
  );
}

export function PublishPlanForm({
  studentId,
  planId,
}: {
  studentId: string;
  planId: string;
}) {
  const action = publishMonthlyPlan.bind(null, studentId, planId);
  const [state, formAction] = useActionState<PublishPlanActionState, FormData>(
    action,
    {},
  );

  return (
    <form action={formAction} className="mt-6">
      {state.formError ? (
        <p role="alert" className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900">
          {state.formError}
        </p>
      ) : null}
      <PendingButton idle="게시" pending="게시 중입니다..." />
    </form>
  );
}
