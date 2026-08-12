import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  getAppRoleFromClaims,
  ROLE_HOME_PATHS,
  type AppRole,
} from "@/lib/auth/roles";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

const protectedRoutes = [
  { prefix: "/operator", loginPath: "/login/operator", role: "operator" },
  { prefix: "/student", loginPath: "/login/student", role: "student" },
] as const;

function redirectWithCookies(
  request: NextRequest,
  cookieResponse: NextResponse,
  pathname: string,
  notice?: "invalid-role",
) {
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = pathname;
  redirectUrl.search = notice ? `?notice=${notice}` : "";

  const redirectResponse = NextResponse.redirect(redirectUrl);
  cookieResponse.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie);
  });

  return redirectResponse;
}

export async function updateSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, publishableKey } = getSupabasePublicEnv();

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({ request });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data, error } = await supabase.auth.getClaims();
  const protectedRoute = protectedRoutes.find(({ prefix }) =>
    request.nextUrl.pathname.startsWith(prefix),
  );

  if (!protectedRoute) {
    return response;
  }

  if (error || !data?.claims) {
    return redirectWithCookies(request, response, protectedRoute.loginPath);
  }

  const role = getAppRoleFromClaims(data.claims);

  if (!role) {
    await supabase.auth.signOut();
    return redirectWithCookies(
      request,
      response,
      protectedRoute.loginPath,
      "invalid-role",
    );
  }

  if (role !== (protectedRoute.role as AppRole)) {
    return redirectWithCookies(request, response, ROLE_HOME_PATHS[role]);
  }

  return response;
}
