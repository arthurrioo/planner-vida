import Link from "next/link";
import { requestPasswordRecoveryAction } from "@/app/auth/actions";
import { AuthShell } from "@/components/auth/auth-shell";

type RecoverPageProps = {
  searchParams: Promise<{
    error?: string;
    message?: string;
  }>;
};

export default async function RecoverPage({ searchParams }: RecoverPageProps) {
  const params = await searchParams;

  return (
    <AuthShell
      error={params.error}
      message={params.message}
      title="Recuperar senha"
    >
      <form action={requestPasswordRecoveryAction} className="grid gap-4">
        <label className="grid gap-2 text-sm font-medium">
          Email
          <input
            className="border-border rounded-md border bg-transparent px-3 py-2 text-base font-normal"
            name="email"
            required
            type="email"
          />
        </label>
        <button
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-semibold"
          type="submit"
        >
          Enviar link
        </button>
      </form>

      <Link className="text-primary text-sm font-medium" href="/login">
        Voltar ao login
      </Link>
    </AuthShell>
  );
}
