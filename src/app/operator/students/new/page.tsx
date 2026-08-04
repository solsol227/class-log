import Link from "next/link";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import { StudentCreateForm } from "./student-create-form";

export default async function OperatorStudentCreatePage() {
  await requireAuthenticatedUser("/login/operator", "operator");

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8 sm:py-14">
      <Link
        href="/operator/students"
        className="font-bold text-[var(--accent-strong)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        학생 목록
      </Link>

      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-6 shadow-[0_24px_70px_rgba(23,64,60,0.09)] sm:p-8">
        <p className="text-sm font-bold tracking-[0.12em] text-[var(--accent-strong)]">
          학생 관리
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">
          학생 등록
        </h1>
        <div className="mt-8">
          <StudentCreateForm />
        </div>
      </section>
    </main>
  );
}
