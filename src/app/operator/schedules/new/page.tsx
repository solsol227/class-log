import Link from "next/link";
import { requireOperatorAccess } from "@/lib/auth/operator-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ScheduleForm } from "../schedule-form";

export default async function NewSchedulePage() {
  await requireOperatorAccess({ owner: true });
  const supabase = await createSupabaseServerClient();
  const [{ data: students, error }, { data: programs, error: programsError }] = await Promise.all([supabase.from("students").select("id, nickname").order("nickname"), supabase.from("student_programs").select("id, student_id, program_type, status, base_allowance_count").eq("status", "active")]);
  if (error || programsError) throw new Error("학생 목록을 불러오지 못했습니다.", { cause: error ?? programsError });
  return <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8 sm:py-14"><Link href="/operator/schedules" className="font-bold text-[var(--accent-strong)] underline-offset-4 hover:underline">일정 목록</Link><section className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-6 sm:p-8"><h1 className="text-3xl font-bold tracking-[-0.04em]">새 일정 등록</h1><div className="mt-8"><ScheduleForm mode="create" students={students.map((student) => ({ id: student.id, name: student.nickname, programs: programs.filter((program) => program.student_id === student.id).map((program) => ({ id: program.id, programType: program.program_type, status: program.status, allowanceConfigured: program.base_allowance_count !== null })) }))} /></div></section></main>;
}
