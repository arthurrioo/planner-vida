type PublicSupabaseConfig = {
  anonKey: string;
  url: string;
};

function getTrimmedEnv(name: string) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

export function getPublicSupabaseConfig(): PublicSupabaseConfig {
  const url = getTrimmedEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = getTrimmedEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (!url || !anonKey) {
    throw new Error(
      "Supabase auth is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  return { anonKey, url };
}

export function hasPublicSupabaseConfig() {
  return Boolean(
    getTrimmedEnv("NEXT_PUBLIC_SUPABASE_URL") &&
    getTrimmedEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  );
}

export function getAppUrl() {
  return getTrimmedEnv("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000";
}
