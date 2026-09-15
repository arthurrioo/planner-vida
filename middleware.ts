import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasPublicSupabaseConfig } from "@/lib/supabase/config";
import { getLoginPath, isAuthPath, isProtectedPath } from "@/lib/auth/routes";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });
  const { pathname } = request.nextUrl;

  if (!hasPublicSupabaseConfig()) {
    if (isProtectedPath(pathname)) {
      return NextResponse.redirect(
        new URL(getLoginPath(pathname), request.url),
      );
    }

    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }

          response = NextResponse.next({
            request,
          });

          for (const { name, options, value } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && isProtectedPath(pathname)) {
    return NextResponse.redirect(new URL(getLoginPath(pathname), request.url));
  }

  if (user && isAuthPath(pathname)) {
    return NextResponse.redirect(new URL("/app", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/", "/app/:path*", "/login", "/signup", "/recover"],
};
