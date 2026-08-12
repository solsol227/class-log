import { logout } from "@/app/auth/actions";

export function LogoutButton() {
  return (
    <form action={logout}>
      <button
        type="submit"
        className="min-h-12 rounded-xl border border-[var(--line)] bg-white px-5 font-bold text-[var(--foreground)] transition hover:border-[#9eb7b3] hover:bg-[#f9fbfb] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] active:translate-y-px"
      >
        로그아웃
      </button>
    </form>
  );
}
