"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { assignSchedulesToStudent, type StudentAssignmentActionState } from "./actions";

const INITIAL_STATE: StudentAssignmentActionState = {};
type ScheduleOption = { value: string; label: string; detail: string };
type ProgramOption = { value: string; label: string };

function normalizeSearch(value: string) { return value.toLocaleLowerCase("ko-KR").replace(/\s+/g, ""); }
function BatchAssignButton({ disabled }: { disabled: boolean }) { const { pending } = useFormStatus(); return <button type="submit" disabled={pending || disabled} className="min-h-11 rounded-xl bg-[var(--accent)] px-4 font-bold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50">{pending ? "배정 중" : "선택 일정 배정"}</button>; }

export function ScheduleAssignmentPicker({ studentId, schedules, programs }: { studentId: string; schedules: ScheduleOption[]; programs: ProgramOption[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [programId, setProgramId] = useState(programs.length === 1 ? programs[0].value : "");
  const [state, formAction] = useActionState(async (previous: StudentAssignmentActionState, data: FormData) => {
    const result = await assignSchedulesToStudent(studentId, previous, data);
    if (result.success) setSelected(new Set());
    return result;
  }, INITIAL_STATE);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const normalizedQuery = normalizeSearch(query);
  const filtered = useMemo(() => schedules.filter((schedule) => normalizeSearch(`${schedule.label} ${schedule.detail}`).includes(normalizedQuery)), [normalizedQuery, schedules]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    function requestClose() { if (selected.size > 0 && !window.confirm("선택한 일정이 있습니다. 배정하지 않고 닫으시겠습니까?")) return; setOpen(false); setQuery(""); setSelected(new Set()); }
    function handlePointerDown(event: PointerEvent) { if (panelRef.current && !panelRef.current.contains(event.target as Node)) requestClose(); }
    function handleKeyDown(event: KeyboardEvent) { if (event.key === "Escape") requestClose(); }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => { document.removeEventListener("pointerdown", handlePointerDown); document.removeEventListener("keydown", handleKeyDown); };
  }, [open, selected]);

  function closePanel() { if (selected.size > 0 && !window.confirm("선택한 일정이 있습니다. 배정하지 않고 닫으시겠습니까?")) return; setOpen(false); setQuery(""); setSelected(new Set()); }
  function toggleSchedule(scheduleId: string) { setSelected((current) => { const next = new Set(current); if (next.has(scheduleId)) next.delete(scheduleId); else next.add(scheduleId); return next; }); }

  return <div ref={panelRef} className="relative">
    <button type="button" aria-expanded={open} aria-label="일정 배정 열기" onClick={() => open ? closePanel() : setOpen(true)} className="flex size-10 items-center justify-center rounded-xl border border-[var(--accent)] text-2xl font-medium leading-none text-[var(--accent-strong)] transition hover:bg-[#e5f2f0] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#bce9e4]"><span aria-hidden="true">+</span></button>
    {open ? <div className="absolute right-0 z-20 mt-2 w-[min(29rem,calc(100vw-2.5rem))] rounded-2xl border border-[var(--line)] bg-white p-4 shadow-[0_18px_55px_rgba(23,64,60,0.16)] sm:p-5">
      <header className="flex items-center justify-between gap-3"><h3 className="text-lg font-bold">배정 가능한 일정</h3><button type="button" onClick={closePanel} aria-label="일정 배정 패널 닫기" className="flex size-10 shrink-0 items-center justify-center rounded-full text-2xl hover:bg-[#eef4f3]">×</button></header>
      <label htmlFor="batch-lesson-search" className="mt-3 block text-sm font-bold">일정 제목 검색</label>
      <input ref={searchRef} id="batch-lesson-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="제목을 입력하세요" className="mt-2 h-11 w-full rounded-xl border border-[#9badaa] bg-white px-4 outline-none focus:border-[var(--accent)] focus:ring-3 focus:ring-[#bce9e4]" />
      <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">{filtered.length ? filtered.map((schedule) => <label key={schedule.value} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${selected.has(schedule.value) ? "border-[var(--accent)] bg-[#eef8f7]" : "border-[var(--line)] hover:border-[var(--accent)]"}`}><input type="checkbox" checked={selected.has(schedule.value)} onChange={() => toggleSchedule(schedule.value)} className="mt-1 size-4 shrink-0" /><span className="min-w-0"><span className="block truncate font-bold">{schedule.label}</span><span className="mt-1 block text-sm text-[var(--muted)]">{schedule.detail}</span></span></label>) : <p className="px-2 py-5 text-sm text-[var(--muted)]">배정 가능한 일정이 없습니다.</p>}</div>
      <form action={formAction} className="mt-3 border-t border-[var(--line)] pt-3">
        <input type="hidden" name="lesson_ids" value={JSON.stringify([...selected])} />
        {state.formError ? <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-900">{state.formError}</p> : null}
        {state.success ? <p role="status" className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-900">{state.assignedCount}개 일정을 배정했습니다.</p> : null}
        {programs.length === 1 ? <div className="flex items-end justify-between gap-3"><input type="hidden" name="student_program_id" value={programs[0].value} /><div><p className="text-sm font-bold text-[var(--accent-strong)]">{selected.size}개 선택됨</p><p className="mt-1 text-xs text-[var(--muted)]">{programs[0].label} 이용권 사용</p></div><BatchAssignButton disabled={selected.size === 0 || !programId} /></div> : <><p className="text-sm font-bold text-[var(--accent-strong)]">{selected.size}개 선택됨</p><label className="mt-3 grid gap-2 text-sm font-bold">사용 이용권<select name="student_program_id" required value={programId} onChange={(event) => setProgramId(event.target.value)} className="h-11 rounded-xl border border-[#9badaa] bg-white px-3 font-normal"><option value="">이용권을 선택하세요</option>{programs.map((program) => <option key={program.value} value={program.value}>{program.label}</option>)}</select></label><div className="mt-3 flex justify-end"><BatchAssignButton disabled={selected.size === 0 || !programId} /></div></>}
      </form>
    </div> : null}
  </div>;
}
