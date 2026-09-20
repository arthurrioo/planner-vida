"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/form";
import type { TransferRecord } from "@/domain/transfers";

type TransferLifecycleActionsProps = {
  reverseAction: (formData: FormData) => void | Promise<void>;
  transfer: TransferRecord;
};

export function TransferLifecycleActions({
  reverseAction,
  transfer,
}: TransferLifecycleActionsProps) {
  const [confirming, setConfirming] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const disabled =
    transfer.status !== "posted" || transfer.originType !== "manual";

  function confirmLifecycleAction() {
    setConfirming(false);
    formRef.current?.requestSubmit();
  }

  return (
    <div className="border-border mt-5 grid gap-3 border-t pt-4">
      <form action={reverseAction} className="grid gap-2" ref={formRef}>
        <Field htmlFor="transfer-reverse-reason" label="Motivo do estorno">
          <Input
            disabled={disabled}
            id="transfer-reverse-reason"
            name="reason"
            required
          />
        </Field>
        <Button
          disabled={disabled}
          onClick={() => setConfirming(true)}
          type="button"
          variant="secondary"
        >
          Estornar transferencia
        </Button>
      </form>
      <ConfirmationDialog
        confirmLabel="Estornar"
        destructive
        onCancel={() => setConfirming(false)}
        onConfirm={confirmLifecycleAction}
        open={confirming}
        title="Estornar transferencia"
      >
        O estorno remove o impacto de saldo da transferencia original e registra
        linhas de lineage para auditoria.
      </ConfirmationDialog>
    </div>
  );
}
