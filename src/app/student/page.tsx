import { AuthenticatedPlaceholder } from "@/components/auth/authenticated-placeholder";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";

export default async function StudentPage() {
  await requireAuthenticatedUser("/login/student", "student");
  return <AuthenticatedPlaceholder role="student" />;
}
