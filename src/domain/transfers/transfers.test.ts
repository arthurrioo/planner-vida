import { describe, expect, it } from "vitest";

import { asAccountId } from "@/domain/accounts";
import { asTransactionId, type TransactionRecord } from "@/domain/transactions";
import {
  asUserId,
  DomainError,
  type AuditEvent,
  type AuditService,
  type RepositoryContext,
} from "@/domain/shared";
import {
  asTransferId,
  TransferService,
  type TransferAccountReference,
  type TransferMutation,
  type TransferRecord,
  type TransferRepository,
  type TransferWithTransactions,
} from "./transfers";

const userA = asUserId("00000000-0000-4000-8000-000000001001");
const userB = asUserId("00000000-0000-4000-8000-000000001002");
const contextA: RepositoryContext = { userId: userA };
const sourceAccountA = asAccountId("00000000-0000-4000-8000-000000001003");
const destinationAccountA = asAccountId("00000000-0000-4000-8000-000000001004");
const archivedAccountA = asAccountId("00000000-0000-4000-8000-000000001005");

describe("TransferService", () => {
  it("creates an atomic transfer with linked outflow and inflow statement rows", async () => {
    const repository = new InMemoryTransferRepository();
    const service = createService(repository);

    const result = await service.createTransfer(contextA, {
      amount: "250.45",
      description: "Reserva mensal",
      destinationAccountId: destinationAccountA,
      sourceAccountId: sourceAccountA,
      transferDate: "2026-09-20",
    });

    expect(result.transfer.status).toBe("posted");
    expect(result.transfer.amount.amount).toBe("250.4500");
    expect(result.outflow.transactionType).toBe("transfer");
    expect(result.inflow.transactionType).toBe("transfer");
    expect(result.outflow.transferId).toBe(result.transfer.id);
    expect(result.inflow.transferId).toBe(result.transfer.id);
    expect(result.transfer.outflowTransactionId).toBe(result.outflow.id);
    expect(result.transfer.inflowTransactionId).toBe(result.inflow.id);
    expect(balanceImpact(repository.transfers, sourceAccountA)).toBe(-250.45);
    expect(balanceImpact(repository.transfers, destinationAccountA)).toBe(
      250.45,
    );
    expect(plTotal(repository.transactions)).toBe(0);
  });

  it("rejects same-account, inactive-account, and invalid money transfers", async () => {
    const service = createService(new InMemoryTransferRepository(), {
      accounts: [
        ...defaultAccounts(),
        {
          id: archivedAccountA,
          name: "Arquivada",
          status: "archived",
          type: "checking",
          userId: userA,
        },
      ],
    });

    await expect(
      service.createTransfer(contextA, {
        amount: "10",
        description: "Mesma conta",
        destinationAccountId: sourceAccountA,
        sourceAccountId: sourceAccountA,
        transferDate: "2026-09-20",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    await expect(
      service.createTransfer(contextA, {
        amount: "10",
        description: "Destino arquivado",
        destinationAccountId: archivedAccountA,
        sourceAccountId: sourceAccountA,
        transferDate: "2026-09-20",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await expect(
      service.createTransfer(contextA, {
        amount: "0",
        description: "Zero",
        destinationAccountId: destinationAccountA,
        sourceAccountId: sourceAccountA,
        transferDate: "2026-09-20",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("rejects cross-user account references even if a repository leaks them", async () => {
    const service = createService(new InMemoryTransferRepository(), {
      accounts: [
        defaultAccounts()[0],
        {
          id: destinationAccountA,
          name: "Conta adulterada",
          status: "active",
          type: "checking",
          userId: userB,
        },
      ],
    });

    await expect(
      service.createTransfer(contextA, {
        amount: "10",
        description: "Cross user",
        destinationAccountId: destinationAccountA,
        sourceAccountId: sourceAccountA,
        transferDate: "2026-09-20",
      }),
    ).rejects.toMatchObject({ code: "OWNERSHIP_MISMATCH" });
  });

  it("reverses transfers through transfer lifecycle, removing balance impact without P&L", async () => {
    const repository = new InMemoryTransferRepository();
    const service = createService(repository);
    const created = await service.createTransfer(contextA, {
      amount: "75",
      description: "Voltar",
      destinationAccountId: destinationAccountA,
      sourceAccountId: sourceAccountA,
      transferDate: "2026-09-20",
    });

    const reversed = await service.reverseTransfer(
      contextA,
      created.transfer.id,
      { reason: "Lancamento duplicado" },
    );

    expect(reversed.original.status).toBe("reversed");
    expect(reversed.reversalOutflow.status).toBe("reversed");
    expect(reversed.reversalInflow.reversalOfTransactionId).toBe(
      created.inflow.id,
    );
    expect(balanceImpact(repository.transfers, sourceAccountA)).toBe(0);
    expect(balanceImpact(repository.transfers, destinationAccountA)).toBe(0);
    expect(plTotal(repository.transactions)).toBe(0);

    await expect(
      service.reverseTransfer(contextA, created.transfer.id, {
        reason: "De novo",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("corrects a transfer atomically by reversing the original and posting a replacement", async () => {
    const repository = new InMemoryTransferRepository();
    const service = createService(repository);
    const created = await service.createTransfer(contextA, {
      amount: "100",
      description: "Valor errado",
      destinationAccountId: destinationAccountA,
      sourceAccountId: sourceAccountA,
      transferDate: "2026-09-20",
    });

    const replacement = await service.updateTransfer(
      contextA,
      created.transfer.id,
      {
        amount: "120",
        description: "Valor corrigido",
        destinationAccountId: destinationAccountA,
        sourceAccountId: sourceAccountA,
        transferDate: "2026-09-21",
      },
    );

    const original = await repository.findById(contextA, created.transfer.id);

    expect(original?.status).toBe("reversed");
    expect(replacement.transfer.status).toBe("posted");
    expect(balanceImpact(repository.transfers, sourceAccountA)).toBe(-120);
    expect(balanceImpact(repository.transfers, destinationAccountA)).toBe(120);
    expect(plTotal(repository.transactions)).toBe(0);
  });

  it("rolls back correction when replacement creation fails", async () => {
    const repository = new InMemoryTransferRepository();
    const service = createService(repository);
    const created = await service.createTransfer(contextA, {
      amount: "100",
      description: "Original",
      destinationAccountId: destinationAccountA,
      sourceAccountId: sourceAccountA,
      transferDate: "2026-09-20",
    });

    repository.failCorrectReplacement = true;

    await expect(
      service.updateTransfer(contextA, created.transfer.id, {
        amount: "120",
        description: "Falha",
        destinationAccountId: destinationAccountA,
        sourceAccountId: sourceAccountA,
        transferDate: "2026-09-21",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const original = await repository.findById(contextA, created.transfer.id);

    expect(original?.status).toBe("posted");
    expect(repository.transfers).toHaveLength(1);
    expect(repository.transactions).toHaveLength(2);
  });

  it("denies cross-user read and lifecycle access", async () => {
    const repository = new InMemoryTransferRepository();
    const service = createService(repository);
    const created = await service.createTransfer(contextA, {
      amount: "25",
      description: "Privada",
      destinationAccountId: destinationAccountA,
      sourceAccountId: sourceAccountA,
      transferDate: "2026-09-20",
    });

    await expect(
      service.getTransfer({ userId: userB }, created.transfer.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      service.reverseTransfer({ userId: userB }, created.transfer.id, {
        reason: "tentativa",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("does not fail persisted mutations when audit write fails", async () => {
    const repository = new InMemoryTransferRepository();
    const service = createService(repository, {
      audit: {
        async record() {
          throw new DomainError("EXTERNAL_SERVICE_FAILED", "Audit failed.");
        },
      },
    });

    const created = await service.createTransfer(contextA, {
      amount: "10",
      description: "Audit fail",
      destinationAccountId: destinationAccountA,
      sourceAccountId: sourceAccountA,
      transferDate: "2026-09-20",
    });

    expect(created.transfer.id).toBeTruthy();
    expect(repository.transfers).toHaveLength(1);
  });
});

function createService(
  repository: InMemoryTransferRepository,
  overrides: Partial<{
    accounts: TransferAccountReference[];
    audit: AuditService;
  }> = {},
) {
  return new TransferService({
    audit: overrides.audit ?? auditRecorder(),
    now: () => new Date("2026-09-20T12:00:00.000Z"),
    references: new InMemoryTransferReferenceRepository(overrides),
    repository,
  });
}

class InMemoryTransferRepository implements TransferRepository {
  failCorrectReplacement = false;
  transactions: TransactionRecord[] = [];
  transfers: TransferRecord[] = [];
  private transactionSequence = 1;
  private transferSequence = 1;

  async list(context: RepositoryContext) {
    return this.transfers.filter(
      (transfer) => transfer.userId === context.userId,
    );
  }

  async findById(context: RepositoryContext, id: string) {
    return (
      this.transfers.find(
        (transfer) => transfer.userId === context.userId && transfer.id === id,
      ) ?? null
    );
  }

  async create(context: RepositoryContext, mutation: TransferMutation) {
    return this.createPair(context, mutation);
  }

  async reverse(
    context: RepositoryContext,
    original: TransferRecord,
    reason: string,
  ) {
    const current = await this.findById(context, original.id);

    if (
      !current ||
      current.status !== "posted" ||
      current.originType !== "manual"
    ) {
      throw new DomainError("CONFLICT", "Cannot reverse transfer.");
    }

    const outflow = this.requireTransaction(current.outflowTransactionId);
    const inflow = this.requireTransaction(current.inflowTransactionId);
    const reversalOutflow = this.toTransaction(
      context,
      current,
      outflow.accountId,
      {
        description: `Reversal: ${outflow.description}`,
        reversalOfTransactionId: outflow.id,
        reversalReason: reason,
        status: "reversed",
      },
    );
    const reversalInflow = this.toTransaction(
      context,
      current,
      inflow.accountId,
      {
        description: `Reversal: ${inflow.description}`,
        reversalOfTransactionId: inflow.id,
        reversalReason: reason,
        status: "reversed",
      },
    );
    const updatedOriginal = {
      ...current,
      status: "reversed" as const,
      updatedAt: "2026-09-20T12:00:00.000Z",
    };

    this.transactions.push(reversalOutflow, reversalInflow);
    this.transactions = this.transactions.map((transaction) => {
      if (transaction.id === outflow.id) {
        return {
          ...transaction,
          reversalReason: reason,
          reversedAt: "2026-09-20T12:00:00.000Z",
          reversedByTransactionId: reversalOutflow.id,
          status: "reversed" as const,
        };
      }

      if (transaction.id === inflow.id) {
        return {
          ...transaction,
          reversalReason: reason,
          reversedAt: "2026-09-20T12:00:00.000Z",
          reversedByTransactionId: reversalInflow.id,
          status: "reversed" as const,
        };
      }

      return transaction;
    });
    this.transfers = this.transfers.map((transfer) =>
      transfer.id === current.id ? updatedOriginal : transfer,
    );

    return {
      original: updatedOriginal,
      reversalInflow,
      reversalOutflow,
    };
  }

  async correct(
    context: RepositoryContext,
    original: TransferRecord,
    reason: string,
    replacement: TransferMutation,
  ) {
    const transferSnapshot = [...this.transfers];
    const transactionSnapshot = [...this.transactions];

    try {
      const reversed = await this.reverse(context, original, reason);

      if (this.failCorrectReplacement) {
        throw new DomainError("CONFLICT", "Injected transfer failure.");
      }

      const replacementPair = await this.createPair(context, replacement);

      return {
        ...reversed,
        replacement: replacementPair,
      };
    } catch (error) {
      this.transfers = transferSnapshot;
      this.transactions = transactionSnapshot;
      throw error;
    }
  }

  private createPair(
    context: RepositoryContext,
    mutation: TransferMutation,
  ): TransferWithTransactions {
    const transferId = asTransferId(
      `00000000-0000-4000-8000-${String(this.transferSequence++).padStart(12, "0")}`,
    );
    const transfer: TransferRecord = {
      amount: mutation.amount,
      createdAt: "2026-09-20T12:00:00.000Z",
      currency: "BRL",
      description: mutation.description,
      destinationAccountId: mutation.destinationAccountId,
      id: transferId,
      inflowTransactionId: null,
      originType: mutation.originType,
      outflowTransactionId: null,
      sourceAccountId: mutation.sourceAccountId,
      status: "posted",
      transferDate: mutation.transferDate,
      updatedAt: "2026-09-20T12:00:00.000Z",
      userId: context.userId,
    };
    const outflow = this.toTransaction(
      context,
      transfer,
      transfer.sourceAccountId,
      {
        description: `Transfer out: ${transfer.description}`,
        status: "posted",
      },
    );
    const inflow = this.toTransaction(
      context,
      transfer,
      transfer.destinationAccountId,
      {
        description: `Transfer in: ${transfer.description}`,
        status: "posted",
      },
    );
    const linkedTransfer = {
      ...transfer,
      inflowTransactionId: inflow.id,
      outflowTransactionId: outflow.id,
    };

    this.transfers.push(linkedTransfer);
    this.transactions.push(outflow, inflow);

    return { inflow, outflow, transfer: linkedTransfer };
  }

  private requireTransaction(id: string | null) {
    const transaction = this.transactions.find((record) => record.id === id);

    if (!transaction || transaction.status !== "posted") {
      throw new DomainError("CONFLICT", "Missing transfer transaction.");
    }

    return transaction;
  }

  private toTransaction(
    context: RepositoryContext,
    transfer: TransferRecord,
    accountId: string | null,
    overrides: Partial<TransactionRecord>,
  ): TransactionRecord {
    return {
      accountId: accountId ? asAccountId(accountId) : null,
      amount: transfer.amount,
      categoryId: null,
      competenceDate: transfer.transferDate,
      competenceMonth: `${transfer.transferDate.slice(0, 7)}-01` as never,
      creditCardId: null,
      currency: "BRL",
      description: transfer.description,
      externalFingerprint: null,
      id: asTransactionId(
        `00000000-0000-4000-8001-${String(this.transactionSequence++).padStart(12, "0")}`,
      ),
      notes: null,
      originType: "manual",
      paymentMethod: "bank_transfer",
      postedAt: "2026-09-20T12:00:00.000Z",
      reversalOfTransactionId: null,
      reversalReason: null,
      reversedAt: null,
      reversedByTransactionId: null,
      sourceId: transfer.id,
      sourceType: "transfer",
      status: "posted",
      subcategoryId: null,
      transferId: transfer.id,
      transactionDate: transfer.transferDate,
      transactionType: "transfer",
      userId: context.userId,
      voidedAt: null,
      ...overrides,
    };
  }
}

class InMemoryTransferReferenceRepository {
  private readonly accounts: TransferAccountReference[];

  constructor(overrides: Partial<{ accounts: TransferAccountReference[] }>) {
    this.accounts = overrides.accounts ?? defaultAccounts();
  }

  async findAccountById(_context: RepositoryContext, id: string) {
    return this.accounts.find((account) => account.id === id) ?? null;
  }

  async listAccounts() {
    return this.accounts;
  }
}

function balanceImpact(
  transfers: readonly TransferRecord[],
  accountId: string,
) {
  return transfers
    .filter((transfer) => transfer.status === "posted")
    .reduce((total, transfer) => {
      const amount = Number(transfer.amount.amount);

      if (transfer.sourceAccountId === accountId) {
        return total - amount;
      }

      if (transfer.destinationAccountId === accountId) {
        return total + amount;
      }

      return total;
    }, 0);
}

function plTotal(transactions: readonly TransactionRecord[]) {
  return transactions
    .filter((transaction) => transaction.status === "posted")
    .reduce((total, transaction) => {
      const amount = Number(transaction.amount.amount);

      if (transaction.transactionType === "income") {
        return total + amount;
      }

      if (transaction.transactionType === "expense") {
        return total - amount;
      }

      return total;
    }, 0);
}

function defaultAccounts(): TransferAccountReference[] {
  return [
    {
      id: sourceAccountA,
      name: "Conta origem",
      status: "active",
      type: "checking",
      userId: userA,
    },
    {
      id: destinationAccountA,
      name: "Conta destino",
      status: "active",
      type: "savings",
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
