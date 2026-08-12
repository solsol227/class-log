"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  classifySupabaseLoginError,
  classifyUnexpectedLoginError,
  getAuthUserMessage,
  type AuthErrorCode,
  type AuthUserMessage,
} from "@/lib/auth/errors";
import {
  InvalidStudentNicknameError,
  studentNicknameToAuthEmail,
} from "@/lib/auth/student-identity";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type LoginMode = "operator" | "student";

type PasswordLoginFormProps = {
  mode: LoginMode;
  initialNotice?: AuthUserMessage | null;
};

type FieldErrors = {
  identifier?: string;
  password?: string;
};

type RoleCheckResponse = {
  destination: "/operator" | "/student";
};

const loginConfig = {
  operator: {
    identifierLabel: "이메일",
    identifierName: "email",
    identifierType: "email",
    identifierPlaceholder: "이메일을 입력하세요",
    identifierRequiredMessage: "이메일을 입력해 주세요.",
    autoComplete: "email",
    buttonLabel: "운영자로 로그인",
  },
  student: {
    identifierLabel: "닉네임",
    identifierName: "nickname",
    identifierType: "text",
    identifierPlaceholder: "닉네임을 입력하세요",
    identifierRequiredMessage: "닉네임을 입력해 주세요.",
    autoComplete: "username",
    buttonLabel: "학생으로 로그인",
  },
} as const;

function getRoleCheckErrorCode(status: number): AuthErrorCode {
  if (status === 401) {
    return "session_expired";
  }

  if (status === 403) {
    return "invalid_role";
  }

  return "auth_server_error";
}

function isRoleCheckResponse(value: unknown): value is RoleCheckResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const destination = (value as RoleCheckResponse).destination;
  return destination === "/operator" || destination === "/student";
}

export function PasswordLoginForm({
  mode,
  initialNotice = null,
}: PasswordLoginFormProps) {
  const router = useRouter();
  const submittingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<AuthUserMessage | null>(
    initialNotice,
  );
  const config = loginConfig[mode];
  const identifierErrorId = `${mode}-identifier-error`;
  const passwordErrorId = `${mode}-password-error`;

  function showFormError(code: AuthErrorCode) {
    setFormError(getAuthUserMessage(code));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submittingRef.current) {
      return;
    }

    setFormError(null);

    const formData = new FormData(event.currentTarget);
    const identifier = String(formData.get(config.identifierName) ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const nextFieldErrors: FieldErrors = {};

    if (!identifier) {
      nextFieldErrors.identifier = config.identifierRequiredMessage;
    }

    if (!password) {
      nextFieldErrors.password = "비밀번호를 입력해 주세요.";
    }

    setFieldErrors(nextFieldErrors);

    if (Object.keys(nextFieldErrors).length > 0) {
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);

    try {
      const email =
        mode === "student"
          ? studentNicknameToAuthEmail(identifier)
          : identifier;
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        showFormError(classifySupabaseLoginError(error));
        return;
      }

      const roleResponse = await fetch("/api/auth/role", {
        method: "POST",
        cache: "no-store",
      });

      if (!roleResponse.ok) {
        showFormError(getRoleCheckErrorCode(roleResponse.status));
        return;
      }

      const roleResult: unknown = await roleResponse.json();

      if (!isRoleCheckResponse(roleResult)) {
        showFormError("auth_server_error");
        return;
      }

      router.replace(roleResult.destination);
      router.refresh();
    } catch (error) {
      if (error instanceof InvalidStudentNicknameError) {
        setFieldErrors({ identifier: error.message });
      } else {
        showFormError(classifyUnexpectedLoginError(error));
      }
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit} noValidate>
      {formError ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-900"
        >
          <p className="font-bold">{formError.message}</p>
          <p className="mt-1 text-rose-800">{formError.action}</p>
        </div>
      ) : null}

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
          disabled={isSubmitting}
          aria-invalid={Boolean(fieldErrors.identifier)}
          aria-describedby={fieldErrors.identifier ? identifierErrorId : undefined}
          onChange={() => {
            setFieldErrors((current) => ({ ...current, identifier: undefined }));
          }}
          className="h-13 w-full rounded-xl border border-[#9badaa] bg-white px-4 text-base outline-none transition placeholder:text-[#5f706e] focus:border-[var(--accent)] focus:ring-3 focus:ring-[#bce9e4] aria-invalid:border-rose-600 aria-invalid:focus:ring-rose-100"
        />
        {fieldErrors.identifier ? (
          <p id={identifierErrorId} className="mt-2 text-sm font-semibold text-rose-800">
            {fieldErrors.identifier}
          </p>
        ) : null}
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
          disabled={isSubmitting}
          aria-invalid={Boolean(fieldErrors.password)}
          aria-describedby={fieldErrors.password ? passwordErrorId : undefined}
          onChange={() => {
            setFieldErrors((current) => ({ ...current, password: undefined }));
          }}
          className="h-13 w-full rounded-xl border border-[#9badaa] bg-white px-4 text-base outline-none transition placeholder:text-[#5f706e] focus:border-[var(--accent)] focus:ring-3 focus:ring-[#bce9e4] aria-invalid:border-rose-600 aria-invalid:focus:ring-rose-100"
        />
        {fieldErrors.password ? (
          <p id={passwordErrorId} className="mt-2 text-sm font-semibold text-rose-800">
            {fieldErrors.password}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        aria-disabled={isSubmitting}
        className="min-h-13 w-full rounded-xl bg-[var(--accent)] px-5 font-bold text-white transition hover:bg-[var(--accent-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] active:translate-y-px disabled:cursor-wait disabled:opacity-70"
      >
        {isSubmitting ? "로그인 중..." : config.buttonLabel}
      </button>
      <p className="text-center text-sm leading-6 text-[var(--muted)]">
        계정이 없다면 수업 운영자에게 문의해 주세요.
      </p>
    </form>
  );
}
