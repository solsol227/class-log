"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  deleteStudent,
  updateStudentProfile,
  type DeleteStudentActionState,
  type StudentProfileActionState,
} from "./actions";

type StudentProfile = {
  id: string;
  name: string;
  gender: string | null;
  age: string | null;
  phone: string | null;
  acquisitionSource: string | null;
  category: string | null;
  joinedMonth: string | null;
  specialNotes: string | null;
};

const PROFILE_INITIAL_STATE: StudentProfileActionState = { fieldErrors: {} };
const DELETE_INITIAL_STATE: DeleteStudentActionState = {};

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

export function StudentProfileCard({ student }: { student: StudentProfile }) {
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
            <ProfileInput id="student-age" label="나이" name="age" defaultValue={student.age ?? ""} />
            <div>
              <label htmlFor="student-phone" className="mb-2 block text-sm font-bold">연락처</label>
              <input id="student-phone" name="phone" inputMode="numeric" autoComplete="tel" value={phone} onChange={(event) => setPhone(formatPhone(event.target.value))} placeholder="010-1234-5678" aria-invalid={Boolean(profileState.fieldErrors.phone)} className="h-12 w-full rounded-xl border border-[#9badaa] bg-white px-4 outline-none focus:border-[var(--accent)] focus:ring-3 focus:ring-[#bce9e4] aria-invalid:border-rose-600" />
              {profileState.fieldErrors.phone ? <p className="mt-2 text-sm font-semibold text-rose-800">{profileState.fieldErrors.phone}</p> : null}
            </div>
            <ProfileInput id="student-source" label="유입경로" name="acquisition_source" defaultValue={student.acquisitionSource ?? ""} />
            <ProfileInput id="student-category" label="구분" name="category" defaultValue={student.category ?? ""} />
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
            <ProfileValue label="나이" value={student.age ?? "-"} />
            <ProfileValue label="연락처" value={student.phone ? formatPhone(student.phone) : "-"} />
            <ProfileValue label="유입경로" value={student.acquisitionSource ?? "-"} />
            <ProfileValue label="구분" value={student.category ?? "-"} />
            <ProfileValue label="유입시기" value={formatJoinedMonth(student.joinedMonth)} />
            <div className="sm:col-span-2"><dt className="text-sm font-bold text-[var(--muted)]">특이사항</dt><dd className="mt-1 whitespace-pre-wrap leading-7">{student.specialNotes ?? "-"}</dd></div>
          </dl>
        </>
      )}

      <div className="mt-8 border-t border-[var(--line)] pt-6">
        <form action={deleteAction} onSubmit={(event) => { if (!window.confirm("이 학생을 삭제하시겠습니까? 학생 계정과 배정된 일정 및 관련 데이터가 함께 삭제될 수 있습니다.")) event.preventDefault(); }}>
          {deleteState.formError ? <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900">{deleteState.formError}</p> : null}
          <DeleteButton />
        </form>
      </div>
    </section>
  );
}

function ProfileInput({ id, label, name, defaultValue, error }: { id: string; label: string; name: string; defaultValue: string; error?: string }) {
  return <div><label htmlFor={id} className="mb-2 block text-sm font-bold">{label}</label><input id={id} name={name} defaultValue={defaultValue} aria-invalid={Boolean(error)} className="h-12 w-full rounded-xl border border-[#9badaa] bg-white px-4 outline-none focus:border-[var(--accent)] focus:ring-3 focus:ring-[#bce9e4] aria-invalid:border-rose-600" />{error ? <p className="mt-2 text-sm font-semibold text-rose-800">{error}</p> : null}</div>;
}

function ProfileValue({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-sm font-bold text-[var(--muted)]">{label}</dt><dd className="mt-1 text-lg">{value}</dd></div>;
}
