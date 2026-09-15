"use server";

import { redirect } from "next/navigation";
import { ensureProfileForUser } from "@/lib/auth/profile";
import { getSafeNextPath } from "@/lib/auth/routes";
import { getAppUrl } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function redirectWithMessage(
  path: string,
  type: "error" | "message",
  message: string,
): never {
  const params = new URLSearchParams();
  params.set(type, message);
  redirect(`${path}?${params.toString()}`);
}

function validateEmailAndPassword(email: string, password: string) {
  if (!email || !email.includes("@")) {
    return "Informe um email válido.";
  }

  if (password.length < 8) {
    return "A senha precisa ter pelo menos 8 caracteres.";
  }

  return null;
}

export async function signUpAction(formData: FormData) {
  const email = getFormString(formData, "email").toLowerCase();
  const password = getFormString(formData, "password");
  const displayName = getFormString(formData, "displayName");
  const validationError = validateEmailAndPassword(email, password);

  if (validationError) {
    redirectWithMessage("/signup", "error", validationError);
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    options: {
      data: displayName ? { display_name: displayName } : undefined,
    },
    password,
  });

  if (error) {
    redirectWithMessage("/signup", "error", error.message);
  }

  if (data.user && data.session) {
    await ensureProfileForUser(supabase, data.user);
    redirect("/app");
  }

  redirectWithMessage(
    "/login",
    "message",
    "Verifique seu email para concluir o cadastro.",
  );
}

export async function signInAction(formData: FormData) {
  const email = getFormString(formData, "email").toLowerCase();
  const password = getFormString(formData, "password");
  const nextPath = getSafeNextPath(formData.get("next"));
  const validationError = validateEmailAndPassword(email, password);

  if (validationError) {
    redirectWithMessage("/login", "error", validationError);
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    redirectWithMessage("/login", "error", error?.message ?? "Login inválido.");
  }

  await ensureProfileForUser(supabase, data.user);
  redirect(nextPath);
}

export async function signOutAction() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirectWithMessage("/login", "message", "Sessão encerrada.");
}

export async function requestPasswordRecoveryAction(formData: FormData) {
  const email = getFormString(formData, "email").toLowerCase();

  if (!email || !email.includes("@")) {
    redirectWithMessage("/recover", "error", "Informe um email válido.");
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${getAppUrl()}/auth/callback?next=/auth/reset`,
  });

  if (error) {
    redirectWithMessage("/recover", "error", error.message);
  }

  redirectWithMessage(
    "/login",
    "message",
    "Enviamos o link de recuperação para seu email.",
  );
}

export async function updatePasswordAction(formData: FormData) {
  const password = getFormString(formData, "password");

  if (password.length < 8) {
    redirectWithMessage(
      "/auth/reset",
      "error",
      "A senha precisa ter pelo menos 8 caracteres.",
    );
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirectWithMessage("/auth/reset", "error", error.message);
  }

  redirect("/app");
}

export async function updateProfileAction(formData: FormData) {
  const displayName = getFormString(formData, "displayName");
  const defaultTimezone =
    getFormString(formData, "defaultTimezone") || "America/Sao_Paulo";
  const locale = getFormString(formData, "locale") || "pt-BR";

  if (!displayName) {
    redirectWithMessage(
      "/app/profile",
      "error",
      "Informe um nome de exibição.",
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login?next=/app/profile");
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      default_timezone: defaultTimezone,
      display_name: displayName,
      locale,
    })
    .eq("id", user.id);

  if (error) {
    redirectWithMessage("/app/profile", "error", error.message);
  }

  redirectWithMessage("/app/profile", "message", "Perfil atualizado.");
}
