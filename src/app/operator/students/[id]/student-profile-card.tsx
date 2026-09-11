"use client";

import { useActionState, useState } from "react";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { AutoResizeTextarea } from "@/components/auto-resize-textarea";
import { deleteStudent, updateStudentProfile, type DeleteStudentActionState, type StudentProfileActionState } from "./actions";

type StudentProfile = { id: string; name: string; gender: string | null; age: number | null; phone: string | null; acquisitionSource: string | null; joinedMonth: string | null; goal: string | null; specialNotes: string | null };
const PROFILE_INITIAL_STATE: StudentProfileActionState = { fieldErrors: {} };
const DELETE_INITIAL_STATE: DeleteStudentActionState = {};

function formatPhone(value: string) { const digits = value.replace(/\D/g, "").slice(0, 11); if (digits.length <= 3) return digits; if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`; return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`; }
function formatJoinedMonth(value: string | null) { if (!value) return "-"; const [year, month] = value.split("-"); return `${year}년 ${month}월`; }
function SaveButton() { const { pending } = useFormStatus(); return <button type="submit" disabled={pending} className="min-h-10 rounded-xl bg-[var(--accent)] px-4 font-bold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-wait disabled:opacity-70">{pending ? "저장 중" : "저장"}</button>; }
function DeleteButton() { const { pending } = useFormStatus(); return <button type="submit" disabled={pending} className="min-h-10 rounded-xl border border-rose-300 px-4 font-bold text-rose-800 transition hover:bg-rose-50 disabled:cursor-wait disabled:opacity-70">{pending ? "삭제 중" : "삭제"}</button>; }

