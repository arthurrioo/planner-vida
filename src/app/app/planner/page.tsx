import { ModulePage } from "@/components/app/module-page";
import { ProtectedAppShell } from "@/components/app/protected-app-shell";

export default function PlannerPage() {
  return (
    <ProtectedAppShell nextPath="/app/planner">
      <ModulePage
        description="Area de tarefas e planejamento pessoal. As regras e entidades de planner entram no milestone funcional proprio."
        eyebrow="Planejamento"
        title="Planner"
      />
    </ProtectedAppShell>
  );
}
