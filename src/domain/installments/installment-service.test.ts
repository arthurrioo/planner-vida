import { describe, expect, it, vi } from "vitest";

import { asAccountId } from "@/domain/accounts";
import { asCategoryId } from "@/domain/categories";
import {
  asUserId,
  DomainError,
  parseLocalDate,
  type AuditService,
  type RepositoryContext,
} from "@/domain/shared";
import { asCreditCardId } from "@/domain/transactions";
import {
  asInstallmentId,
  asInstallmentPlanId,
  InstallmentService,
  type InstallmentAccountReference,
  type InstallmentCategoryReference,
  type InstallmentCreditCardReference,
  type InstallmentPlanMutation,
  type InstallmentPlanWithInstallments,
  type InstallmentReferenceRepository,
  type InstallmentRepository,
} from "./installments";

const userA = asUserId("00000000-0000-4000-8000-000000001211");
const userB = asUserId("00000000-0000-4000-8000-000000001212");
const context: RepositoryContext = { userId: userA };
const accountId = asAccountId("00000000-0000-4000-8000-000000001213");
const categoryId = asCategoryId("00000000-0000-4000-8000-000000001214");
const cardId = asCreditCardId("00000000-0000-4000-8000-000000001215");
const planId = asInstallmentPlanId("00000000-0000-4000-8000-000000001216");
const installmentId = asInstallmentId("00000000-0000-4000-8000-000000001217");