export function StudentProfileCard({ student, canManage }: { student: StudentProfile; canManage: boolean }) {
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState("");
  const [deleteState, deleteAction] = useActionState(deleteStudent.bind(null, student.id), DELETE_INITIAL_STATE);
  const actions = canManage ? <div className="flex shrink-0 items-center gap-2"><button type="button" onClick={() => { setEditing(true); setNotice(""); }} className="min-h-10 rounded-xl border border-[var(--line)] px-4 font-bold transition hover:border-[var(--accent)] hover:text-[var(--accent-strong)]">수정</button><form action={deleteAction} onSubmit={(event) => { if (!window.confirm("이 학생을 삭제하시겠습니까? 학생 계정과 배정된 일정 및 관련 데이터가 함께 삭제될 수 있습니다.")) event.preventDefault(); }}><DeleteButton /></form></div> : null;
  return <section className="rounded-2xl border border-[var(--line)] bg-white p-6 shadow-[0_24px_70px_rgba(23,64,60,0.09)] sm:p-8">
    {notice ? <p role="status" className="mb-4 text-sm font-bold text-[var(--accent-strong)]">{notice}</p> : null}
    {deleteState.formError ? <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900">{deleteState.formError}</p> : null}
    {editing && canManage ? <StudentEditForm student={student} onCancel={() => { setEditing(false); setNotice("학생 기본정보 편집을 취소했습니다."); }} onSaved={() => { setEditing(false); setNotice("학생 기본정보를 저장했습니다."); }} /> : <StudentProfileView student={student} actions={actions} />}
  </section>;
}

function StudentProfileView({ student, actions }: { student: StudentProfile; actions: ReactNode }) {
  return <><div className="flex items-start justify-between gap-4"><h1 className="min-w-0 break-words text-3xl font-bold tracking-[-0.04em] sm:text-4xl">{student.name}</h1>{actions}</div>
    <dl className="mt-7 grid grid-cols-[5rem_minmax(0,1fr)] gap-x-4 gap-y-4"><ProfileValue label="성별" value={student.gender === "male" ? "남" : student.gender === "female" ? "여" : "-"} /><ProfileValue label="나이" value={student.age?.toString() ?? "-"} /><ProfileValue label="연락처" value={student.phone ? formatPhone(student.phone) : "-"} /><ProfileValue label="유입경로" value={student.acquisitionSource ? ({ instagram: "인스타그램", daangn: "당근", referral: "지인소개", naver: "네이버" }[student.acquisitionSource] ?? student.acquisitionSource) : "-"} /><ProfileValue label="유입시기" value={formatJoinedMonth(student.joinedMonth)} /><ProfileValue label="목표" value={student.goal ?? "-"} multiline /><ProfileValue label="특이사항" value={student.specialNotes ?? "-"} multiline /></dl></>;
}

function StudentEditForm({ student, onCancel, onSaved }: { student: StudentProfile; onCancel: () => void; onSaved: () => void }) {
  const [state, action] = useActionState(async (previous: StudentProfileActionState, data: FormData) => { const result = await updateStudentProfile(student.id, previous, data); if (result.success) onSaved(); return result; }, PROFILE_INITIAL_STATE);
  const [dirty, setDirty] = useState(false);
  const [phone, setPhone] = useState(formatPhone(student.phone ?? ""));
  const [joinedMonth, setJoinedMonth] = useState(student.joinedMonth?.slice(0, 7) ?? "");
  return <form action={action} onChange={() => setDirty(true)} className="space-y-6" noValidate>
    <div className="flex flex-wrap items-start justify-between gap-4"><h1 className="min-w-0 break-words text-3xl font-bold tracking-[-0.04em] sm:text-4xl">{student.name}</h1><div className="flex gap-2"><CancelButton onCancel={onCancel} /><SaveButton /></div></div>
    {state.formError ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900">{state.formError}</p> : null}
    {dirty ? <p role="status" className="text-sm text-[var(--muted)]">미저장 변경이 있습니다.</p> : null}
    <div className="grid gap-5 sm:grid-cols-2">
      <ProfileInput id="student-name" label="이름" name="name" defaultValue={student.name} error={state.fieldErrors.name} />
      <div><label htmlFor="student-gender" className="mb-2 block text-sm font-bold">성별</label><select id="student-gender" name="gender" defaultValue={student.gender ?? ""} className="h-12 w-full rounded-xl border border-[#9badaa] bg-white px-4"><option value="">선택 안 함</option><option value="male">남</option><option value="female">여</option></select>{state.fieldErrors.gender ? <p className="mt-2 text-sm font-semibold text-rose-800">{state.fieldErrors.gender}</p> : null}</div>
      <ProfileInput id="student-age" label="나이" name="age" type="number" defaultValue={student.age?.toString() ?? ""} error={state.fieldErrors.age} />
      <div><label htmlFor="student-phone" className="mb-2 block text-sm font-bold">연락처</label><input id="student-phone" name="phone" inputMode="numeric" autoComplete="tel" value={phone} onChange={(event) => setPhone(formatPhone(event.target.value))} placeholder="010-1234-5678" aria-invalid={Boolean(state.fieldErrors.phone)} className="h-12 w-full rounded-xl border border-[#9badaa] bg-white px-4 aria-invalid:border-rose-600" />{state.fieldErrors.phone ? <p className="mt-2 text-sm font-semibold text-rose-800">{state.fieldErrors.phone}</p> : null}</div>
      <div><label htmlFor="student-source" className="mb-2 block text-sm font-bold">유입경로</label><select id="student-source" name="acquisition_source" defaultValue={student.acquisitionSource ?? ""} className="h-12 w-full rounded-xl border border-[#9badaa] bg-white px-4"><option value="">선택 안 함</option><option value="instagram">인스타그램</option><option value="daangn">당근</option><option value="referral">지인소개</option><option value="naver">네이버</option></select>{state.fieldErrors.acquisitionSource ? <p className="mt-2 text-sm font-semibold text-rose-800">{state.fieldErrors.acquisitionSource}</p> : null}</div>
      <div><label htmlFor="joined-month" className="mb-2 block text-sm font-bold">유입시기</label><input id="joined-month" name="joined_month" type="month" value={joinedMonth} onChange={(event) => setJoinedMonth(event.target.value)} aria-invalid={Boolean(state.fieldErrors.joinedMonth)} className="h-12 w-full rounded-xl border border-[#9badaa] bg-white px-4 aria-invalid:border-rose-600" />{state.fieldErrors.joinedMonth ? <p className="mt-2 text-sm font-semibold text-rose-800">{state.fieldErrors.joinedMonth}</p> : null}</div>
      <div className="sm:col-span-2"><label htmlFor="student-goal" className="mb-2 block text-sm font-bold">목표</label><AutoResizeTextarea id="student-goal" name="goal" maxLength={1000} defaultValue={student.goal ?? ""} aria-invalid={Boolean(state.fieldErrors.goal)} className="w-full rounded-xl border border-[#9badaa] bg-white px-4 py-3 leading-7 aria-invalid:border-rose-600" />{state.fieldErrors.goal ? <p className="mt-2 text-sm font-semibold text-rose-800">{state.fieldErrors.goal}</p> : null}</div>
      <div className="sm:col-span-2"><label htmlFor="student-notes" className="mb-2 block text-sm font-bold">특이사항</label><AutoResizeTextarea id="student-notes" name="special_notes" defaultValue={student.specialNotes ?? ""} className="w-full rounded-xl border border-[#9badaa] bg-white px-4 py-3 leading-7" /></div>
    </div>
  </form>;
}

function CancelButton({ onCancel }: { onCancel: () => void }) { const { pending } = useFormStatus(); return <button type="button" disabled={pending} onClick={onCancel} className="min-h-10 rounded-xl border border-[var(--line)] px-4 font-bold disabled:opacity-60">취소</button>; }
function ProfileInput({ id, label, name, defaultValue, error, type = "text" }: { id: string; label: string; name: string; defaultValue: string; error?: string; type?: string }) { return <div><label htmlFor={id} className="mb-2 block text-sm font-bold">{label}</label><input id={id} name={name} type={type} min={type === "number" ? 1 : undefined} max={type === "number" ? 119 : undefined} defaultValue={defaultValue} aria-invalid={Boolean(error)} className="h-12 w-full rounded-xl border border-[#9badaa] bg-white px-4 aria-invalid:border-rose-600" />{error ? <p className="mt-2 text-sm font-semibold text-rose-800">{error}</p> : null}</div>; }
function ProfileValue({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) { return <><dt className="pt-0.5 text-sm font-bold text-[var(--muted)]">{label}</dt><dd className={`min-w-0 break-words ${multiline ? "whitespace-pre-wrap leading-7" : ""}`}>{value}</dd></>; }
