"use client";

import type React from "react";
import { useEffect, useId, useRef } from "react";

import { Button } from "./button";
import { cn } from "@/lib/utils";

type ConfirmationDialogProps = {
  cancelLabel?: string;
  children: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  onCancel?: () => void;
  onConfirm?: () => void;
  open: boolean;
  title: string;
};

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function ConfirmationDialog({
  cancelLabel = "Cancelar",
  children,
  confirmLabel,
  destructive = false,
  onCancel,
  onConfirm,
  open,
  title,
}: ConfirmationDialogProps) {
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusableElements = getFocusableElements(dialogRef.current);
    focusableElements[0]?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [open]);

  if (!open) {
    return null;
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel?.();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusableElements = getFocusableElements(dialogRef.current);

    if (focusableElements.length === 0) {
      event.preventDefault();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  return (
    <div
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      aria-modal="true"
      className="bg-foreground/20 fixed inset-0 z-40 grid place-items-center p-4"
      onKeyDown={handleKeyDown}
      role="dialog"
    >
      <section
        className="border-border bg-background grid w-full max-w-md gap-4 rounded-lg border p-4 shadow-lg"
        ref={dialogRef}
      >
        <div className="grid gap-2">
          <h2 className="text-foreground text-lg font-semibold" id={titleId}>
            {title}
          </h2>
          <div
            className="text-muted-foreground text-sm leading-6"
            id={descriptionId}
          >
            {children}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button onClick={onCancel} variant="secondary">
            {cancelLabel}
          </Button>
          <Button
            className={cn(destructive && "bg-danger text-danger-foreground")}
            onClick={onConfirm}
            variant={destructive ? "destructive" : "default"}
          >
            {confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}

function getFocusableElements(container: HTMLElement | null) {
  if (!container) {
    return [];
  }

  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector));
}
