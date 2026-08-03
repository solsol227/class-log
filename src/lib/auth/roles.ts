export const APP_ROLES = ["operator", "student"] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const ROLE_HOME_PATHS: Record<AppRole, "/operator" | "/student"> = {
  operator: "/operator",
  student: "/student",
};

export function isAppRole(value: unknown): value is AppRole {
  return APP_ROLES.includes(value as AppRole);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getAppRoleFromClaims(claims: unknown): AppRole | null {
  if (!isRecord(claims) || !isRecord(claims.app_metadata)) {
    return null;
  }

  const role = claims.app_metadata.role;
  return isAppRole(role) ? role : null;
}

// TODO(rbac): Route authorization does not replace database RLS. Add policies
// that enforce the same signed role and record ownership before business tables exist.
