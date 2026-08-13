import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";

export default async function StudentPlanDetailPage() {
  await requireAuthenticatedUser("/login/student", "student");
  redirect("/student/schedule");
}
