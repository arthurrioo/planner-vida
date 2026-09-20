"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
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
  const disabled =
    transaction.status !== "posted" || transaction.originType !== "manual";

  return (
    <div className="border-border mt-5 grid gap-3 border-t pt-4">
      <form action={voidAction} className="grid gap-2">
        <Input
          disabled={disabled}
          name="reason"
          placeholder="Motivo da anulacao"
          required
        />
        <Button disabled={disabled} type="submit" variant="secondary">
          Anular
        </Button>
      </form>
      <form action={reverseAction} className="grid gap-2">
        <Input
          disabled={disabled}
          name="reason"
          placeholder="Motivo da reversao"
          required
        />
        <Button disabled={disabled} type="submit" variant="secondary">
          Reverter
        </Button>
      </form>
    </div>
  );
}
