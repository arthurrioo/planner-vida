import type { SupabaseClient } from "@supabase/supabase-js";

import { asAccountId, isAccountStatus, isAccountType } from "@/domain/accounts";
import {
  asUserId,
  DEFAULT_CURRENCY_CODE,
  DomainError,
  originTypes,
  parseLocalDate,
  parseMoney,
  type OriginType,
  type RepositoryContext,
} from "@/domain/shared";
import {
  asCreditCardId,
  asTransactionId,
  isPaymentMethod,
  isTransactionStatus,
  isTransactionType,
  type TransactionRecord,
} from "@/domain/transactions";
import {
  asTransferId,
  type TransferAccountReference,
  type TransferMutation,
  type TransferRecord,
  type TransferReferenceRepository,
  type TransferRepository,
} from "@/domain/transfers";
import { asCategoryId } from "@/domain/categories";

type TransferRow = Readonly<{
  amount: string | number;
  created_at?: string;
  currency: string;
  description: string;
  destination_account_id: string;
  id: string;
  inflow_transaction_id: string | null;
  origin_type: string;
  outflow_transaction_id: string | null;
  source_account_id: string;
  status: string;
  transfer_date: string;
  updated_at?: string;
  user_id: string;
}>;

type TransactionRow = Readonly<{
  account_id: string | null;
  amount: string | number;
  category_id: string | null;
  competence_date: string;
  competence_month: string;
  created_at?: string;
  credit_card_id: string | null;
  currency: string;
  description: string | null;
  external_fingerprint: string | null;
  id: string;
  notes: string | null;
  origin_type: string;
  payment_method: string;
  posted_at: string | null;
  reversal_of_transaction_id: string | null;
  reversal_reason: string | null;
  reversed_at: string | null;
  reversed_by_transaction_id: string | null;
  source_id: string | null;
  source_type: string | null;
  status: string;
  subcategory_id: string | null;
  transfer_id: string | null;
  transaction_date: string;
  transaction_type: string;
  updated_at?: string;
  user_id: string;
  voided_at: string | null;
}>;

type AccountReferenceRow = Readonly<{
  id: string;
  name: string;
  status: string;
  type: string;
  user_id: string;
}>;

export class SupabaseTransferRepository implements TransferRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async list(context: RepositoryContext) {
    const { data, error } = await this.supabase
      .from("transfers")
      .select(transferColumns)
      .eq("user_id", context.userId)
      .order("transfer_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      throw mapSupabaseError(error);
    }

    return (data ?? []).map((row) =>
      mapTransferRow(row as unknown as TransferRow),
    );
  }

  async findById(context: RepositoryContext, id: string) {
    const { data, error } = await this.supabase
      .from("transfers")
      .select(transferColumns)
      .eq("user_id", context.userId)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw mapSupabaseError(error);
    }

    return data ? mapTransferRow(data as unknown as TransferRow) : null;
  }

  async create(context: RepositoryContext, mutation: TransferMutation) {
    const { data, error } = await this.supabase.rpc("create_transfer", {
      p_transfer: toTransferRpcPayload(mutation),
    });

    if (error) {
      throw mapSupabaseError(error);
    }

    return mapTransferWithTransactions(data);
  }

  async reverse(
    _context: RepositoryContext,
    original: TransferRecord,
    reason: string,
  ) {
    const { data, error } = await this.supabase.rpc("reverse_transfer", {
      p_reversal_reason: reason,
      p_transfer_id: original.id,
    });

    if (error) {
      throw mapSupabaseError(error);
    }

    const result = assertRpcObject(data);

    return {
      original: mapTransferRow(result.original as TransferRow),
      reversalInflow: mapTransactionRow(
        result.reversal_inflow as TransactionRow,
      ),
      reversalOutflow: mapTransactionRow(
        result.reversal_outflow as TransactionRow,
      ),
    };
  }

  async correct(
    _context: RepositoryContext,
    original: TransferRecord,
    reason: string,
    replacement: TransferMutation,
  ) {
    const { data, error } = await this.supabase.rpc("correct_transfer", {
      p_replacement: toTransferRpcPayload(replacement),
      p_reversal_reason: reason,
      p_transfer_id: original.id,
    });

    if (error) {
      throw mapSupabaseError(error);
    }

    const result = assertRpcObject(data);

    return {
      original: mapTransferRow(result.original as TransferRow),
      replacement: mapTransferWithTransactions(result.replacement),
      reversalInflow: mapTransactionRow(
        result.reversal_inflow as TransactionRow,
      ),
      reversalOutflow: mapTransactionRow(
        result.reversal_outflow as TransactionRow,
      ),
    };
  }
}

