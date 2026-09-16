import { ModulePage } from "@/components/app/module-page";
import { ProtectedAppShell } from "@/components/app/protected-app-shell";

export default function FinanceiroPage() {
  return (
    <ProtectedAppShell nextPath="/app/financeiro">
      <ModulePage
        description="Entrada do bloco financeiro AFR-compatible, ainda sem operacoes de dominio nesta M05."
        eyebrow="Controle financeiro"
        title="Financeiro"
      />
    </ProtectedAppShell>
  );
}
