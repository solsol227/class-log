"use client";

import Link from "next/link";
import { DemoNotice } from "@/components/demo-notice";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ reset }: ErrorPageProps) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <main className="mx-auto flex w-full max-w-2xl flex-1 items-center px-5 py-12 sm:px-8">
        <section className="w-full rounded-2xl border border-[var(--line)] bg-white p-6 shadow-[0_24px_70px_rgba(23,64,60,0.09)] sm:p-8">
          <p className="text-sm font-bold tracking-[0.12em] text-[var(--accent-strong)]">
            클래스로그
          </p>
          <h1 className="mt-4 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">
            화면을 불러올 수 없습니다.
          </h1>
          <p role="alert" className="mt-4 leading-7 text-[var(--muted)]">
            화면을 불러오는 중 문제가 발생했습니다. 다시 시도해 주세요.
          </p>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            문제가 계속되면 홈으로 이동한 뒤 다시 시작해 주세요.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={reset}
              className="min-h-12 rounded-xl bg-[var(--accent)] px-5 font-bold text-white transition hover:bg-[var(--accent-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] active:translate-y-px"
            >
              다시 시도
            </button>
            <Link
              href="/"
              className="flex min-h-12 items-center justify-center rounded-xl border border-[var(--line)] px-5 font-bold text-[var(--accent-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              홈으로 이동
            </Link>
          </div>
        </section>
      </main>
      <DemoNotice />
    </div>
  );
}
