import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";

type LessonCreatePageProps = {
  params: Promise<{ id: string }>;
};

export default async function LessonCreatePage({
  params,
}: LessonCreatePageProps) {
  await requireAuthenticatedUser("/login/operator", "operator");
  await params;
  redirect("/operator/schedules/new");
}
