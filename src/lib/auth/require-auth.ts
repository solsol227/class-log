import { redirect } from "next/navigation";
import {
  getAppRoleFromClaims,
  ROLE_HOME_PATHS,
  type AppRole,
} from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function requireAuthenticatedUser(
  loginPath: "/login/operator" | "/login/student",
  expectedRole: AppRole,
) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect(loginPath);
  }

  const role = getAppRoleFromClaims(data.claims);

  if (!role) {
    await supabase.auth.signOut();
    redirect(`${loginPath}?notice=invalid-role`);
  }

  if (role !== expectedRole) {
    redirect(ROLE_HOME_PATHS[role]);
  }

  return data.claims;
}
