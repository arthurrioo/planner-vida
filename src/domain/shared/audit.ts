import type { AuditSeverity, OriginType } from "./enums";
import { redactSensitivePayload } from "./redaction";

export type AuditActor = Readonly<{
  userId: string;
  role?: "user" | "admin" | "system";
}>;

export type AuditEvent = Readonly<{
  action: string;
  actor: AuditActor;
  severity: AuditSeverity;
  occurredAt: string;
  originType?: OriginType;
  entity?: Readonly<{
    type: string;
    id?: string;
    ownerUserId?: string;
  }>;
  metadata?: Record<string, unknown>;
}>;

export type AuditService = Readonly<{
  record(event: AuditEvent): Promise<void>;
}>;

export function createAuditEvent(
  event: Omit<AuditEvent, "metadata"> & {
    metadata?: Record<string, unknown>;
  },
): AuditEvent {
  return {
    ...event,
    metadata: event.metadata
      ? (redactSensitivePayload(event.metadata) as Record<string, unknown>)
      : undefined,
  };
}
