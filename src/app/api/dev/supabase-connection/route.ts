import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type ConnectionResult = {
  ok: boolean;
  message: string;
};

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return new NextResponse(null, { status: 404 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    return NextResponse.json<ConnectionResult>({
      ok: false,
      message: "필요한 환경변수가 설정되지 않았습니다.",
    });
  }

  try {
    const authSettingsUrl = new URL("/auth/v1/settings", supabaseUrl);
    const response = await fetch(authSettingsUrl, {
      headers: {
        apikey: supabasePublishableKey,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json<ConnectionResult>({
        ok: false,
        message: "Supabase Auth 연결에 실패했습니다. 환경변수를 확인해 주세요.",
      });
    }

    return NextResponse.json<ConnectionResult>({
      ok: true,
      message: "Supabase 프로젝트에 정상적으로 연결되었습니다.",
    });
  } catch {
    return NextResponse.json<ConnectionResult>({
      ok: false,
      message: "Supabase Auth 연결을 확인할 수 없습니다.",
    });
  }
}
