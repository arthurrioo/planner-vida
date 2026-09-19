import { describe, expect, it } from "vitest";

import {
  AccountService,
  calculateAccountBalance,
  isLifecycleActionAllowed,
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
  type AuditEvent,
  type AuditService,
  type Logger,
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
): AccountRepository & {
  getRecord: (id: AccountRecord["id"]) => AccountRecord | undefined;
} {
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
    getRecord(id) {
      return records.get(id);
    },
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    name: "Conta Nova",
    openingBalance: "10",
    openingBalanceDate: "2026-09-15",
    type: "wallet",
    ...overrides,
  };
}

function auditRecorder(): AuditService & { events: AuditEvent[] } {
  return {
    events: [],
    async record(event) {
      this.events.push(event);
    },
  };
}

function failingAuditRecorder(): AuditService {
  return {
    async record() {
      throw new DomainError("EXTERNAL_SERVICE_FAILED", "Audit write failed.");
    },
  };
}

function loggerRecorder(): Logger & { events: unknown[] } {
  return {
    events: [],
    emit(event) {
      this.events.push(event);
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

  it("accepts negative opening balances as snapshot values for any account type", () => {
    const checking = parseAccountMutation({
      name: "Conta Especial",
      openingBalance: "-50.0000",
      openingBalanceDate: "2026-09-15",
      type: "checking",
    });
    const benefit = parseAccountMutation({
      name: "Beneficio Legado",
      openingBalance: "-10.0000",
      openingBalanceDate: "2026-09-15",
      type: "benefit",
    });

    expect(checking.openingBalance.amount).toBe("-50.0000");
    expect(benefit.openingBalance.amount).toBe("-10.0000");
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

  it("rejects negative overdraft limits", () => {
    expect(() =>
      parseAccountMutation({
        name: "Conta Corrente",
        openingBalance: "0",
        openingBalanceDate: "2026-09-15",
        overdraftLimit: "-1",
        type: "checking",
      }),
    ).toThrow(DomainError);
  });

  it("rejects invalid money, date, and account type values", () => {
    expect(() =>
      parseAccountMutation({
        name: "",
        openingBalance: "1.00001",
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

    const created = await service.createAccount(contextA, input());

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
        ...input(),
        name: "Conta Principal",
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

  it("supports the canonical lifecycle state machine", async () => {
    const active = account();
    const archived = account({
      archivedAt: "2026-09-16T00:00:00.000Z",
      id: "account-archived" as AccountRecord["id"],
      status: "archived",
    });
    const closed = account({
      archivedAt: "2026-09-17T00:00:00.000Z",
      id: "account-closed" as AccountRecord["id"],
      status: "closed",
    });
    const repository = createRepository([active, archived, closed]);
    const service = new AccountService({
      now: () => new Date("2026-09-18T12:00:00.000Z"),
      repository,
    });

    await expect(
      service.archiveAccount(contextA, active.id),
    ).resolves.toMatchObject({
      status: "archived",
    });
    await expect(
      service.reactivateAccount(contextA, archived.id),
    ).resolves.toMatchObject({ archivedAt: null, status: "active" });
    await expect(
      service.closeAccount(contextA, active.id),
    ).resolves.toMatchObject({
      status: "closed",
    });
    await expect(
      service.closeAccount(contextA, archived.id),
    ).resolves.toMatchObject({
      status: "closed",
    });
    await expect(
      service.reactivateAccount(contextA, closed.id),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(
      service.archiveAccount(contextA, closed.id),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("treats self-transitions as idempotent no-ops where supported", async () => {
    const active = account();
    const archived = account({
      archivedAt: "2026-09-16T00:00:00.000Z",
      status: "archived",
    });
    const closed = account({
      archivedAt: "2026-09-17T00:00:00.000Z",
      status: "closed",
    });

    await expect(
      new AccountService({
        repository: createRepository([active]),
      }).reactivateAccount(contextA, active.id),
    ).resolves.toBe(active);
    await expect(
      new AccountService({
        repository: createRepository([archived]),
      }).archiveAccount(contextA, archived.id),
    ).resolves.toBe(archived);
    await expect(
      new AccountService({
        repository: createRepository([closed]),
      }).closeAccount(contextA, closed.id),
    ).resolves.toBe(closed);
  });

  it("allows archived edits and forbids closed edits", async () => {
    const archived = account({
      archivedAt: "2026-09-16T00:00:00.000Z",
      status: "archived",
    });
    const closed = account({
      archivedAt: "2026-09-17T00:00:00.000Z",
      id: "account-closed" as AccountRecord["id"],
      status: "closed",
    });
    const service = new AccountService({
      repository: createRepository([archived, closed]),
    });

    await expect(
      service.updateAccount(
        contextA,
        archived.id,
        input({ name: "Arquivada" }),
      ),
    ).resolves.toMatchObject({ name: "Arquivada" });
    await expect(
      service.updateAccount(contextA, closed.id, input({ name: "Encerrada" })),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("deletes unreferenced accounts through the explicit safe-delete API", async () => {
    const base = account();
    const repository = createRepository([base]);
    const audit = auditRecorder();
    const service = new AccountService({ audit, repository });

    const result = await service.deleteAccountIfSafe(contextA, base.id);

    expect(result.mode).toBe("deleted");
    expect(repository.getRecord(base.id)).toBeUndefined();
    expect(audit.events.at(-1)?.action).toBe("accounts.delete");
  });

  it("blocks explicit hard-delete when dependencies exist", async () => {
    const base = account();
    const repository = createRepository([base], { [base.id]: 2 });
    const service = new AccountService({ repository });

    const result = await service.deleteAccountIfSafe(contextA, base.id);

    expect(result).toMatchObject({ dependencyCount: 2, mode: "blocked" });
    expect(repository.getRecord(base.id)?.status).toBe("active");
  });

  it("keeps deleteOrArchiveAccount as a safe archive fallback", async () => {
    const base = account();
    const repository = createRepository([base], { [base.id]: 2 });
    const service = new AccountService({ repository });

    const result = await service.deleteOrArchiveAccount(contextA, base.id);

    expect(result.mode).toBe("archived");
    expect(result.account.status).toBe("archived");
  });

  it("denies cross-user update, archive, reactivate, close, and delete", async () => {
    const foreign = account({ userId: userB });
    const service = new AccountService({
      repository: createRepository([foreign]),
    });

    await expect(
      service.updateAccount(contextA, foreign.id, input()),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      service.archiveAccount(contextA, foreign.id),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      service.reactivateAccount(contextA, foreign.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      service.closeAccount(contextA, foreign.id),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      service.deleteAccountIfSafe(contextA, foreign.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("defaults selectable accounts to active-only", async () => {
    const active = account();
    const archived = account({
      id: "account-archived" as AccountRecord["id"],
      status: "archived",
    });
    const service = new AccountService({
      repository: createRepository([active, archived]),
    });

    await expect(service.listSelectableAccounts(contextA)).resolves.toEqual([
      expect.objectContaining({ id: active.id }),
    ]);
    await expect(
      service.listSelectableAccounts(contextA, {
        includeStatuses: ["active", "archived"],
      }),
    ).resolves.toHaveLength(2);
  });

  it("records audit events for reactivation", async () => {
    const archived = account({
      archivedAt: "2026-09-16T00:00:00.000Z",
      status: "archived",
    });
    const audit = auditRecorder();
    const service = new AccountService({
      audit,
      repository: createRepository([archived]),
    });

    await service.reactivateAccount(contextA, archived.id);

    expect(audit.events.at(-1)?.action).toBe("accounts.reactivate");
  });

  it("does not convert persisted account mutations into failures when audit write fails", async () => {
    const logger = loggerRecorder();
    const repository = createRepository();
    const service = new AccountService({
      audit: failingAuditRecorder(),
      logger,
      repository,
    });

    const created = await service.createAccount(contextA, input());

    expect(repository.getRecord(created.id)).toBeDefined();
    expect(logger.events).toHaveLength(1);
    expect(logger.events[0]).toMatchObject({
      context: "AccountService.recordAccountAudit",
      level: "error",
    });
  });
});

describe("isLifecycleActionAllowed", () => {
  it("documents the final Phase 1 transition matrix", () => {
    expect(isLifecycleActionAllowed("active", "archive")).toBe(true);
    expect(isLifecycleActionAllowed("archived", "archive")).toBe(true);
    expect(isLifecycleActionAllowed("closed", "archive")).toBe(false);
    expect(isLifecycleActionAllowed("active", "reactivate")).toBe(true);
    expect(isLifecycleActionAllowed("archived", "reactivate")).toBe(true);
    expect(isLifecycleActionAllowed("closed", "reactivate")).toBe(false);
    expect(isLifecycleActionAllowed("active", "close")).toBe(true);
    expect(isLifecycleActionAllowed("archived", "close")).toBe(true);
    expect(isLifecycleActionAllowed("closed", "close")).toBe(true);
    expect(isLifecycleActionAllowed("active", "update")).toBe(true);
    expect(isLifecycleActionAllowed("archived", "update")).toBe(true);
    expect(isLifecycleActionAllowed("closed", "update")).toBe(false);
  });
});
