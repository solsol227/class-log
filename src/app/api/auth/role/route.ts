import { NextResponse } from "next/server";
import {
  getAppRoleFromClaims,
  isAppRole,
  ROLE_HOME_PATHS,
} from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAuthServiceUnavailable } from "@/lib/auth/errors";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();

  if (isAuthServiceUnavailable(error)) {
    return new NextResponse(null, {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "5" },
    });
  }

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

  if (role === "operator") {
    const { data: operatorContext, error: operatorError } = await supabase.rpc(
      "get_my_operator_context",
    );

    if (operatorError) {
      console.error("운영 계정 권한 확인에 실패했습니다.", { code: operatorError.code });
      return new NextResponse(null, {
        status: 503,
        headers: { "Cache-Control": "no-store", "Retry-After": "5" },
      });
    }

    if (!operatorContext) {
      await supabase.auth.signOut();
      return new NextResponse(null, { status: 403 });
    }
  }

  return NextResponse.json({ destination: ROLE_HOME_PATHS[role] });
}
