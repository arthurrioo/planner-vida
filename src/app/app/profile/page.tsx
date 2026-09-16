import { updateProfileAction } from "@/app/auth/actions";
import { AuthFormMessage } from "@/components/auth/auth-form-message";
import { ModulePage } from "@/components/app/module-page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
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
    <ModulePage
      description="Preferencias basicas do usuario autenticado preservadas pela camada de Auth/RLS congelada na M04."
      eyebrow="Configuracoes"
      title="Perfil"
    >
      <Card className="max-w-2xl">
        <CardContent className="grid gap-5 pt-4">
          <AuthFormMessage error={params.error} message={params.message} />

          <form action={updateProfileAction} className="grid gap-4">
            <Field htmlFor="displayName" label="Nome">
              <Input
                defaultValue={profile.display_name}
                id="displayName"
                name="displayName"
                required
                type="text"
              />
            </Field>
            <Field htmlFor="defaultTimezone" label="Fuso horario">
              <Input
                defaultValue={profile.default_timezone}
                id="defaultTimezone"
                name="defaultTimezone"
                required
                type="text"
              />
            </Field>
            <Field htmlFor="locale" label="Idioma">
              <Input
                defaultValue={profile.locale}
                id="locale"
                name="locale"
                required
                type="text"
              />
            </Field>
            <Field htmlFor="currency" label="Moeda">
              <Input
                disabled
                id="currency"
                type="text"
                value={profile.default_currency}
              />
            </Field>
            <Button className="justify-self-start" type="submit">
              Salvar
            </Button>
          </form>
        </CardContent>
      </Card>
    </ModulePage>
  );
}
