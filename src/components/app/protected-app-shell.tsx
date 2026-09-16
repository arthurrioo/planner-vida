import type React from "react";

import { AppShell } from "./app-shell";
import { getActorForUser, getAuthenticatedSession } from "@/lib/auth/session";

type ProtectedAppShellContext = Awaited<
  ReturnType<typeof getProtectedAppShellContext>
>;

type ProtectedAppShellProps = {
  children: React.ReactNode;
  nextPath: string;
};

export async function getProtectedAppShellContext(nextPath: string) {
  const { profile, user } = await getAuthenticatedSession(nextPath);
  const actor = await getActorForUser(user);
  const roleLabel = actor.roles.includes("admin") ? "Admin" : "User";

  return {
    profile,
    shellProps: {
      displayName: profile.display_name,
      email: profile.email,
      roleLabel,
    },
    user,
  };
}

export function AuthenticatedAppShell({
  children,
  context,
}: {
  children: React.ReactNode;
  context: ProtectedAppShellContext;
}) {
  return <AppShell {...context.shellProps}>{children}</AppShell>;
}

export async function ProtectedAppShell({
  children,
  nextPath,
}: ProtectedAppShellProps) {
  const context = await getProtectedAppShellContext(nextPath);

  return (
    <AuthenticatedAppShell context={context}>{children}</AuthenticatedAppShell>
  );
}
