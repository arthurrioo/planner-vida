import type React from "react";
import Link from "next/link";
import { AuthFormMessage } from "./auth-form-message";
import { hasPublicSupabaseConfig } from "@/lib/supabase/config";

type AuthShellProps = {
  children: React.ReactNode;
  error?: string | string[];
  message?: string | string[];
  title: string;
};

export function AuthShell({ children, error, message, title }: AuthShellProps) {
  const isConfigured = hasPublicSupabaseConfig();

  return (
    <main className="bg-muted flex min-h-dvh items-center justify-center px-6 py-10">
      <section className="border-border bg-background grid w-full max-w-md gap-6 rounded-lg border p-6 shadow-sm">
        <header className="grid gap-2">
          <Link className="text-primary text-sm font-semibold" href="/">
            Planner Vida
          </Link>
          <h1 className="text-foreground text-2xl font-semibold">{title}</h1>
        </header>

        {!isConfigured ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Autenticação indisponível neste ambiente.
          </p>
        ) : (
          <>
            <AuthFormMessage error={error} message={message} />
            {children}
          </>
        )}
      </section>
    </main>
  );
}
