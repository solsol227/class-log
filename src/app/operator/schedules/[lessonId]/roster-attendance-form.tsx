"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { saveRosterAttendance, type AttendanceStatus, type RosterAttendanceActionState } from "../actions";

const INITIAL_STATE: RosterAttendanceActionState = {};
const OPTIONS: Array<{ value: AttendanceStatus; label: string }> = [
  { value: "present", label: "출석" },
  { value: "absent", label: "결석" },
  { value: "excused", label: "사유결석" },
];

type RosterStudent = { id: string; name: string; status: AttendanceStatus | null };

function SaveButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="min-h-12 w-full rounded-xl bg-[var(--accent)] px-5 font-bold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-wait disabled:opacity-70">{pending ? "출결을 저장하는 중입니다..." : "출결 저장"}</button>;
}

export function RosterAttendanceForm({ lessonId, students, blockedReason }: { lessonId: string; students: RosterStudent[]; blockedReason: string | null }) {
  const [state, formAction] = useActionState(saveRosterAttendance.bind(null, lessonId), INITIAL_STATE);

  return (
    <form action={formAction} className="mt-5" noValidate>
      {state.formError ? <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900">{state.formError}</p> : null}
      {blockedReason ? <p className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 font-bold text-amber-950">{blockedReason}</p> : null}
      <div className="space-y-3">
        {students.map((student) => (
          <fieldset key={student.id} disabled={Boolean(blockedReason)} className="grid gap-3 rounded-xl border border-[var(--line)] p-4 sm:grid-cols-[minmax(9rem,1fr)_minmax(0,2fr)] sm:items-center">
            <legend className="sr-only">{student.name} 출결 상태</legend>
            <div>
              <p className="font-bold">{student.name}</p>
              <p className="mt-1 text-sm text-[var(--muted)]">{student.status ? "기록됨" : "미기록"}</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {OPTIONS.map((option) => (
                <label key={option.value} className="flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-[#9badaa] bg-white px-2 text-center text-sm font-bold has-checked:border-[var(--accent)] has-checked:bg-[#e5f2f0] has-checked:text-[var(--accent-strong)] has-disabled:cursor-not-allowed has-disabled:opacity-60">
                  <input type="radio" name={`attendance_${student.id}`} value={option.value} defaultChecked={student.status === option.value} className="sr-only" />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      {!blockedReason ? <div className="mt-5"><SaveButton /></div> : null}
    </form>
  );
}
