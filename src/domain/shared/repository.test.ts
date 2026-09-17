import { describe, expect, it } from "vitest";

import {
  type ApplicationService,
  DomainError,
  assertOwnedByContext,
  asUserId,
  createPassthroughTransactionBoundary,
  mapDomainErrorToHttpStatus,
} from "./index";

describe("repository/service and transaction boundary conventions", () => {
  it("blocks ownership mismatch before persistence", () => {
    const context = { userId: asUserId("user-a") };

    expect(() =>
      assertOwnedByContext(context, {
        id: "record-a",
        userId: asUserId("user-b"),
      }),
    ).toThrow(DomainError);
    expect(() =>
      assertOwnedByContext(context, {
        id: "record-a",
        userId: asUserId("user-b"),
      }),
    ).toThrow("user_id");
    expect(() =>
      assertOwnedByContext(context, {
        id: "record-a",
        userId: asUserId("user-a"),
      }),
    ).not.toThrow();
  });

  it("uses canonical DomainError codes for invalid users and ownership mismatches", () => {
    expect(() => asUserId(" ")).toThrow(DomainError);

    try {
      asUserId(" ");
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("VALIDATION_FAILED");
      expect(mapDomainErrorToHttpStatus(error as DomainError)).toBe(422);
    }

    try {
      assertOwnedByContext(
        { userId: asUserId("user-a") },
        { id: "record-a", userId: asUserId("user-b") },
      );
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("OWNERSHIP_MISMATCH");
      expect(mapDomainErrorToHttpStatus(error as DomainError)).toBe(403);
    }
  });

  it("provides a transaction boundary contract for future atomic operations", async () => {
    const boundary = createPassthroughTransactionBoundary();

    await expect(
      boundary.run(async (transaction) => transaction.transactionId),
    ).resolves.toBe("passthrough");
  });

  it("defines application service contracts with repository context", async () => {
    const service: ApplicationService<{ name: string }, { savedBy: string }> = {
      async execute(context) {
        return { savedBy: context.userId };
      },
    };

    await expect(
      service.execute({ userId: asUserId("user-a") }, { name: "Conta" }),
    ).resolves.toEqual({ savedBy: "user-a" });
  });
});
