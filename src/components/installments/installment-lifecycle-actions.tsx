"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/form";
import type { InstallmentPlanRecord } from "@/domain/installments";

type InstallmentLifecycleActionsProps = {
  action: (formData: FormData) => void | Promise<void>;
  plan: InstallmentPlanRecord;
};

export function InstallmentLifecycleActions({
  action,
  plan,
}: InstallmentLifecycleActionsProps) {
  const [confirming, setConfirming] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const disabled = plan.status === "cancelled";

  return (
    <div className="border-border mt-5 border-t pt-4">
      <form action={action} className="grid gap-2" ref={formRef}>
        <Field
          htmlFor="installment-cancellation-reason"
          label="Motivo do cancelamento"
        >
          <Input
            disabled={disabled}
            id="installment-cancellation-reason"
            minLength={3}
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
          Cancelar parcelamento
        </Button>
      </form>
      <ConfirmationDialog
        confirmLabel="Cancelar"
        destructive
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          formRef.current?.requestSubmit();
        }}
        open={confirming}
        title="Cancelar parcelamento"
      >
        Parcelas futuras serao canceladas. Parcelas ja realizadas serao
        estornadas com lineage auditavel.
      </ConfirmationDialog>
    </div>
  );
}
