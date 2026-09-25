import type { SupabaseClient } from "@supabase/supabase-js";

import { asAccountId, isAccountStatus, isAccountType } from "@/domain/accounts";
import { asCategoryId, isCategoryType } from "@/domain/categories";
import {
  asCreditCardId,
  asTransactionId,
  isPaymentMethod,
  isTransactionStatus,
  isTransactionType,
  type AccountReference,
  type CategoryReference,
  type CreditCardReference,
  type TransactionMutation,
  type TransactionRecord,
  type TransactionRepository,
  type TransactionReversalMutation,
  type TransactionSearch,
  type TransactionReferenceRepository,
} from "@/domain/transactions";
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
import { asTransferId } from "@/domain/transfers";

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

type CategoryReferenceRow = Readonly<{
  archived_at: string | null;
  id: string;
  name: string;
  parent_id: string | null;
  type: string;
  user_id: string;
}>;

type CreditCardReferenceRow = Readonly<{
  id: string;
  name: string;
  status: string;
  user_id: string;
}>;

export class SupabaseTransactionRepository implements TransactionRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async list(context: RepositoryContext, search: TransactionSearch = {}) {
    let query = this.supabase
      .from("transactions")
      .select(transactionColumns)
      .eq("user_id", context.userId)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (search.accountId) {
      query = query.eq("account_id", search.accountId);
    }

    if (search.categoryId) {
      query = query.or(
        `category_id.eq.${search.categoryId},subcategory_id.eq.${search.categoryId}`,
      );
    }

    if (search.creditCardId) {
      query = query.eq("credit_card_id", search.creditCardId);
    }

    if (search.dateFrom) {
      query = query.gte("transaction_date", search.dateFrom);
    }

    if (search.dateTo) {
      query = query.lte("transaction_date", search.dateTo);
    }

    if (search.paymentMethod) {
      query = query.eq("payment_method", search.paymentMethod);
    }

    if (search.status) {
      query = query.eq("status", search.status);
    }

    if (search.transactionType) {
      query = query.eq("transaction_type", search.transactionType);
    }

    if (search.query?.trim()) {
      query = query.ilike("description", `%${search.query.trim()}%`);
    }

    const limit = Math.min(Math.max(search.limit ?? 200, 1), 201);
    const { data, error } =
      search.offset !== undefined
        ? await query.range(search.offset, search.offset + limit - 1)
        : await query.limit(limit);

    if (error) {
      throw mapSupabaseError(error);
    }

    return (data ?? []).map((row) =>
      mapTransactionRow(row as unknown as TransactionRow),
    );
  }

  async findById(context: RepositoryContext, id: string) {
    const { data, error } = await this.supabase
      .from("transactions")
      .select(transactionColumns)
      .eq("user_id", context.userId)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw mapSupabaseError(error);
    }

    return data ? mapTransactionRow(data as unknown as TransactionRow) : null;
  }

  async findByExternalFingerprint(
    context: RepositoryContext,
    fingerprint: string,
  ) {
    const { data, error } = await this.supabase
      .from("transactions")
      .select(transactionColumns)
      .eq("user_id", context.userId)
      .eq("external_fingerprint", fingerprint)
      .maybeSingle();

    if (error) {
      throw mapSupabaseError(error);
    }

    return data ? mapTransactionRow(data as unknown as TransactionRow) : null;
  }

  async create(context: RepositoryContext, mutation: TransactionMutation) {
    const { data, error } = await this.supabase
      .from("transactions")
      .insert(toTransactionInsert(context, mutation))
      .select(transactionColumns)
      .single();

    if (error) {
      throw mapSupabaseError(error);
    }

    return mapTransactionRow(data as unknown as TransactionRow);
  }

  async voidPosted(
    context: RepositoryContext,
    id: string,
    voidedAt: string,
    reason: string,
  ) {
    const { data, error } = await this.supabase
      .from("transactions")
      .update({
        reversal_reason: reason,
        status: "voided",
        voided_at: voidedAt,
      })
      .eq("user_id", context.userId)
      .eq("id", id)
      .eq("status", "posted")
      .eq("origin_type", "manual")
      .select(transactionColumns)
      .single();

    if (error) {
      throw error.code === "PGRST116"
        ? new DomainError(
            "CONFLICT",
            "Only manual posted transactions can be voided.",
          )
        : mapSupabaseError(error);
    }

    return mapTransactionRow(data as unknown as TransactionRow);
  }

  async reverse(
    _context: RepositoryContext,
    original: TransactionRecord,
    reversal: TransactionReversalMutation,
  ) {
    const { data, error } = await this.supabase.rpc("reverse_transaction", {
      p_reversal_reason: reversal.reversalReason,
      p_transaction_id: original.id,
    });

    if (error) {
      throw mapSupabaseError(error);
    }

    return mapReverseRpcResult(data);
  }

  async correct(
    context: RepositoryContext,
    original: TransactionRecord,
    reversal: TransactionReversalMutation,
    replacement: TransactionMutation,
  ) {
    const { data, error } = await this.supabase.rpc("correct_transaction", {
      p_replacement: toTransactionRpcPayload(context, replacement),
      p_reversal_reason: reversal.reversalReason,
      p_transaction_id: original.id,
    });

    if (error) {
      throw mapSupabaseError(error);
    }

    return mapCorrectRpcResult(data);
  }
}

