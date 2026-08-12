import { PasswordLoginForm } from "@/components/auth/password-login-form";
import { LoginShell } from "@/components/login-shell";
import { getAuthNoticeMessage } from "@/lib/auth/errors";

type StudentLoginPageProps = {
  searchParams: Promise<{ notice?: string }>;
};

export default async function StudentLoginPage({
  searchParams,
}: StudentLoginPageProps) {
  const { notice } = await searchParams;
  const initialNotice = getAuthNoticeMessage(notice);

  return (
    <LoginShell
      audience="학생"
      description="나의 일정과 수업 피드백을 확인하기 위한 학생 전용 화면입니다."
    >
      <PasswordLoginForm mode="student" initialNotice={initialNotice} />
    </LoginShell>
  );
}
