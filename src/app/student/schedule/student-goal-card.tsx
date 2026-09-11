"use client";

import { useActionState, useState } from "react";
import { AutoResizeTextarea } from "@/components/auto-resize-textarea";
import { updateMyStudentGoal, type StudentGoalActionState } from "./actions";

const INITIAL_STATE: StudentGoalActionState = { status: "idle" };

export function StudentGoalCard({ initialGoal }: { initialGoal: string | null }) {
  const [goal, setGoal] = useState(initialGoal ?? "");
  const [state, action, pending] = useActionState(
    async (previousState: StudentGoalActionState, formData: FormData) => {
      const result = await updateMyStudentGoal(previousState, formData);
      if (result.status === "success") setGoal(result.goal ?? "");
      return result;
    },
    INITIAL_STATE,
  );

  return (
    <form action={action} className="flex min-h-32 flex-col rounded-xl border border-[#dce8e6] bg-[#f8fbfa] p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="student-goal" className="font-bold text-[var(--accent-strong)]">내 목표</label>
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-lg border border-[var(--accent)] bg-white px-3 py-1.5 text-sm font-bold text-[var(--accent-strong)] transition hover:bg-[#e5f2f0] disabled:cursor-wait disabled:opacity-60"
        >
          {pending ? "수정 중" : "수정"}
        </button>
      </div>
      <AutoResizeTextarea
        id="student-goal"
        name="goal"
        maxLength={1000}
        maxRows={9}
        value={goal}
        onChange={(event) => setGoal(event.target.value)}
        placeholder="나만의 목표를 설정해볼까요?"
        aria-describedby="student-goal-status"
        className="mt-3 w-full border-0 bg-transparent p-0 leading-7 text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] focus:ring-0"
      />
      <p
        id="student-goal-status"
        aria-live="polite"
        className={`mt-auto pt-3 text-xs ${state.status === "error" ? "text-[#b42318]" : "text-[var(--muted)]"}`}
      >
        {state.message ?? "운영자 화면의 목표와 함께 반영됩니다."}
      </p>
    </form>
  );
}
