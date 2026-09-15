"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getPublicSupabaseConfig } from "./config";

export function createBrowserSupabaseClient() {
  const { anonKey, url } = getPublicSupabaseConfig();

  return createBrowserClient(url, anonKey);
}
