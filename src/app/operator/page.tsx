import { AuthenticatedPlaceholder } from "@/components/auth/authenticated-placeholder";
import { getAuthNoticeMessage } from "@/lib/auth/errors";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";

type OperatorPageProps = {
  searchParams: Promise<{ notice?: string }>;
};

export default async function OperatorPage({ searchParams }: OperatorPageProps) {
  await requireAuthenticatedUser("/login/operator", "operator");
  const { notice } = await searchParams;
  return (
    <AuthenticatedPlaceholder
      role="operator"
      notice={getAuthNoticeMessage(notice)}
    />
  );
}
