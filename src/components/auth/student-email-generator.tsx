"use client";

import { useState, type FormEvent } from "react";
import {
  InvalidStudentNicknameError,
  studentNicknameToAuthEmail,
} from "@/lib/auth/student-identity";

export function StudentEmailGenerator() {
  const [email, setEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmail("");
    setErrorMessage("");

    const formData = new FormData(event.currentTarget);
    const nickname = String(formData.get("nickname") ?? "");

    try {
      setEmail(studentNicknameToAuthEmail(nickname));
    } catch (error) {
      setErrorMessage(
        error instanceof InvalidStudentNicknameError
          ? error.message
          : "인증용 이메일을 만들 수 없습니다.",
      );
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div>
        <label htmlFor="nickname" className="mb-2 block text-sm font-bold">
          테스트 학생 이름
        </label>
        <input
          id="nickname"
          name="nickname"
          type="text"
          autoComplete="off"
          required
          className="h-13 w-full rounded-xl border border-[#b9c9c6] bg-white px-4 text-base outline-none focus:border-[var(--accent)]"
        />
      </div>
      <button
        type="submit"
        className="min-h-12 w-full rounded-xl bg-[var(--accent)] px-5 font-bold text-white"
      >
        내부 인증용 이메일 만들기
      </button>
      {email ? (
        <output className="block break-all rounded-xl bg-[#e8f4f2] px-4 py-3 font-mono text-sm">
          {email}
        </output>
      ) : null}
      {errorMessage ? (
        <p role="alert" className="text-sm font-semibold text-rose-800">
          {errorMessage}
        </p>
      ) : null}
      <p className="text-sm leading-6 text-[var(--muted)]">
        변환은 브라우저 안에서만 수행되며 서버 로그에 남기지 않습니다.
      </p>
    </form>
  );
}
