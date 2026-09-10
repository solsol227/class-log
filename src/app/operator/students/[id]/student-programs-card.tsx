"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { addAllowanceAdjustment, configureRentalAllowance, updateStudentPrograms, type StudentProfileActionState } from "./actions";

export type StudentProgram = { id: string; programType: string; storedStatus: string; effectiveStatus: string; startedAt: string; endedAt: string | null; stopReason: string | null; baseAllowanceCount: number | null };
export type AllowanceStatus = { studentProgramId: string; programType: string; periodMonth: string | null; baseAllowanceCount: number | null; operatorAdjustmentCount: number; draftCount: number; reservedCount: number; usedCount: number; remainingCount: number | null; makeupAvailableCount: number; makeupReservedCount: number; makeupUsedCount: number };
export type AllowanceAdjustment = { id: string; studentProgramId: string; targetMonth: string | null; delta: number; reason: string; createdAt: string };

const INITIAL_STATE: StudentProfileActionState = { fieldErrors: {} };
const PROGRAM_TYPES = ["weekday_vocal", "weekend_vocal", "rental", "trial"] as const;
const PROGRAM_LABELS: Record<string, string> = { weekday_vocal: "평일보컬", weekend_vocal: "주말보컬", rental: "대여", trial: "체험" };
const STATUS_LABELS: Record<string, string> = { active: "이용 중", inactive: "장기 미배정", stopped: "중단" };
const STOP_REASON_LABELS: Record<string, string> = { break: "잠시 쉼", ended: "이용 종료", other: "기타" };

