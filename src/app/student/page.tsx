import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";

export default async function StudentPage() {
  await requireAuthenticatedUser("/login/student", "student");
  redirect("/student/schedule");
}
