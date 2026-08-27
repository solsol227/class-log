import { NextResponse } from "next/server";
import {
  getAppRoleFromClaims,
  isAppRole,
  ROLE_HOME_PATHS,
} from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    return new NextResponse(null, { status: 401 });
  }

  const role = getAppRoleFromClaims(data.claims);

  if (!role) {
    await supabase.auth.signOut();
    return new NextResponse(null, { status: 403 });
  }

  const body: unknown = await request.json().catch(() => null);
  const expectedRole =
    typeof body === "object" && body !== null && "expectedRole" in body
      ? (body as { expectedRole?: unknown }).expectedRole
      : null;

  if (!isAppRole(expectedRole)) {
    return new NextResponse(null, { status: 400 });
  }

  if (role !== expectedRole) {
    await supabase.auth.signOut();
    return new NextResponse(null, { status: 403 });
  }

  return NextResponse.json({ destination: ROLE_HOME_PATHS[role] });
}
