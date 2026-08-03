import { notFound } from "next/navigation";
import { StudentEmailGenerator } from "@/components/auth/student-email-generator";

export default function StudentAuthEmailPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-lg px-5 py-12 sm:px-8">
      <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm sm:p-8">
        <p className="mb-2 text-sm font-bold text-[var(--accent-strong)]">
          개발 전용 도구
        </p>
        <h1 className="text-2xl font-black">학생 내부 인증용 이메일 변환</h1>
        <p className="mb-7 mt-3 text-sm leading-6 text-[var(--muted)]">
          Supabase Dashboard에 테스트 학생 계정을 만들 때만 사용하세요.
        </p>
        <StudentEmailGenerator />
      </div>
    </main>
  );
}
