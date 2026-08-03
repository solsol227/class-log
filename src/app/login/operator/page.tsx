import { PasswordLoginForm } from "@/components/auth/password-login-form";
import { LoginShell } from "@/components/login-shell";

type OperatorLoginPageProps = {
  searchParams: Promise<{ notice?: string }>;
};

export default async function OperatorLoginPage({
  searchParams,
}: OperatorLoginPageProps) {
  const { notice } = await searchParams;
  const initialNotice =
    notice === "invalid-role"
      ? "사용 권한이 설정되지 않은 계정입니다. 운영자에게 문의해 주세요."
      : undefined;

  return (
    <LoginShell
      audience="운영자"
      description="일정과 수업 기록을 관리하기 위한 운영자 전용 화면입니다."
    >
      <PasswordLoginForm mode="operator" initialNotice={initialNotice} />
    </LoginShell>
  );
}
