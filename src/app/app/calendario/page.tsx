import { ModulePage } from "@/components/app/module-page";
import { ProtectedAppShell } from "@/components/app/protected-app-shell";

export default function CalendarioPage() {
  return (
    <ProtectedAppShell nextPath="/app/calendario">
      <ModulePage
        description="Agenda central para eventos, vencimentos e compromissos. A M05 entrega somente o ponto de montagem visual e responsivo."
        eyebrow="Agenda"
        title="Calendario"
      />
    </ProtectedAppShell>
  );
}
