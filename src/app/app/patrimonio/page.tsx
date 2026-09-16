import { ModulePage } from "@/components/app/module-page";
import { ProtectedAppShell } from "@/components/app/protected-app-shell";

export default function PatrimonioPage() {
  return (
    <ProtectedAppShell nextPath="/app/patrimonio">
      <ModulePage
        description="Superficie inicial para patrimonio, ativos e posicao financeira, sem calculos ou persistencia nesta M05."
        eyebrow="Patrimonio"
        title="Patrimonio"
      />
    </ProtectedAppShell>
  );
}
