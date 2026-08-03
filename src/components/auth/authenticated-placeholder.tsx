import Link from "next/link";
import type { AppRole } from "@/lib/auth/roles";
import { LogoutButton } from "@/components/auth/logout-button";
import { DemoNotice } from "@/components/demo-notice";

type AuthenticatedPlaceholderProps = {
  role: AppRole;
};

const content = {
  operator: {
    title: "운영자 로그인 완료",
    description: "인증 상태가 확인되었습니다. 운영 기능은 다음 단계에서 추가됩니다.",
  },
  student: {
    title: "학생 로그인 완료",
    description: "인증 상태가 확인되었습니다. 학생 기능은 다음 단계에서 추가됩니다.",
  },
} as const;

export function AuthenticatedPlaceholder({
  role,
}: AuthenticatedPlaceholderProps) {
  const pageContent = content[role];

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <main className="mx-auto flex w-full max-w-3xl flex-1 items-center px-5 py-12 sm:px-8">
        <section className="w-full rounded-2xl border border-[var(--line)] bg-white p-6 shadow-[0_24px_70px_rgba(23,64,60,0.09)] sm:p-8">
          <p className="text-sm font-bold tracking-[0.12em] text-[var(--accent-strong)]">
            클래스로그
          </p>
          <h1 className="mt-4 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">
            {pageContent.title}
          </h1>
          <p className="mt-4 leading-7 text-[var(--muted)]">
            {pageContent.description}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <LogoutButton />
            <Link
              href="/"
              className="flex min-h-12 items-center rounded-xl px-5 font-bold text-[var(--accent-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
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
