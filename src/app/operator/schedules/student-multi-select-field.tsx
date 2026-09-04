"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

const PROGRAM_LABELS: Record<string, string> = {
  weekday_vocal: "평일보컬",
  weekend_vocal: "주말보컬",
  trial: "체험",
  rental: "대여",
};

export type StudentProgramOption = {
  id: string;
  programType: string;
  status: string;
  allowanceConfigured: boolean;
};

export type StudentSelectOption = {
  id: string;
  name: string;
  programs: StudentProgramOption[];
};

function normalize(value: string) {
  return value.toLocaleLowerCase("ko-KR").replace(/\s+/g, "");
}

export function StudentMultiSelectField({ students, initialSelectedProgramIds = [], error }: { students: StudentSelectOption[]; initialSelectedProgramIds?: string[]; error?: string }) {
  const [query, setQuery] = useState("");
  const initialProgramByStudent = useMemo(() => {
    const selected = new Set(initialSelectedProgramIds);
    return new Map(students.flatMap((student) => {
      const program = student.programs.find((item) => selected.has(item.id));
      return program ? [[student.id, program.id] as const] : [];
    }));
  }, [initialSelectedProgramIds, students]);
  const [selectedProgramByStudent, setSelectedProgramByStudent] = useState(initialProgramByStudent);
  const normalizedQuery = normalize(query);
  const filtered = useMemo(() => students.filter((student) => normalize(student.name).includes(normalizedQuery)), [normalizedQuery, students]);

  function selectablePrograms(student: StudentSelectOption) {
    const selectedProgramId = selectedProgramByStudent.get(student.id);
    return student.programs.filter((program) => (program.status === "active" && program.allowanceConfigured) || program.id === selectedProgramId);
  }

  function toggle(student: StudentSelectOption) {
    setSelectedProgramByStudent((current) => {
      const next = new Map(current);
      if (next.has(student.id)) next.delete(student.id);
      else {
        const programs = selectablePrograms(student);
        if (programs.length > 0) next.set(student.id, programs[0].id);
      }
      return next;
    });
  }

  return (
    <fieldset>
      <legend className="text-sm font-bold">배정 학생과 이용권 (선택)</legend>
      {students.length === 0 ? (
        <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950">등록된 학생이 없습니다. 학생 없이 일정을 등록하거나 <Link href="/operator/students/new" className="font-bold underline underline-offset-4">학생을 먼저 등록</Link>할 수 있습니다.</p>
      ) : (
        <>
          <div className="mt-3 flex items-center justify-between gap-3">
            <label htmlFor="schedule-student-search" className="sr-only">학생 이름 검색</label>
            <input id="schedule-student-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="학생 이름 검색" className="h-12 w-full rounded-xl border border-[#9badaa] bg-white px-4 outline-none focus:border-[var(--accent)] focus:ring-3 focus:ring-[#bce9e4]" />
            <span className="shrink-0 text-sm font-bold text-[var(--accent-strong)]">{selectedProgramByStudent.size}명 선택</span>
          </div>
          {[...selectedProgramByStudent.values()].map((programId) => <input key={programId} type="hidden" name="student_program_ids" value={programId} />)}
          <div className="mt-3 max-h-72 space-y-2 overflow-y-auto rounded-xl border border-[var(--line)] p-2">
            {filtered.length === 0 ? <p className="px-3 py-4 text-sm text-[var(--muted)]">검색 결과가 없습니다.</p> : filtered.map((student) => {
              const programs = selectablePrograms(student);
              const selectedProgramId = selectedProgramByStudent.get(student.id);
              const selected = Boolean(selectedProgramId);
              const unavailable = programs.length === 0;
              return (
                <div key={student.id} className={`rounded-lg px-3 py-2 transition ${selected ? "bg-[#e5f2f0]" : "hover:bg-[#f4f8f7]"}`}>
                  <label className={`flex min-h-8 items-center gap-3 ${unavailable ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
                    <input type="checkbox" checked={selected} disabled={unavailable} onChange={() => toggle(student)} className="size-4 accent-[var(--accent)]" />
                    <span className="font-bold">{student.name}</span>
                    {!selected && unavailable ? <span className="ml-auto text-xs text-[var(--muted)]">사용 가능한 이용권 없음</span> : null}
                  </label>
                  {selected && programs.length === 1 ? <p className="ml-7 mt-1 text-sm text-[var(--muted)]">{PROGRAM_LABELS[programs[0].programType] ?? programs[0].programType}</p> : null}
                  {selected && programs.length > 1 ? (
                    <label className="ml-7 mt-2 flex items-center gap-2 text-sm font-bold">이용권
                      <select value={selectedProgramId} onChange={(event) => setSelectedProgramByStudent((current) => new Map(current).set(student.id, event.target.value))} className="h-10 flex-1 rounded-lg border border-[#9badaa] bg-white px-2 font-normal">
                        {programs.map((program) => <option key={program.id} value={program.id}>{PROGRAM_LABELS[program.programType] ?? program.programType}{program.status === "active" ? "" : " (기존 배정)"}</option>)}
                      </select>
                    </label>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      )}
      {error ? <p className="mt-2 text-sm font-semibold text-rose-800">{error}</p> : null}
    </fieldset>
  );
}
