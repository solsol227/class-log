import Link from "next/link";
import { DemoNotice } from "@/components/demo-notice";
import { SiteHeader } from "@/components/site-header";

export default function Home() {
  return (
    <div className="min-h-[100dvh]">
      <SiteHeader />
      <main className="mx-auto grid w-full max-w-7xl gap-12 px-5 pb-10 pt-10 sm:px-8 md:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)] md:items-center md:gap-16 md:pb-16 md:pt-16 lg:px-12 lg:pt-20">
        <section aria-labelledby="home-title" className="max-w-2xl">
          <p className="mb-5 text-sm font-bold tracking-[0.14em] text-[var(--accent-strong)]">
            수업 운영의 기준을 또렷하게
          </p>
          <h1
            id="home-title"
            className="text-4xl font-bold leading-[1.08] tracking-[-0.045em] text-[var(--foreground)] sm:text-5xl lg:text-6xl"
          >
            클래스로그
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--muted)] sm:text-xl sm:leading-9">
            수업 일정부터 출석, 보강, 피드백까지 한곳에서 관리하세요.
          </p>
          <div className="mt-9 grid gap-3 sm:max-w-xl sm:grid-cols-2">
            <Link
              href="/login/operator"
              className="flex min-h-14 items-center justify-between rounded-2xl bg-[var(--accent)] px-5 font-bold text-white transition hover:bg-[var(--accent-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] active:translate-y-px"
            >
              <span>운영자로 시작하기</span>
              <span aria-hidden="true">→</span>
            </Link>
            <Link
              href="/login/student"
              className="flex min-h-14 items-center justify-between rounded-2xl border border-[var(--line)] bg-white px-5 font-bold text-[var(--foreground)] transition hover:border-[#9eb7b3] hover:bg-[#f9fbfb] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] active:translate-y-px"
            >
              <span>학생으로 시작하기</span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>

        <section
          aria-labelledby="overview-title"
          className="rounded-2xl border border-[var(--line)] bg-white p-6 shadow-[0_24px_70px_rgba(23,64,60,0.09)] sm:p-8"
        >
          <h2 id="overview-title" className="text-xl font-bold tracking-tight">
            흩어진 수업 기록을 한 흐름으로
          </h2>
          <p className="mt-3 leading-7 text-[var(--muted)]">
            운영자는 수업의 흐름을 관리하고, 학생은 자신의 일정과 피드백을
            확인할 수 있습니다.
          </p>
          <dl className="mt-7 divide-y divide-[var(--line)] border-y border-[var(--line)]">
            {[
              ["01", "월간 활동과 일정"],
              ["02", "출석과 보강"],
              ["03", "수업 피드백"],
            ].map(([number, label]) => (
              <div key={number} className="grid grid-cols-[2.5rem_1fr] items-center py-4">
                <dt className="text-sm font-bold text-[var(--accent-strong)]">{number}</dt>
                <dd className="font-semibold">{label}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>
      <DemoNotice />
    </div>
  );
}
