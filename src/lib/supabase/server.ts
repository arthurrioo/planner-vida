import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicSupabaseConfig } from "./config";

export async function createServerSupabaseClient() {
  const { anonKey, url } = getPublicSupabaseConfig();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, options, value } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components can read session cookies but cannot always write
          // refreshed cookies. Middleware and Server Actions perform writes.
        }
      },
    },
  });
}
