"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { PressHoldPasswordField } from "@/components/auth/press-hold-password-field";
import { createStaff, type StaffCreateActionState } from "./actions";

const INITIAL_STATE: StaffCreateActionState = { fieldErrors: {} };

function SubmitButton() {
  const { pending } = useFormStatus();
  return <button disabled={pending} className="min-h-12 rounded-xl bg-[var(--accent)] px-5 font-bold text-white disabled:opacity-60">{pending ? "등록 중..." : "직원 등록"}</button>;
}

export function StaffCreateForm() {
  const [state, action] = useActionState(createStaff, INITIAL_STATE);
  const [createAccount, setCreateAccount] = useState(state.values?.createAccount ?? false);
  return <form action={action} className="mt-6 grid gap-4 rounded-2xl border border-[var(--line)] bg-white p-5" noValidate>
    {state.formError ? <p role="alert" className="rounded-xl bg-rose-50 p-3 font-bold text-rose-900">{state.formError}</p> : null}
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-2 text-sm font-bold">직원 이름<input name="display_name" required defaultValue={state.values?.displayName} className="h-12 rounded-xl border border-[#9badaa] px-4 font-normal" />{state.fieldErrors.displayName ? <span className="text-rose-800">{state.fieldErrors.displayName}</span> : null}</label>
      <label className="grid gap-2 text-sm font-bold">업무 역할<select name="role" required defaultValue={state.values?.role ?? "manager"} className="h-12 rounded-xl border border-[#9badaa] bg-white px-4 font-normal"><option value="manager">매니저</option><option value="vocal_trainer">보컬트레이너</option></select></label>
    </div>
    <label className="flex min-h-11 items-center gap-3 font-bold"><input type="checkbox" name="create_account" checked={createAccount} onChange={(event) => setCreateAccount(event.target.checked)} /> 로그인 계정도 함께 만들기</label>
    {createAccount ? <div className="grid gap-4 rounded-xl bg-[#f4f8f7] p-4 sm:grid-cols-2">
      <label className="grid gap-2 text-sm font-bold sm:col-span-2">로그인 아이디<input name="login_id" autoComplete="username" required defaultValue={state.values?.loginId} placeholder="영문 소문자·숫자·_·- (4~32자)" className="h-12 rounded-xl border border-[#9badaa] bg-white px-4 font-normal" />{state.fieldErrors.loginId ? <span className="text-rose-800">{state.fieldErrors.loginId}</span> : null}</label>
      <PressHoldPasswordField id="staff-create-password" name="password" label="초기 비밀번호" error={state.fieldErrors.password} />
      <PressHoldPasswordField id="staff-create-password-confirmation" name="password_confirmation" label="비밀번호 확인" error={state.fieldErrors.passwordConfirmation} />
      <p className="text-sm text-[var(--muted)] sm:col-span-2">비밀번호는 8자 이상이며 저장 후 다시 볼 수 없습니다.</p>
    </div> : null}
    <SubmitButton />
  </form>;
}
