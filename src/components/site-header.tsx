import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="mx-auto flex h-20 w-full max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-12">
      <Link
        href="/"
        className="text-xl font-black tracking-[-0.04em] text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
      >
        클래스로그
      </Link>
      <p className="text-sm font-semibold text-[var(--muted)]">Class Log</p>
    </header>
  );
}
