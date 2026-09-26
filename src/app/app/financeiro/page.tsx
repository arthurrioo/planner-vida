import Link from "next/link";

import { ModulePage } from "@/components/app/module-page";
import { ProtectedAppShell } from "@/components/app/protected-app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function FinanceiroPage() {
  return (
    <ProtectedAppShell nextPath="/app/financeiro">
      <ModulePage
        description="Entrada do bloco financeiro AFR-compatible, usando contas como base de saldo calculado."
        eyebrow="Controle financeiro"
        title="Financeiro"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Contas</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4 text-sm leading-6">
                Cadastre contas, saldos iniciais, limites e status sem criar
                saldo atual mutavel.
              </p>
              <Link
                className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium"
                href="/app/financeiro/contas"
              >
                Abrir contas
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Categorias</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4 text-sm leading-6">
                Organize receitas, despesas, investimentos e transferencias em
                categorias e subcategorias canonicas.
              </p>
              <Link
                className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium"
                href="/app/financeiro/categorias"
              >
                Abrir categorias
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Transacoes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4 text-sm leading-6">
                Registre fatos financeiros realizados com conta, categoria,
                competencia e reversao auditavel.
              </p>
              <Link
                className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium"
                href="/app/financeiro/transacoes"
              >
                Abrir transacoes
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Extrato</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4 text-sm leading-6">
                Revise o historico financeiro realizado com filtros, contexto de
                conta/cartao e saldos calculados.
              </p>
              <Link
                className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium"
                href="/app/financeiro/extrato"
              >
                Abrir extrato
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Transferencias</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4 text-sm leading-6">
                Movimente saldo entre contas proprias com criacao atomica e
                exclusao de P&L.
              </p>
              <Link
                className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium"
                href="/app/financeiro/transferencias"
              >
                Abrir transferencias
              </Link>
            </CardContent>
          </Card>
        </div>
      </ModulePage>
    </ProtectedAppShell>
  );
}
