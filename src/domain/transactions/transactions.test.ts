import { describe, expect, it } from "vitest";

import {
  asCreditCardId,
  asTransactionId,
  TransactionService,
  type AccountReference,
  type CategoryReference,
  type CreditCardReference,
  type TransactionMutation,
  type TransactionRecord,
  type TransactionRepository,
  type TransactionReversalMutation,
} from "./transactions";
import { asAccountId } from "@/domain/accounts";
import { asCategoryId } from "@/domain/categories";
import {
  asUserId,
  DomainError,
  type AuditEvent,
  type AuditService,
  type RepositoryContext,
} from "@/domain/shared";

const userA = asUserId("00000000-0000-4000-8000-000000000901");
const userB = asUserId("00000000-0000-4000-8000-000000000902");
const contextA: RepositoryContext = { userId: userA };
const accountA = asAccountId("00000000-0000-4000-8000-000000000903");
const benefitAccountA = asAccountId("00000000-0000-4000-8000-000000000904");
const categoryIncomeA = asCategoryId("00000000-0000-4000-8000-000000000905");
const categoryExpenseA = asCategoryId("00000000-0000-4000-8000-000000000906");
const subcategoryExpenseA = asCategoryId(
  "00000000-0000-4000-8000-000000000907",
);
const categoryInvestmentA = asCategoryId(
  "00000000-0000-4000-8000-000000000908",
);
const creditCardA = asCreditCardId("00000000-0000-4000-8000-000000000909");

