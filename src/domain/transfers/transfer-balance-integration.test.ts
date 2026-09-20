import { describe, expect, it } from "vitest";

import {
  asAccountId,
  calculateAccountBalance,
  type AccountBalanceMovements,
  type AccountRecord,
} from "@/domain/accounts";
import { asTransactionId, type TransactionRecord } from "@/domain/transactions";
import {
  asUserId,
  parseMoney,
  type Money,
  type RepositoryContext,
} from "@/domain/shared";
import {
  asTransferId,
  TransferService,
  type TransferAccountReference,
  type TransferMutation,
  type TransferRecord,
  type TransferRepository,
} from "./transfers";

const userId = asUserId("00000000-0000-4000-8000-000000002001");
const context: RepositoryContext = { userId };
const sourceAccountId = asAccountId("00000000-0000-4000-8000-000000002002");
const destinationAccountId = asAccountId(
  "00000000-0000-4000-8000-000000002003",
);

describe("M10 transfer rows with M07 balance calculation", () => {
  it("uses real calculateAccountBalance over persisted transfer movements", async () => {
    const repository = new PersistedTransferRepository();
    const service = new TransferService({
      references: {
        async findAccountById(_context, id) {
          return accounts.find((account) => account.id === id) ?? null;
        },
        async listAccounts() {
          return accounts;
        },
      },
      repository,
    });

    await service.createTransfer(context, {
      amount: "125.5000",
      description: "Reserva",
      destinationAccountId,
      sourceAccountId,
      transferDate: "2026-09-20",
    });

    const sourceBalance = calculateAccountBalance(
      account(sourceAccountId, "1000.0000"),
      movementsFromTransfers(repository.transfers, sourceAccountId),
    );
    const destinationBalance = calculateAccountBalance(
      account(destinationAccountId, "100.0000"),
      movementsFromTransfers(repository.transfers, destinationAccountId),
    );

    expect(sourceBalance.amount).toBe("874.5000");
    expect(destinationBalance.amount).toBe("225.5000");
    expect(repository.transactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          categoryId: null,
          transactionType: "transfer",
          transferId: repository.transfers[0]?.id,
        }),
      ]),
    );
  });
});

class PersistedTransferRepository implements TransferRepository {
  transactions: TransactionRecord[] = [];
  transfers: TransferRecord[] = [];
  private sequence = 1;

  async list() {
    return this.transfers;
  }

  async findById(_context: RepositoryContext, id: string) {
    return this.transfers.find((transfer) => transfer.id === id) ?? null;
  }

  async create(context: RepositoryContext, mutation: TransferMutation) {
    const transferId = asTransferId(
      `00000000-0000-4000-8000-${String(this.sequence++).padStart(12, "0")}`,
    );
    const transfer: TransferRecord = {
      amount: mutation.amount,
      currency: "BRL",
      description: mutation.description,
      destinationAccountId: mutation.destinationAccountId,
      id: transferId,
      inflowTransactionId: null,
      originType: "manual",
      outflowTransactionId: null,
      sourceAccountId: mutation.sourceAccountId,
      status: "posted",
      transferDate: mutation.transferDate,
      userId: context.userId,
    };
    const outflow = transaction(context, transfer, mutation.sourceAccountId, 1);
    const inflow = transaction(
      context,
      transfer,
      mutation.destinationAccountId,
      2,
    );
    const linked = {
      ...transfer,
      inflowTransactionId: inflow.id,
      outflowTransactionId: outflow.id,
    };

    this.transfers.push(linked);
    this.transactions.push(outflow, inflow);

    return { inflow, outflow, transfer: linked };
  }

  async reverse(): Promise<never> {
    throw new Error("Not needed for balance integration.");
  }

  async correct(): Promise<never> {
    throw new Error("Not needed for balance integration.");
  }
}

const accounts: TransferAccountReference[] = [
  {
    id: sourceAccountId,
    name: "Origem",
    status: "active",
    type: "checking",
    userId,
  },
  {
    id: destinationAccountId,
    name: "Destino",
    status: "active",
    type: "savings",
    userId,
  },
];

function movementsFromTransfers(
  transfers: readonly TransferRecord[],
  accountId: string,
): AccountBalanceMovements {
  return {
    expense: money("0"),
    income: money("0"),
    incomingTransfers: sumMoney(
      transfers
        .filter(
          (transfer) =>
            transfer.status === "posted" &&
            transfer.destinationAccountId === accountId,
        )
        .map((transfer) => transfer.amount),
    ),
    investment: money("0"),
    invoicePayments: money("0"),
    outgoingTransfers: sumMoney(
      transfers
        .filter(
          (transfer) =>
            transfer.status === "posted" &&
            transfer.sourceAccountId === accountId,
        )
        .map((transfer) => transfer.amount),
    ),
  };
}

function account(
  id: AccountRecord["id"],
  openingBalance: string,
): AccountRecord {
  return {
    archivedAt: null,
    currency: "BRL",
    description: null,
    id,
    institution: null,
    name: "Conta",
    normalizedName: "conta",
    openingBalance: money(openingBalance),
    openingBalanceDate: "2026-09-01" as never,
    overdraftLimit: money("0"),
    status: "active",
    type: "checking",
    userId,
  };
}

function transaction(
  context: RepositoryContext,
  transfer: TransferRecord,
  accountId: AccountRecord["id"],
  sequence: number,
): TransactionRecord {
  return {
    accountId,
    amount: transfer.amount,
    categoryId: null,
    competenceDate: transfer.transferDate,
    competenceMonth: `${transfer.transferDate.slice(0, 7)}-01` as never,
    creditCardId: null,
    currency: "BRL",
    description: transfer.description,
    externalFingerprint: null,
    id: asTransactionId(
      `00000000-0000-4000-8001-${String(sequence).padStart(12, "0")}`,
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
    transactionDate: transfer.transferDate,
    transactionType: "transfer",
    transferId: transfer.id,
    userId: context.userId,
    voidedAt: null,
  };
}

function money(value: string) {
  return parseMoney(value);
}

function sumMoney(values: readonly Money[]) {
  return money(
    formatScaledMoney(
      values.reduce((sum, value) => sum + scaledMoney(value.amount), BigInt(0)),
    ),
  );
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
