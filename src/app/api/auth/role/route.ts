import { NextResponse } from "next/server";
import { getAppRoleFromClaims, ROLE_HOME_PATHS } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST() {
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

  return NextResponse.json({ destination: ROLE_HOME_PATHS[role] });
}