describe("TransactionService", () => {
  it("creates income, expense, and investment posted facts with competence default", async () => {
    const repository = new InMemoryTransactionRepository();
    const service = createService(repository);

    const income = await service.createTransaction(contextA, {
      accountId: accountA,
      amount: "1000",
      categoryId: categoryIncomeA,
      description: "Salario",
      paymentMethod: "pix",
      transactionDate: "2026-09-20",
      transactionType: "income",
    });
    const expense = await service.createTransaction(contextA, {
      accountId: accountA,
      amount: "120.50",
      categoryId: subcategoryExpenseA,
      competenceDate: "2026-09-01",
      description: "Mercado",
      paymentMethod: "debit",
      transactionDate: "2026-09-20",
      transactionType: "expense",
    });
    const investment = await service.createTransaction(contextA, {
      accountId: accountA,
      amount: "300",
      categoryId: categoryInvestmentA,
      description: "Tesouro",
      paymentMethod: "bank_transfer",
      transactionDate: "2026-09-21",
      transactionType: "investment",
    });

    expect(income.status).toBe("posted");
    expect(income.competenceDate).toBe("2026-09-20");
    expect(income.competenceMonth).toBe("2026-09-01");
    expect(expense.categoryId).toBe(categoryExpenseA);
    expect(expense.subcategoryId).toBe(subcategoryExpenseA);
    expect(expense.competenceDate).toBe("2026-09-01");
    expect(investment.transactionType).toBe("investment");
  });

  it("requires account impact for non-card methods and excludes account impact for card purchases", async () => {
    const repository = new InMemoryTransactionRepository();
    const service = createService(repository);

    await expect(
      service.createTransaction(contextA, {
        amount: "12",
        categoryId: categoryExpenseA,
        description: "Sem conta",
        paymentMethod: "pix",
        transactionDate: "2026-09-20",
        transactionType: "expense",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    const cardPurchase = await service.createTransaction(contextA, {
      amount: "99",
      categoryId: categoryExpenseA,
      creditCardId: creditCardA,
      description: "Compra cartao",
      paymentMethod: "credit_card",
      transactionDate: "2026-09-20",
      transactionType: "expense",
    });

    expect(cardPurchase.accountId).toBeNull();
    expect(cardPurchase.creditCardId).toBe(creditCardA);
  });

  it("requires benefit payment methods to use a benefit account", async () => {
    const service = createService(new InMemoryTransactionRepository());

    await expect(
      service.createTransaction(contextA, {
        accountId: accountA,
        amount: "45",
        categoryId: categoryExpenseA,
        description: "Almoco",
        paymentMethod: "benefit_meal",
        transactionDate: "2026-09-20",
        transactionType: "expense",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    const transaction = await service.createTransaction(contextA, {
      accountId: benefitAccountA,
      amount: "45",
      categoryId: categoryExpenseA,
      description: "Almoco",
      paymentMethod: "benefit_meal",
      transactionDate: "2026-09-20",
      transactionType: "expense",
    });

    expect(transaction.accountId).toBe(benefitAccountA);
  });

  it("rejects transfer-type boundary and category type mismatches", async () => {
    const service = createService(new InMemoryTransactionRepository());

    await expect(
      service.createTransaction(contextA, {
        accountId: accountA,
        amount: "10",
        categoryId: categoryExpenseA,
        description: "Transferencia direta",
        paymentMethod: "bank_transfer",
        transactionDate: "2026-09-20",
        transactionType: "transfer",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    await expect(
      service.createTransaction(contextA, {
        accountId: accountA,
        amount: "10",
        categoryId: categoryIncomeA,
        description: "Categoria errada",
        paymentMethod: "pix",
        transactionDate: "2026-09-20",
        transactionType: "expense",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("rejects cross-user references even when a repository returns them", async () => {
    const service = createService(new InMemoryTransactionRepository(), {
      accounts: [
        {
          id: accountA,
          name: "Conta adulterada",
          status: "active",
          type: "checking",
          userId: userB,
        },
      ],
    });

    await expect(
      service.createTransaction(contextA, {
        accountId: accountA,
        amount: "10",
        categoryId: categoryExpenseA,
        description: "Cross user",
        paymentMethod: "pix",
        transactionDate: "2026-09-20",
        transactionType: "expense",
      }),
    ).rejects.toMatchObject({ code: "OWNERSHIP_MISMATCH" });
  });

  it("voids and reverses posted manual transactions without hard delete", async () => {
    const repository = new InMemoryTransactionRepository();
    const service = createService(repository);
    const transaction = await service.createTransaction(contextA, {
      accountId: accountA,
      amount: "10",
      categoryId: categoryExpenseA,
      description: "Despesa",
      paymentMethod: "pix",
      transactionDate: "2026-09-20",
      transactionType: "expense",
    });

    const voided = await service.voidTransaction(contextA, transaction.id, {
      reason: "Erro de digitacao",
    });

    expect(voided.status).toBe("voided");
    expect(repository.records).toHaveLength(1);

    const second = await service.createTransaction(contextA, {
      accountId: accountA,
      amount: "11",
      categoryId: categoryExpenseA,
      description: "Despesa 2",
      paymentMethod: "pix",
      transactionDate: "2026-09-20",
      transactionType: "expense",
    });
    const reversed = await service.reverseTransaction(contextA, second.id, {
      reason: "Lancamento duplicado",
    });

    expect(reversed.original.status).toBe("reversed");
    expect(reversed.reversal.reversalOfTransactionId).toBe(second.id);
    expect(repository.records).toHaveLength(3);
  });

  it("does not fail persisted mutations when audit write fails", async () => {
    const repository = new InMemoryTransactionRepository();
    const service = createService(repository, {
      audit: {
        async record() {
          throw new DomainError("EXTERNAL_SERVICE_FAILED", "Audit failed.");
        },
      },
    });

    const transaction = await service.createTransaction(contextA, {
      accountId: accountA,
      amount: "10",
      categoryId: categoryExpenseA,
      description: "Audit fail",
      paymentMethod: "pix",
      transactionDate: "2026-09-20",
      transactionType: "expense",
    });

    expect(transaction.id).toBeTruthy();
    expect(repository.records).toHaveLength(1);
  });
});

function createService(
  repository: InMemoryTransactionRepository,
  overrides: Partial<{
    accounts: AccountReference[];
    audit: AuditService;
    categories: CategoryReference[];
    creditCards: CreditCardReference[];
  }> = {},
) {
  const references = new InMemoryReferenceRepository(overrides);

  return new TransactionService({
    audit: overrides.audit ?? auditRecorder(),
    now: () => new Date("2026-09-20T12:00:00.000Z"),
    references,
    repository,
  });
}

class InMemoryTransactionRepository implements TransactionRepository {
  records: TransactionRecord[] = [];
  private sequence = 1;

  async create(context: RepositoryContext, mutation: TransactionMutation) {
    const record = this.toRecord(context, mutation);
    this.records.push(record);
    return record;
  }

  async findByExternalFingerprint(
    context: RepositoryContext,
    fingerprint: string,
  ) {
    return (
      this.records.find(
        (record) =>
          record.userId === context.userId &&
          record.externalFingerprint === fingerprint,
      ) ?? null
    );
  }

  async findById(context: RepositoryContext, id: string) {
    return (
      this.records.find(
        (record) => record.userId === context.userId && record.id === id,
      ) ?? null
    );
  }

  async list() {
    return this.records;
  }

  async reverse(
    context: RepositoryContext,
    original: TransactionRecord,
    reversal: TransactionReversalMutation,
  ) {
    const reversalRecord = this.toRecord(context, reversal, {
      reversalOfTransactionId: reversal.reversalOfTransactionId,
      reversalReason: reversal.reversalReason,
      status: "reversed",
    });
    this.records.push(reversalRecord);
    const updatedOriginal = {
      ...original,
      reversalReason: reversal.reversalReason,
      reversedAt: "2026-09-20T12:00:00.000Z",
      reversedByTransactionId: reversalRecord.id,
      status: "reversed" as const,
    };
    this.records = this.records.map((record) =>
      record.id === original.id ? updatedOriginal : record,
    );
    return { original: updatedOriginal, reversal: reversalRecord };
  }

  async updatePosted(
    context: RepositoryContext,
    id: string,
    mutation: TransactionMutation,
  ) {
    const current = await this.findById(context, id);
    if (!current) {
      throw new DomainError("NOT_FOUND", "Missing.");
    }
    const updated = { ...this.toRecord(context, mutation), id: current.id };
    this.records = this.records.map((record) =>
      record.id === current.id ? updated : record,
    );
    return updated;
  }

  async voidPosted(
    context: RepositoryContext,
    id: string,
    voidedAt: string,
    reason: string,
  ) {
    const current = await this.findById(context, id);
    if (!current) {
      throw new DomainError("NOT_FOUND", "Missing.");
    }
    const updated = {
      ...current,
      reversalReason: reason,
      status: "voided" as const,
      voidedAt,
    };
    this.records = this.records.map((record) =>
      record.id === id ? updated : record,
    );
    return updated;
  }

  private toRecord(
    context: RepositoryContext,
    mutation: TransactionMutation,
    overrides: Partial<TransactionRecord> = {},
  ): TransactionRecord {
    return {
      accountId: mutation.accountId,
      amount: mutation.amount,
      categoryId: mutation.categoryId,
      competenceDate: mutation.competenceDate,
      competenceMonth: mutation.competenceMonth,
      creditCardId: mutation.creditCardId,
      currency: "BRL",
      description: mutation.description,
      externalFingerprint: mutation.externalFingerprint,
      id: asTransactionId(
        `00000000-0000-4000-8000-${String(this.sequence++).padStart(12, "0")}`,
      ),
      notes: mutation.notes,
      originType: mutation.originType,
      paymentMethod: mutation.paymentMethod,
      postedAt: "2026-09-20T12:00:00.000Z",
      reversalOfTransactionId: null,
      reversalReason: null,
      reversedAt: null,
      reversedByTransactionId: null,
      sourceId: mutation.sourceId,
      sourceType: mutation.sourceType,
      status: mutation.status,
      subcategoryId: mutation.subcategoryId,
      transactionDate: mutation.transactionDate,
      transactionType: mutation.transactionType,
      userId: context.userId,
      voidedAt: null,
      ...overrides,
    };
  }
}

class InMemoryReferenceRepository {
  private readonly accounts: AccountReference[];
  private readonly categories: CategoryReference[];
  private readonly creditCards: CreditCardReference[];

  constructor(
    overrides: Partial<{
      accounts: AccountReference[];
      categories: CategoryReference[];
      creditCards: CreditCardReference[];
    }>,
  ) {
    this.accounts = overrides.accounts ?? [
      {
        id: accountA,
        name: "Conta",
        status: "active",
        type: "checking",
        userId: userA,
      },
      {
        id: benefitAccountA,
        name: "Beneficio",
        status: "active",
        type: "benefit",
        userId: userA,
      },
    ];
    this.categories = overrides.categories ?? [
      {
        archivedAt: null,
        id: categoryIncomeA,
        name: "Receitas",
        parentId: null,
        type: "income",
        userId: userA,
      },
      {
        archivedAt: null,
        id: categoryExpenseA,
        name: "Despesas",
        parentId: null,
        type: "variable_expense",
        userId: userA,
      },
      {
        archivedAt: null,
        id: subcategoryExpenseA,
        name: "Mercado",
        parentId: categoryExpenseA,
        type: "variable_expense",
        userId: userA,
      },
      {
        archivedAt: null,
        id: categoryInvestmentA,
        name: "Investimentos",
        parentId: null,
        type: "investment",
        userId: userA,
      },
    ];
    this.creditCards = overrides.creditCards ?? [
      {
        id: creditCardA,
        name: "Cartao",
        status: "active",
        userId: userA,
      },
    ];
  }

  async findAccountById(_context: RepositoryContext, id: string) {
    return this.accounts.find((account) => account.id === id) ?? null;
  }

  async findCategoryById(_context: RepositoryContext, id: string) {
    return this.categories.find((category) => category.id === id) ?? null;
  }

  async findCreditCardById(_context: RepositoryContext, id: string) {
    return this.creditCards.find((card) => card.id === id) ?? null;
  }

  async listAccounts() {
    return this.accounts;
  }

  async listCategories() {
    return this.categories;
  }

  async listCreditCards() {
    return this.creditCards;
  }
}

function auditRecorder(): AuditService & { events: AuditEvent[] } {
  const events: AuditEvent[] = [];

  return {
    events,
    async record(event) {
      events.push(event);
    },
  };
}
