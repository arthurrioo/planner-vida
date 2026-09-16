import type React from "react";

import { AppShell } from "@/components/app/app-shell";
import { getActorForUser, getAuthenticatedSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function ProtectedAppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { profile, user } = await getAuthenticatedSession("/app");
  const actor = await getActorForUser(user);
  const roleLabel = actor.roles.includes("admin") ? "Admin" : "User";

  return (
    <AppShell
      displayName={profile.display_name}
      email={profile.email}
      roleLabel={roleLabel}
    >
      {children}
    </AppShell>
  );
}
