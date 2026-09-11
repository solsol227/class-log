"use server";

import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { classifySupabaseLoginError, type AuthErrorCode } from "@/lib/auth/errors";
import { InvalidStaffLoginIdError, staffLoginIdToAuthEmail } from "@/lib/auth/operator-identity";
import { getAppRoleFromClaims, ROLE_HOME_PATHS } from "@/lib/auth/roles";
import { InvalidStudentNicknameError, studentNicknameToAuthEmail } from "@/lib/auth/student-identity";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

type LoginMode = "operator" | "student";

export type PasswordLoginResult =
  | { status: "success"; destination: "/operator/schedules" | "/student/schedule" }
  | { status: "error"; code: AuthErrorCode; fieldError?: string };

export async function loginWithPassword(
  mode: LoginMode,
  identifier: string,
  password: string,
): Promise<PasswordLoginResult> {
  if (!identifier || !password) return { status: "error", code: "auth_invalid_credentials" };

  let email: string;
  try {
    email = mode === "student"
      ? studentNicknameToAuthEmail(identifier)
      : identifier.includes("@")
        ? identifier
        : staffLoginIdToAuthEmail(identifier);
  } catch (error) {
    if (error instanceof InvalidStudentNicknameError || error instanceof InvalidStaffLoginIdError) {
      return { status: "error", code: "auth_invalid_credentials", fieldError: error.message };
    }
    return { status: "error", code: "auth_server_error" };
  }

  const supabase = await createSupabaseServerClient();
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) return { status: "error", code: classifySupabaseLoginError(signInError) };
  const accessToken = signInData.session?.access_token;
  if (!accessToken) {
    await supabase.auth.signOut();
    return { status: "error", code: "auth_server_error" };
  }

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(accessToken);
  if (claimsError || !claimsData?.claims) {
    await supabase.auth.signOut();
    return { status: "error", code: "auth_server_error" };
  }

  const role = getAppRoleFromClaims(claimsData.claims);
  if (!role || role !== mode) {
    await supabase.auth.signOut();
    return { status: "error", code: "invalid_role" };
  }

  if (role === "operator") {
    const { url, publishableKey } = getSupabasePublicEnv();
    const authenticatedClient = createClient(url, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data: operatorContext, error: operatorError } = await authenticatedClient.rpc("get_my_operator_context");
    if (operatorError) {
      await supabase.auth.signOut();
      return { status: "error", code: "auth_server_error" };
    }
    if (!operatorContext) {
      await supabase.auth.signOut();
      return { status: "error", code: "account_disabled" };
    }
  }

  return { status: "success", destination: ROLE_HOME_PATHS[role] };
}

export async function logout() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}
