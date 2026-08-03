import { PasswordLoginForm } from "@/components/auth/password-login-form";
import { LoginShell } from "@/components/login-shell";

type StudentLoginPageProps = {
  searchParams: Promise<{ notice?: string }>;
};

export default async function StudentLoginPage({
  searchParams,
}: StudentLoginPageProps) {
  const { notice } = await searchParams;
  const initialNotice =
    notice === "invalid-role"
      ? "사용 권한이 설정되지 않은 계정입니다. 운영자에게 문의해 주세요."
      : undefined;

  return (
    <LoginShell
      audience="학생"
      description="나의 일정과 수업 피드백을 확인하기 위한 학생 전용 화면입니다."
    >
      <PasswordLoginForm mode="student" initialNotice={initialNotice} />
    </LoginShell>
  );
}
