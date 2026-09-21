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
  parseTransferMutation,
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
const closedAccountA = asAccountId("00000000-0000-4000-8000-000000001006");
const activeReplacementAccountA = asAccountId(
  "00000000-0000-4000-8000-000000001007",
);

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
    expect(balanceImpact(repository.transfers, sourceAccountA)).toBe(
      "-250.4500",
    );
    expect(balanceImpact(repository.transfers, destinationAccountA)).toBe(
      "250.4500",
    );
    expect(plTotal(repository.transactions)).toBe("0.0000");
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
        {
          id: closedAccountA,
          name: "Encerrada",
          status: "closed",
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
        amount: "10",
        description: "Origem encerrada",
        destinationAccountId: destinationAccountA,
        sourceAccountId: closedAccountA,
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
    expect(balanceImpact(repository.transfers, sourceAccountA)).toBe("0.0000");
    expect(balanceImpact(repository.transfers, destinationAccountA)).toBe(
      "0.0000",
    );
    expect(plTotal(repository.transactions)).toBe("0.0000");

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
    expect(balanceImpact(repository.transfers, sourceAccountA)).toBe(
      "-120.0000",
    );
    expect(balanceImpact(repository.transfers, destinationAccountA)).toBe(
      "120.0000",
    );
    expect(plTotal(repository.transactions)).toBe("0.0000");
  });

  it("allows correction to preserve historical inactive accounts but rejects changed inactive targets", async () => {
    const repository = new InMemoryTransferRepository();
    const activeService = createService(repository, {
      accounts: [
        ...defaultAccounts(),
        {
          id: activeReplacementAccountA,
          name: "Conta ativa nova",
          status: "active",
          type: "checking",
          userId: userA,
        },
      ],
    });
    const created = await activeService.createTransfer(contextA, {
      amount: "100",
      description: "Historica",
      destinationAccountId: destinationAccountA,
      sourceAccountId: sourceAccountA,
      transferDate: "2026-09-20",
    });

    const archivedSourceService = createService(repository, {
      accounts: [
        { ...defaultAccounts()[0], status: "archived" },
        defaultAccounts()[1],
        {
          id: archivedAccountA,
          name: "Arquivada diferente",
          status: "archived",
          type: "checking",
          userId: userA,
        },
        {
          id: activeReplacementAccountA,
          name: "Conta ativa nova",
          status: "active",
          type: "checking",
          userId: userA,
        },
      ],
    });

    const amountOnly = await archivedSourceService.updateTransfer(
      contextA,
      created.transfer.id,
      {
        amount: "101",
        description: "Mantem origem arquivada",
        destinationAccountId: destinationAccountA,
        sourceAccountId: sourceAccountA,
        transferDate: "2026-09-21",
      },
    );

    expect(amountOnly.transfer.sourceAccountId).toBe(sourceAccountA);

    const createdWithClosedDestination = await activeService.createTransfer(
      contextA,
      {
        amount: "50",
        description: "Destino historico",
        destinationAccountId: destinationAccountA,
        sourceAccountId: sourceAccountA,
        transferDate: "2026-09-22",
      },
    );
    const closedDestinationService = createService(repository, {
      accounts: [
        defaultAccounts()[0],
        { ...defaultAccounts()[1], status: "closed" },
        {
          id: closedAccountA,
          name: "Encerrada diferente",
          status: "closed",
          type: "checking",
          userId: userA,
        },
        {
          id: activeReplacementAccountA,
          name: "Conta ativa nova",
          status: "active",
          type: "checking",
          userId: userA,
        },
      ],
    });

    await expect(
      closedDestinationService.updateTransfer(
        contextA,
        createdWithClosedDestination.transfer.id,
        {
          amount: "51",
          description: "Mantem destino encerrado",
          destinationAccountId: destinationAccountA,
          sourceAccountId: sourceAccountA,
          transferDate: "2026-09-23",
        },
      ),
    ).resolves.toMatchObject({
      transfer: { destinationAccountId: destinationAccountA },
    });

    await expect(
      archivedSourceService.updateTransfer(contextA, amountOnly.transfer.id, {
        amount: "102",
        description: "Troca para arquivada",
        destinationAccountId: destinationAccountA,
        sourceAccountId: archivedAccountA,
        transferDate: "2026-09-24",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await expect(
      closedDestinationService.updateTransfer(
        contextA,
        createdWithClosedDestination.transfer.id,
        {
          amount: "52",
          description: "Troca para encerrada",
          destinationAccountId: closedAccountA,
          sourceAccountId: sourceAccountA,
          transferDate: "2026-09-24",
        },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const activeReplacement = await closedDestinationService.updateTransfer(
      contextA,
      amountOnly.transfer.id,
      {
        amount: "103",
        description: "Troca para ativa",
        destinationAccountId: activeReplacementAccountA,
        sourceAccountId: sourceAccountA,
        transferDate: "2026-09-25",
      },
    );

    expect(activeReplacement.transfer.destinationAccountId).toBe(
      activeReplacementAccountA,
    );
  });

  it("keeps correction options active-only plus the current historical inactive accounts", async () => {
    const service = createService(new InMemoryTransferRepository(), {
      accounts: [
        { ...defaultAccounts()[0], status: "archived" },
        defaultAccounts()[1],
        {
          id: archivedAccountA,
          name: "Arquivada diferente",
          status: "archived",
          type: "checking",
          userId: userA,
        },
      ],
    });
    const transfer = transferRecord({
      sourceAccountId: sourceAccountA,
      destinationAccountId: destinationAccountA,
    });

    await expect(service.listFormOptions(contextA)).resolves.toEqual({
      accounts: [defaultAccounts()[1]],
    });
    await expect(
      service.listCorrectionOptions(contextA, transfer),
    ).resolves.toEqual({
      accounts: [
        defaultAccounts()[1],
        { ...defaultAccounts()[0], status: "archived" },
      ],
    });
  });

  it("validates transfer money and LocalDate boundaries without coercion", () => {
    expect(
      parseTransferMutation({
        amount: "0.0100",
        description: "Minimo",
        destinationAccountId: destinationAccountA,
        sourceAccountId: sourceAccountA,
        transferDate: "2028-02-29",
      }).amount.amount,
    ).toBe("0.0100");
    expect(
      parseTransferMutation({
        amount: "123.4567",
        description: "Precisao",
        destinationAccountId: destinationAccountA,
        sourceAccountId: sourceAccountA,
        transferDate: "2026-09-20",
      }).amount.amount,
    ).toBe("123.4567");

    for (const amount of [
      "123.45678",
      "0",
      "-1",
      "1000000000000000.0000",
      "1e2",
      "1,23",
    ]) {
      expect(() =>
        parseTransferMutation({
          amount,
          description: "Invalido",
          destinationAccountId: destinationAccountA,
          sourceAccountId: sourceAccountA,
          transferDate: "2026-09-20",
        }),
      ).toThrow(DomainError);
    }

    for (const transferDate of ["2026-02-29", "2026-09-20T00:00:00Z"]) {
      expect(() =>
        parseTransferMutation({
          amount: "1.2300",
          description: "Data invalida",
          destinationAccountId: destinationAccountA,
          sourceAccountId: sourceAccountA,
          transferDate,
        }),
      ).toThrow(DomainError);
    }
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

  it("records minimized transfer audit metadata without amount or descriptive fields", async () => {
    const audit = auditRecorder();
    const repository = new InMemoryTransferRepository();
    const service = createService(repository, { audit });

    const created = await service.createTransfer(contextA, {
      amount: "10",
      description: "Metadata privada",
      destinationAccountId: destinationAccountA,
      sourceAccountId: sourceAccountA,
      transferDate: "2026-09-20",
    });
    const reversed = await service.reverseTransfer(
      contextA,
      created.transfer.id,
      { reason: "Duplicado" },
    );
    const replacement = await service.createTransfer(contextA, {
      amount: "20",
      description: "Corrigir",
      destinationAccountId: destinationAccountA,
      sourceAccountId: sourceAccountA,
      transferDate: "2026-09-21",
    });
    await service.updateTransfer(contextA, replacement.transfer.id, {
      amount: "21",
      description: "Corrigido",
      destinationAccountId: destinationAccountA,
      sourceAccountId: sourceAccountA,
      transferDate: "2026-09-22",
    });

    expect(reversed.original.status).toBe("reversed");
    expect(audit.events.map((event) => event.action)).toEqual([
      "transfers.create",
      "transfers.reverse",
      "transfers.create",
      "transfers.reverse_for_correction",
      "transfers.correct",
    ]);

    for (const event of audit.events) {
      expect(event.metadata).toEqual(
        expect.objectContaining({
          requestId: null,
          status: expect.any(String),
        }),
      );
      expect(event.metadata).not.toHaveProperty("amount");
      expect(event.metadata).not.toHaveProperty("description");
      expect(event.metadata).not.toHaveProperty("sourceAccountName");
      expect(event.metadata).not.toHaveProperty("destinationAccountName");
      expect(event.entity?.id).toBeTruthy();
    }
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
  const total = transfers
    .filter((transfer) => transfer.status === "posted")
    .reduce((total, transfer) => {
      const amount = scaledMoney(transfer.amount.amount);

      if (transfer.sourceAccountId === accountId) {
        return total - amount;
      }

      if (transfer.destinationAccountId === accountId) {
        return total + amount;
      }

      return total;
    }, BigInt(0));

  return formatScaledMoney(total);
}

function plTotal(transactions: readonly TransactionRecord[]) {
  const total = transactions
    .filter((transaction) => transaction.status === "posted")
    .reduce((total, transaction) => {
      const amount = scaledMoney(transaction.amount.amount);

      if (transaction.transactionType === "income") {
        return total + amount;
      }

      if (transaction.transactionType === "expense") {
        return total - amount;
      }

      return total;
    }, BigInt(0));

  return formatScaledMoney(total);
}

function scaledMoney(value: string) {
  const sign = value.startsWith("-") ? -BigInt(1) : BigInt(1);
  const unsigned = value.startsWith("-") ? value.slice(1) : value;
  const [integer, fraction = ""] = unsigned.split(".");

  return sign * BigInt(`${integer}${fraction.padEnd(4, "0")}`);
}

function formatScaledMoney(value: bigint) {
  const sign = value < BigInt(0) ? "-" : "";
  const absolute = value < BigInt(0) ? -value : value;
  const raw = absolute.toString().padStart(5, "0");

  return `${sign}${raw.slice(0, -4)}.${raw.slice(-4)}`;
}

function transferRecord(
  overrides: Partial<TransferRecord> = {},
): TransferRecord {
  return {
    amount: { amount: "10.0000" as never, currency: "BRL" },
    currency: "BRL",
    description: "Historica",
    destinationAccountId: destinationAccountA,
    id: asTransferId("00000000-0000-4000-8000-000000001090"),
    inflowTransactionId: asTransactionId(
      "00000000-0000-4000-8000-000000001091",
    ),
    originType: "manual",
    outflowTransactionId: asTransactionId(
      "00000000-0000-4000-8000-000000001092",
    ),
    sourceAccountId: sourceAccountA,
    status: "posted",
    transferDate: "2026-09-20" as never,
    userId: userA,
    ...overrides,
  };
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
