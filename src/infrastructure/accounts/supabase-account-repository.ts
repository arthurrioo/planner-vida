import type { SupabaseClient } from "@supabase/supabase-js";

import {
  asAccountId,
  isAccountStatus,
  isAccountType,
  zeroMoney,
  type AccountBalanceMovements,
  type AccountId,
  type AccountMutation,
  type AccountRecord,
  type AccountRepository,
} from "@/domain/accounts";
import {
  asUserId,
  addMoney,
  DEFAULT_CURRENCY_CODE,
  DomainError,
  parseLocalDate,
  parseMoney,
  type AccountStatus,
  type Money,
  type RepositoryContext,
} from "@/domain/shared";

type AccountRow = Readonly<{
  archived_at: string | null;
  created_at?: string;
  currency: string;
  description: string | null;
  id: string;
  institution: string | null;
  name: string;
  normalized_name: string;
  opening_balance: string | number;
  opening_balance_date: string;
  overdraft_limit: string | number;
  status: string;
  type: string;
  updated_at?: string;
  user_id: string;
}>;

type TransactionRow = Readonly<{
  amount: string | number;
  credit_card_id: string | null;
  payment_method: string;
  transaction_type: string;
}>;

type TransferRow = Readonly<{
  amount: string | number;
}>;

type InvoicePaymentRow = Readonly<{
  interest_amount: string | number;
  payment_type: string;
  principal_amount: string | number;
}>;

export const ACCOUNT_DEPENDENCY_REFERENCES = [
  { column: "account_id", table: "annual_obligations" },
  { column: "linked_account_id", table: "assets" },
  { column: "account_id", table: "credit_cards" },
  { column: "account_id", table: "events" },
  { column: "account_id", table: "financial_commitments" },
  { column: "account_id", table: "financial_goals" },
  { column: "account_id", table: "installment_plans" },
  { column: "account_id", table: "invoice_payments" },
  { column: "linked_account_id", table: "liabilities" },
  { column: "account_id", table: "subscriptions" },
  { column: "account_id", table: "transactions" },
  { column: "destination_account_id", table: "transfers" },
  { column: "source_account_id", table: "transfers" },
] as const;

export class SupabaseAccountRepository implements AccountRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async list(context: RepositoryContext) {
    const { data, error } = await this.supabase
      .from("accounts")
      .select(accountColumns)
      .eq("user_id", context.userId)
      .order("status", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      throw mapSupabaseError(error);
    }

