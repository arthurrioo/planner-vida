import { ModulePage } from "@/components/app/module-page";
import { ProtectedAppShell } from "@/components/app/protected-app-shell";

export default function ComprasPage() {
  return (
    <ProtectedAppShell nextPath="/app/compras">
      <ModulePage
        description="Area para listas de compras e desejos. Esta tela preserva o destino de navegacao sem antecipar regras de shopping/wishlist."
        eyebrow="Compras"
        title="Compras"
      />
    </ProtectedAppShell>
  );
}
