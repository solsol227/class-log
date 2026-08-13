import Link from "next/link";
import type { ReactNode } from "react";
import { LogoutButton } from "@/components/auth/logout-button";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";

export default async function OperatorLayout({ children }: { children: ReactNode }) {
  await requireAuthenticatedUser("/login/operator", "operator");

  return (
    <div className="min-h-[100dvh]">
      <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[rgba(244,247,246,0.96)] backdrop-blur">
        <nav aria-label="운영자 메뉴" className="mx-auto flex min-h-18 w-full max-w-7xl items-center justify-between gap-4 px-5 sm:px-8 lg:px-12">
          <div className="flex items-center gap-1 sm:gap-2">
            <Link href="/operator/schedules" className="rounded-xl px-3 py-2 font-bold text-[var(--foreground)] transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:px-4">일정관리</Link>
            <Link href="/operator/students" className="rounded-xl px-3 py-2 font-bold text-[var(--foreground)] transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:px-4">학생관리</Link>
          </div>
          <LogoutButton compact />
        </nav>
      </header>
      {children}
    </div>
  );
}