    return (data ?? []).map((row) =>
      mapAccountRow(row as unknown as AccountRow),
    );
  }

  async findById(context: RepositoryContext, id: AccountId) {
    const { data, error } = await this.supabase
      .from("accounts")
      .select(accountColumns)
      .eq("user_id", context.userId)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw mapSupabaseError(error);
    }

    return data ? mapAccountRow(data as unknown as AccountRow) : null;
  }

  async findActiveByNormalizedName(
    context: RepositoryContext,
    normalizedName: string,
  ) {
    const { data, error } = await this.supabase
      .from("accounts")
      .select(accountColumns)
      .eq("user_id", context.userId)
      .eq("normalized_name", normalizedName)
      .eq("status", "active")
      .is("archived_at", null)
      .maybeSingle();

    if (error) {
      throw mapSupabaseError(error);
    }

    return data ? mapAccountRow(data as unknown as AccountRow) : null;
  }

  async create(context: RepositoryContext, mutation: AccountMutation) {
    const { data, error } = await this.supabase
      .from("accounts")
      .insert(toAccountInsert(context, mutation))
      .select(accountColumns)
      .single();

    if (error) {
      throw mapSupabaseError(error);
    }

    return mapAccountRow(data as unknown as AccountRow);
  }

  async update(
    context: RepositoryContext,
    id: AccountId,
    mutation: AccountMutation,
  ) {
    const { data, error } = await this.supabase
      .from("accounts")
      .update(toAccountUpdate(mutation))
      .eq("user_id", context.userId)
      .eq("id", id)
      .select(accountColumns)
      .single();

    if (error) {
      throw mapSupabaseError(error);
    }

    return mapAccountRow(data as unknown as AccountRow);
  }

  async updateStatus(
    context: RepositoryContext,
    id: AccountId,
    status: AccountStatus,
    archivedAt: string | null,
  ) {
    const { data, error } = await this.supabase
      .from("accounts")
      .update({ archived_at: archivedAt, status })
      .eq("user_id", context.userId)
      .eq("id", id)
      .select(accountColumns)
      .single();

    if (error) {
      throw mapSupabaseError(error);
    }

    return mapAccountRow(data as unknown as AccountRow);
  }

  async delete(context: RepositoryContext, id: AccountId) {
    const { error } = await this.supabase
      .from("accounts")
      .delete()
      .eq("user_id", context.userId)
      .eq("id", id);

    if (error) {
      throw mapSupabaseError(error);
    }
  }

  async countDependencies(context: RepositoryContext, id: AccountId) {
    const counts = await Promise.all(
      ACCOUNT_DEPENDENCY_REFERENCES.map((reference) =>
        this.countBy(reference.table, context, reference.column, id),
      ),
    );

    return counts.reduce((total, count) => total + count, 0);
  }

  async getBalanceMovements(
    context: RepositoryContext,
    account: AccountRecord,
  ): Promise<AccountBalanceMovements> {
    const [
      transactions,
      incomingTransfers,
      outgoingTransfers,
      invoicePayments,
    ] = await Promise.all([
      this.listPostedTransactions(context, account.id),
      this.listTransferAmounts(context, "destination_account_id", account.id),
      this.listTransferAmounts(context, "source_account_id", account.id),
      this.listInvoicePaymentAmounts(context, account.id),
    ]);

    return {
      expense: sumMoney(
        transactions
          .filter(
            (row) =>
              row.transaction_type === "expense" &&
              row.payment_method !== "credit_card" &&
              row.credit_card_id === null,
          )
          .map((row) => row.amount),
      ),
      income: sumMoney(
        transactions
          .filter((row) => row.transaction_type === "income")
          .map((row) => row.amount),
      ),
      incomingTransfers: sumMoney(incomingTransfers.map((row) => row.amount)),
      investment: sumMoney(
        transactions
          .filter(
            (row) =>
              row.transaction_type === "investment" &&
              row.payment_method !== "credit_card" &&
              row.credit_card_id === null,
          )
          .map((row) => row.amount),
      ),
      invoicePayments: sumMoney(
        invoicePayments
          .filter((row) => row.payment_type === "payment")
          .map((row) =>
            addMoney(
              parseMoney(row.principal_amount.toString()),
              parseMoney(row.interest_amount.toString()),
            ),
          ),
      ),
      outgoingTransfers: sumMoney(outgoingTransfers.map((row) => row.amount)),
    };
  }

  private async countBy(
    table: string,
    context: RepositoryContext,
    column: string,
    id: AccountId,
  ) {
    const { count, error } = await this.supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .eq(column, id);

    if (error) {
      throw mapSupabaseError(error);
    }

    return count ?? 0;
  }

  private async listPostedTransactions(
    context: RepositoryContext,
    id: AccountId,
  ) {
    const { data, error } = await this.supabase
      .from("transactions")
      .select("transaction_type, amount, payment_method, credit_card_id")
      .eq("user_id", context.userId)
      .eq("account_id", id)
      .eq("status", "posted");

    if (error) {
      throw mapSupabaseError(error);
    }

    return (data ?? []) as TransactionRow[];
  }

  private async listTransferAmounts(
    context: RepositoryContext,
    column: "destination_account_id" | "source_account_id",
    id: AccountId,
  ) {
    const { data, error } = await this.supabase
      .from("transfers")
      .select("amount")
      .eq("user_id", context.userId)
      .eq(column, id)
      .eq("status", "posted");

    if (error) {
      throw mapSupabaseError(error);
    }

    return (data ?? []) as TransferRow[];
  }

  private async listInvoicePaymentAmounts(
    context: RepositoryContext,
    id: AccountId,
  ) {
    const { data, error } = await this.supabase
      .from("invoice_payments")
      .select("principal_amount, interest_amount, payment_type")
      .eq("user_id", context.userId)
      .eq("account_id", id)
      .eq("status", "posted");

    if (error) {
      throw mapSupabaseError(error);
    }

    return (data ?? []) as InvoicePaymentRow[];
  }
}

