import "server-only";

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import type { AppRole, AuthenticatedActor } from "./authorization";
import { ensureProfileForUser, getCurrentProfile } from "./profile";
import { getLoginPath } from "./routes";
import { hasPublicSupabaseConfig } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function getAuthenticatedSession(nextPath = "/app") {
  if (!hasPublicSupabaseConfig()) {
    redirect(getLoginPath(nextPath));
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect(getLoginPath(nextPath));
  }

  await ensureProfileForUser(supabase, user);
  const profile = await getCurrentProfile(supabase, user);

  return { profile, supabase, user };
}

export async function getActorForUser(user: User): Promise<AuthenticatedActor> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .is("revoked_at", null);

  if (error) {
    throw new Error(error.message);
  }

  const roles = (data ?? [])
    .map((row) => row.role)
    .filter((role): role is AppRole => role === "admin" || role === "user");

  return {
    id: user.id,
    roles,
  };
}
