import { ModulePage } from "@/components/app/module-page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatBRL, formatDateBR } from "@/lib/ui/formatters";

export default async function AppHomePage() {
  return (
    <ModulePage
      description="Centro operacional mobile-first para o dia. Nesta M05, a tela estabelece o shell e os estados de montagem; conteudo financeiro real entra nos milestones funcionais."
      eyebrow="Home"
      title="Hoje"
    >
      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Resumo do dia</CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              description={`Estados, listas e cards ja usam o padrao visual da M05. Exemplo de formatacao: ${formatDateBR("2026-09-15")} e ${formatBRL("1234.56")}.`}
              title="Sem eventos sinteticos carregados"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Pronto para proximos milestones</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm leading-6">
              O conteudo desta area permanece sem regra financeira ate a entrada
              dos modulos canonicos de financeiro, planner e calendario.
            </p>
          </CardContent>
        </Card>
      </div>
    </ModulePage>
  );
}