function todayInKorea() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()); }
function formatDate(value: string) { return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" }).format(new Date(value)); }
function formatPeriod(value: string | null) { if (!value) return "등록 기간 전체"; const [year, month] = value.split("-"); return `${year}년 ${month}월`; }
function SaveButton() { const { pending } = useFormStatus(); return <button type="submit" disabled={pending} className="min-h-10 rounded-xl bg-[var(--accent)] px-4 font-bold text-white disabled:cursor-wait disabled:opacity-60">{pending ? "저장 중" : "저장"}</button>; }

export function StudentProgramsCard({ studentId, programs, allowanceStatuses, adjustments, canManage }: { studentId: string; programs: StudentProgram[]; allowanceStatuses: AllowanceStatus[]; adjustments: AllowanceAdjustment[]; canManage: boolean }) {
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState("");
  return <section className="rounded-2xl border border-[var(--line)] bg-white p-6 shadow-[0_18px_50px_rgba(23,64,60,0.06)] sm:p-8">
    {notice ? <p role="status" className="mb-4 text-sm font-bold text-[var(--accent-strong)]">{notice}</p> : null}
    {editing && canManage ? <ProgramEditor studentId={studentId} programs={programs} allowanceStatuses={allowanceStatuses} adjustments={adjustments} onCancel={() => { setEditing(false); setNotice("이용프로그램 편집을 취소했습니다."); }} onSaved={() => { setEditing(false); setNotice("이용프로그램을 저장했습니다."); }} /> : <><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold">이용프로그램</h2>{canManage ? <button type="button" onClick={() => { setEditing(true); setNotice(""); }} className="min-h-10 rounded-xl border border-[var(--line)] px-4 font-bold transition hover:border-[var(--accent)] hover:text-[var(--accent-strong)]">수정</button> : null}</div><ProgramHistory programs={programs} allowanceStatuses={allowanceStatuses} /></>}
  </section>;
}

function ProgramEditor({ studentId, programs, allowanceStatuses, adjustments, onCancel, onSaved }: { studentId: string; programs: StudentProgram[]; allowanceStatuses: AllowanceStatus[]; adjustments: AllowanceAdjustment[]; onCancel: () => void; onSaved: () => void }) {
  const today = useMemo(() => todayInKorea(), []);
  const activePrograms = programs.filter((program) => program.storedStatus === "active");
  const stoppedPrograms = programs.filter((program) => program.storedStatus === "stopped");
  const activeTypes = new Set(activePrograms.map((program) => program.programType));
  const availableTypes = PROGRAM_TYPES.filter((type) => !activeTypes.has(type));
  const [stopDrafts, setStopDrafts] = useState<Record<string, { selected: boolean; endedAt: string; stopReason: string }>>(() => Object.fromEntries(activePrograms.map((program) => [program.id, { selected: false, endedAt: today, stopReason: "" }])));
  const [historyReasons, setHistoryReasons] = useState<Record<string, string>>(() => Object.fromEntries(stoppedPrograms.map((program) => [program.id, program.stopReason ?? ""])));
  const [startDrafts, setStartDrafts] = useState<Record<string, { selected: boolean; startedAt: string; baseAllowanceCount: string }>>(() => Object.fromEntries(availableTypes.map((type) => [type, { selected: false, startedAt: today, baseAllowanceCount: "" }])));
  const changes = {
    stop: activePrograms.flatMap((program) => stopDrafts[program.id]?.selected ? [{ id: program.id, endedAt: stopDrafts[program.id].endedAt, stopReason: stopDrafts[program.id].stopReason || null }] : []),
    start: availableTypes.flatMap((programType) => startDrafts[programType]?.selected ? [{ programType, startedAt: startDrafts[programType].startedAt, ...(programType === "rental" ? { baseAllowanceCount: Number(startDrafts[programType].baseAllowanceCount) } : {}) }] : []),
    reasonUpdates: stoppedPrograms.flatMap((program) => (historyReasons[program.id] ?? "") !== (program.stopReason ?? "") ? [{ id: program.id, stopReason: historyReasons[program.id] || null }] : []),
  };
  const changeCount = changes.stop.length + changes.start.length + changes.reasonUpdates.length;
  const [state, action] = useActionState(async (previous: StudentProfileActionState, data: FormData) => { const result = await updateStudentPrograms(studentId, previous, data); if (result.success) onSaved(); return result; }, INITIAL_STATE);

  return <div>
    <form id="student-program-changes" action={action} className="flex flex-wrap items-center justify-between gap-3"><input type="hidden" name="program_changes" value={JSON.stringify(changes)} /><h2 className="text-xl font-bold">이용프로그램 편집</h2><div className="flex gap-2"><button type="button" onClick={onCancel} className="min-h-10 rounded-xl border border-[var(--line)] px-4 font-bold">취소</button><SaveButton /></div></form>
    {state.formError ? <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-900">{state.formError}</p> : null}
    {state.fieldErrors.programs ? <p className="mt-3 text-sm font-semibold text-rose-800">{state.fieldErrors.programs}</p> : null}

    <div className="mt-5 space-y-4">{activePrograms.map((program) => {
      const status = currentAllowanceStatus(program, allowanceStatuses, today);
      const recent = adjustments.filter((item) => item.studentProgramId === program.id && item.targetMonth === status?.periodMonth).slice(0, 3);
      const draft = stopDrafts[program.id];
      return <article key={program.id} className="rounded-xl border border-[var(--line)] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold">{PROGRAM_LABELS[program.programType]}</h3><p className="mt-1 text-sm text-[var(--muted)]">{program.startedAt} 시작 · {STATUS_LABELS[program.effectiveStatus]}</p></div><div className="flex items-center gap-3"><p className="font-bold text-[var(--accent-strong)]">남은 횟수 {status?.remainingCount ?? "-"}회</p><button type="button" onClick={() => setStopDrafts((current) => ({ ...current, [program.id]: { ...current[program.id], selected: true } }))} className="min-h-9 rounded-lg border border-rose-200 px-3 text-sm font-bold text-rose-800">중단</button></div></div>
        {status ? <AllowanceSummary status={status} /> : <p className="mt-4 text-sm text-[var(--muted)]">이용횟수 정보를 불러오지 못했습니다.</p>}
        {status ? <AllowanceAdjustmentForm studentId={studentId} program={program} status={status} /> : null}
        {recent.length ? <div className="mt-4 border-t border-[var(--line)] pt-3"><p className="text-sm font-bold">최근 조정</p><ul className="mt-2 space-y-1 text-sm text-[var(--muted)]">{recent.map((item) => <li key={item.id}>{item.delta > 0 ? "+" : ""}{item.delta} · {item.reason} · {formatDate(item.createdAt)}</li>)}</ul></div> : null}
        {draft?.selected ? <div className="mt-4 grid gap-3 rounded-xl bg-rose-50 p-4 sm:grid-cols-2"><label className="text-sm font-bold">중단일<input type="date" required value={draft.endedAt} min={program.startedAt} onChange={(event) => setStopDrafts((current) => ({ ...current, [program.id]: { ...current[program.id], endedAt: event.target.value } }))} className="mt-2 h-11 w-full rounded-lg border bg-white px-3 font-normal" /></label><label className="text-sm font-bold">중단 사유<select value={draft.stopReason} onChange={(event) => setStopDrafts((current) => ({ ...current, [program.id]: { ...current[program.id], stopReason: event.target.value } }))} className="mt-2 h-11 w-full rounded-lg border bg-white px-3 font-normal"><StopReasonOptions /></select></label><div className="flex gap-2 sm:col-span-2"><button type="submit" form="student-program-changes" className="min-h-10 rounded-lg bg-rose-700 px-4 font-bold text-white">중단 확인</button><button type="button" onClick={() => setStopDrafts((current) => ({ ...current, [program.id]: { ...current[program.id], selected: false } }))} className="min-h-10 rounded-lg border border-rose-200 px-4 font-bold text-rose-800">취소</button></div></div> : null}
      </article>;
    })}</div>

    {availableTypes.length ? <section className="mt-5 rounded-xl border border-dashed border-[#9badaa] p-4"><h3 className="font-bold">추가</h3><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{availableTypes.map((programType) => { const draft = startDrafts[programType]; return <label key={programType} className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg border px-3 text-center text-sm font-bold ${draft?.selected ? "border-[var(--accent)] bg-[#e5f2f0] text-[var(--accent-strong)]" : "border-[var(--line)]"}`}><input type="checkbox" className="sr-only" checked={draft?.selected ?? false} onChange={(event) => setStartDrafts((current) => ({ ...current, [programType]: { ...current[programType], selected: event.target.checked } }))} />{PROGRAM_LABELS[programType]}</label>; })}</div><div className="mt-3 grid gap-3 sm:grid-cols-2">{availableTypes.filter((type) => startDrafts[type]?.selected).map((programType) => { const draft = startDrafts[programType]; return <div key={programType} className="rounded-lg bg-[#f4f8f7] p-3"><p className="font-bold">{PROGRAM_LABELS[programType]}</p><label className="mt-3 block text-sm font-bold">시작일<input type="date" required value={draft.startedAt} onChange={(event) => setStartDrafts((current) => ({ ...current, [programType]: { ...current[programType], startedAt: event.target.value } }))} className="mt-1 h-10 w-full rounded-lg border bg-white px-2 font-normal" /></label>{programType === "rental" ? <label className="mt-3 block text-sm font-bold">총 제공 횟수<input type="number" min="1" required value={draft.baseAllowanceCount} onChange={(event) => setStartDrafts((current) => ({ ...current, [programType]: { ...current[programType], baseAllowanceCount: event.target.value } }))} className="mt-1 h-10 w-full rounded-lg border bg-white px-2 font-normal" /></label> : null}</div>; })}</div></section> : null}

    {stoppedPrograms.length ? <section className="mt-5 rounded-xl bg-[#f4f8f7] p-4"><h3 className="font-bold">이용 이력</h3><ul className="mt-3 space-y-4">{stoppedPrograms.map((program) => { const history = allowanceStatuses.filter((status) => status.studentProgramId === program.id); const programAdjustments = adjustments.filter((item) => item.studentProgramId === program.id); return <li key={program.id} className="border-t border-[var(--line)] pt-4 first:border-0 first:pt-0"><div className="grid gap-3 sm:grid-cols-[1fr_12rem] sm:items-start"><div><p className="font-bold">{PROGRAM_LABELS[program.programType]}</p><p className="mt-1 text-sm text-[var(--muted)]">{program.startedAt} ~ {program.endedAt ?? "-"}</p><p className="mt-1 text-sm">중단 사유: {program.stopReason ? STOP_REASON_LABELS[program.stopReason] : "사유 없음"}</p></div><label className="text-sm font-bold">중단 사유 수정<select value={historyReasons[program.id] ?? ""} onChange={(event) => setHistoryReasons((current) => ({ ...current, [program.id]: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border bg-white px-2 font-normal"><StopReasonOptions /></select></label></div>{history.map((status) => <AllowanceSummary key={status.periodMonth ?? "enrollment"} status={status} compact />)}{programAdjustments.length ? <ul className="mt-3 space-y-1 text-sm text-[var(--muted)]">{programAdjustments.map((item) => <li key={item.id}>{item.delta > 0 ? "+" : ""}{item.delta} · {item.reason} · {formatDate(item.createdAt)}</li>)}</ul> : null}</li>; })}</ul></section> : null}
    {changeCount ? <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm font-bold text-amber-950">미저장 프로그램 변경 {changeCount}건</p> : null}
  </div>;
}

function currentAllowanceStatus(program: StudentProgram, statuses: AllowanceStatus[], today: string) { const items = statuses.filter((status) => status.studentProgramId === program.id); if (program.programType === "weekday_vocal" || program.programType === "weekend_vocal") return items.find((status) => status.periodMonth?.slice(0, 7) === today.slice(0, 7)) ?? items[0]; return items.find((status) => status.periodMonth === null) ?? items[0]; }
function AllowanceSummary({ status, compact = false }: { status: AllowanceStatus; compact?: boolean }) { return <div className={compact ? "mt-3 rounded-lg border border-[var(--line)] bg-white p-3" : "mt-4"}><p className="text-sm font-bold text-[var(--muted)]">{formatPeriod(status.periodMonth)}</p><dl className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><div><dt className="text-[var(--muted)]">기본+추가</dt><dd className="font-bold">{status.baseAllowanceCount ?? "-"}+{status.operatorAdjustmentCount}</dd></div><div><dt className="text-[var(--muted)]">Draft</dt><dd className="font-bold">{status.draftCount}</dd></div><div><dt className="text-[var(--muted)]">예약/사용</dt><dd className="font-bold">{status.reservedCount}/{status.usedCount}</dd></div><div><dt className="text-[var(--muted)]">보강</dt><dd className="font-bold">{status.makeupAvailableCount}/{status.makeupReservedCount}/{status.makeupUsedCount}</dd></div></dl></div>; }
function AllowanceAdjustmentForm({ studentId, program, status }: { studentId: string; program: StudentProgram; status: AllowanceStatus }) { const monthly = program.programType === "weekday_vocal" || program.programType === "weekend_vocal"; if (status.baseAllowanceCount === null && program.programType === "rental") return <form action={configureRentalAllowance.bind(null, studentId, program.id)} className="mt-4 flex flex-wrap gap-2"><input type="number" name="allowance_count" min="1" required placeholder="총 제공 횟수" className="h-10 min-w-0 flex-1 rounded-lg border px-3" /><button className="h-10 rounded-lg border px-3 font-bold">대여 횟수 설정</button></form>; return <form action={addAllowanceAdjustment.bind(null, studentId, program.id)} className="mt-4 grid gap-2 sm:grid-cols-[9rem_6rem_1fr_auto]">{monthly ? <input type="month" name="target_month" required defaultValue={status.periodMonth?.slice(0, 7)} className="h-10 rounded-lg border px-2" /> : <input type="hidden" name="target_month" value="" />}<input type="number" name="delta" required placeholder="+1 / -1" className="h-10 rounded-lg border px-2" /><input name="reason" required placeholder="조정 사유" className="h-10 rounded-lg border px-3" /><button className="h-10 rounded-lg border px-3 font-bold">이력 추가</button></form>; }
function ProgramHistory({ programs, allowanceStatuses }: { programs: StudentProgram[]; allowanceStatuses: AllowanceStatus[] }) {
  const activePrograms = programs.filter((program) => program.storedStatus === "active");
  const stoppedPrograms = programs.filter((program) => program.storedStatus === "stopped");
  const renderProgram = (program: StudentProgram) => {
    const current = currentAllowanceStatus(program, allowanceStatuses, todayInKorea());
    return <li key={program.id} className="rounded-xl border border-[var(--line)] p-4">
      <div className="flex flex-wrap justify-between gap-3"><p className="font-bold">{PROGRAM_LABELS[program.programType] ?? program.programType}</p><span className="text-sm font-bold text-[var(--accent-strong)]">{STATUS_LABELS[program.effectiveStatus] ?? program.effectiveStatus}</span></div>
      <p className="mt-1 text-sm text-[var(--muted)]">{program.startedAt}{program.endedAt ? ` ~ ${program.endedAt}` : " 시작"}</p>
      {program.storedStatus === "stopped" ? <p className="mt-2 text-sm">중단 사유: {program.stopReason ? STOP_REASON_LABELS[program.stopReason] : "사유 없음"}</p> : null}
      {program.storedStatus === "active" ? <p className="mt-3 font-bold text-[var(--accent-strong)]">남은 횟수 {current?.remainingCount ?? "-"}회</p> : null}
    </li>;
  };
  if (!programs.length) return <p className="mt-4 text-sm text-[var(--muted)]">등록된 이용프로그램이 없습니다.</p>;
  return <div className="mt-4 space-y-5">
    {activePrograms.length ? <ul className="space-y-3">{activePrograms.map(renderProgram)}</ul> : <p className="text-sm text-[var(--muted)]">현재 이용 중인 프로그램이 없습니다.</p>}
    {stoppedPrograms.length ? <section><h3 className="font-bold">이용 이력</h3><ul className="mt-3 space-y-3">{stoppedPrograms.map(renderProgram)}</ul></section> : null}
  </div>;
}
function StopReasonOptions() { return <><option value="">사유 없음</option><option value="break">잠시 쉼</option><option value="ended">이용 종료</option><option value="other">기타</option></>; }
