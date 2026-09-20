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
const archivedAccountA = asAccountId("00000000-0000-4000-8000-000000000910");
const closedAccountA = asAccountId("00000000-0000-4000-8000-000000000911");
const archivedCategoryA = asCategoryId("00000000-0000-4000-8000-000000000912");

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
    expect(reversed.reversal.status).toBe("reversed");
    expect(reversed.reversal.reversalOfTransactionId).toBe(second.id);
    expect(repository.records).toHaveLength(3);
  });

  it("rejects repeat lifecycle transitions and opposite transitions", async () => {
    const repository = new InMemoryTransactionRepository();
    const service = createService(repository);
    const voided = await service.createTransaction(contextA, {
      accountId: accountA,
      amount: "10",
      categoryId: categoryExpenseA,
      description: "Anular",
      paymentMethod: "pix",
      transactionDate: "2026-09-20",
      transactionType: "expense",
    });
    const reversed = await service.createTransaction(contextA, {
      accountId: accountA,
      amount: "11",
      categoryId: categoryExpenseA,
      description: "Estornar",
      paymentMethod: "pix",
      transactionDate: "2026-09-20",
      transactionType: "expense",
    });

    await service.voidTransaction(contextA, voided.id, {
      reason: "cancelamento",
    });
    await service.reverseTransaction(contextA, reversed.id, {
      reason: "duplicado",
    });

    await expect(
      service.voidTransaction(contextA, voided.id, { reason: "de novo" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      service.reverseTransaction(contextA, reversed.id, { reason: "de novo" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      service.reverseTransaction(contextA, voided.id, { reason: "depois" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      service.voidTransaction(contextA, reversed.id, { reason: "depois" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("corrects posted facts atomically with a reversed lineage row and posted replacement", async () => {
    const repository = new InMemoryTransactionRepository();
    const service = createService(repository);
    const original = await service.createTransaction(contextA, {
      accountId: accountA,
      amount: "50",
      categoryId: categoryExpenseA,
      description: "Despesa original",
      paymentMethod: "pix",
      transactionDate: "2026-09-20",
      transactionType: "expense",
    });

    const replacement = await service.updateTransaction(contextA, original.id, {
      accountId: accountA,
      amount: "35",
      categoryId: categoryExpenseA,
      description: "Despesa corrigida",
      paymentMethod: "pix",
      transactionDate: "2026-09-21",
      transactionType: "expense",
    });

    const originalAfter = await repository.findById(contextA, original.id);
    const reversals = repository.records.filter(
      (record) => record.reversalOfTransactionId === original.id,
    );

    expect(originalAfter?.status).toBe("reversed");
    expect(originalAfter?.reversedByTransactionId).toBe(reversals[0]?.id);
    expect(reversals).toHaveLength(1);
    expect(reversals[0]?.status).toBe("reversed");
    expect(replacement.status).toBe("posted");
    expect(replacement.amount.amount).toBe("35.0000");
    expect(accountBalance(repository.records, accountA)).toBe(-35);
  });

  it("rolls back correction when replacement creation fails", async () => {
    const repository = new InMemoryTransactionRepository();
    repository.failCorrectReplacement = true;
    const service = createService(repository);
    const original = await service.createTransaction(contextA, {
      accountId: accountA,
      amount: "50",
      categoryId: categoryExpenseA,
      description: "Despesa original",
      paymentMethod: "pix",
      transactionDate: "2026-09-20",
      transactionType: "expense",
    });

    await expect(
      service.updateTransaction(contextA, original.id, {
        accountId: accountA,
        amount: "35",
        categoryId: categoryExpenseA,
        description: "Despesa corrigida",
        paymentMethod: "pix",
        transactionDate: "2026-09-21",
        transactionType: "expense",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const originalAfter = await repository.findById(contextA, original.id);
    const reversals = repository.records.filter(
      (record) => record.reversalOfTransactionId === original.id,
    );

    expect(originalAfter?.status).toBe("posted");
    expect(reversals).toHaveLength(0);
    expect(repository.records).toHaveLength(1);
  });

  it("denies cross-user create, read, void, reverse, and correct access", async () => {
    const repository = new InMemoryTransactionRepository();
    const service = createService(repository);
    const transaction = await service.createTransaction(contextA, {
      accountId: accountA,
      amount: "10",
      categoryId: categoryExpenseA,
      description: "Privada",
      paymentMethod: "pix",
      transactionDate: "2026-09-20",
      transactionType: "expense",
    });

    await expect(
      service.getTransaction({ userId: userB }, transaction.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      service.voidTransaction({ userId: userB }, transaction.id, {
        reason: "tentativa",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      service.reverseTransaction({ userId: userB }, transaction.id, {
        reason: "tentativa",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      service.updateTransaction({ userId: userB }, transaction.id, {
        accountId: accountA,
        amount: "9",
        categoryId: categoryExpenseA,
        description: "Tentativa",
        paymentMethod: "pix",
        transactionDate: "2026-09-20",
        transactionType: "expense",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      service.createTransaction(contextA, {
        accountId: accountA,
        amount: "10",
        categoryId: categoryExpenseA,
        description: "Cartao com conta",
        paymentMethod: "credit_card",
        transactionDate: "2026-09-20",
        transactionType: "expense",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("rejects inactive account/category targets and invalid payment combinations", async () => {
    const service = createService(new InMemoryTransactionRepository(), {
      accounts: [
        defaultAccounts()[0],
        { ...defaultAccounts()[0], id: archivedAccountA, status: "archived" },
        { ...defaultAccounts()[0], id: closedAccountA, status: "closed" },
      ],
      categories: [
        ...defaultCategories(),
        {
          ...defaultCategories()[1],
          archivedAt: "2026-09-19T00:00:00.000Z",
          id: archivedCategoryA,
        },
      ],
    });

    await expect(
      service.createTransaction(contextA, {
        accountId: archivedAccountA,
        amount: "10",
        categoryId: categoryExpenseA,
        description: "Conta arquivada",
        paymentMethod: "pix",
        transactionDate: "2026-09-20",
        transactionType: "expense",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      service.createTransaction(contextA, {
        accountId: closedAccountA,
        amount: "10",
        categoryId: categoryExpenseA,
        description: "Conta fechada",
        paymentMethod: "pix",
        transactionDate: "2026-09-20",
        transactionType: "expense",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      service.createTransaction(contextA, {
        accountId: accountA,
        amount: "10",
        categoryId: archivedCategoryA,
        description: "Categoria arquivada",
        paymentMethod: "pix",
        transactionDate: "2026-09-20",
        transactionType: "expense",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      service.createTransaction(contextA, {
        accountId: accountA,
        amount: "10",
        categoryId: categoryIncomeA,
        creditCardId: creditCardA,
        description: "Receita cartao",
        paymentMethod: "credit_card",
        transactionDate: "2026-09-20",
        transactionType: "income",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(
      service.createTransaction(contextA, {
        accountId: accountA,
        amount: "10",
        categoryId: categoryExpenseA,
        description: "Metodo invalido",
        paymentMethod: "invalid",
        transactionDate: "2026-09-20",
        transactionType: "expense",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("validates amount precision, LocalDate edges, and UUID input safely", async () => {
    const service = createService(new InMemoryTransactionRepository());

    await expect(
      service.createTransaction(contextA, {
        accountId: accountA,
        amount: "0",
        categoryId: categoryExpenseA,
        description: "Zero",
        paymentMethod: "pix",
        transactionDate: "2026-09-20",
        transactionType: "expense",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(
      service.createTransaction(contextA, {
        accountId: accountA,
        amount: "10.12345",
        categoryId: categoryExpenseA,
        description: "Precisao",
        paymentMethod: "pix",
        transactionDate: "2026-09-20",
        transactionType: "expense",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(
      service.createTransaction(contextA, {
        accountId: accountA,
        amount: "10",
        categoryId: categoryExpenseA,
        description: "Data invalida",
        paymentMethod: "pix",
        transactionDate: "2026-02-30",
        transactionType: "expense",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(() => asTransactionId("not-a-uuid")).toThrow(DomainError);
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
  failCorrectReplacement = false;
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
    const current = await this.findById(context, original.id);
    if (
      !current ||
      current.status !== "posted" ||
      current.originType !== "manual"
    ) {
      throw new DomainError("CONFLICT", "Cannot reverse.");
    }
    if (
      this.records.some(
        (record) => record.reversalOfTransactionId === original.id,
      )
    ) {
      throw new DomainError("CONFLICT", "Already reversed.");
    }
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

  async correct(
    context: RepositoryContext,
    original: TransactionRecord,
    reversal: TransactionReversalMutation,
    replacement: TransactionMutation,
  ) {
    const snapshot = [...this.records];
    try {
      const reversed = await this.reverse(context, original, reversal);

      if (this.failCorrectReplacement) {
        throw new DomainError("CONFLICT", "Injected replacement failure.");
      }

      const replacementRecord = this.toRecord(context, replacement);
      this.records.push(replacementRecord);

      return {
        ...reversed,
        replacement: replacementRecord,
      };
    } catch (error) {
      this.records = snapshot;
      throw error;
    }
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
    if (current.status !== "posted" || current.originType !== "manual") {
      throw new DomainError("CONFLICT", "Cannot void.");
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
    this.accounts = overrides.accounts ?? [...defaultAccounts()];
    this.categories = overrides.categories ?? [...defaultCategories()];
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

function accountBalance(
  records: readonly TransactionRecord[],
  accountId: string,
) {
  return records
    .filter(
      (record) =>
        record.accountId === accountId &&
        record.status === "posted" &&
        record.paymentMethod !== "credit_card",
    )
    .reduce((total, record) => {
      const amount = Number(record.amount.amount);
      return record.transactionType === "income"
        ? total + amount
        : total - amount;
    }, 0);
}

function defaultAccounts(): AccountReference[] {
  return [
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
}

function defaultCategories(): CategoryReference[] {
  return [
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