describe("InstallmentService", () => {
  it("creates a reconciled schedule through one repository mutation", async () => {
    const repository = new MemoryInstallmentRepository();
    const service = createService(repository);

    const created = await service.createInstallmentPurchase(context, command());

    expect(repository.createCalls).toBe(1);
    expect(repository.lastMutation?.installments).toHaveLength(3);
    expect(
      repository.lastMutation?.installments.map((item) => item.amount.amount),
    ).toEqual(["33.3400", "33.3300", "33.3300"]);
    expect(created.plan).not.toHaveProperty("transactionId");
    expect(created.installments.every((item) => !item.transactionId)).toBe(
      true,
    );
  });

  it("rejects leaked cross-user references before persistence", async () => {
    const repository = new MemoryInstallmentRepository();
    const service = createService(repository, {
      accounts: [account({ userId: userB })],
    });

    await expect(
      service.createInstallmentPurchase(context, command()),
    ).rejects.toMatchObject({ code: "OWNERSHIP_MISMATCH" });
    expect(repository.createCalls).toBe(0);
  });

  it("requires benefit methods to use a benefit account", async () => {
    const repository = new MemoryInstallmentRepository();
    const service = createService(repository);

    await expect(
      service.createInstallmentPurchase(context, {
        ...command(),
        paymentMethod: "benefit_meal",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(repository.createCalls).toBe(0);
  });

  it("realizes only scheduled installments and uses direct ownership lookup", async () => {
    const repository = new MemoryInstallmentRepository();
    const service = createService(repository);
    await service.createInstallmentPurchase(context, command());

    const realized = await service.realizeInstallment(context, installmentId, {
      transactionDate: "2026-10-06",
    });

    expect(repository.findInstallmentCalls).toBe(1);
    expect(repository.realizeCalls).toBe(1);
    expect(realized.installments[0]?.status).toBe("posted");

    await expect(
      service.realizeInstallment(context, installmentId),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(repository.realizeCalls).toBe(1);
  });

  it("commits cancellation even when non-blocking audit fails", async () => {
    const repository = new MemoryInstallmentRepository();
    const logger = { emit: vi.fn() };
    const audit: AuditService = {
      async record() {
        throw new DomainError("EXTERNAL_SERVICE_FAILED", "Audit unavailable.");
      },
    };
    const service = createService(repository, { audit, logger });
    await service.createInstallmentPurchase(context, command());

    const cancelled = await service.cancelInstallmentPlan(context, planId, {
      reason: "Compra duplicada",
    });

    expect(cancelled.plan.status).toBe("cancelled");
    expect(repository.cancelCalls).toBe(1);
    expect(logger.emit).toHaveBeenCalled();
  });
});

class MemoryInstallmentRepository implements InstallmentRepository {
  cancelCalls = 0;
  createCalls = 0;
  findInstallmentCalls = 0;
  lastMutation: InstallmentPlanMutation | null = null;
  realizeCalls = 0;
  private stored: InstallmentPlanWithInstallments | null = null;

  async createPlan(
    _context: RepositoryContext,
    mutation: InstallmentPlanMutation,
  ) {
    this.createCalls += 1;
    this.lastMutation = mutation;
    this.stored = materialize(mutation);
    return this.stored;
  }

  async listPlans() {
    return this.stored ? [this.stored] : [];
  }

  async findPlanById(_context: RepositoryContext, id: string) {
    return this.stored?.plan.id === id ? this.stored : null;
  }

  async findInstallmentById(_context: RepositoryContext, id: string) {
    this.findInstallmentCalls += 1;
    return this.stored?.installments.some((item) => item.id === id)
      ? this.stored
      : null;
  }

  async realizeInstallment() {
    this.realizeCalls += 1;
    if (!this.stored) throw new Error("missing fixture");
    this.stored = {
      ...this.stored,
      installments: this.stored.installments.map((item, index) =>
        index === 0
          ? {
              ...item,
              status: "posted" as const,
              transactionId: "00000000-0000-4000-8000-000000001218" as never,
            }
          : item,
      ),
    };
    return this.stored;
  }

  async cancelPlan() {
    this.cancelCalls += 1;
    if (!this.stored) throw new Error("missing fixture");
    this.stored = {
      installments: this.stored.installments.map((item) => ({
        ...item,
        status: "cancelled" as const,
      })),
      plan: { ...this.stored.plan, status: "cancelled" as const },
    };
    return this.stored;
  }
}

function createService(
  repository: InstallmentRepository,
  overrides: Partial<{
    accounts: InstallmentAccountReference[];
    audit: AuditService;
    logger: { emit: (event: never) => void };
  }> = {},
) {
  const accounts = overrides.accounts ?? [account()];
  const categories: InstallmentCategoryReference[] = [
    {
      archivedAt: null,
      id: categoryId,
      name: "Compras",
      parentId: null,
      type: "variable_expense",
      userId: userA,
    },
  ];
  const cards: InstallmentCreditCardReference[] = [
    { id: cardId, name: "Cartao", status: "active", userId: userA },
  ];
  const references: InstallmentReferenceRepository = {
    async findAccountById(_context, id) {
      return accounts.find((item) => item.id === id) ?? null;
    },
    async findCategoryById(_context, id) {
      return categories.find((item) => item.id === id) ?? null;
    },
    async findCreditCardById(_context, id) {
      return cards.find((item) => item.id === id) ?? null;
    },
    async listAccounts() {
      return accounts;
    },
    async listCategories() {
      return categories;
    },
    async listCreditCards() {
      return cards;
    },
  };

  return new InstallmentService({
    audit: overrides.audit,
    logger: overrides.logger as never,
    references,
    repository,
  });
}

function account(
  overrides: Partial<InstallmentAccountReference> = {},
): InstallmentAccountReference {
  return {
    id: accountId,
    name: "Conta principal",
    status: "active",
    type: "checking",
    userId: userA,
    ...overrides,
  };
}

function command() {
  return {
    accountId,
    categoryId,
    creditCardId: "",
    description: "Compra parcelada",
    firstDueDate: "2026-10-05",
    merchantName: "Loja",
    paymentMethod: "pix",
    purchaseDate: "2026-09-26",
    totalAmount: "100.00",
    totalInstallments: "3",
  };
}

function materialize(
  mutation: InstallmentPlanMutation,
): InstallmentPlanWithInstallments {
  return {
    plan: {
      ...mutation,
      currency: "BRL",
      id: planId,
      status: "active",
      userId: userA,
    },
    installments: mutation.installments.map((item, index) => ({
      ...item,
      competenceDate: parseLocalDate(item.competenceDate),
      financialCommitmentId: null,
      id: index === 0 ? installmentId : asInstallmentId(installmentUuid(index)),
      importItemId: null,
      invoiceId: null,
      planId,
      transactionId: null,
      userId: userA,
    })),
  };
}

function installmentUuid(index: number) {
  return `00000000-0000-4000-8000-${String(1220 + index).padStart(12, "0")}`;
}
