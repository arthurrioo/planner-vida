import Link from "next/link";
import { signUpAction } from "@/app/auth/actions";
import { AuthShell } from "@/components/auth/auth-shell";

type SignupPageProps = {
  searchParams: Promise<{
    error?: string;
    message?: string;
  }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams;

  return (
    <AuthShell
      error={params.error}
      message={params.message}
      title="Criar conta"
    >
      <form action={signUpAction} className="grid gap-4">
        <label className="grid gap-2 text-sm font-medium">
          Nome
          <input
            className="border-border rounded-md border bg-transparent px-3 py-2 text-base font-normal"
            name="displayName"
            required
            type="text"
          />
        </label>
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
          Criar conta
        </button>
      </form>

      <p className="text-muted-foreground text-sm">
        Já tem conta?{" "}
        <Link className="text-primary font-medium" href="/login">
          Entrar
        </Link>
      </p>
    </AuthShell>
  );
}
