"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOperatorAccess } from "@/lib/auth/operator-access";
import { InvalidStaffLoginIdError, normalizeStaffLoginId, staffLoginIdToAuthEmail } from "@/lib/auth/operator-identity";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ROLES = ["manager", "vocal_trainer"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GENERIC_ACCOUNT_ERROR = "로그인 계정을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";

type StaffAccountFieldErrors = { displayName?: string; loginId?: string; password?: string; passwordConfirmation?: string };
export type StaffCreateActionState = {
  fieldErrors: StaffAccountFieldErrors;
  formError?: string;
  values?: { displayName: string; role: string; createAccount: boolean; loginId: string };
};

function isDuplicateAuthUserError(error: { code?: string }) {
  return error.code === "email_exists" || error.code === "user_already_exists";
}

function validatePassword(password: string, confirmation: string, errors: StaffAccountFieldErrors) {
  if (!password) errors.password = "초기 비밀번호를 입력해 주세요.";
  else if (password.length < 8) errors.password = "비밀번호는 8자 이상 입력해 주세요.";
  if (!confirmation) errors.passwordConfirmation = "비밀번호 확인을 입력해 주세요.";
  else if (password !== confirmation) errors.passwordConfirmation = "비밀번호가 일치하지 않습니다.";
}

async function accountIdentifierExists(loginId: string) {
  const supabase = await createSupabaseServerClient();
  const [accountResult, studentResult] = await Promise.all([
    supabase.from("operator_accounts").select("auth_user_id").eq("login_id", loginId).maybeSingle(),
    supabase.from("students").select("id").eq("nickname", loginId).maybeSingle(),
  ]);
  if (accountResult.error || studentResult.error) throw new Error("Account identifier lookup failed");
  return Boolean(accountResult.data || studentResult.data);
}

async function cleanupCreatedAuthUser(authUserId: string) {
  try {
    const { error } = await createSupabaseAdminClient().auth.admin.deleteUser(authUserId);
    if (error) console.error("생성된 직원 인증 계정 정리에 실패했습니다.", { code: error.code });
  } catch {
    console.error("생성된 직원 인증 계정 정리에 실패했습니다.");
  }
}

async function createStaffAuthUser(loginId: string, password: string) {
  return createSupabaseAdminClient().auth.admin.createUser({
    email: staffLoginIdToAuthEmail(loginId),
    password,
    email_confirm: true,
    app_metadata: { role: "operator" },
  });
}

export async function createStaff(_previousState: StaffCreateActionState, formData: FormData): Promise<StaffCreateActionState> {
  await requireOperatorAccess({ owner: true });
  const displayName = String(formData.get("display_name") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  const createAccount = formData.get("create_account") === "on";
  const rawLoginId = String(formData.get("login_id") ?? "");
  const password = String(formData.get("password") ?? "");
  const passwordConfirmation = String(formData.get("password_confirmation") ?? "");
  const fieldErrors: StaffAccountFieldErrors = {};
  const values = { displayName, role, createAccount, loginId: rawLoginId };

  if (!displayName) fieldErrors.displayName = "직원 이름을 입력해 주세요.";
  if (!ROLES.includes(role)) fieldErrors.displayName = "업무 역할을 확인해 주세요.";
  let loginId = "";
  if (createAccount) {
    try { loginId = normalizeStaffLoginId(rawLoginId); }
    catch (error) { fieldErrors.loginId = error instanceof InvalidStaffLoginIdError ? error.message : "로그인 아이디를 확인해 주세요."; }
    validatePassword(password, passwordConfirmation, fieldErrors);
  }
  if (Object.keys(fieldErrors).length) return { fieldErrors, values };

  const supabase = await createSupabaseServerClient();
  if (!createAccount) {
    const { data, error } = await supabase.from("staff_profiles").insert({ display_name: displayName, role }).select("id").maybeSingle();
    if (error || !data) return { fieldErrors: {}, formError: "직원을 등록하지 못했습니다.", values };
    revalidateStaffViews(data.id);
    redirect("/operator/staff?created=1");
  }

  try {
    if (await accountIdentifierExists(loginId)) return { fieldErrors: { loginId: "이미 사용 중인 로그인 아이디입니다." }, values };
  } catch { return { fieldErrors: {}, formError: GENERIC_ACCOUNT_ERROR, values }; }

  let authResult;
  try { authResult = await createStaffAuthUser(loginId, password); }
  catch { return { fieldErrors: {}, formError: GENERIC_ACCOUNT_ERROR, values }; }
  if (authResult.error || !authResult.data.user) {
    const duplicate = isDuplicateAuthUserError(authResult.error ?? {});
    return { fieldErrors: duplicate ? { loginId: "이미 사용 중인 로그인 아이디입니다." } : {}, formError: duplicate ? undefined : GENERIC_ACCOUNT_ERROR, values };
  }

  const { data: staffId, error: linkError } = await supabase.rpc("create_staff_with_operator_account", {
    staff_display_name: displayName,
    staff_role: role,
    target_auth_user_id: authResult.data.user.id,
    target_login_id: loginId,
  });
  if (linkError || !staffId) {
    await cleanupCreatedAuthUser(authResult.data.user.id);
    const duplicate = linkError?.code === "23505";
    return { fieldErrors: duplicate ? { loginId: "이미 사용 중인 로그인 아이디입니다." } : {}, formError: duplicate ? undefined : GENERIC_ACCOUNT_ERROR, values };
  }
  revalidateStaffViews(staffId);
  redirect(`/operator/staff/${staffId}?accountCreated=1`);
}

export async function createStaffAccount(staffId: string, formData: FormData) {
  await requireOperatorAccess({ owner: true });
  if (!UUID_PATTERN.test(staffId)) redirect("/operator/staff?error=invalid");
  const rawLoginId = String(formData.get("login_id") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("password_confirmation") ?? "");
  let loginId: string;
  try { loginId = normalizeStaffLoginId(rawLoginId); }
  catch { redirect(`/operator/staff/${staffId}?accountError=invalid_id`); }
  if (password.length < 8 || password !== confirmation) redirect(`/operator/staff/${staffId}?accountError=password`);
  try { if (await accountIdentifierExists(loginId)) redirect(`/operator/staff/${staffId}?accountError=duplicate`); }
  catch { redirect(`/operator/staff/${staffId}?accountError=save`); }

  const supabase = await createSupabaseServerClient();
  const { data: staff } = await supabase.from("staff_profiles").select("id, auth_user_id, is_active").eq("id", staffId).maybeSingle();
  if (!staff?.is_active || staff.auth_user_id) redirect(`/operator/staff/${staffId}?accountError=state`);
  let authResult;
  try { authResult = await createStaffAuthUser(loginId, password); }
  catch { redirect(`/operator/staff/${staffId}?accountError=save`); }
  if (authResult.error || !authResult.data.user) redirect(`/operator/staff/${staffId}?accountError=${isDuplicateAuthUserError(authResult.error ?? {}) ? "duplicate" : "save"}`);
  const { data, error } = await supabase.rpc("link_staff_operator_account", {
    target_staff_id: staffId,
    target_auth_user_id: authResult.data.user.id,
    target_login_id: loginId,
  });
  if (error || data !== staffId) {
    await cleanupCreatedAuthUser(authResult.data.user.id);
    redirect(`/operator/staff/${staffId}?accountError=${error?.code === "23505" ? "duplicate" : "save"}`);
  }
  revalidateStaffViews(staffId);
  redirect(`/operator/staff/${staffId}?accountCreated=1`);
}

async function getStaffAuthUserId(staffId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("staff_profiles").select("auth_user_id").eq("id", staffId).maybeSingle();
  if (!data?.auth_user_id) return null;
  const { data: account } = await supabase.from("operator_accounts").select("auth_user_id, access_level").eq("auth_user_id", data.auth_user_id).maybeSingle();
  return account?.access_level === "staff" ? account.auth_user_id : null;
}

export async function resetStaffPassword(staffId: string, formData: FormData) {
  await requireOperatorAccess({ owner: true });
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("password_confirmation") ?? "");
  if (!UUID_PATTERN.test(staffId) || password.length < 8 || password !== confirmation) redirect(`/operator/staff/${staffId}?accountError=password`);
  const authUserId = await getStaffAuthUserId(staffId);
  if (!authUserId) redirect(`/operator/staff/${staffId}?accountError=state`);
  let error;
  try { ({ error } = await createSupabaseAdminClient().auth.admin.updateUserById(authUserId, { password })); }
  catch { redirect(`/operator/staff/${staffId}?accountError=reset`); }
  if (error) redirect(`/operator/staff/${staffId}?accountError=reset`);
  revalidateStaffViews(staffId);
  redirect(`/operator/staff/${staffId}?passwordReset=1`);
}

async function changeStaffAccountEnabled(staffId: string, enabled: boolean) {
  await requireOperatorAccess({ owner: true });
  if (!UUID_PATTERN.test(staffId)) redirect("/operator/staff?error=invalid");
  const authUserId = await getStaffAuthUserId(staffId);
  if (!authUserId) redirect(`/operator/staff/${staffId}?accountError=state`);
  const admin = createSupabaseAdminClient();
  let authError;
  try { ({ error: authError } = await admin.auth.admin.updateUserById(authUserId, { ban_duration: enabled ? "none" : "876000h" })); }
  catch { redirect(`/operator/staff/${staffId}?accountError=status`); }
  if (authError) redirect(`/operator/staff/${staffId}?accountError=status`);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("set_staff_operator_account_enabled", { target_staff_id: staffId, enabled });
  if (error || data !== staffId) {
    const { error: rollbackError } = await admin.auth.admin.updateUserById(authUserId, { ban_duration: enabled ? "876000h" : "none" });
    if (rollbackError) console.error("직원 로그인 상태 보상 복구에 실패했습니다.", { code: rollbackError.code });
    redirect(`/operator/staff/${staffId}?accountError=status`);
  }
  revalidateStaffViews(staffId);
  redirect(`/operator/staff/${staffId}?accountStatus=${enabled ? "enabled" : "disabled"}`);
}

export async function suspendStaffAccount(staffId: string) { return changeStaffAccountEnabled(staffId, false); }
export async function reactivateStaffAccount(staffId: string) { return changeStaffAccountEnabled(staffId, true); }

export async function updateStaff(staffId: string, formData: FormData) {
  await requireOperatorAccess({ owner: true });
  const displayName = String(formData.get("display_name") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  if (!UUID_PATTERN.test(staffId) || !displayName || !ROLES.includes(role)) redirect("/operator/staff?error=invalid");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("staff_profiles").update({ display_name: displayName, role }).eq("id", staffId).eq("is_active", true).select("id").maybeSingle();
  if (error || !data) redirect("/operator/staff?error=save");
  revalidateStaffViews(staffId);
  redirect("/operator/staff?updated=1");
}

async function archiveOrRestoreStaff(staffId: string, restore: boolean) {
  await requireOperatorAccess({ owner: true });
  if (!UUID_PATTERN.test(staffId)) redirect("/operator/staff?error=invalid");
  const authUserId = await getStaffAuthUserId(staffId);
  const admin = authUserId ? createSupabaseAdminClient() : null;
  if (admin && authUserId) {
    let error;
    try { ({ error } = await admin.auth.admin.updateUserById(authUserId, { ban_duration: restore ? "none" : "876000h" })); }
    catch { redirect(`/operator/staff?error=${restore ? "restore" : "delete"}`); }
    if (error) redirect(`/operator/staff?error=${restore ? "restore" : "delete"}`);
  }
  const supabase = await createSupabaseServerClient();
  const result = restore ? await supabase.rpc("restore_staff_profile", { target_staff_id: staffId }) : await supabase.rpc("delete_or_archive_staff", { target_staff_id: staffId });
  const ok = restore ? result.data === staffId : result.data === "archived";
  if (result.error || !ok) {
    if (admin && authUserId) {
      const { error } = await admin.auth.admin.updateUserById(authUserId, { ban_duration: restore ? "876000h" : "none" });
      if (error) console.error("직원 보관 상태 보상 복구에 실패했습니다.", { code: error.code });
    }
    redirect(`/operator/staff?error=${restore ? "restore" : "delete"}`);
  }
  revalidateStaffViews(staffId);
  redirect(restore ? "/operator/staff?restored=1" : "/operator/staff?deleted=archived");
}

export async function deleteStaff(staffId: string) { return archiveOrRestoreStaff(staffId, false); }
export async function restoreStaff(staffId: string) { return archiveOrRestoreStaff(staffId, true); }

function revalidateStaffViews(staffId?: string) {
  revalidatePath("/operator/staff");
  if (staffId) revalidatePath(`/operator/staff/${staffId}`);
  revalidatePath("/operator/staff/[staffId]", "page");
  revalidatePath("/operator/schedules/[lessonId]", "page");
  revalidatePath("/student/schedule");
  revalidatePath("/student/feedback");
}
