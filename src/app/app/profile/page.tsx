import { updateProfileAction } from "@/app/auth/actions";
import { AuthFormMessage } from "@/components/auth/auth-form-message";
import { getAuthenticatedSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type ProfilePageProps = {
  searchParams: Promise<{
    error?: string;
    message?: string;
  }>;
};

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  const params = await searchParams;
  const { profile } = await getAuthenticatedSession("/app/profile");

  return (
    <main className="min-h-dvh px-6 py-8 sm:px-10 lg:px-12">
      <section className="mx-auto grid w-full max-w-2xl gap-8">
        <header className="border-border border-b pb-5">
          <p className="text-muted-foreground text-sm font-medium">
            Planner Vida
          </p>
          <h1 className="text-foreground mt-2 text-3xl font-semibold">
            Perfil
          </h1>
        </header>

        <AuthFormMessage error={params.error} message={params.message} />

        <form action={updateProfileAction} className="grid gap-4">
          <label className="grid gap-2 text-sm font-medium">
            Nome
            <input
              className="border-border rounded-md border bg-transparent px-3 py-2 text-base font-normal"
              defaultValue={profile.display_name}
              name="displayName"
              required
              type="text"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Fuso horário
            <input
              className="border-border rounded-md border bg-transparent px-3 py-2 text-base font-normal"
              defaultValue={profile.default_timezone}
              name="defaultTimezone"
              required
              type="text"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Idioma
            <input
              className="border-border rounded-md border bg-transparent px-3 py-2 text-base font-normal"
              defaultValue={profile.locale}
              name="locale"
              required
              type="text"
            />
          </label>
          <button
            className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-semibold"
            type="submit"
          >
            Salvar
          </button>
        </form>
      </section>
    </main>
  );
}
