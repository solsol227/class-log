import { cookies } from "next/headers";
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
  const cookieStore = await cookies();
  const hadAuthCookie = cookieStore.getAll().some(
    ({ name }) => name.startsWith("sb-") && name.includes("-auth-token"),
  );
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect(
      hadAuthCookie ? `${loginPath}?notice=session-expired` : loginPath,
    );
  }

  const role = getAppRoleFromClaims(data.claims);

  if (!role) {
    await supabase.auth.signOut();
    redirect(`${loginPath}?notice=invalid-role`);
  }

  if (role !== expectedRole) {
    redirect(`${ROLE_HOME_PATHS[role]}?notice=forbidden-route`);
  }

  return data.claims;
}
