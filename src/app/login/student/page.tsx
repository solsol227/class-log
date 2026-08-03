import { LoginShell } from "@/components/login-shell";

export default function StudentLoginPage() {
  return (
    <LoginShell
      audience="학생"
      description="나의 일정과 수업 피드백을 확인하기 위한 학생 전용 화면입니다."
    />
  );
}
