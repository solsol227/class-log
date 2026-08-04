import { AuthenticatedPlaceholder } from "@/components/auth/authenticated-placeholder";
import { getAuthNoticeMessage } from "@/lib/auth/errors";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";

type StudentPageProps = {
  searchParams: Promise<{ notice?: string }>;
};

export default async function StudentPage({ searchParams }: StudentPageProps) {
  await requireAuthenticatedUser("/login/student", "student");
  const { notice } = await searchParams;
  return (
    <AuthenticatedPlaceholder
      role="student"
      notice={getAuthNoticeMessage(notice)}
      featureLink={{ href: "/student/plans", label: "내 월간 계획 보기" }}
    />
  );
}
