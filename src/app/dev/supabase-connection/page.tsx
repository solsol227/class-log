import { notFound } from "next/navigation";
import { ConnectionCheck } from "./connection-check";

export default function SupabaseConnectionPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-xl items-center px-5 py-12 sm:px-8">
      <section className="w-full rounded-2xl border border-[var(--line)] bg-white p-6 shadow-[0_24px_70px_rgba(23,64,60,0.09)] sm:p-8">
        <p className="text-sm font-bold tracking-[0.12em] text-[var(--accent-strong)]">
          개발 전용 연결 테스트
        </p>
        <h1 className="mt-4 text-3xl font-bold tracking-[-0.04em]">
          Supabase 연결 상태
        </h1>
        <p className="mt-4 leading-7 text-[var(--muted)]">
          데이터베이스 테이블을 조회하지 않고 Auth 서비스 연결만 확인합니다.
          환경변수 값은 화면에 표시되지 않습니다.
        </p>
        <ConnectionCheck />
      </section>
    </main>
  );
}
