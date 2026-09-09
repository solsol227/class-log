"use client";

import { PressHoldPasswordField } from "@/components/auth/press-hold-password-field";
import { createStaffAccount, resetStaffPassword } from "./actions";

export function CreateStaffAccountForm({ staffId }: { staffId: string }) {
  return <form action={createStaffAccount.bind(null, staffId)} className="mt-5 grid gap-4 sm:grid-cols-2">
    <label className="grid gap-2 text-sm font-bold sm:col-span-2">로그인 아이디<input name="login_id" required autoComplete="username" placeholder="영문 소문자·숫자·_·- (4~32자)" className="h-12 rounded-xl border border-[#9badaa] px-4 font-normal" /></label>
    <PressHoldPasswordField id={`account-password-${staffId}`} name="password" label="초기 비밀번호" />
    <PressHoldPasswordField id={`account-confirm-${staffId}`} name="password_confirmation" label="비밀번호 확인" />
    <p className="text-sm text-[var(--muted)] sm:col-span-2">비밀번호는 8자 이상이며 계정 생성 후 다시 볼 수 없습니다.</p>
    <button className="min-h-12 rounded-xl bg-[var(--accent)] px-5 font-bold text-white sm:col-span-2">로그인 계정 생성</button>
  </form>;
}

export function ResetStaffPasswordForm({ staffId }: { staffId: string }) {
  return <form action={resetStaffPassword.bind(null, staffId)} className="mt-5 grid gap-4 sm:grid-cols-2">
    <PressHoldPasswordField id={`reset-password-${staffId}`} name="password" label="새 임시 비밀번호" />
    <PressHoldPasswordField id={`reset-confirm-${staffId}`} name="password_confirmation" label="비밀번호 확인" />
    <button className="min-h-11 rounded-xl border border-[var(--accent)] px-4 font-bold text-[var(--accent-strong)] sm:col-span-2">비밀번호 재설정</button>
  </form>;
}