export class SupabaseTransactionReferenceRepository implements TransactionReferenceRepository {
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

  async listCategories(context: RepositoryContext) {
    const { data, error } = await this.supabase
      .from("categories")
      .select(categoryReferenceColumns)
      .eq("user_id", context.userId)
      .order("parent_id", { ascending: true, nullsFirst: true })
      .order("name", { ascending: true });

    if (error) {
      throw mapSupabaseError(error);
    }

    return (data ?? []).map((row) =>
      mapCategoryReference(row as unknown as CategoryReferenceRow),
    );
  }

  async findCategoryById(context: RepositoryContext, id: string) {
    const { data, error } = await this.supabase
      .from("categories")
      .select(categoryReferenceColumns)
      .eq("user_id", context.userId)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw mapSupabaseError(error);
    }

    return data
      ? mapCategoryReference(data as unknown as CategoryReferenceRow)
      : null;
  }

  async listCreditCards(context: RepositoryContext) {
    const { data, error } = await this.supabase
      .from("credit_cards")
      .select(creditCardReferenceColumns)
      .eq("user_id", context.userId)
      .order("name", { ascending: true });

    if (error) {
      throw mapSupabaseError(error);
    }

    return (data ?? []).map((row) =>
      mapCreditCardReference(row as unknown as CreditCardReferenceRow),
    );
  }

  async findCreditCardById(context: RepositoryContext, id: string) {
    const { data, error } = await this.supabase
      .from("credit_cards")
      .select(creditCardReferenceColumns)
      .eq("user_id", context.userId)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw mapSupabaseError(error);
    }

    return data
      ? mapCreditCardReference(data as unknown as CreditCardReferenceRow)
      : null;
  }
}

