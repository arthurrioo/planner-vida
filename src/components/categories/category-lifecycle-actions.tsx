import { Button } from "@/components/ui/button";

type CategoryLifecycleActionsProps = {
  archivedAt: string | null;
  archiveAction: () => Promise<void>;
  deleteOrArchiveAction: () => Promise<void>;
  dependencyCount: number;
};

export function CategoryLifecycleActions({
  archivedAt,
  archiveAction,
  deleteOrArchiveAction,
  dependencyCount,
}: CategoryLifecycleActionsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <form action={archiveAction}>
        <Button
          disabled={Boolean(archivedAt)}
          type="submit"
          variant="secondary"
        >
          Arquivar
        </Button>
      </form>
      <form action={deleteOrArchiveAction}>
        <Button type="submit" variant="destructive">
          {dependencyCount > 0 ? "Arquivar por vinculo" : "Excluir"}
        </Button>
      </form>
    </div>
  );
}
