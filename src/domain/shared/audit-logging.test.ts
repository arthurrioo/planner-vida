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

  it("redacts common PII aliases without redacting generic business keys", () => {
    expect(
      redactSensitivePayload({
        email: "person@example.test",
        cpf: "123.456.789-09",
        phoneNumber: "+55 (11) 99999-9999",
        cardNumber: "4111 1111 1111 1111",
        accountNumber: "000123-4",
        iban: "GB82WEST12345698765432",
        nested: {
          documentId: "ABC123",
          pan: "4111111111111111",
          accountName: "Conta corrente",
          cardBrand: "Visa",
        },
      }),
    ).toEqual({
      email: REDACTED_VALUE,
      cpf: REDACTED_VALUE,
      phoneNumber: REDACTED_VALUE,
      cardNumber: REDACTED_VALUE,
      accountNumber: REDACTED_VALUE,
      iban: REDACTED_VALUE,
      nested: {
        documentId: REDACTED_VALUE,
        pan: REDACTED_VALUE,
        accountName: "Conta corrente",
        cardBrand: "Visa",
      },
    });
  });

  it("redacts high-confidence PII values inside nested arrays", () => {
    expect(
      redactSensitivePayload({
        contacts: [
          "person@example.test",
          "CPF 12345678909",
          "safe merchant reference",
        ],
      }),
    ).toEqual({
      contacts: [
        REDACTED_VALUE,
        `CPF ${REDACTED_VALUE}`,
        "safe merchant reference",
      ],
    });
  });

  it("does not mutate inputs and handles depth, circular references, and Error objects", () => {
    const payload: Record<string, unknown> = {
      nested: { email: "person@example.test" },
      error: new Error("failed for person@example.test"),
    };
    payload.self = payload;

    const redacted = redactSensitivePayload(payload);

    expect(payload.nested).toEqual({ email: "person@example.test" });
    expect(redacted).toMatchObject({
      nested: { email: REDACTED_VALUE },
      self: "[CIRCULAR]",
      error: { name: "Error", message: REDACTED_VALUE },
    });

    expect(
      redactSensitivePayload({
        a: { b: { c: { d: { e: { f: "too-deep" } } } } },
      }),
    ).toEqual({
      a: { b: { c: { d: { e: "[TRUNCATED]" } } } },
    });
  });
});
