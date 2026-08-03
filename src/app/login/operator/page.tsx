import { PasswordLoginForm } from "@/components/auth/password-login-form";
import { LoginShell } from "@/components/login-shell";

export default function OperatorLoginPage() {
  return (
    <LoginShell
      audience="운영자"
      description="일정과 수업 기록을 관리하기 위한 운영자 전용 화면입니다."
    >
      <PasswordLoginForm mode="operator" />
    </LoginShell>
  );
}
