"use client";

import { useActionState } from "react";
import { AssignmentSearchPicker, type AssignmentPickerOption } from "@/components/assignment-search-picker";
import { assignScheduleToStudent, type StudentAssignmentActionState } from "./actions";

const INITIAL_STATE: StudentAssignmentActionState = {};

export function ScheduleAssignmentPicker({ studentId, schedules }: { studentId: string; schedules: AssignmentPickerOption[] }) {
  const [state, formAction] = useActionState(assignScheduleToStudent.bind(null, studentId), INITIAL_STATE);

  return (
    <AssignmentSearchPicker
      title="일정 배정 열기"
      searchLabel="일정 제목 검색"
      searchPlaceholder="제목을 입력하세요"
      inputName="lesson_id"
      options={schedules}
      formAction={formAction}
      formError={state.formError}
      submitLabel="배정"
    />
  );
}
