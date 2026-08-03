import Link from "next/link";
import { DemoNotice } from "@/components/demo-notice";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <main className="mx-auto flex w-full max-w-2xl flex-1 items-center px-5 py-12 sm:px-8">
        <section className="w-full rounded-2xl border border-[var(--line)] bg-white p-6 shadow-[0_24px_70px_rgba(23,64,60,0.09)] sm:p-8">
          <p className="text-sm font-bold tracking-[0.12em] text-[var(--accent-strong)]">
            클래스로그
          </p>
          <h1 className="mt-4 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">
            요청한 페이지를 찾을 수 없습니다.
          </h1>
          <p className="mt-4 leading-7 text-[var(--muted)]">
            주소를 다시 확인하거나 홈에서 원하는 화면으로 이동해 주세요.
          </p>
          <Link
            href="/"
            className="mt-8 inline-flex min-h-12 items-center justify-center rounded-xl bg-[var(--accent)] px-5 font-bold text-white transition hover:bg-[var(--accent-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] active:translate-y-px"
          >
            홈으로 이동
          </Link>
        </section>
      </main>
      <DemoNotice />
    </div>
  );
}
