import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";

export default async function OperatorPage() {
  await requireAuthenticatedUser("/login/operator", "operator");
  redirect("/operator/schedules");
}
