import { logout } from "@/app/auth/actions";

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  return (
    <form action={logout}>
      <button
        type="submit"
        className={`${compact ? "min-h-10 px-3 sm:px-4" : "min-h-12 px-5"} rounded-xl border border-[var(--line)] bg-white font-bold text-[var(--foreground)] transition hover:border-[#9eb7b3] hover:bg-[#f9fbfb] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] active:translate-y-px`}
      >
        로그아웃
      </button>
    </form>
  );
}
