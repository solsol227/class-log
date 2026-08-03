import { AuthenticatedPlaceholder } from "@/components/auth/authenticated-placeholder";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";

export default async function OperatorPage() {
  await requireAuthenticatedUser("/login/operator", "operator");
  return <AuthenticatedPlaceholder role="operator" />;
}
