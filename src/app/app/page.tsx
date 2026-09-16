import Link from "next/link";
import { signOutAction } from "@/app/auth/actions";
import { getActorForUser, getAuthenticatedSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AppHomePage() {
  const { profile, user } = await getAuthenticatedSession("/app");
  const actor = await getActorForUser(user);
  const roleLabel = actor.roles.includes("admin") ? "Admin" : "User";

  return (
    <main className="min-h-dvh px-6 py-8 sm:px-10 lg:px-12">
      <section className="mx-auto grid w-full max-w-5xl gap-8">
        <header className="border-border flex flex-wrap items-center justify-between gap-4 border-b pb-5">
          <div>
            <p className="text-muted-foreground text-sm font-medium">
              Planner Vida
            </p>
            <h1 className="text-foreground mt-2 text-3xl font-semibold">
              {profile.display_name}
            </h1>
          </div>
          <form action={signOutAction}>
            <button
              className="border-border rounded-md border px-4 py-2 text-sm font-semibold"
              type="submit"
            >
              Sair
            </button>
          </form>
        </header>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="border-border rounded-lg border p-4">
            <p className="text-muted-foreground text-sm">Email</p>
            <p className="mt-2 font-medium break-words">{profile.email}</p>
          </div>
          <div className="border-border rounded-lg border p-4">
            <p className="text-muted-foreground text-sm">Perfil</p>
            <p className="mt-2 font-medium">{roleLabel}</p>
          </div>
          <div className="border-border rounded-lg border p-4">
            <p className="text-muted-foreground text-sm">Moeda</p>
            <p className="mt-2 font-medium">{profile.default_currency}</p>
          </div>
        </div>

        <nav className="border-border flex flex-wrap gap-3 border-t pt-5">
          <Link
            className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-semibold"
            href="/app/profile"
          >
            Perfil
          </Link>
        </nav>
      </section>
    </main>
  );
}
