"use client";

import { useState } from "react";
import { ScheduleForm } from "../schedule-form";
import type { StudentSelectOption } from "../student-multi-select-field";
import type { AttendanceStatus } from "../actions";
import { DeleteScheduleForm } from "./schedule-management-forms";
import { RosterAttendanceForm } from "./roster-attendance-form";

type Lesson = {
  id: string;
  title: string;
  dateInput: string;
  startTimeInput: string;
  endTimeInput: string;
  dateLabel: string;
  timeLabel: string;
  location: string | null;
  notes: string | null;
  status: string;
  statusLabel: string;
};

type AssignedStudent = { id: string; name: string; attendanceStatus: AttendanceStatus | null };

export function ScheduleDashboard({ lesson, assignedStudents, studentOptions, attendanceBlockedReason }: { lesson: Lesson; assignedStudents: AssignedStudent[]; studentOptions: StudentSelectOption[]; attendanceBlockedReason: string | null }) {
  const [editing, setEditing] = useState(false);
  const canEdit = lesson.status !== "cancelled";

  return (
    <section className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-6 shadow-[0_24px_70px_rgba(23,64,60,0.08)] sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-bold text-[var(--accent-strong)]">일정 정보</p>
            <span className="rounded-full bg-[#e5f2f0] px-3 py-1 text-sm font-bold text-[var(--accent-strong)]">{lesson.statusLabel}</span>
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">{lesson.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && !editing ? <button type="button" onClick={() => setEditing(true)} className="min-h-11 rounded-xl border border-[var(--accent)] px-4 font-bold text-[var(--accent-strong)] transition hover:bg-[#e5f2f0] active:translate-y-px">수정</button> : null}
          <DeleteScheduleForm lessonId={lesson.id} />
        </div>
      </div>

      {editing ? (
        <div className="mt-8 border-t border-[var(--line)] pt-7">
          <h2 className="text-2xl font-bold">일정 수정</h2>
          {lesson.status === "completed" ? <p className="mt-3 text-sm text-[var(--muted)]">완료된 일정도 정보와 학생 배정을 수정할 수 있습니다.</p> : null}
          <div className="mt-5"><ScheduleForm mode="edit" lessonId={lesson.id} initialValues={{ title: lesson.title, date: lesson.dateInput, startTime: lesson.startTimeInput, endTime: lesson.endTimeInput, location: lesson.location ?? "", notes: lesson.notes ?? "", studentIds: assignedStudents.map((student) => student.id) }} students={studentOptions} onCancel={() => setEditing(false)} /></div>
        </div>
      ) : (
        <>
          <dl className="mt-8 grid gap-5 sm:grid-cols-2">
            <div><dt className="text-sm font-bold text-[var(--muted)]">날짜</dt><dd className="mt-1 text-lg">{lesson.dateLabel}</dd></div>
            <div><dt className="text-sm font-bold text-[var(--muted)]">시간</dt><dd className="mt-1 text-lg">{lesson.timeLabel}</dd></div>
            <div><dt className="text-sm font-bold text-[var(--muted)]">장소</dt><dd className="mt-1 text-lg">{lesson.location || "등록된 장소가 없습니다."}</dd></div>
            <div className="sm:col-span-2"><dt className="text-sm font-bold text-[var(--muted)]">메모</dt><dd className="mt-1 whitespace-pre-wrap leading-7">{lesson.notes || "등록된 메모가 없습니다."}</dd></div>
          </dl>
          <div className="mt-8 border-t border-[var(--line)] pt-7">
            <h2 className="text-2xl font-bold">배정된 학생</h2>
            {assignedStudents.length === 0 ? <p className="mt-4 text-[var(--muted)]">아직 배정된 학생이 없습니다.</p> : <RosterAttendanceForm lessonId={lesson.id} students={assignedStudents.map((student) => ({ id: student.id, name: student.name, status: student.attendanceStatus }))} blockedReason={attendanceBlockedReason} />}
          </div>
        </>
      )}
    </section>
  );
}
