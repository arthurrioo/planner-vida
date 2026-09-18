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
        cnpj: "12.345.678/0001-90",
        phoneNumber: "+55 (11) 99999-9999",
        cardNumber: "4111 1111 1111 1111",
        accountNumber: "000123-4",
        iban: "GB82WEST12345698765432",
        nested: {
          documentId: "ABC123",
          pan: "4111111111111111",
          cardPan: "4111111111111111",
          mobilePhone: "+55 (11) 99999-9999",
          taxId: "12345678909",
          accountName: "Conta corrente",
          cardBrand: "Visa",
        },
      }),
    ).toEqual({
      email: REDACTED_VALUE,
      cpf: REDACTED_VALUE,
      cnpj: REDACTED_VALUE,
      phoneNumber: REDACTED_VALUE,
      cardNumber: REDACTED_VALUE,
      accountNumber: REDACTED_VALUE,
      iban: REDACTED_VALUE,
      nested: {
        documentId: REDACTED_VALUE,
        pan: REDACTED_VALUE,
        cardPan: REDACTED_VALUE,
        mobilePhone: REDACTED_VALUE,
        taxId: REDACTED_VALUE,
        accountName: "Conta corrente",
        cardBrand: "Visa",
      },
    });
  });

  it("uses token-aware key redaction instead of substring matching", () => {
    const safeKeys = {
      company: "safe",
      companyName: "safe",
      expand: "safe",
      expandable: "safe",
      isExpanded: "safe",
      japan: "safe",
      panel: "safe",
      span: "safe",
      automobile: "safe",
      automobileValue: "safe",
      documentation: "safe",
      documentary: "safe",
      taxidermist: "safe",
      accountName: "safe",
      cardBrand: "safe",
    };

    expect(redactSensitivePayload(safeKeys)).toEqual(safeKeys);

    expect(
      redactSensitivePayload({
        pan: "sensitive",
        card_pan: "sensitive",
        cardPan: "sensitive",
        mobile: "sensitive",
        mobile_phone: "sensitive",
        mobilePhone: "sensitive",
        document: "sensitive",
        document_id: "sensitive",
        documentNumber: "sensitive",
        tax_id: "sensitive",
        taxId: "sensitive",
        account_number: "sensitive",
        accountNumber: "sensitive",
        card_number: "sensitive",
        cardNumber: "sensitive",
        email: "sensitive",
        cpf: "sensitive",
        cnpj: "sensitive",
        iban: "sensitive",
        password: "sensitive",
        serviceRoleKey: "sensitive",
        authorization: "sensitive",
        apiKey: "sensitive",
        pdfPassword: "sensitive",
      }),
    ).toEqual({
      pan: REDACTED_VALUE,
      card_pan: REDACTED_VALUE,
      cardPan: REDACTED_VALUE,
      mobile: REDACTED_VALUE,
      mobile_phone: REDACTED_VALUE,
      mobilePhone: REDACTED_VALUE,
      document: REDACTED_VALUE,
      document_id: REDACTED_VALUE,
      documentNumber: REDACTED_VALUE,
      tax_id: REDACTED_VALUE,
      taxId: REDACTED_VALUE,
      account_number: REDACTED_VALUE,
      accountNumber: REDACTED_VALUE,
      card_number: REDACTED_VALUE,
      cardNumber: REDACTED_VALUE,
      email: REDACTED_VALUE,
      cpf: REDACTED_VALUE,
      cnpj: REDACTED_VALUE,
      iban: REDACTED_VALUE,
      password: REDACTED_VALUE,
      serviceRoleKey: REDACTED_VALUE,
      authorization: REDACTED_VALUE,
      apiKey: REDACTED_VALUE,
      pdfPassword: REDACTED_VALUE,
    });

    expect(
      redactSensitivePayload({
        token: "sensitive",
        secret: "sensitive",
        credential: "sensitive",
      }),
    ).toEqual({
      token: REDACTED_VALUE,
      secret: REDACTED_VALUE,
      credential: REDACTED_VALUE,
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
