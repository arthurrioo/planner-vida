import { redactSensitivePayload } from "./redaction";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type StructuredLogEvent = Readonly<{
  level: LogLevel;
  message: string;
  context: string;
  occurredAt: string;
  requestId?: string;
  userId?: string;
  metadata?: unknown;
}>;

export type Logger = Readonly<{
  emit(event: StructuredLogEvent): void;
}>;

export function createStructuredLogEvent(
  event: Omit<StructuredLogEvent, "metadata"> & { metadata?: unknown },
): StructuredLogEvent {
  return {
    ...event,
    metadata:
      event.metadata === undefined
        ? undefined
        : redactSensitivePayload(event.metadata),
  };
}
