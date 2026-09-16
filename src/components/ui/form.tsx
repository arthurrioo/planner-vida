import type React from "react";
import { Children, cloneElement, isValidElement } from "react";

import { cn } from "@/lib/utils";

type FieldProps = React.LabelHTMLAttributes<HTMLLabelElement> & {
  error?: string;
  hint?: string;
  label: string;
};

type DescribedFieldChildProps = {
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "false" | "true";
  id?: string;
};

function mergeDescribedBy(current: string | undefined, next: string) {
  return Array.from(
    new Set([current, next].filter(Boolean).join(" ").split(" ")),
  )
    .filter(Boolean)
    .join(" ");
}

export function Field({
  children,
  className,
  error,
  hint,
  label,
  ...props
}: FieldProps) {
  const { htmlFor, ...labelProps } = props;
  const describedBy = [
    htmlFor && hint ? `${htmlFor}-hint` : undefined,
    htmlFor && error ? `${htmlFor}-error` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
  const enhancedChildren = describedBy
    ? Children.map(children, (child) => {
        if (!isValidElement<DescribedFieldChildProps>(child)) {
          return child;
        }

        const childProps: DescribedFieldChildProps = {
          "aria-describedby": mergeDescribedBy(
            child.props["aria-describedby"],
            describedBy,
          ),
        };

        if (error && child.props["aria-invalid"] === undefined) {
          childProps["aria-invalid"] = true;
        }

        return cloneElement(child, childProps);
      })
    : children;

  return (
    <div className={cn("grid gap-2 text-sm font-medium", className)}>
      <label htmlFor={htmlFor} {...labelProps}>
        {label}
      </label>
      {enhancedChildren}
      {hint ? (
        <span
          className="text-muted-foreground text-xs leading-5"
          id={htmlFor ? `${htmlFor}-hint` : undefined}
        >
          {hint}
        </span>
      ) : null}
      {error ? (
        <span
          className="text-danger text-xs font-semibold"
          id={htmlFor ? `${htmlFor}-error` : undefined}
        >
          {error}
        </span>
      ) : null}
    </div>
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
