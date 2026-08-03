import Link from "next/link";
import type { ReactNode } from "react";
import { DemoNotice } from "@/components/demo-notice";

type LoginShellProps = {
  audience: "운영자" | "학생";
  description: string;
  children: ReactNode;
};

export function LoginShell({
  audience,
  description,
  children,
}: LoginShellProps) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="mx-auto flex h-20 w-full max-w-7xl items-center px-5 sm:px-8 lg:px-12">
        <Link
          href="/"
          className="font-bold text-[var(--accent-strong)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
        >
          ← 홈으로
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-7xl flex-1 items-center px-5 py-8 sm:px-8 lg:px-12">
        <div className="grid w-full gap-10 md:grid-cols-[minmax(0,0.8fr)_minmax(360px,0.65fr)] md:justify-between md:gap-16">
          <section className="max-w-xl self-center">
            <p className="text-sm font-bold tracking-[0.14em] text-[var(--accent-strong)]">
              {audience} 로그인
            </p>
            <h1 className="mt-4 text-4xl font-bold leading-tight tracking-[-0.04em] sm:text-5xl">
              반갑습니다.
              <br />
              수업 기록을 확인하세요.
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-8 text-[var(--muted)]">
              {description}
            </p>
          </section>

          <section
            aria-label={`${audience} 로그인 입력`}
            className="rounded-2xl border border-[var(--line)] bg-white p-6 shadow-[0_24px_70px_rgba(23,64,60,0.09)] sm:p-8"
          >
            {children}
          </section>
        </div>
      </main>
      <DemoNotice />
    </div>
  );
}
