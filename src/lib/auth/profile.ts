import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";

export type PlannerProfile = {
  default_currency: string;
  default_timezone: string;
  display_name: string;
  email: string;
  id: string;
  last_login_at: string | null;
  locale: string;
};

export class AuthProfileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthProfileError";
  }
}

function getMetadataString(user: User, key: string) {
  const value = user.user_metadata?.[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

export function getProfileDefaultsFromUser(user: User) {
  if (!user.email) {
    throw new AuthProfileError("Planner Vida profiles require an auth email.");
  }

  const displayName =
    getMetadataString(user, "display_name") ??
    getMetadataString(user, "full_name") ??
    getMetadataString(user, "name") ??
    user.email;

  return {
    default_currency: "BRL",
    default_timezone: "America/Sao_Paulo",
    display_name: displayName,
    email: user.email,
    id: user.id,
    locale: "pt-BR",
  };
}

export async function ensureProfileForUser(
  supabase: SupabaseClient,
  user: User,
) {
  const defaults = getProfileDefaultsFromUser(user);
  const now = new Date().toISOString();

  const { data: existingProfile, error: selectError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (selectError) {
    throw new AuthProfileError(selectError.message);
  }

  if (!existingProfile) {
    const { error } = await supabase.from("profiles").insert({
      ...defaults,
      last_login_at: now,
    });

    if (error) {
      throw new AuthProfileError(error.message);
    }
  } else {
    const { error } = await supabase
      .from("profiles")
      .update({ last_login_at: now })
      .eq("id", user.id);

    if (error) {
      throw new AuthProfileError(error.message);
    }
  }

  const { data: role, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "user")
    .is("revoked_at", null)
    .maybeSingle();

  if (roleError) {
    throw new AuthProfileError(roleError.message);
  }

  if (!role) {
    throw new AuthProfileError("Authenticated user has no active user role.");
  }
}

export async function getCurrentProfile(supabase: SupabaseClient, user: User) {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id,email,display_name,default_currency,default_timezone,locale,last_login_at",
    )
    .eq("id", user.id)
    .single<PlannerProfile>();

  if (error) {
    throw new AuthProfileError(error.message);
  }

  return data;
}
