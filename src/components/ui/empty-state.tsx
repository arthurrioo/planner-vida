import type React from "react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  action?: React.ReactNode;
  className?: string;
  description: string;
  title: string;
};

export function EmptyState({
  action,
  className,
  description,
  title,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "border-border bg-muted/45 grid min-h-40 place-items-center rounded-md border border-dashed p-6 text-center",
        className,
      )}
    >
      <div className="grid max-w-md gap-2">
        <h2 className="text-foreground text-base font-semibold">{title}</h2>
        <p className="text-muted-foreground text-sm leading-6">{description}</p>
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
    </div>
  );
}

export function LoadingState({ label = "Carregando" }: { label?: string }) {
  return (
    <div
      aria-live="polite"
      className="border-border bg-surface text-muted-foreground flex min-h-32 items-center justify-center rounded-md border p-6 text-sm font-medium"
      role="status"
    >
      {label}
    </div>
  );
}

export function ErrorState({
  description,
  title = "Nao foi possivel carregar",
}: {
  description: string;
  title?: string;
}) {
  return (
    <div
      className="border-danger/35 bg-danger-muted rounded-md border p-4"
      role="alert"
    >
      <h2 className="text-danger text-sm font-semibold">{title}</h2>
      <p className="text-danger mt-1 text-sm leading-6">{description}</p>
    </div>
  );
}
