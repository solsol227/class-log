"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ROLES = ["manager", "vocal_trainer"];

export async function createStaff(formData: FormData) {
  await requireAuthenticatedUser("/login/operator", "operator");
  const displayName = String(formData.get("display_name") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  if (!displayName || !ROLES.includes(role)) redirect("/operator/staff?error=invalid");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("staff_profiles").insert({ display_name: displayName, role });
  if (error) redirect("/operator/staff?error=save");
  revalidatePath("/operator/staff");
  redirect("/operator/staff?created=1");
}

export async function updateStaff(staffId: string, formData: FormData) {
  await requireAuthenticatedUser("/login/operator", "operator");
  const displayName = String(formData.get("display_name") ?? "").trim();
  const isActive = formData.get("is_active") === "on";
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("staff_profiles").update({ display_name: displayName, is_active: isActive }).eq("id", staffId);
  if (error) redirect("/operator/staff?error=save");
  revalidatePath("/operator/staff");
  redirect("/operator/staff?updated=1");
}
