import { updatePasswordAction } from "@/app/auth/actions";
import { AuthShell } from "@/components/auth/auth-shell";

type ResetPasswordPageProps = {
  searchParams: Promise<{
    error?: string;
    message?: string;
  }>;
};

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const params = await searchParams;

  return (
    <AuthShell error={params.error} message={params.message} title="Nova senha">
      <form action={updatePasswordAction} className="grid gap-4">
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
          Atualizar senha
        </button>
      </form>
    </AuthShell>
  );
}