export class SupabaseTransferReferenceRepository implements TransferReferenceRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async listAccounts(context: RepositoryContext) {
    const { data, error } = await this.supabase
      .from("accounts")
      .select(accountReferenceColumns)
      .eq("user_id", context.userId)
      .order("name", { ascending: true });

    if (error) {
      throw mapSupabaseError(error);
    }

    return (data ?? []).map((row) =>
      mapAccountReference(row as unknown as AccountReferenceRow),
    );
  }

  async findAccountById(context: RepositoryContext, id: string) {
    const { data, error } = await this.supabase
      .from("accounts")
      .select(accountReferenceColumns)
      .eq("user_id", context.userId)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw mapSupabaseError(error);
    }

    return data
      ? mapAccountReference(data as unknown as AccountReferenceRow)
      : null;
  }
}

const transferColumns = [
  "id",
  "user_id",
  "source_account_id",
  "destination_account_id",
  "amount",
  "currency",
  "transfer_date",
  "description",
  "status",
  "outflow_transaction_id",
  "inflow_transaction_id",
  "origin_type",
  "created_at",
  "updated_at",
].join(", ");

const accountReferenceColumns = [
  "id",
  "user_id",
  "name",
  "type",
  "status",
].join(", ");

function mapTransferWithTransactions(value: unknown) {
  const result = assertRpcObject(value);

  return {
    inflow: mapTransactionRow(result.inflow as TransactionRow),
    outflow: mapTransactionRow(result.outflow as TransactionRow),
    transfer: mapTransferRow(result.transfer as TransferRow),
  };
}

function mapTransferRow(row: TransferRow): TransferRecord {
  if (row.currency !== DEFAULT_CURRENCY_CODE) {
    throw new DomainError("INVARIANT_VIOLATION", "Unsupported currency.", {
      details: { currency: row.currency },
    });
  }

  if (!isTransferStatus(row.status) || !isOriginType(row.origin_type)) {
    throw new DomainError(
      "INVARIANT_VIOLATION",
      "Invalid transfer enum value.",
    );
  }

  return {
    amount: parseMoney(row.amount.toString()),
    createdAt: row.created_at,
    currency: DEFAULT_CURRENCY_CODE,
    description: row.description,
    destinationAccountId: asAccountId(row.destination_account_id),
    id: asTransferId(row.id),
    inflowTransactionId: row.inflow_transaction_id
      ? asTransactionId(row.inflow_transaction_id)
      : null,
    originType: row.origin_type,
    outflowTransactionId: row.outflow_transaction_id
      ? asTransactionId(row.outflow_transaction_id)
      : null,
    sourceAccountId: asAccountId(row.source_account_id),
    status: row.status,
    transferDate: parseLocalDate(row.transfer_date),
    updatedAt: row.updated_at,
    userId: asUserId(row.user_id),
  };
}

