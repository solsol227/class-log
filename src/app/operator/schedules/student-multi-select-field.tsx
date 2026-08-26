"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type StudentSelectOption = { id: string; name: string; programTypes?: string[] };

function normalize(value: string) {
  return value.toLocaleLowerCase("ko-KR").replace(/\s+/g, "");
}

export function StudentMultiSelectField({ students, initialSelectedIds = [], error }: { students: StudentSelectOption[]; initialSelectedIds?: string[]; error?: string }) {
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState(() => new Set(initialSelectedIds));
  const normalizedQuery = normalize(query);
  const filtered = useMemo(
    () => students.filter((student) => normalize(student.name).includes(normalizedQuery)),
    [normalizedQuery, students],
  );

  function toggle(studentId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  return (
    <fieldset>
      <legend className="text-sm font-bold">배정 학생 (선택)</legend>
      {students.length === 0 ? (
        <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950">
          등록된 학생이 없습니다. 학생 없이 일정을 등록하거나 <Link href="/operator/students/new" className="font-bold underline underline-offset-4">학생을 먼저 등록</Link>할 수 있습니다.
        </p>
      ) : (
        <>
          <div className="mt-3 flex items-center justify-between gap-3">
            <label htmlFor="schedule-student-search" className="sr-only">학생 이름 검색</label>
            <input id="schedule-student-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="학생 이름 검색" className="h-12 w-full rounded-xl border border-[#9badaa] bg-white px-4 outline-none focus:border-[var(--accent)] focus:ring-3 focus:ring-[#bce9e4]" />
            <span className="shrink-0 text-sm font-bold text-[var(--accent-strong)]">{selectedIds.size}명 선택</span>
          </div>
          {[...selectedIds].map((studentId) => (
            <input key={studentId} type="hidden" name="student_ids" value={studentId} />
          ))}
          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto rounded-xl border border-[var(--line)] p-2">
            {filtered.length === 0 ? <p className="px-3 py-4 text-sm text-[var(--muted)]">검색 결과가 없습니다.</p> : filtered.map((student) => {
              const selected = selectedIds.has(student.id);
              return (
                <label key={student.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition hover:bg-[#f4f8f7] has-checked:bg-[#e5f2f0]">
                  <input type="checkbox" checked={selected} onChange={() => toggle(student.id)} className="size-4 accent-[var(--accent)]" />
                  <span className="font-bold">{student.name}</span>
                </label>
              );
            })}
          </div>
        </>
      )}
      {error ? <p className="mt-2 text-sm font-semibold text-rose-800">{error}</p> : null}
    </fieldset>
  );
}
