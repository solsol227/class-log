"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getLoginErrorMessage } from "@/lib/auth/errors";
import {
  InvalidStudentNicknameError,
  studentNicknameToAuthEmail,
} from "@/lib/auth/student-identity";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type LoginMode = "operator" | "student";

type PasswordLoginFormProps = {
  mode: LoginMode;
  initialNotice?: string;
};

const loginConfig = {
  operator: {
    identifierLabel: "이메일",
    identifierName: "email",
    identifierType: "email",
    identifierPlaceholder: "이메일을 입력하세요",
    autoComplete: "email",
    buttonLabel: "운영자로 로그인",
  },
  student: {
    identifierLabel: "닉네임",
    identifierName: "nickname",
    identifierType: "text",
    identifierPlaceholder: "닉네임을 입력하세요",
    autoComplete: "username",
    buttonLabel: "학생으로 로그인",
  },
} as const;

type RoleCheckResponse = {
  destination?: "/operator" | "/student";
  message?: string;
};

export function PasswordLoginForm({
  mode,
  initialNotice = "",
}: PasswordLoginFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(initialNotice);
  const config = loginConfig[mode];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const identifier = String(formData.get(config.identifierName) ?? "");
    const password = String(formData.get("password") ?? "");

    try {
      const email =
        mode === "student"
          ? studentNicknameToAuthEmail(identifier)
          : identifier.trim();

      if (!email || !password) {
        setErrorMessage("로그인 정보를 모두 입력해 주세요.");
        return;
      }

      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrorMessage(getLoginErrorMessage(error.code));
        return;
      }

      const roleResponse = await fetch("/api/auth/role", {
        method: "POST",
        cache: "no-store",
      });
      const roleResult = (await roleResponse.json()) as RoleCheckResponse;

      if (!roleResponse.ok || !roleResult.destination) {
        setErrorMessage(
          roleResult.message ??
            "계정 권한을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.",
        );
        return;
      }

      router.replace(roleResult.destination);
      router.refresh();
    } catch (error) {
      if (error instanceof InvalidStudentNicknameError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("로그인 연결을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div>
        <label htmlFor={config.identifierName} className="mb-2 block text-sm font-bold">
          {config.identifierLabel}
        </label>
        <input
          id={config.identifierName}
          name={config.identifierName}
          type={config.identifierType}
          autoComplete={config.autoComplete}
          placeholder={config.identifierPlaceholder}
          required
          className="h-13 w-full rounded-xl border border-[#b9c9c6] bg-white px-4 text-base outline-none transition placeholder:text-[#71817f] focus:border-[var(--accent)] focus:ring-3 focus:ring-[#bce9e4]"
        />
      </div>
      <div>
        <label htmlFor={`${mode}-password`} className="mb-2 block text-sm font-bold">
          비밀번호
        </label>
        <input
          id={`${mode}-password`}
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="비밀번호를 입력하세요"
          required
          className="h-13 w-full rounded-xl border border-[#b9c9c6] bg-white px-4 text-base outline-none transition placeholder:text-[#71817f] focus:border-[var(--accent)] focus:ring-3 focus:ring-[#bce9e4]"
        />
      </div>
      {errorMessage ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold leading-6 text-rose-800"
        >
          {errorMessage}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={isSubmitting}
        className="min-h-13 w-full rounded-xl bg-[var(--accent)] px-5 font-bold text-white transition hover:bg-[var(--accent-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] active:translate-y-px disabled:cursor-wait disabled:opacity-70"
      >
        {isSubmitting ? "로그인 중" : config.buttonLabel}
      </button>
      <p className="text-center text-sm leading-6 text-[var(--muted)]">
        계정이 없다면 수업 운영자에게 문의해 주세요.
      </p>
    </form>
  );
}