const accountColumns = [
  "id",
  "user_id",
  "name",
  "normalized_name",
  "type",
  "institution",
  "description",
  "opening_balance",
  "opening_balance_date",
  "overdraft_limit",
  "currency",
  "status",
  "archived_at",
  "created_at",
  "updated_at",
].join(", ");

function mapAccountRow(row: AccountRow): AccountRecord {
  if (row.currency !== DEFAULT_CURRENCY_CODE) {
    throw new DomainError(
      "INVARIANT_VIOLATION",
      "Unsupported account currency.",
      {
        details: { currency: row.currency },
      },
    );
  }

  if (!isAccountType(row.type) || !isAccountStatus(row.status)) {
    throw new DomainError("INVARIANT_VIOLATION", "Invalid account enum value.");
  }

  return {
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    currency: DEFAULT_CURRENCY_CODE,
    description: row.description,
    id: asAccountId(row.id),
    institution: row.institution,
    name: row.name,
    normalizedName: row.normalized_name,
    openingBalance: parseMoney(row.opening_balance.toString(), {
      allowNegative: true,
    }),
    openingBalanceDate: parseLocalDate(row.opening_balance_date),
    overdraftLimit: parseMoney(row.overdraft_limit.toString()),
    status: row.status,
    type: row.type,
    updatedAt: row.updated_at,
    userId: asUserId(row.user_id),
  };
}

function toAccountInsert(
  context: RepositoryContext,
  mutation: AccountMutation,
) {
  return {
    currency: DEFAULT_CURRENCY_CODE,
    description: mutation.description,
    institution: mutation.institution,
    name: mutation.name,
    normalized_name: mutation.normalizedName,
    opening_balance: mutation.openingBalance.amount,
    opening_balance_date: mutation.openingBalanceDate,
    overdraft_limit: mutation.overdraftLimit.amount,
    type: mutation.type,
    user_id: context.userId,
  };
}

function toAccountUpdate(mutation: AccountMutation) {
  return {
    description: mutation.description,
    institution: mutation.institution,
    name: mutation.name,
    normalized_name: mutation.normalizedName,
    opening_balance: mutation.openingBalance.amount,
    opening_balance_date: mutation.openingBalanceDate,
    overdraft_limit: mutation.overdraftLimit.amount,
    type: mutation.type,
  };
}

function sumMoney(values: readonly (string | number | Money)[]) {
  return values.reduce<Money>((total, value) => {
    const next = isMoney(value) ? value : parseMoney(value.toString());

    return addMoney(total, next);
  }, zeroMoney());
}

function isMoney(value: string | number | Money): value is Money {
  return typeof value === "object" && "amount" in value && "currency" in value;
}

function mapSupabaseError(error: { code?: string; message: string }) {
  if (error.code === "23505") {
    return new DomainError(
      "CONFLICT",
      "Account conflicts with existing data.",
      {
        details: { source: "database" },
      },
    );
  }

  if (error.code === "42501" || error.code === "PGRST301") {
    return new DomainError("AUTHORIZATION_DENIED", "Account access denied.");
  }

  if (error.code === "23503") {
    return new DomainError(
      "CONFLICT",
      "Account is referenced by dependent records.",
      { details: { source: "database" } },
    );
  }

  return new DomainError("UNEXPECTED", "Unexpected account storage error.", {
    details: { source: "database" },
  });
}
