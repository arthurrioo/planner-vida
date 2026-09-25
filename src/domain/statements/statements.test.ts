import { describe, expect, it } from "vitest";

import {
  asAccountId,
  calculateAccountBalance,
  type AccountRecord,
  type AccountWithBalance,
} from "@/domain/accounts";
import { asCategoryId } from "@/domain/categories";
import {
  asUserId,
  parseLocalDate,
  parseMoney,
  type RepositoryContext,
} from "@/domain/shared";
import {
  asCreditCardId,
  asTransactionId,
  type AccountReference,
  type CategoryReference,
  type CreditCardReference,
  type TransactionRecord,
  type TransactionSearch,
} from "@/domain/transactions";
import { asTransferId } from "@/domain/transfers";
import { StatementService } from "./statements";

const userA = asUserId("00000000-0000-4000-8000-000000011001");
const userB = asUserId("00000000-0000-4000-8000-000000011002");
const contextA: RepositoryContext = { userId: userA };
const checkingA = asAccountId("00000000-0000-4000-8000-000000011003");
const savingsA = asAccountId("00000000-0000-4000-8000-000000011004");
const groceriesA = asCategoryId("00000000-0000-4000-8000-000000011005");
const marketA = asCategoryId("00000000-0000-4000-8000-000000011006");
const incomeA = asCategoryId("00000000-0000-4000-8000-000000011007");
const cardA = asCreditCardId("00000000-0000-4000-8000-000000011008");
const transferA = asTransferId("00000000-0000-4000-8000-000000011009");
let transactionSequence = 1;

type TransactionOverrides = Omit<
  Partial<TransactionRecord>,
  "amount" | "competenceDate" | "competenceMonth" | "transactionDate"
> &
  Readonly<{
    amount?: string;
    competenceDate?: string;
    competenceMonth?: string;
    transactionDate?: string;
  }>;

