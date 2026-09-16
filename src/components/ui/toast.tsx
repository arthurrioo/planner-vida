import { cn } from "@/lib/utils";

export type ToastMessage = {
  description?: string;
  id: string;
  title: string;
  tone?: "success" | "warning" | "error" | "info";
};

const toneClasses = {
  error: "border-danger/45 bg-danger-muted text-danger",
  info: "border-border bg-surface text-foreground",
  success: "border-success/45 bg-success-muted text-success",
  warning: "border-warning/45 bg-warning-muted text-warning",
};

export function ToastViewport({ messages }: { messages: ToastMessage[] }) {
  return (
    <section
      aria-label="Notificacoes"
      aria-live="polite"
      className="fixed top-4 right-4 z-50 grid w-[min(24rem,calc(100vw-2rem))] gap-2"
    >
      {messages.map((message) => (
        <article
          className={cn(
            "rounded-md border p-3 shadow-sm",
            toneClasses[message.tone ?? "info"],
          )}
          key={message.id}
        >
          <h2 className="text-sm font-semibold">{message.title}</h2>
          {message.description ? (
            <p className="mt-1 text-sm leading-5">{message.description}</p>
          ) : null}
        </article>
      ))}
    </section>
  );
}
