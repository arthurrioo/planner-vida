import { describe, expect, it } from "vitest";

import {
  REDACTED_VALUE,
  createAuditEvent,
  createStructuredLogEvent,
  redactSensitivePayload,
} from "./index";

describe("audit and structured logging helpers", () => {
  it("redacts secrets and truncates excessive payloads", () => {
    expect(
      redactSensitivePayload({
        pdfPassword: "1234",
        serviceRoleKey: "secret",
        nested: { token: "abc", ok: "visible" },
      }),
    ).toEqual({
      pdfPassword: REDACTED_VALUE,
      serviceRoleKey: REDACTED_VALUE,
      nested: { token: REDACTED_VALUE, ok: "visible" },
    });
  });

  it("creates audit events without leaking sensitive metadata", () => {
    expect(
      createAuditEvent({
        action: "import_batch.process",
        actor: { userId: "user-a", role: "user" },
        severity: "info",
        occurredAt: "2026-09-15T12:00:00.000Z",
        originType: "import",
        metadata: { password: "pdf-password", importedRows: 10 },
      }),
    ).toMatchObject({
      action: "import_batch.process",
      metadata: { password: REDACTED_VALUE, importedRows: 10 },
    });
  });

  it("creates structured logs with the same redaction boundary", () => {
    expect(
      createStructuredLogEvent({
        level: "warn",
        context: "m06",
        message: "validation failed",
        occurredAt: "2026-09-15T12:00:00.000Z",
        metadata: { authorization: "Bearer token", issueCount: 2 },
      }),
    ).toMatchObject({
      level: "warn",
      metadata: { authorization: REDACTED_VALUE, issueCount: 2 },
    });
  });
});