describe("StatementService", () => {
  it("lists statement entries with AFR-style filter combinations and context labels", async () => {
    const service = createStatementService([
      transaction({
        accountId: checkingA,
        amount: "50",
        categoryId: groceriesA,
        description: "Mercado semanal",
        paymentMethod: "pix",
        subcategoryId: marketA,
        transactionDate: "2026-09-18",
        transactionType: "expense",
      }),
      transaction({
        accountId: checkingA,
        amount: "1000",
        categoryId: incomeA,
        description: "Salario",
        paymentMethod: "bank_transfer",
        transactionDate: "2026-09-15",
        transactionType: "income",
      }),
      transaction({
        amount: "80",
        categoryId: groceriesA,
        creditCardId: cardA,
        description: "Mercado no cartao",
        paymentMethod: "credit_card",
        subcategoryId: marketA,
        transactionDate: "2026-09-12",
        transactionType: "expense",
      }),
    ]);

    const result = await service.getStatement(contextA, {
      accountId: checkingA,
      categoryId: marketA,
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
      paymentMethod: "pix",
      query: "mercado",
      transactionType: "expense",
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.accountName).toBe("Conta Corrente");
    expect(result.entries[0]?.categoryLabel).toBe("Compras / Mercado");
    expect(result.entries[0]?.transaction.description).toBe("Mercado semanal");
  });

  it("keeps deterministic ordering and paginates without leaking the next page row", async () => {
    const service = createStatementService([
      transaction({
        description: "Mais antiga",
        transactionDate: "2026-09-10",
      }),
      transaction({ description: "Mais nova", transactionDate: "2026-09-20" }),
      transaction({ description: "Meio", transactionDate: "2026-09-15" }),
    ]);

    const pageOne = await service.getStatement(contextA, {
      page: "1",
      pageSize: "2",
    });
    const pageTwo = await service.getStatement(contextA, {
      page: "2",
      pageSize: "2",
    });

    expect(
      pageOne.entries.map((entry) => entry.transaction.description),
    ).toEqual(["Mais nova", "Meio"]);
    expect(pageOne.hasNextPage).toBe(true);
    expect(pageOne.hasPreviousPage).toBe(false);
    expect(
      pageTwo.entries.map((entry) => entry.transaction.description),
    ).toEqual(["Mais antiga"]);
    expect(pageTwo.hasNextPage).toBe(false);
    expect(pageTwo.hasPreviousPage).toBe(true);
  });

  it("routes transfer entries to transfer lifecycle and card entries to transaction lifecycle", async () => {
    const service = createStatementService([
      transaction({
        accountId: checkingA,
        categoryId: null,
        description: "Transferencia",
        paymentMethod: "bank_transfer",
        transactionType: "transfer",
        transferId: transferA,
      }),
      transaction({
        amount: "80",
        categoryId: groceriesA,
        creditCardId: cardA,
        description: "Compra cartao",
        paymentMethod: "credit_card",
      }),
    ]);

    const result = await service.getStatement(contextA);

    expect(result.entries[0]?.detailPath).toBe(
      `/app/financeiro/transferencias/${transferA}`,
    );
    expect(result.entries[1]?.creditCardName).toBe("Cartao Azul");
    expect(result.entries[1]?.detailPath).toBe(
      `/app/financeiro/transacoes/${result.entries[1]?.transaction.id}`,
    );
  });

  it("denies cross-user statement rows even if a repository is misconfigured", async () => {
    const service = createStatementService([transaction({ userId: userB })]);

    await expect(service.getStatement(contextA)).rejects.toMatchObject({
      code: "OWNERSHIP_MISMATCH",
    });
  });
});

describe("M11 realized-finance balance invariants", () => {
  it("derives account balance after income, expense, investment, and transfer movements", () => {
    const balance = calculateAccountBalance(account("100.0000"), {
      expense: money("30"),
      income: money("500"),
      incomingTransfers: money("70"),
      investment: money("120"),
      invoicePayments: money("0"),
      outgoingTransfers: money("40"),
    });

    expect(balance.amount).toBe("480.0000");
  });

  it("keeps credit-card purchases out of immediate account balance", () => {
    const balance = calculateAccountBalance(account("100.0000"), {
      expense: money("0"),
      income: money("0"),
      incomingTransfers: money("0"),
      investment: money("0"),
      invoicePayments: money("0"),
      outgoingTransfers: money("0"),
    });

    expect(balance.amount).toBe("100.0000");
  });
});

function createStatementService(records: TransactionRecord[]) {
  const repository = new InMemoryStatementTransactionRepository(records);
  const references = new InMemoryStatementReferenceRepository();

  return new StatementService({
    accountService: {
      async listAccounts(context) {
        return defaultAccountBalances().filter(
          (account) => account.userId === context.userId,
        );
      },
    },
    references,
    transactions: repository,
  });
}

class InMemoryStatementTransactionRepository {
  constructor(private readonly records: readonly TransactionRecord[]) {}

  async list(context: RepositoryContext, search: TransactionSearch = {}) {
    const filtered = this.records
      .filter(
        (record) => record.userId === context.userId || record.userId === userB,
      )
      .filter((record) =>
        search.accountId ? record.accountId === search.accountId : true,
      )
      .filter((record) =>
        search.categoryId
          ? record.categoryId === search.categoryId ||
            record.subcategoryId === search.categoryId
          : true,
      )
      .filter((record) =>
        search.creditCardId
          ? record.creditCardId === search.creditCardId
          : true,
      )
      .filter((record) =>
        search.dateFrom ? record.transactionDate >= search.dateFrom : true,
      )
      .filter((record) =>
        search.dateTo ? record.transactionDate <= search.dateTo : true,
      )
      .filter((record) =>
        search.paymentMethod
          ? record.paymentMethod === search.paymentMethod
          : true,
      )
      .filter((record) =>
        search.query
          ? record.description
              ?.toLowerCase()
              .includes(search.query.toLowerCase())
          : true,
      )
      .filter((record) =>
        search.status ? record.status === search.status : true,
      )
      .filter((record) =>
        search.transactionType
          ? record.transactionType === search.transactionType
          : true,
      )
      .sort((left, right) =>
        right.transactionDate.localeCompare(left.transactionDate),
      );
    const offset = search.offset ?? 0;
    const limit = search.limit ?? filtered.length;

    return filtered.slice(offset, offset + limit);
  }
}

class InMemoryStatementReferenceRepository {
  async listAccounts() {
    return defaultAccounts();
  }

  async listCategories() {
    return defaultCategories();
  }

  async listCreditCards() {
    return defaultCreditCards();
  }
}

function transaction(overrides: TransactionOverrides = {}): TransactionRecord {
  const {
    amount,
    competenceDate: competenceDateInput,
    competenceMonth: competenceMonthInput,
    transactionDate: transactionDateInput,
    ...recordOverrides
  } = overrides;
  const transactionDate = parseLocalDate(transactionDateInput ?? "2026-09-20");
  const competenceDate = parseLocalDate(
    competenceDateInput ?? transactionDateInput ?? "2026-09-20",
  );
  const competenceMonth = parseLocalDate(
    competenceMonthInput ?? `${competenceDate.slice(0, 7)}-01`,
  );
  const id =
    recordOverrides.id ??
    asTransactionId(
      `00000000-0000-4000-8000-${String(transactionSequence++).padStart(12, "0")}`,
    );

  return {
    accountId: null,
    amount: money(amount ?? "10"),
    categoryId: groceriesA,
    competenceDate,
    competenceMonth,
    creditCardId: null,
    currency: "BRL",
    description: "Lancamento",
    externalFingerprint: null,
    id,
    notes: null,
    originType: "manual",
    paymentMethod: "pix",
    postedAt: "2026-09-20T12:00:00.000Z",
    reversalOfTransactionId: null,
    reversalReason: null,
    reversedAt: null,
    reversedByTransactionId: null,
    sourceId: null,
    sourceType: "manual",
    status: "posted",
    subcategoryId: null,
    transactionDate,
    transactionType: "expense",
    transferId: null,
    userId: userA,
    voidedAt: null,
    ...recordOverrides,
  };
}

function account(openingBalance: string): AccountRecord {
  return {
    archivedAt: null,
    currency: "BRL",
    description: null,
    id: checkingA,
    institution: "Banco",
    name: "Conta Corrente",
    normalizedName: "conta corrente",
    openingBalance: money(openingBalance),
    openingBalanceDate: parseLocalDate("2026-09-01"),
    overdraftLimit: money("0"),
    status: "active",
    type: "checking",
    userId: userA,
  };
}

function defaultAccountBalances(): AccountWithBalance[] {
  return [
    {
      ...account("100.0000"),
      balance: money("100.0000"),
      dependencyCount: 1,
    },
    {
      ...account("250.0000"),
      balance: money("250.0000"),
      dependencyCount: 0,
      id: savingsA,
      name: "Reserva",
      normalizedName: "reserva",
      type: "savings",
    },
  ];
}

function defaultAccounts(): AccountReference[] {
  return [
    {
      id: checkingA,
      name: "Conta Corrente",
      status: "active",
      type: "checking",
      userId: userA,
    },
    {
      id: savingsA,
      name: "Reserva",
      status: "active",
      type: "savings",
      userId: userA,
    },
  ];
}

function defaultCategories(): CategoryReference[] {
  return [
    {
      archivedAt: null,
      id: groceriesA,
      name: "Compras",
      parentId: null,
      type: "variable_expense",
      userId: userA,
    },
    {
      archivedAt: null,
      id: marketA,
      name: "Mercado",
      parentId: groceriesA,
      type: "variable_expense",
      userId: userA,
    },
    {
      archivedAt: null,
      id: incomeA,
      name: "Receitas",
      parentId: null,
      type: "income",
      userId: userA,
    },
  ];
}

function defaultCreditCards(): CreditCardReference[] {
  return [
    {
      id: cardA,
      name: "Cartao Azul",
      status: "active",
      userId: userA,
    },
  ];
}

function money(value: string) {
  return parseMoney(value);
}
