import { describe, expect, it } from "vitest";

import {
  AccountService,
  calculateAccountBalance,
  parseAccountMutation,
  zeroMoney,
  type AccountRecord,
  type AccountRepository,
} from "./accounts";
import {
  asUserId,
  DomainError,
  parseLocalDate,
  parseMoney,
  type RepositoryContext,
} from "@/domain/shared";

const userA = asUserId("00000000-0000-4000-8000-000000000701");
const userB = asUserId("00000000-0000-4000-8000-000000000702");
const contextA: RepositoryContext = { userId: userA };

function account(overrides: Partial<AccountRecord> = {}): AccountRecord {
  return {
    archivedAt: null,
    currency: "BRL",
    description: null,
    id: "account-a" as AccountRecord["id"],
    institution: "Banco",
    name: "Conta Corrente",
    normalizedName: "conta corrente",
    openingBalance: parseMoney("1000"),
    openingBalanceDate: parseLocalDate("2026-09-15"),
    overdraftLimit: parseMoney("500"),
    status: "active",
    type: "checking",
    userId: userA,
    ...overrides,
  };
}

function createRepository(
  accounts: AccountRecord[] = [],
  dependencyCounts: Readonly<Record<string, number>> = {},
): AccountRepository {
  const records = new Map(accounts.map((item) => [item.id, item]));

  return {
    async countDependencies(_context, id) {
      return dependencyCounts[id] ?? 0;
    },
    async create(context, mutation) {
      const created = account({
        ...mutation,
        archivedAt: null,
        id: `account-${records.size + 1}` as AccountRecord["id"],
        status: "active",
        userId: context.userId,
      });
      records.set(created.id, created);
      return created;
    },
    async delete(_context, id) {
      records.delete(id);
    },
    async findActiveByNormalizedName(context, normalizedName) {
      return (
        [...records.values()].find(
          (item) =>
            item.userId === context.userId &&
            item.normalizedName === normalizedName &&
            item.status === "active" &&
            item.archivedAt === null,
        ) ?? null
      );
    },
    async findById(context, id) {
      const record = records.get(id);
      return record && record.userId === context.userId ? record : null;
    },
    async getBalanceMovements() {
      return {
        expense: zeroMoney(),
        income: zeroMoney(),
        incomingTransfers: zeroMoney(),
        investment: zeroMoney(),
        invoicePayments: zeroMoney(),
        outgoingTransfers: zeroMoney(),
      };
    },
    async list(context) {
      return [...records.values()].filter(
        (item) => item.userId === context.userId,
      );
    },
    async update(context, id, mutation) {
      const existing = records.get(id);

      if (!existing || existing.userId !== context.userId) {
        throw new DomainError("NOT_FOUND", "Missing account.");
      }

      const updated = { ...existing, ...mutation };
      records.set(id, updated);
      return updated;
    },
    async updateStatus(context, id, status, archivedAt) {
      const existing = records.get(id);

      if (!existing || existing.userId !== context.userId) {
        throw new DomainError("NOT_FOUND", "Missing account.");
      }

      const updated = { ...existing, archivedAt, status };
      records.set(id, updated);
      return updated;
    },
  };
}

describe("parseAccountMutation", () => {
  it("normalizes active account input without exposing mutable current balance", () => {
    const mutation = parseAccountMutation({
      name: "  Conta   Principal  ",
      openingBalance: "123.45",
      openingBalanceDate: "2026-09-15",
      overdraftLimit: "500",
      type: "checking",
    });

    expect(mutation).toMatchObject({
      name: "Conta Principal",
      normalizedName: "conta principal",
      type: "checking",
    });
    expect(mutation.openingBalance.amount).toBe("123.4500");
    expect("currentBalance" in mutation).toBe(false);
  });

  it("accepts benefit accounts with their own balance", () => {
    const mutation = parseAccountMutation({
      name: "VR Alimentacao",
      openingBalance: "640",
      openingBalanceDate: "2026-09-15",
      type: "benefit",
    });

    expect(mutation.type).toBe("benefit");
    expect(mutation.openingBalance.amount).toBe("640.0000");
  });

  it("rejects overdraft metadata on benefit accounts", () => {
    expect(() =>
      parseAccountMutation({
        name: "Vale Refeicao",
        openingBalance: "100",
        openingBalanceDate: "2026-09-15",
        overdraftLimit: "1",
        type: "benefit",
      }),
    ).toThrow(DomainError);
  });

  it("rejects invalid money, date, and account type values", () => {
    expect(() =>
      parseAccountMutation({
        name: "",
        openingBalance: "-1",
        openingBalanceDate: "2026-02-31",
        type: "bank",
      }),
    ).toThrow(DomainError);
  });
});

describe("calculateAccountBalance", () => {
  it("uses opening balance as the base when there are no movements", () => {
    const balance = calculateAccountBalance(account(), {
      expense: zeroMoney(),
      income: zeroMoney(),
      incomingTransfers: zeroMoney(),
      investment: zeroMoney(),
      invoicePayments: zeroMoney(),
      outgoingTransfers: zeroMoney(),
    });

    expect(balance.amount).toBe("1000.0000");
  });

  it("derives balance from account movements without a mutable balance field", () => {
    const balance = calculateAccountBalance(account(), {
      expense: parseMoney("120"),
      income: parseMoney("300"),
      incomingTransfers: parseMoney("25"),
      investment: parseMoney("80"),
      invoicePayments: parseMoney("40"),
      outgoingTransfers: parseMoney("10"),
    });

    expect(balance.amount).toBe("1075.0000");
  });
});

describe("AccountService", () => {
  it("creates accounts scoped to the repository context user", async () => {
    const service = new AccountService({ repository: createRepository() });

    const created = await service.createAccount(contextA, {
      name: "Conta Nova",
      openingBalance: "10",
      openingBalanceDate: "2026-09-15",
      type: "wallet",
    });

    expect(created.userId).toBe(userA);
    expect(created.normalizedName).toBe("conta nova");
  });

  it("blocks duplicate active normalized names per user", async () => {
    const service = new AccountService({
      repository: createRepository([
        account({ normalizedName: "conta principal" }),
      ]),
    });

    await expect(
      service.createAccount(contextA, {
        name: "Conta Principal",
        openingBalance: "10",
        openingBalanceDate: "2026-09-15",
        type: "wallet",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("does not expose another user's account through the service", async () => {
    const service = new AccountService({
      repository: createRepository([account({ userId: userB })]),
    });

    await expect(
      service.getAccount(contextA, "account-a" as AccountRecord["id"]),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("archives instead of deleting accounts with dependent records", async () => {
    const base = account();
    const repository = createRepository([base], { [base.id]: 2 });
    const service = new AccountService({ repository });

    const result = await service.deleteOrArchiveAccount(contextA, base.id);

    expect(result.mode).toBe("archived");
    expect(result.account.status).toBe("archived");
  });
});
