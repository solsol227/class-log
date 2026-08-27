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
  revalidatePath("/operator/staff");
  redirect("/operator/staff?created=1");
}

export async function updateStaff(staffId: string, formData: FormData) {
  await requireAuthenticatedUser("/login/operator", "operator");
  const displayName = String(formData.get("display_name") ?? "").trim();
  const isActive = formData.get("is_active") === "on";
  if (!UUID_PATTERN.test(staffId) || !displayName) redirect("/operator/staff?error=invalid");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("staff_profiles").update({ display_name: displayName, is_active: isActive }).eq("id", staffId).select("id").maybeSingle();
  if (error || !data) redirect("/operator/staff?error=save");
  revalidatePath("/operator/staff");
  redirect("/operator/staff?updated=1");
}
