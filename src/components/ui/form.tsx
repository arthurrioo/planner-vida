import type React from "react";

import { cn } from "@/lib/utils";

type FieldProps = React.LabelHTMLAttributes<HTMLLabelElement> & {
  error?: string;
  hint?: string;
  label: string;
};

export function Field({
  children,
  className,
  error,
  hint,
  label,
  ...props
}: FieldProps) {
  const describedBy = [
    hint ? `${props.htmlFor}-hint` : undefined,
    error ? `${props.htmlFor}-error` : undefined,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <label
      className={cn("grid gap-2 text-sm font-medium", className)}
      {...props}
    >
      <span>{label}</span>
      {children}
      {hint ? (
        <span
          className="text-muted-foreground text-xs leading-5"
          id={`${props.htmlFor}-hint`}
        >
          {hint}
        </span>
      ) : null}
      {error ? (
        <span
          className="text-danger text-xs font-semibold"
          id={`${props.htmlFor}-error`}
        >
          {error}
        </span>
      ) : null}
      {describedBy ? <span className="sr-only">{describedBy}</span> : null}
    </label>
  );
}

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  hasError?: boolean;
};

export function Input({ className, hasError, ...props }: InputProps) {
  return (
    <input
      aria-invalid={hasError || undefined}
      className={cn(
        "border-border bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-ring h-10 rounded-md border px-3 text-base transition-colors outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60",
        hasError && "border-danger focus-visible:ring-danger",
        className,
      )}
      {...props}
    />
  );
}
