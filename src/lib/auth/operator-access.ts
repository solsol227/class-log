import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";

export type OperatorAccessLevel = "owner" | "staff";

export type OperatorAccess = {
  accessLevel: OperatorAccessLevel;
  staffProfileId: string | null;
  isOwner: boolean;
  canManageSchedules: boolean;
  canConfirmDrafts: boolean;
  canManageAssignments: boolean;
  canManageStudents: boolean;
  canManageStudentPrograms: boolean;
  canManageStaff: boolean;
  canManageAccounts: boolean;
  canManageMakeup: boolean;
  canRecordAttendance: boolean;
  canManageFeedback: boolean;
};

type OperatorContextPayload = {
  accessLevel?: unknown;
  staffProfileId?: unknown;
};

function parseOperatorContext(value: unknown): OperatorAccess | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as OperatorContextPayload;
  if (payload.accessLevel !== "owner" && payload.accessLevel !== "staff") return null;
  const staffProfileId = typeof payload.staffProfileId === "string" ? payload.staffProfileId : null;
  if (payload.accessLevel === "staff" && !staffProfileId) return null;
  const isOwner = payload.accessLevel === "owner";

  return {
    accessLevel: payload.accessLevel,
    staffProfileId,
    isOwner,
    canManageSchedules: isOwner,
    canConfirmDrafts: isOwner,
    canManageAssignments: isOwner,
    canManageStudents: isOwner,
    canManageStudentPrograms: isOwner,
    canManageStaff: isOwner,
    canManageAccounts: isOwner,
    canManageMakeup: isOwner,
    canRecordAttendance: true,
    canManageFeedback: true,
  };
}

export async function loadOperatorAccess() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_my_operator_context");
  if (error) {
    throw new Error("운영 계정 권한을 확인하지 못했습니다.", { cause: error });
  }
  return parseOperatorContext(data);
}

export async function requireOperatorAccess(options?: { owner?: boolean }): Promise<OperatorAccess & { authUserId: string }> {
  const claims = await requireAuthenticatedUser("/login/operator", "operator");
  const access = await loadOperatorAccess();
  if (!access) redirect("/login/operator?notice=account-disabled");
  if (options?.owner && !access.isOwner) redirect("/operator/schedules?notice=forbidden-route");
  if (typeof claims.sub !== "string") redirect("/login/operator?notice=invalid-role");
  return { ...access, authUserId: claims.sub };
}
