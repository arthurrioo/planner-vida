import { ModulePage } from "@/components/app/module-page";
import { ProtectedAppShell } from "@/components/app/protected-app-shell";

export default function RecorrentesPage() {
  return (
    <ProtectedAppShell nextPath="/app/recorrentes">
      <ModulePage
        description="Ponto de entrada para assinaturas, rotinas e recorrencias. A M05 entrega navegacao, shell e estado vazio."
        eyebrow="Rotinas"
        title="Recorrentes"
      />
    </ProtectedAppShell>
  );
}
