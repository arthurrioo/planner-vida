import Link from "next/link";
import { signInAction } from "@/app/auth/actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { getSafeNextPath } from "@/lib/auth/routes";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    message?: string;
    next?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextPath = getSafeNextPath(params.next ?? null);

  return (
    <AuthShell error={params.error} message={params.message} title="Entrar">
      <form action={signInAction} className="grid gap-4">
        <input name="next" type="hidden" value={nextPath} />
        <label className="grid gap-2 text-sm font-medium">
          Email
          <input
            className="border-border rounded-md border bg-transparent px-3 py-2 text-base font-normal"
            name="email"
            required
            type="email"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Senha
          <input
            className="border-border rounded-md border bg-transparent px-3 py-2 text-base font-normal"
            minLength={8}
            name="password"
            required
            type="password"
          />
        </label>
        <button
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-semibold"
          type="submit"
        >
          Entrar
        </button>
      </form>

      <footer className="text-muted-foreground flex flex-wrap justify-between gap-3 text-sm">
        <Link className="text-primary font-medium" href="/signup">
          Criar conta
        </Link>
        <Link className="text-primary font-medium" href="/recover">
          Recuperar senha
        </Link>
      </footer>
    </AuthShell>
  );
}
