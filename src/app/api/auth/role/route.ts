import { NextResponse } from "next/server";
import { getAppRoleFromClaims, ROLE_HOME_PATHS } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    return NextResponse.json(
      { message: "로그인 상태를 확인할 수 없습니다. 다시 로그인해 주세요." },
      { status: 401 },
    );
  }

  const role = getAppRoleFromClaims(data.claims);

  if (!role) {
    await supabase.auth.signOut();
    return NextResponse.json(
      {
        code: "invalid-role",
        message: "사용 권한이 설정되지 않은 계정입니다. 운영자에게 문의해 주세요.",
      },
      { status: 403 },
    );
  }

  return NextResponse.json({ destination: ROLE_HOME_PATHS[role] });
}
