"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/form";
import type { TransactionRecord } from "@/domain/transactions";

type TransactionLifecycleActionsProps = {
  reverseAction: (formData: FormData) => void | Promise<void>;
  transaction: TransactionRecord;
  voidAction: (formData: FormData) => void | Promise<void>;
};

export function TransactionLifecycleActions({
  reverseAction,
  transaction,
  voidAction,
}: TransactionLifecycleActionsProps) {
  const [confirmation, setConfirmation] = useState<"reverse" | "void" | null>(
    null,
  );
  const reverseFormRef = useRef<HTMLFormElement>(null);
  const voidFormRef = useRef<HTMLFormElement>(null);
  const disabled =
    transaction.status !== "posted" || transaction.originType !== "manual";

  function confirmLifecycleAction() {
    const form =
      confirmation === "void" ? voidFormRef.current : reverseFormRef.current;
    setConfirmation(null);
    form?.requestSubmit();
  }

  return (
    <div className="border-border mt-5 grid gap-3 border-t pt-4">
      <form action={voidAction} className="grid gap-2" ref={voidFormRef}>
        <Field htmlFor="void-reason" label="Motivo da anulacao">
          <Input disabled={disabled} id="void-reason" name="reason" required />
        </Field>
        <Button
          disabled={disabled}
          onClick={() => setConfirmation("void")}
          type="button"
          variant="secondary"
        >
          Anular
        </Button>
      </form>
      <form action={reverseAction} className="grid gap-2" ref={reverseFormRef}>
        <Field htmlFor="reverse-reason" label="Motivo do estorno">
          <Input
            disabled={disabled}
            id="reverse-reason"
            name="reason"
            required
          />
        </Field>
        <Button
          disabled={disabled}
          onClick={() => setConfirmation("reverse")}
          type="button"
          variant="secondary"
        >
          Estornar
        </Button>
      </form>
      <ConfirmationDialog
        confirmLabel={confirmation === "void" ? "Anular" : "Estornar"}
        destructive
        onCancel={() => setConfirmation(null)}
        onConfirm={confirmLifecycleAction}
        open={confirmation !== null}
        title={
          confirmation === "void" ? "Anular transacao" : "Estornar transacao"
        }
      >
        {confirmation === "void"
          ? "A anulacao cancela este lancamento sem criar uma nova transacao."
          : "O estorno cria uma linha de lineage com status revertido e marca a original como revertida."}
      </ConfirmationDialog>
    </div>
  );
}
