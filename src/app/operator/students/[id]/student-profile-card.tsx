"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  deleteStudent,
  updateStudentProfile,
  addStudentProgram,
  stopStudentProgram,
  type DeleteStudentActionState,
  type StudentProfileActionState,
  type StudentProgramActionState,
} from "./actions";

type StudentProfile = {
  id: string;
  name: string;
  gender: string | null;
  age: number | null;
  phone: string | null;
  acquisitionSource: string | null;
  joinedMonth: string | null;
  specialNotes: string | null;
};

type StudentProgram = { id: string; programType: string; storedStatus: string; effectiveStatus: string; startedAt: string; endedAt: string | null; stopReason: string | null };

const PROFILE_INITIAL_STATE: StudentProfileActionState = { fieldErrors: {} };
const DELETE_INITIAL_STATE: DeleteStudentActionState = {};
const PROGRAM_INITIAL_STATE: StudentProgramActionState = {};
const PROGRAM_LABELS: Record<string, string> = { weekday_vocal: "평일보컬", weekend_vocal: "주말보컬", rental: "대여", trial: "체험" };
const STATUS_LABELS: Record<string, string> = { active: "이용 중", inactive: "비활성", stopped: "중단" };

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function formatJoinedMonth(value: string | null) {
  if (!value) return "-";
  const [year, month] = value.split("-");
  return `${year.slice(2)}년 ${month}월`;
}

function SaveButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="min-h-10 rounded-xl bg-[var(--accent)] px-4 font-bold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-wait disabled:opacity-70">{pending ? "저장 중" : "완료"}</button>;
}

function DeleteButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="min-h-11 rounded-xl border border-rose-300 px-4 font-bold text-rose-800 transition hover:bg-rose-50 disabled:cursor-wait disabled:opacity-70">{pending ? "삭제 중" : "학생 삭제"}</button>;
}