function mapTransactionRow(row: TransactionRow): TransactionRecord {
  if (
    row.currency !== DEFAULT_CURRENCY_CODE ||
    !isTransactionType(row.transaction_type) ||
    !isTransactionStatus(row.status) ||
    !isPaymentMethod(row.payment_method) ||
    !isOriginType(row.origin_type)
  ) {
    throw new DomainError(
      "INVARIANT_VIOLATION",
      "Invalid transaction row returned by transfer RPC.",
    );
  }

  return {
    accountId: row.account_id ? asAccountId(row.account_id) : null,
    amount: parseMoney(row.amount.toString()),
    categoryId: row.category_id ? asCategoryId(row.category_id) : null,
    competenceDate: parseLocalDate(row.competence_date),
    competenceMonth: parseLocalDate(row.competence_month),
    createdAt: row.created_at,
    creditCardId: row.credit_card_id
      ? asCreditCardId(row.credit_card_id)
      : null,
    currency: DEFAULT_CURRENCY_CODE,
    description: row.description,
    externalFingerprint: row.external_fingerprint,
    id: asTransactionId(row.id),
    notes: row.notes,
    originType: row.origin_type,
    paymentMethod: row.payment_method,
    postedAt: row.posted_at,
    reversalOfTransactionId: row.reversal_of_transaction_id
      ? asTransactionId(row.reversal_of_transaction_id)
      : null,
    reversalReason: row.reversal_reason,
    reversedAt: row.reversed_at,
    reversedByTransactionId: row.reversed_by_transaction_id
      ? asTransactionId(row.reversed_by_transaction_id)
      : null,
    sourceId: row.source_id,
    sourceType: row.source_type,
    status: row.status,
    subcategoryId: row.subcategory_id ? asCategoryId(row.subcategory_id) : null,
    transferId: row.transfer_id ? asTransferId(row.transfer_id) : null,
    transactionDate: parseLocalDate(row.transaction_date),
    transactionType: row.transaction_type,
    updatedAt: row.updated_at,
    userId: asUserId(row.user_id),
    voidedAt: row.voided_at,
  };
}

function mapAccountReference(
  row: AccountReferenceRow,
): TransferAccountReference {
  if (!isAccountStatus(row.status) || !isAccountType(row.type)) {
    throw new DomainError("INVARIANT_VIOLATION", "Invalid account enum value.");
  }

  return {
    id: asAccountId(row.id),
    name: row.name,
    status: row.status,
    type: row.type,
    userId: asUserId(row.user_id),
  };
}

function toTransferRpcPayload(mutation: TransferMutation) {
  return {
    amount: mutation.amount.amount,
    description: mutation.description,
    destination_account_id: mutation.destinationAccountId,
    source_account_id: mutation.sourceAccountId,
    transfer_date: mutation.transferDate,
  };
}

function assertRpcObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    throw new DomainError("UNEXPECTED", "Unexpected transfer RPC response.", {
      details: { source: "database" },
    });
  }

  return value as Record<string, unknown>;
}

function isOriginType(value: string): value is OriginType {
  return originTypes.includes(value as OriginType);
}

function isTransferStatus(value: string): value is TransferRecord["status"] {
  return value === "posted" || value === "voided" || value === "reversed";
}

function mapSupabaseError(error: { code?: string; message: string }) {
  if (
    error.code === "P0001" &&
    error.message.includes("m10_transfer_validation")
  ) {
    return new DomainError("VALIDATION_FAILED", "Transfer input is invalid.", {
      details: { source: "database" },
    });
  }

  if (
    error.code === "P0001" &&
    error.message.includes("m10_transfer_conflict")
  ) {
    return new DomainError(
      "CONFLICT",
      "Transfer lifecycle transition conflicts with current state.",
      { details: { source: "database" } },
    );
  }

  if (error.code === "42501" || error.code === "PGRST301") {
    return new DomainError("AUTHORIZATION_DENIED", "Transfer access denied.");
  }

  if (error.code === "23503") {
    return new DomainError(
      "CONFLICT",
      "Transfer references missing or incompatible data.",
      { details: { source: "database" } },
    );
  }

  if (error.code === "23514" || error.code === "22P02") {
    return new DomainError("VALIDATION_FAILED", "Transfer input is invalid.", {
      details: { source: "database" },
    });
  }

  if (error.code === "PGRST116") {
    return new DomainError("NOT_FOUND", "Transfer was not found.");
  }

  return new DomainError("UNEXPECTED", "Unexpected transfer storage error.", {
    details: { source: "database" },
  });
}
