import { NextResponse, type NextRequest } from "next/server";
import { ensureProfileForUser } from "@/lib/auth/profile";
import { getSafeNextPath } from "@/lib/auth/routes";
import { hasPublicSupabaseConfig } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = getSafeNextPath(requestUrl.searchParams.get("next"));

  if (!hasPublicSupabaseConfig()) {
    return NextResponse.redirect(
      new URL(
        "/login?error=Autentica%C3%A7%C3%A3o%20indispon%C3%ADvel",
        request.url,
      ),
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL(
        "/login?error=Link%20de%20autentica%C3%A7%C3%A3o%20inv%C3%A1lido",
        request.url,
      ),
    );
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(
      new URL("/login?error=Falha%20ao%20confirmar%20sess%C3%A3o", request.url),
    );
  }

  await ensureProfileForUser(supabase, data.user);

  return NextResponse.redirect(new URL(nextPath, request.url));
}
