export const APP_ROLES = ["operator", "student"] as const;

export type AppRole = (typeof APP_ROLES)[number];

export function isAppRole(value: unknown): value is AppRole {
  return APP_ROLES.includes(value as AppRole);
}

// TODO(auth-roles): Store the application role in signed app_metadata and
// enforce it on the server before role-specific data or features are added.
