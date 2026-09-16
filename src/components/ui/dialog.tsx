import type React from "react";

import { Button } from "./button";
import { cn } from "@/lib/utils";

type ConfirmationDialogProps = {
  cancelLabel?: string;
  children: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  open: boolean;
  title: string;
};

export function ConfirmationDialog({
  cancelLabel = "Cancelar",
  children,
  confirmLabel,
  destructive = false,
  open,
  title,
}: ConfirmationDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      aria-labelledby="confirmation-dialog-title"
      aria-modal="true"
      className="bg-foreground/20 fixed inset-0 z-40 grid place-items-center p-4"
      role="dialog"
    >
      <section className="border-border bg-background grid w-full max-w-md gap-4 rounded-lg border p-4 shadow-lg">
        <div className="grid gap-2">
          <h2
            className="text-foreground text-lg font-semibold"
            id="confirmation-dialog-title"
          >
            {title}
          </h2>
          <div className="text-muted-foreground text-sm leading-6">
            {children}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary">{cancelLabel}</Button>
          <Button
            className={cn(destructive && "bg-danger text-danger-foreground")}
            variant={destructive ? "destructive" : "default"}
          >
            {confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}
