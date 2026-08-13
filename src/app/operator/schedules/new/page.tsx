import Link from "next/link";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import { ScheduleForm } from "../schedule-form";

export default async function NewSchedulePage() {
  await requireAuthenticatedUser("/login/operator", "operator");
  return <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8 sm:py-14"><Link href="/operator/schedules" className="font-bold text-[var(--accent-strong)] underline-offset-4 hover:underline">일정 목록</Link><section className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-6 sm:p-8"><p className="text-sm font-bold tracking-[0.12em] text-[var(--accent-strong)]">일정 관리</p><h1 className="mt-3 text-3xl font-bold tracking-[-0.04em]">새 일정 등록</h1><p className="mt-3 leading-7 text-[var(--muted)]">공통 일정을 먼저 만든 뒤 상세 화면에서 학생을 여러 명 배정할 수 있습니다.</p><div className="mt-8"><ScheduleForm mode="create" /></div></section></main>;
}
