"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/dialog";

type CategoryLifecycleActionsProps = {
  archivedAt: string | null;
  archiveAction: () => Promise<void>;
  deleteAction: () => Promise<void>;
  dependencyCount: number;
};

export function CategoryLifecycleActions({
  archivedAt,
  archiveAction,
  deleteAction,
  dependencyCount,
}: CategoryLifecycleActionsProps) {
  const deleteFormRef = useRef<HTMLFormElement>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const canDeleteSafely = !archivedAt && dependencyCount === 0;
  const canArchive = !archivedAt;

  return (
    <>
      <div className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          {canArchive ? (
            <form action={archiveAction}>
              <Button type="submit" variant="secondary">
                Arquivar
              </Button>
            </form>
          ) : null}

          {canDeleteSafely ? (
            <form action={deleteAction} ref={deleteFormRef}>
              <Button
                onClick={() => setShowDeleteDialog(true)}
                type="button"
                variant="destructive"
              >
                Excluir permanentemente
              </Button>
            </form>
          ) : null}
        </div>

        {!canDeleteSafely ? (
          <p className="text-muted-foreground text-sm leading-6">
            Esta categoria possui vinculos preservados ou esta arquivada.
            Exclusao permanente fica indisponivel; use Arquivar para ocultar a
            categoria sem apagar historico.
          </p>
        ) : null}
      </div>

      <ConfirmationDialog
        confirmLabel="Excluir permanentemente"
        destructive
        onCancel={() => setShowDeleteDialog(false)}
        onConfirm={() => {
          setShowDeleteDialog(false);
          deleteFormRef.current?.requestSubmit();
        }}
        open={showDeleteDialog}
        title="Excluir permanentemente"
      >
        Esta categoria nao possui vinculos. A exclusao permanente e
        irreversivel.
      </ConfirmationDialog>
    </>
  );
}
