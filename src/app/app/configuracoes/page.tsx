import Link from "next/link";

import { ModulePage } from "@/components/app/module-page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ConfiguracoesPage() {
  return (
    <ModulePage
      description="Preferencias e configuracoes da conta autenticada, mantendo a visibilidade individual definida na M04."
      eyebrow="Conta"
      title="Configuracoes"
    >
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Conta</CardTitle>
        </CardHeader>
        <CardContent>
          <Link
            className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex rounded-md px-4 py-2 text-sm font-semibold transition-colors outline-none focus-visible:ring-2"
            href="/app/profile"
          >
            Editar perfil
          </Link>
        </CardContent>
      </Card>
    </ModulePage>
  );
}
