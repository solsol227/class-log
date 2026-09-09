import { redirect } from "next/navigation";
import { requireOperatorAccess } from "@/lib/auth/operator-access";

type LessonCreatePageProps = {
  params: Promise<{ id: string }>;
};

export default async function LessonCreatePage({
  params,
}: LessonCreatePageProps) {
  await requireOperatorAccess({ owner: true });
  await params;
  redirect("/operator/schedules/new");
}
