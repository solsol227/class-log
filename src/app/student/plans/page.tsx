import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";

export default async function StudentPlansPage() {
  await requireAuthenticatedUser("/login/student", "student");
  redirect("/student/schedule");
}