const transactionColumns = [
  "id",
  "user_id",
  "transaction_type",
  "status",
  "description",
  "amount",
  "currency",
  "transaction_date",
  "competence_date",
  "competence_month",
  "category_id",
  "subcategory_id",
  "transfer_id",
  "payment_method",
  "account_id",
  "credit_card_id",
  "origin_type",
  "source_type",
  "source_id",
  "external_fingerprint",
  "notes",
  "posted_at",
  "voided_at",
  "reversed_at",
  "reversal_of_transaction_id",
  "reversed_by_transaction_id",
  "reversal_reason",
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
const categoryReferenceColumns = [
  "id",
  "user_id",
  "name",
  "parent_id",
  "type",
  "archived_at",
].join(", ");
const creditCardReferenceColumns = ["id", "user_id", "name", "status"].join(
  ", ",
);

function mapTransactionRow(row: TransactionRow): TransactionRecord {
  if (row.currency !== DEFAULT_CURRENCY_CODE) {
    throw new DomainError(
      "INVARIANT_VIOLATION",
      "Unsupported transaction currency.",
      { details: { currency: row.currency } },
    );
  }

  if (
    !isTransactionType(row.transaction_type) ||
    !isTransactionStatus(row.status) ||
    !isPaymentMethod(row.payment_method) ||
    !isOriginType(row.origin_type)
  ) {
    throw new DomainError(
      "INVARIANT_VIOLATION",
      "Invalid transaction enum value.",
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

function mapAccountReference(row: AccountReferenceRow): AccountReference {
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

function mapCategoryReference(row: CategoryReferenceRow): CategoryReference {
  if (!isCategoryType(row.type)) {
    throw new DomainError(
      "INVARIANT_VIOLATION",
      "Invalid category enum value.",
    );
  }

  return {
    archivedAt: row.archived_at,
    id: asCategoryId(row.id),
    name: row.name,
    parentId: row.parent_id ? asCategoryId(row.parent_id) : null,
    type: row.type,
    userId: asUserId(row.user_id),
  };
}

function mapCreditCardReference(
  row: CreditCardReferenceRow,
): CreditCardReference {
  return {
    id: asCreditCardId(row.id),
    name: row.name,
    status: row.status,
    userId: asUserId(row.user_id),
  };
}

function toTransactionInsert(
  context: RepositoryContext,
  mutation: TransactionMutation,
) {
  return {
    account_id: mutation.accountId,
    amount: mutation.amount.amount,
    category_id: mutation.categoryId,
    competence_date: mutation.competenceDate,
    competence_month: mutation.competenceMonth,
    credit_card_id: mutation.creditCardId,
    currency: DEFAULT_CURRENCY_CODE,
    description: mutation.description,
    external_fingerprint: mutation.externalFingerprint,
    notes: mutation.notes,
    origin_type: mutation.originType,
    payment_method: mutation.paymentMethod,
    posted_at: new Date().toISOString(),
    source_id: mutation.sourceId,
    source_type: mutation.sourceType,
    status: mutation.status,
    subcategory_id: mutation.subcategoryId,
    transaction_date: mutation.transactionDate,
    transaction_type: mutation.transactionType,
    user_id: context.userId,
  };
}

function isOriginType(value: string): value is OriginType {
  return originTypes.includes(value as OriginType);
}

function toTransactionRpcPayload(
  context: RepositoryContext,
  mutation: TransactionMutation,
) {
  return {
    ...toTransactionInsert(context, mutation),
    posted_at: undefined,
    user_id: undefined,
  };
}

function mapReverseRpcResult(value: unknown) {
  const result = assertRpcObject(value);

  return {
    original: mapTransactionRow(result.original as TransactionRow),
    reversal: mapTransactionRow(result.reversal as TransactionRow),
  };
}

function mapCorrectRpcResult(value: unknown) {
  const result = assertRpcObject(value);

  return {
    original: mapTransactionRow(result.original as TransactionRow),
    replacement: mapTransactionRow(result.replacement as TransactionRow),
    reversal: mapTransactionRow(result.reversal as TransactionRow),
  };
}

function assertRpcObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    throw new DomainError(
      "UNEXPECTED",
      "Unexpected transaction RPC response.",
      { details: { source: "database" } },
    );
  }

  return value as Record<string, unknown>;
}

function mapSupabaseError(error: { code?: string; message: string }) {
  if (error.code === "23505") {
    return new DomainError(
      "CONFLICT",
      "Transaction conflicts with existing data.",
      { details: { source: "database" } },
    );
  }

  if (
    error.code === "P0001" &&
    error.message.includes("m09_transaction_conflict")
  ) {
    return new DomainError(
      "CONFLICT",
      "Transaction lifecycle transition conflicts with current state.",
      { details: { source: "database" } },
    );
  }

  if (
    error.code === "P0001" &&
    error.message.includes("m09_transaction_validation")
  ) {
    return new DomainError(
      "VALIDATION_FAILED",
      "Transaction input is invalid.",
      { details: { source: "database" } },
    );
  }

  if (error.code === "42501" || error.code === "PGRST301") {
    return new DomainError(
      "AUTHORIZATION_DENIED",
      "Transaction access denied.",
    );
  }

  if (error.code === "23503") {
    return new DomainError(
      "CONFLICT",
      "Transaction references missing or incompatible data.",
      { details: { source: "database" } },
    );
  }

  if (error.code === "22P02") {
    return new DomainError(
      "VALIDATION_FAILED",
      "Transaction input is invalid.",
    );
  }

  if (error.code === "PGRST116") {
    return new DomainError("NOT_FOUND", "Transaction was not found.");
  }

  return new DomainError(
    "UNEXPECTED",
    "Unexpected transaction storage error.",
    {
      details: { source: "database" },
    },
  );
}
