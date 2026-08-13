"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AssignmentSearchPicker, type AssignmentPickerOption } from "@/components/assignment-search-picker";
import { assignStudents, deleteSchedule, unassignStudent, type ManagementActionState } from "../actions";

const INITIAL_STATE: ManagementActionState = {};

function PendingButton({ idle, pending }: { idle: string; pending: string }) {
  const status = useFormStatus();
  return <button type="submit" disabled={status.pending} className="min-h-11 rounded-xl bg-[var(--accent)] px-4 font-bold text-white disabled:cursor-wait disabled:opacity-70">{status.pending ? pending : idle}</button>;
}

export function StudentAssignmentPicker({ lessonId, students }: { lessonId: string; students: AssignmentPickerOption[] }) {
  const [state, formAction] = useActionState(assignStudents.bind(null, lessonId), INITIAL_STATE);
  return <AssignmentSearchPicker title="학생 배정 열기" searchLabel="학생 이름 검색" searchPlaceholder="이름을 입력하세요" inputName="student_ids" options={students} formAction={formAction} formError={state.formError} submitLabel="배정" />;
}

export function UnassignStudentForm({ lessonId, studentId }: { lessonId: string; studentId: string }) {
  const [state, formAction] = useActionState(unassignStudent.bind(null, lessonId, studentId), INITIAL_STATE);
  return <form action={formAction} className="mt-3">{state.formError ? <p role="alert" className="mb-3 text-sm font-bold text-rose-800">{state.formError}</p> : null}<PendingButton idle="배정 해제" pending="확인 중입니다..." /></form>;
}

export function DeleteScheduleForm({ lessonId }: { lessonId: string }) {
  const [state, formAction] = useActionState(deleteSchedule.bind(null, lessonId), INITIAL_STATE);
  return <form action={formAction} onSubmit={(event) => { if (!window.confirm("이 일정을 삭제하시겠습니까? 배정 정보와 관련 데이터도 함께 삭제될 수 있습니다.")) event.preventDefault(); }}>{state.formError ? <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900">{state.formError}</p> : null}<button type="submit" className="min-h-11 rounded-xl border border-rose-300 px-4 font-bold text-rose-800 hover:bg-rose-50">일정 삭제</button></form>;
}

export function NoStudentsNotice() {
  return <p className="mt-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950">등록된 학생이 없습니다. 먼저 학생을 등록해주세요. <Link href="/operator/students/new" className="font-bold underline underline-offset-4">학생 등록으로 이동</Link></p>;
}
