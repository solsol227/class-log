"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { saveRosterAttendance, type AttendanceStatus, type RosterAttendanceActionState } from "../actions";

const INITIAL_STATE: RosterAttendanceActionState = {};
const OPTIONS: Array<{ value: AttendanceStatus; label: string }> = [
  { value: "present", label: "출석" },
  { value: "absent", label: "결석" },
  { value: "excused", label: "사유결석" },
];

type RosterStudent = {
  id: string;
  name: string;
  status: AttendanceStatus | null;
  makeupStatus: string | null;
};

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
        {students.map((student) => {
          const makeupLocksAttendance = student.status === "excused"
            && student.makeupStatus === "completed";
          const makeupNotice = student.makeupStatus === "completed"
            ? "완료된 보강과 연결되어 사유결석 상태를 변경할 수 없습니다."
            : student.status === "excused" && student.makeupStatus === "scheduled"
              ? "출결을 변경하면 보강 예정이 자동 취소되고 보강이 만든 대체 일정 배정도 정리됩니다."
              : student.status === "excused" && student.makeupStatus === "requested"
                ? "출결을 변경하면 보강 대기가 자동 취소됩니다."
              : null;
          return (
            <fieldset key={student.id} disabled={Boolean(blockedReason)} className="grid gap-3 rounded-xl border border-[var(--line)] p-4 sm:grid-cols-[minmax(9rem,1fr)_minmax(0,2fr)] sm:items-center">
              <legend className="sr-only">{student.name} 출결 상태</legend>
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold">{student.name}</p>
                  <Link href={`/operator/schedules/${lessonId}/students/${student.id}/feedback`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center rounded-lg border border-[var(--accent)] px-3 text-sm font-bold text-[var(--accent-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">피드백 작성 <span aria-hidden="true" className="ml-1">↗</span></Link>
                </div>
                <p className="mt-1 text-sm text-[var(--muted)]">{student.status ? "기록됨" : "미기록"}</p>
                {makeupNotice ? <p className="mt-2 text-xs font-semibold text-amber-800">{makeupNotice}</p> : null}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {OPTIONS.map((option) => (
                  <label key={option.value} className="flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-[#9badaa] bg-white px-2 text-center text-sm font-bold has-checked:border-[var(--accent)] has-checked:bg-[#e5f2f0] has-checked:text-[var(--accent-strong)] has-disabled:cursor-not-allowed has-disabled:opacity-60">
                    <input
                      type="radio"
                      name={`attendance_${student.id}`}
                      value={option.value}
                      defaultChecked={student.status === option.value}
                      disabled={makeupLocksAttendance && option.value !== "excused"}
                      className="sr-only"
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}
      </div>
      {!blockedReason ? <div className="mt-5"><SaveButton /></div> : null}
    </form>
  );
}
