"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  saveAttendance,
  type AttendanceActionState,
  type AttendanceStatus,
} from "./actions";

const ATTENDANCE_OPTIONS: Array<{
  value: AttendanceStatus;
  label: string;
}> = [
  { value: "present", label: "출석" },
  { value: "late", label: "지각" },
  { value: "absent", label: "결석" },
  { value: "excused", label: "사유결석" },
];

const INITIAL_STATE: AttendanceActionState = { fieldErrors: {} };

function SubmitButton({ hasRecord }: { hasRecord: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-12 w-full rounded-xl bg-[var(--accent)] px-5 font-bold text-white transition hover:bg-[var(--accent-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-wait disabled:opacity-70"
    >
      {pending
        ? "출결을 저장하는 중입니다..."
        : hasRecord
          ? "출석 수정"
          : "출석 등록"}
    </button>
  );
}

type AttendanceFormProps = {
  studentId: string;
  lessonId: string;
  initialStatus: AttendanceStatus;
  initialMemo: string;
  hasRecord: boolean;
};

export function AttendanceForm({
  studentId,
  lessonId,
  initialStatus,
  initialMemo,
  hasRecord,
}: AttendanceFormProps) {
  const action = saveAttendance.bind(null, studentId, lessonId);
  const [state, formAction] = useActionState(action, INITIAL_STATE);
  const selectedStatus = state.values?.status ?? initialStatus;
  const memo = state.values?.memo ?? initialMemo;

  return (
    <form action={formAction} className="mt-6 space-y-6" noValidate>
      {state.formError ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900"
        >
          {state.formError}
        </p>
      ) : null}

      <fieldset>
        <legend className="text-sm font-bold">출결 상태</legend>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ATTENDANCE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl border border-[#9badaa] bg-white px-3 text-center font-bold has-checked:border-[var(--accent)] has-checked:bg-[#e5f2f0] has-checked:text-[var(--accent-strong)]"
            >
              <input
                type="radio"
                name="status"
                value={option.value}
                defaultChecked={selectedStatus === option.value}
                className="sr-only"
              />
              {option.label}
            </label>
          ))}
        </div>
        {state.fieldErrors.status ? (
          <p className="mt-2 text-sm font-semibold text-rose-800">
            {state.fieldErrors.status}
          </p>
        ) : null}
      </fieldset>

      <div>
        <label htmlFor="attendance-memo" className="mb-2 block text-sm font-bold">
          메모 (선택)
        </label>
        <textarea
          id="attendance-memo"
          name="memo"
          rows={4}
          maxLength={1000}
          defaultValue={memo}
          aria-invalid={Boolean(state.fieldErrors.memo)}
          aria-describedby={
            state.fieldErrors.memo ? "attendance-memo-error" : undefined
          }
          className="w-full rounded-xl border border-[#9badaa] bg-white px-4 py-3 text-base outline-none transition focus:border-[var(--accent)] focus:ring-3 focus:ring-[#bce9e4] aria-invalid:border-rose-600"
        />
        <p className="mt-2 text-sm text-[var(--muted)]">최대 1000자</p>
        {state.fieldErrors.memo ? (
          <p
            id="attendance-memo-error"
            className="mt-2 text-sm font-semibold text-rose-800"
          >
            {state.fieldErrors.memo}
          </p>
        ) : null}
      </div>

      <SubmitButton hasRecord={hasRecord} />
    </form>
  );
}
