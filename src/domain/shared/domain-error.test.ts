import { describe, expect, it } from "vitest";

import {
  DomainError,
  mapDomainErrorToHttpStatus,
  toPublicError,
} from "./domain-error";

describe("domain error taxonomy", () => {
  it("maps domain error codes to stable public contracts", () => {
    const error = new DomainError(
      "OWNERSHIP_MISMATCH",
      "Cross-user FK denied.",
      {
        details: { entity: "account" },
      },
    );

    expect(error.severity).toBe("warning");
    expect(mapDomainErrorToHttpStatus(error)).toBe(403);
    expect(toPublicError(error)).toEqual({
      code: "OWNERSHIP_MISMATCH",
      message: "Cross-user FK denied.",
      details: { entity: "account" },
    });
  });

  it("does not leak arbitrary errors to the public contract", () => {
    expect(toPublicError(new Error("database secret detail"))).toEqual({
      code: "UNEXPECTED",
      message: "Unexpected application error.",
    });
  });
});
