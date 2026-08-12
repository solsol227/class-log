import { redirect } from "next/navigation";
import type { AppRole } from "@/lib/auth/roles";
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

  // TODO(auth-roles): Compare a signed app_metadata role with expectedRole.
  // Authentication is enforced now; role authorization is intentionally deferred.
  void expectedRole;

  return data.claims;
}
