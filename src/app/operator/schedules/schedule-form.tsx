"use client";

import { useActionState, useLayoutEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { createSchedule, updateSchedule, type ScheduleActionState } from "./actions";
import { ScheduleDateTimeFields, type ScheduleDateTimeFieldsHandle } from "./schedule-date-time-fields";
import { StudentMultiSelectField, type StudentSelectOption } from "./student-multi-select-field";

const INITIAL_STATE: ScheduleActionState = { fieldErrors: {} };
type ScheduleValues = {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  notes: string;
  studentIds?: string[];
  programType?: string;
  status?: string;
};

function FormActions({ mode, onCancel }: { mode: "create" | "edit"; onCancel?: () => void }) {
  const { pending } = useFormStatus();

  if (mode === "create") {
    return <button type="submit" disabled={pending} className="min-h-12 w-full rounded-xl bg-[var(--accent)] px-5 font-bold text-white transition hover:bg-[var(--accent-strong)] active:translate-y-px disabled:cursor-wait disabled:opacity-70">{pending ? "등록하는 중입니다..." : "일정 등록"}</button>;
  }

  return (
    <div className="flex justify-end">
      <button type="button" disabled={pending} onClick={onCancel} className="min-h-12 rounded-xl border border-[#9badaa] px-5 font-bold text-[var(--foreground)] transition hover:bg-[#f4f8f7] active:translate-y-px disabled:opacity-60">취소</button>
    </div>
  );
}

export function ScheduleForm({ mode, lessonId, initialValues, students, onCancel, formId }: { mode: "create" | "edit"; lessonId?: string; initialValues?: ScheduleValues; students?: StudentSelectOption[]; onCancel?: () => void; formId?: string }) {
  const action = mode === "edit" && lessonId ? updateSchedule.bind(null, lessonId) : createSchedule;
  const [state, formAction] = useActionState(action, INITIAL_STATE);
  const dateTimeFieldsRef = useRef<ScheduleDateTimeFieldsHandle>(null);
  const values = state.values ?? initialValues;
  const [programType, setProgramType] = useState(values?.programType ?? "weekday_vocal");
  const dateTimeKey = `${values?.date ?? ""}|${values?.startTime ?? ""}|${values?.endTime ?? ""}`;
  const programStudents = students?.filter((student) => student.programTypes?.includes(programType));
  const programStudentIds = new Set(programStudents?.map((student) => student.id));
  const selectedProgramStudentIds = values?.studentIds?.filter((studentId) => programStudentIds.has(studentId));

  return (
    <form id={formId} action={formAction} onSubmit={(event) => { if (dateTimeFieldsRef.current && !dateTimeFieldsRef.current.validate()) event.preventDefault(); }} className="space-y-5" noValidate>
      {state.formError ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900">{state.formError}</p> : null}
      <FormInput id="schedule-title" label="제목" name="title" defaultValue={values?.title} error={state.fieldErrors.title} />
      <div><label htmlFor="schedule-program" className="mb-2 block text-sm font-bold">프로그램</label><select id="schedule-program" name="program_type" value={programType} onChange={(event) => setProgramType(event.target.value)} className="h-13 w-full rounded-xl border border-[#9badaa] bg-white px-4"><option value="weekday_vocal">평일보컬</option><option value="weekend_vocal">주말보컬</option><option value="trial">체험</option></select>{state.fieldErrors.program ? <p className="mt-2 text-sm font-semibold text-rose-800">{state.fieldErrors.program}</p> : null}</div>
      <div><label htmlFor="schedule-status" className="mb-2 block text-sm font-bold">저장 상태</label><select id="schedule-status" name="status" defaultValue={values?.status === "draft" ? "draft" : "scheduled"} className="h-13 w-full rounded-xl border border-[#9badaa] bg-white px-4"><option value="scheduled">확정 일정</option><option value="draft">Draft</option></select></div>
      <ScheduleDateTimeFields ref={dateTimeFieldsRef} key={dateTimeKey} initialDate={values?.date} initialStartTime={values?.startTime} initialEndTime={values?.endTime} dateError={state.fieldErrors.date} startError={state.fieldErrors.startsAt} endError={state.fieldErrors.endsAt} />
      <div>
        <label htmlFor="schedule-location" className="mb-2 block text-sm font-bold">장소 선택 (선택)</label>
        <input id="schedule-location" name="location" list="schedule-location-options" defaultValue={values?.location} placeholder="장소를 선택하거나 직접 입력하세요" className="h-13 w-full rounded-xl border border-[#9badaa] bg-white px-4 text-base outline-none focus:border-[var(--accent)] focus:ring-3 focus:ring-[#bce9e4]" />
        <datalist id="schedule-location-options"><option value="교실" /><option value="온라인" /><option value="외부" /></datalist>
      </div>
      <div>
        <label htmlFor="schedule-notes" className="mb-2 block text-sm font-bold">메모 (선택)</label>
        <AutoResizeTextarea id="schedule-notes" name="notes" defaultValue={values?.notes} />
      </div>
      {programStudents ? <StudentMultiSelectField key={`${programType}|${(selectedProgramStudentIds ?? []).join(",")}`} students={programStudents} initialSelectedIds={selectedProgramStudentIds} error={state.fieldErrors.students} /> : null}
      <FormActions mode={mode} onCancel={onCancel} />
    </form>
  );
}

function AutoResizeTextarea({ id, name, defaultValue }: { id: string; name: string; defaultValue?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function resize() {
    const textarea = ref.current;
    if (!textarea) return;
    textarea.style.height = "52px";
    textarea.style.height = `${Math.max(52, textarea.scrollHeight)}px`;
  }

  useLayoutEffect(resize, [defaultValue]);

  return <textarea ref={ref} id={id} name={name} rows={1} defaultValue={defaultValue} onInput={resize} className="min-h-13 w-full resize-none overflow-hidden rounded-xl border border-[#9badaa] bg-white px-4 py-3 text-base leading-7 outline-none focus:border-[var(--accent)] focus:ring-3 focus:ring-[#bce9e4]" />;
}

function FormInput({ id, label, name, defaultValue, error }: { id: string; label: string; name: string; defaultValue?: string; error?: string }) {
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-bold">{label}</label>
      <input id={id} name={name} defaultValue={defaultValue} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} className="h-13 w-full rounded-xl border border-[#9badaa] bg-white px-4 text-base outline-none focus:border-[var(--accent)] focus:ring-3 focus:ring-[#bce9e4] aria-invalid:border-rose-600" />
      {error ? <p id={errorId} className="mt-2 text-sm font-semibold text-rose-800">{error}</p> : null}
    </div>
  );
}
