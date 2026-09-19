"use client";

import { useRef, useState } from "react";

import type { AccountWithBalance } from "@/domain/accounts";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/dialog";

type FormAction = (formData: FormData) => void | Promise<void>;

type AccountLifecycleActionsProps = {
  account: AccountWithBalance;
  archiveAction: FormAction;
  closeAction: FormAction;
  deleteAction: FormAction;
  reactivateAction: FormAction;
};

export function AccountLifecycleActions({
  account,
  archiveAction,
  closeAction,
  deleteAction,
  reactivateAction,
}: AccountLifecycleActionsProps) {
  const closeFormRef = useRef<HTMLFormElement>(null);
  const deleteFormRef = useRef<HTMLFormElement>(null);
  const [dialog, setDialog] = useState<"close" | "delete" | null>(null);
  const canDeleteSafely = account.dependencyCount === 0;
  const canArchive = account.status === "active";
  const canClose = account.status === "active" || account.status === "archived";
  const canReactivate = account.status === "archived";

  return (
    <>
      <div className="mt-5 grid gap-3">
        <div className="flex flex-wrap gap-2">
          {canArchive ? (
            <form action={archiveAction}>
              <Button type="submit" variant="secondary">
                Arquivar
              </Button>
            </form>
          ) : null}

          {canReactivate ? (
            <form action={reactivateAction}>
              <Button type="submit" variant="secondary">
                Reativar
              </Button>
            </form>
          ) : null}

          {canClose ? (
            <form action={closeAction} ref={closeFormRef}>
              <Button
                onClick={() => setDialog("close")}
                type="button"
                variant="secondary"
              >
                Encerrar
              </Button>
            </form>
          ) : null}

          {canDeleteSafely ? (
            <form action={deleteAction} ref={deleteFormRef}>
              <Button
                onClick={() => setDialog("delete")}
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
            Esta conta possui registros vinculados. Exclusao permanente fica
            indisponivel; use Arquivar quando quiser ocultar a conta sem apagar
            historico.
          </p>
        ) : null}
      </div>

      <ConfirmationDialog
        confirmLabel="Encerrar conta"
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          setDialog(null);
          closeFormRef.current?.requestSubmit();
        }}
        open={dialog === "close"}
        title="Encerrar conta"
      >
        A conta sera marcada como encerrada e ficara somente para leitura nesta
        fase.
      </ConfirmationDialog>

      <ConfirmationDialog
        confirmLabel="Excluir permanentemente"
        destructive
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          setDialog(null);
          deleteFormRef.current?.requestSubmit();
        }}
        open={dialog === "delete"}
        title="Excluir permanentemente"
      >
        Esta conta nao possui registros vinculados. A exclusao permanente e
        irreversivel.
      </ConfirmationDialog>
    </>
  );
}
