"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ROLES = ["manager", "vocal_trainer"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function createStaff(formData: FormData) {
  await requireAuthenticatedUser("/login/operator", "operator");
  const displayName = String(formData.get("display_name") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  if (!displayName || !ROLES.includes(role)) redirect("/operator/staff?error=invalid");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("staff_profiles").insert({ display_name: displayName, role }).select("id").maybeSingle();
  if (error || !data) redirect("/operator/staff?error=save");
  revalidateStaffViews(data.id);
  redirect("/operator/staff?created=1");
}

export async function updateStaff(staffId: string, formData: FormData) {
  await requireAuthenticatedUser("/login/operator", "operator");
  const displayName = String(formData.get("display_name") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  if (!UUID_PATTERN.test(staffId) || !displayName || !ROLES.includes(role)) redirect("/operator/staff?error=invalid");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("staff_profiles").update({ display_name: displayName, role }).eq("id", staffId).eq("is_active", true).select("id").maybeSingle();
  if (error || !data) redirect("/operator/staff?error=save");
  revalidateStaffViews(staffId);
  redirect("/operator/staff?updated=1");
}

export async function deleteStaff(staffId: string) {
  await requireAuthenticatedUser("/login/operator", "operator");
  if (!UUID_PATTERN.test(staffId)) redirect("/operator/staff?error=invalid");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("delete_or_archive_staff", { target_staff_id: staffId });
  if (error || data !== "archived") redirect("/operator/staff?error=delete");
  revalidateStaffViews(staffId);
  redirect(`/operator/staff?deleted=${data}`);
}

export async function restoreStaff(staffId: string) {
  await requireAuthenticatedUser("/login/operator", "operator");
  if (!UUID_PATTERN.test(staffId)) redirect("/operator/staff?error=invalid");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("restore_staff_profile", { target_staff_id: staffId });
  if (error || data !== staffId) redirect("/operator/staff?error=restore");
  revalidateStaffViews(staffId);
  redirect("/operator/staff?restored=1");
}

function revalidateStaffViews(staffId?: string) {
  revalidatePath("/operator/staff");
  if (staffId) revalidatePath(`/operator/staff/${staffId}`);
  revalidatePath("/operator/staff/[staffId]", "page");
  revalidatePath("/operator/schedules/[lessonId]", "page");
  revalidatePath("/student/schedule");
  revalidatePath("/student/feedback");
}