export function StudentProfileCard({ student, programs }: { student: StudentProfile; programs: StudentProgram[] }) {
  const [editing, setEditing] = useState(false);
  const [profileState, profileAction] = useActionState(updateStudentProfile.bind(null, student.id), PROFILE_INITIAL_STATE);
  const [deleteState, deleteAction] = useActionState(deleteStudent.bind(null, student.id), DELETE_INITIAL_STATE);
  const [phone, setPhone] = useState(formatPhone(student.phone ?? ""));
  const [joinedMonth, setJoinedMonth] = useState(student.joinedMonth?.slice(0, 7) ?? "");

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-white p-6 shadow-[0_24px_70px_rgba(23,64,60,0.09)] sm:p-8">
      {editing ? (
        <form action={profileAction} className="space-y-6" noValidate>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold tracking-[0.12em] text-[var(--accent-strong)]">학생 정보</p>
              <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">{student.name}</h1>
            </div>
            <SaveButton />
          </div>

          {profileState.formError ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900">{profileState.formError}</p> : null}

          <div className="grid gap-5 sm:grid-cols-2">
            <ProfileInput id="student-name" label="이름" name="name" defaultValue={student.name} error={profileState.fieldErrors.name} />
            <div>
              <label htmlFor="student-gender" className="mb-2 block text-sm font-bold">성별</label>
              <select id="student-gender" name="gender" defaultValue={student.gender ?? ""} className="h-12 w-full rounded-xl border border-[#9badaa] bg-white px-4 outline-none focus:border-[var(--accent)] focus:ring-3 focus:ring-[#bce9e4]">
                <option value="">선택 안 함</option><option value="male">남</option><option value="female">여</option>
              </select>
              {profileState.fieldErrors.gender ? <p className="mt-2 text-sm font-semibold text-rose-800">{profileState.fieldErrors.gender}</p> : null}
            </div>
            <ProfileInput id="student-age" label="나이" name="age" type="number" defaultValue={student.age?.toString() ?? ""} error={profileState.fieldErrors.age} />
            <div>
              <label htmlFor="student-phone" className="mb-2 block text-sm font-bold">연락처</label>
              <input id="student-phone" name="phone" inputMode="numeric" autoComplete="tel" value={phone} onChange={(event) => setPhone(formatPhone(event.target.value))} placeholder="010-1234-5678" aria-invalid={Boolean(profileState.fieldErrors.phone)} className="h-12 w-full rounded-xl border border-[#9badaa] bg-white px-4 outline-none focus:border-[var(--accent)] focus:ring-3 focus:ring-[#bce9e4] aria-invalid:border-rose-600" />
              {profileState.fieldErrors.phone ? <p className="mt-2 text-sm font-semibold text-rose-800">{profileState.fieldErrors.phone}</p> : null}
            </div>
            <div><label htmlFor="student-source" className="mb-2 block text-sm font-bold">유입경로</label><select id="student-source" name="acquisition_source" defaultValue={student.acquisitionSource ?? ""} className="h-12 w-full rounded-xl border border-[#9badaa] bg-white px-4"><option value="">선택 안 함</option><option value="instagram">인스타그램</option><option value="daangn">당근</option><option value="referral">지인소개</option><option value="naver">네이버</option></select>{profileState.fieldErrors.acquisitionSource ? <p className="mt-2 text-sm font-semibold text-rose-800">{profileState.fieldErrors.acquisitionSource}</p> : null}</div>
            <div className="sm:col-span-2">
              <label htmlFor="joined-month" className="mb-2 block text-sm font-bold">유입시기</label>
              <input id="joined-month" name="joined_month" type="month" value={joinedMonth} onChange={(event) => setJoinedMonth(event.target.value)} aria-invalid={Boolean(profileState.fieldErrors.joinedMonth)} className="h-13 w-full rounded-xl border border-[#9badaa] bg-white px-4 text-base outline-none focus:border-[var(--accent)] focus:ring-3 focus:ring-[#bce9e4] aria-invalid:border-rose-600" />
              <p className="mt-2 text-sm text-[var(--muted)]">달력에서 선택하거나 키보드로 직접 입력하세요.{joinedMonth ? ` 현재 ${formatJoinedMonth(`${joinedMonth}-01`)}입니다.` : ""}</p>
              {profileState.fieldErrors.joinedMonth ? <p className="mt-2 text-sm font-semibold text-rose-800">{profileState.fieldErrors.joinedMonth}</p> : null}
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="student-notes" className="mb-2 block text-sm font-bold">특이사항</label>
              <textarea id="student-notes" name="special_notes" rows={5} defaultValue={student.specialNotes ?? ""} className="w-full rounded-xl border border-[#9badaa] bg-white px-4 py-3 outline-none focus:border-[var(--accent)] focus:ring-3 focus:ring-[#bce9e4]" />
            </div>
          </div>
        </form>
      ) : (
        <>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold tracking-[0.12em] text-[var(--accent-strong)]">학생 정보</p>
              <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">{student.name}</h1>
            </div>
            <button type="button" onClick={() => setEditing(true)} className="min-h-10 rounded-xl border border-[var(--line)] px-4 font-bold transition hover:border-[var(--accent)] hover:text-[var(--accent-strong)]">수정</button>
          </div>
          <dl className="mt-8 grid gap-x-8 gap-y-5 sm:grid-cols-2">
            <ProfileValue label="성별" value={student.gender === "male" ? "남" : student.gender === "female" ? "여" : "-"} />
            <ProfileValue label="나이" value={student.age?.toString() ?? "-"} />
            <ProfileValue label="연락처" value={student.phone ? formatPhone(student.phone) : "-"} />
            <ProfileValue label="유입경로" value={student.acquisitionSource ? ({ instagram: "인스타그램", daangn: "당근", referral: "지인소개", naver: "네이버" }[student.acquisitionSource] ?? student.acquisitionSource) : "-"} />
            <ProfileValue label="유입시기" value={formatJoinedMonth(student.joinedMonth)} />
            <div className="sm:col-span-2"><dt className="text-sm font-bold text-[var(--muted)]">특이사항</dt><dd className="mt-1 whitespace-pre-wrap leading-7">{student.specialNotes ?? "-"}</dd></div>
          </dl>
        </>
      )}

      <ProgramSection studentId={student.id} programs={programs} />

      <div className="mt-8 border-t border-[var(--line)] pt-6">
        <form action={deleteAction} onSubmit={(event) => { if (!window.confirm("이 학생을 삭제하시겠습니까? 학생 계정과 배정된 일정 및 관련 데이터가 함께 삭제될 수 있습니다.")) event.preventDefault(); }}>
          {deleteState.formError ? <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900">{deleteState.formError}</p> : null}
          <DeleteButton />
        </form>
      </div>
    </section>
  );
}

function ProfileInput({ id, label, name, defaultValue, error, type = "text" }: { id: string; label: string; name: string; defaultValue: string; error?: string; type?: string }) {
  return <div><label htmlFor={id} className="mb-2 block text-sm font-bold">{label}</label><input id={id} name={name} type={type} min={type === "number" ? 1 : undefined} max={type === "number" ? 119 : undefined} defaultValue={defaultValue} aria-invalid={Boolean(error)} className="h-12 w-full rounded-xl border border-[#9badaa] bg-white px-4 outline-none focus:border-[var(--accent)] focus:ring-3 focus:ring-[#bce9e4] aria-invalid:border-rose-600" />{error ? <p className="mt-2 text-sm font-semibold text-rose-800">{error}</p> : null}</div>;
}

function ProgramSection({ studentId, programs }: { studentId: string; programs: StudentProgram[] }) {
  const [addState, addAction] = useActionState(addStudentProgram.bind(null, studentId), PROGRAM_INITIAL_STATE);
  return <section className="mt-8 border-t border-[var(--line)] pt-6"><h2 className="text-xl font-bold">이용 프로그램</h2><ul className="mt-4 space-y-3">{programs.map((program) => <li key={program.id} className="rounded-xl border border-[var(--line)] p-4"><div className="flex flex-wrap justify-between gap-3"><div><p className="font-bold">{PROGRAM_LABELS[program.programType] ?? program.programType}</p><p className="mt-1 text-sm text-[var(--muted)]">{program.startedAt} 시작 · {STATUS_LABELS[program.effectiveStatus] ?? program.effectiveStatus}</p></div>{program.storedStatus === "active" ? <StopProgramForm studentId={studentId} programId={program.id} /> : null}</div></li>)}</ul><form action={addAction} className="mt-4 grid gap-3 rounded-xl bg-[#f4f8f7] p-4 sm:grid-cols-[1fr_1fr_auto]"><select name="program_type" required className="h-11 rounded-xl border border-[#9badaa] bg-white px-3"><option value="">프로그램 선택</option>{Object.entries(PROGRAM_LABELS).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select><input name="started_at" type="date" required className="h-11 rounded-xl border border-[#9badaa] bg-white px-3"/><button className="rounded-xl bg-[var(--accent)] px-4 font-bold text-white">추가</button>{addState.formError ? <p className="text-sm font-semibold text-rose-800 sm:col-span-3">{addState.formError}</p> : null}</form></section>;
}

function StopProgramForm({ studentId, programId }: { studentId: string; programId: string }) {
  const [state, action] = useActionState(stopStudentProgram.bind(null, studentId, programId), PROGRAM_INITIAL_STATE);
  return <form action={action} className="flex flex-wrap items-center gap-2"><select name="stop_reason" className="h-10 rounded-lg border border-[#9badaa] bg-white px-2"><option value="">사유 없음</option><option value="break">잠시 쉼</option><option value="ended">이용 종료</option><option value="other">기타</option></select><button className="h-10 rounded-lg border border-rose-300 px-3 font-bold text-rose-800">중단</button>{state.formError ? <p className="w-full text-sm font-semibold text-rose-800">{state.formError}</p> : null}</form>;
}

function ProfileValue({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-sm font-bold text-[var(--muted)]">{label}</dt><dd className="mt-1 text-lg">{value}</dd></div>;
}
