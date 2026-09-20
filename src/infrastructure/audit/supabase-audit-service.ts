import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  DomainError,
  type AuditEvent,
  type AuditService,
} from "@/domain/shared";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";

type AuditLogRow = Readonly<{
  action: string;
  actor_role: string;
  actor_user_id: string;
  correlation_id: string | null;
  metadata: Record<string, unknown>;
  resource_id: string | null;
  resource_type: string;
  severity: string;
  user_id: string;
}>;

export class SupabasePrivilegedAuditService implements AuditService {
  private client: SupabaseClient | null = null;

  async record(event: AuditEvent) {
    const { error } = await this.getClient()
      .from("audit_logs")
      .insert(toAuditLogRow(event));

    if (error) {
      throw mapAuditWriteError(error);
    }
  }

  private getClient() {
    if (!this.client) {
      const { url } = getPublicSupabaseConfig();
      const serviceRoleKey = getServiceRoleKey();
      this.client = createClient(url, serviceRoleKey, {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
      });
    }

    return this.client;
  }
}

function getServiceRoleKey() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!serviceRoleKey) {
    throw new Error(
      "Supabase service role is not configured for server audit writes.",
    );
  }

  return serviceRoleKey;
}

function toAuditLogRow(event: AuditEvent): AuditLogRow {
  const requestId =
    typeof event.metadata?.requestId === "string"
      ? event.metadata.requestId
      : null;

  return {
    action: event.action,
    actor_role: event.actor.role ?? "user",
    actor_user_id: event.actor.userId,
    correlation_id: requestId,
    metadata: event.metadata ?? {},
    resource_id: event.entity?.id ?? null,
    resource_type: event.entity?.type ?? "unknown",
    severity: event.severity,
    user_id: event.entity?.ownerUserId ?? event.actor.userId,
  };
}

function mapAuditWriteError(error: { code?: string; message: string }) {
  return new DomainError("EXTERNAL_SERVICE_FAILED", "Audit write failed.", {
    details: {
      source: "audit_logs",
      supabaseCode: error.code ?? "unknown",
    },
  });
}
