import type { SupabaseClient } from "@supabase/supabase-js";

import { asAccountId, isAccountStatus, isAccountType } from "@/domain/accounts";
import { asCategoryId, isCategoryType } from "@/domain/categories";
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
  asInstallmentId,
  asInstallmentPlanId,
  asFinancialCommitmentId,
  isInstallmentPlanStatus,
  isInstallmentStatus,
  type InstallmentAccountReference,
  type InstallmentCategoryReference,
  type InstallmentCreditCardReference,
  type InstallmentMutation,
  type InstallmentPlanMutation,
  type InstallmentPlanRecord,
  type InstallmentPlanWithInstallments,
  type InstallmentRecord,
  type InstallmentReferenceRepository,
  type InstallmentRepository,
} from "@/domain/installments";
import {
  asCreditCardId,
  asTransactionId,
  isPaymentMethod,
} from "@/domain/transactions";

type InstallmentPlanRow = Readonly<{
  account_id: string | null;
  category_id: string | null;
  created_at?: string;
  credit_card_id: string | null;
  currency: string;
  description: string;
  first_due_date: string;
  id: string;
  merchant_key: string | null;
  merchant_name: string | null;
  origin_type: string;
  payment_method: string;
  purchase_date: string;
  source_id: string | null;
  source_type: string | null;
  status: string;
  subcategory_id: string | null;
  total_amount: string | number;
  total_installments: number;
  updated_at?: string;
  user_id: string;
}>;

type InstallmentRow = Readonly<{
  amount: string | number;
  competence_date: string | null;
  created_at?: string;
  due_date: string;
  financial_commitment_id: string | null;
  id: string;
  import_item_id: string | null;
  installment_number: number;
  invoice_id: string | null;
  plan_id: string;
  status: string;
  transaction_id: string | null;
  updated_at?: string;
  user_id: string;
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

export class SupabaseInstallmentRepository implements InstallmentRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async listPlans(context: RepositoryContext) {
    const { data, error } = await this.supabase
      .from("installment_plans")
      .select(`${installmentPlanColumns}, installments(${installmentColumns})`)
      .eq("user_id", context.userId)
      .order("first_due_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      throw mapSupabaseError(error);
    }

    return (data ?? []).map((row) => mapPlanWithInstallments(row));
  }

  async findPlanById(context: RepositoryContext, id: string) {
    const { data, error } = await this.supabase
      .from("installment_plans")
      .select(`${installmentPlanColumns}, installments(${installmentColumns})`)
      .eq("user_id", context.userId)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw mapSupabaseError(error);
    }

    return data ? mapPlanWithInstallments(data) : null;
  }

  async findInstallmentById(context: RepositoryContext, id: string) {
    const { data, error } = await this.supabase
      .from("installments")
      .select(
        `plan_id, installment_plans!inner(${installmentPlanColumns}, installments(${installmentColumns}))`,
      )
      .eq("user_id", context.userId)
      .eq("id", id)
      .eq("installment_plans.user_id", context.userId)
      .maybeSingle();

    if (error) {
      throw mapSupabaseError(error);
    }

    if (!data) {
      return null;
    }

    const joined = data as unknown as {
      installment_plans: unknown;
    };
    return mapPlanWithInstallments(joined.installment_plans);
  }

  async createPlan(
    _context: RepositoryContext,
    mutation: InstallmentPlanMutation,
  ) {
    const { data, error } = await this.supabase.rpc("create_installment_plan", {
      p_plan: toPlanRpcPayload(mutation),
    });

    if (error) {
      throw mapSupabaseError(error);
    }

    return mapPlanWithInstallmentsFromRpc(data);
  }

  async realizeInstallment(
    _context: RepositoryContext,
    _plan: InstallmentPlanRecord,
    installment: InstallmentRecord,
    transactionDate: string,
  ) {
    const { data, error } = await this.supabase.rpc("realize_installment", {
      p_installment_id: installment.id,
      p_transaction_date: transactionDate,
    });

    if (error) {
      throw mapSupabaseError(error);
    }

    return mapPlanWithInstallmentsFromRpc(data);
  }

  async cancelPlan(
    _context: RepositoryContext,
    plan: InstallmentPlanRecord,
    reason: string,
  ) {
    const { data, error } = await this.supabase.rpc("cancel_installment_plan", {
      p_plan_id: plan.id,
      p_reversal_reason: reason,
    });

    if (error) {
      throw mapSupabaseError(error);
    }

    return mapPlanWithInstallmentsFromRpc(data);
  }
}

export class SupabaseInstallmentReferenceRepository implements InstallmentReferenceRepository {
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

const installmentPlanColumns = [
  "id",
  "user_id",
  "description",
  "merchant_name",
  "merchant_key",
  "total_amount",
  "currency",
  "total_installments",
  "first_due_date",
  "purchase_date",
  "category_id",
  "subcategory_id",
  "payment_method",
  "account_id",
  "credit_card_id",
  "status",
  "origin_type",
  "source_type",
  "source_id",
  "created_at",
  "updated_at",
].join(", ");

const installmentColumns = [
  "id",
  "user_id",
  "plan_id",
  "installment_number",
  "amount",
  "due_date",
  "competence_date",
  "status",
  "transaction_id",
  "financial_commitment_id",
  "invoice_id",
  "import_item_id",
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

function mapPlanWithInstallments(
  value: unknown,
): InstallmentPlanWithInstallments {
  const row = value as InstallmentPlanRow & {
    installments?: readonly InstallmentRow[];
  };
  const installments = [...(row.installments ?? [])]
    .map(mapInstallmentRow)
    .sort((left, right) => left.installmentNumber - right.installmentNumber);

  return {
    installments,
    plan: mapInstallmentPlanRow(row),
  };
}

function mapPlanWithInstallmentsFromRpc(value: unknown) {
  const result = assertRpcObject(value);

  return {
    installments: ((result.installments as readonly InstallmentRow[]) ?? [])
      .map(mapInstallmentRow)
      .sort((left, right) => left.installmentNumber - right.installmentNumber),
    plan: mapInstallmentPlanRow(result.plan as InstallmentPlanRow),
  };
}

function mapInstallmentPlanRow(row: InstallmentPlanRow): InstallmentPlanRecord {
  if (row.currency !== DEFAULT_CURRENCY_CODE) {
    throw new DomainError(
      "INVARIANT_VIOLATION",
      "Unsupported installment currency.",
      { details: { currency: row.currency } },
    );
  }

  if (
    !isInstallmentPlanStatus(row.status) ||
    !isPaymentMethod(row.payment_method) ||
    !isOriginType(row.origin_type)
  ) {
    throw new DomainError(
      "INVARIANT_VIOLATION",
      "Invalid installment plan enum value.",
    );
  }

  return {
    accountId: row.account_id ? asAccountId(row.account_id) : null,
    categoryId: row.category_id ? asCategoryId(row.category_id) : null,
    createdAt: row.created_at,
    creditCardId: row.credit_card_id
      ? asCreditCardId(row.credit_card_id)
      : null,
    currency: DEFAULT_CURRENCY_CODE,
    description: row.description,
    firstDueDate: parseLocalDate(row.first_due_date),
    id: asInstallmentPlanId(row.id),
    merchantKey: row.merchant_key,
    merchantName: row.merchant_name,
    originType: row.origin_type,
    paymentMethod: row.payment_method,
    purchaseDate: parseLocalDate(row.purchase_date),
    sourceId: row.source_id,
    sourceType: row.source_type,
    status: row.status,
    subcategoryId: row.subcategory_id ? asCategoryId(row.subcategory_id) : null,
    totalAmount: parseMoney(row.total_amount.toString()),
    totalInstallments: row.total_installments,
    updatedAt: row.updated_at,
    userId: asUserId(row.user_id),
  };
}

function mapInstallmentRow(row: InstallmentRow): InstallmentRecord {
  if (!isInstallmentStatus(row.status)) {
    throw new DomainError(
      "INVARIANT_VIOLATION",
      "Invalid installment enum value.",
    );
  }

  return {
    amount: parseMoney(row.amount.toString()),
    competenceDate: row.competence_date
      ? parseLocalDate(row.competence_date)
      : null,
    createdAt: row.created_at,
    dueDate: parseLocalDate(row.due_date),
    financialCommitmentId: row.financial_commitment_id
      ? asFinancialCommitmentId(row.financial_commitment_id)
      : null,
    id: asInstallmentId(row.id),
    importItemId: row.import_item_id,
    installmentNumber: row.installment_number,
    invoiceId: row.invoice_id,
    planId: asInstallmentPlanId(row.plan_id),
    status: row.status,
    transactionId: row.transaction_id
      ? asTransactionId(row.transaction_id)
      : null,
    updatedAt: row.updated_at,
    userId: asUserId(row.user_id),
  };
}

function mapAccountReference(
  row: AccountReferenceRow,
): InstallmentAccountReference {
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

function mapCategoryReference(
  row: CategoryReferenceRow,
): InstallmentCategoryReference {
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
): InstallmentCreditCardReference {
  return {
    id: asCreditCardId(row.id),
    name: row.name,
    status: row.status,
    userId: asUserId(row.user_id),
  };
}

function toPlanRpcPayload(mutation: InstallmentPlanMutation) {
  return {
    account_id: mutation.accountId,
    category_id: mutation.categoryId,
    credit_card_id: mutation.creditCardId,
    description: mutation.description,
    first_due_date: mutation.firstDueDate,
    installments: mutation.installments.map(toInstallmentPayload),
    merchant_key: mutation.merchantKey,
    merchant_name: mutation.merchantName,
    payment_method: mutation.paymentMethod,
    purchase_date: mutation.purchaseDate,
    source_id: mutation.sourceId,
    source_type: mutation.sourceType,
    subcategory_id: mutation.subcategoryId,
    total_amount: mutation.totalAmount.amount,
    total_installments: mutation.totalInstallments,
  };
}

function toInstallmentPayload(mutation: InstallmentMutation) {
  return {
    amount: mutation.amount.amount,
    competence_date: mutation.competenceDate,
    due_date: mutation.dueDate,
    installment_number: mutation.installmentNumber,
  };
}

function isOriginType(value: string): value is OriginType {
  return originTypes.includes(value as OriginType);
}

function assertRpcObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    throw new DomainError(
      "UNEXPECTED",
      "Unexpected installment RPC response.",
      { details: { source: "database" } },
    );
  }

  return value as Record<string, unknown>;
}

function mapSupabaseError(error: { code?: string; message: string }) {
  if (
    error.code === "P0001" &&
    error.message.includes("m12_installment_validation")
  ) {
    return new DomainError(
      "VALIDATION_FAILED",
      "Installment input is invalid.",
      {
        details: { source: "database" },
      },
    );
  }

  if (
    error.code === "P0001" &&
    error.message.includes("m12_installment_conflict")
  ) {
    return new DomainError(
      "CONFLICT",
      "Installment lifecycle transition conflicts with current state.",
      { details: { source: "database" } },
    );
  }

  if (error.code === "42501" || error.code === "PGRST301") {
    return new DomainError(
      "AUTHORIZATION_DENIED",
      "Installment access denied.",
    );
  }

  if (error.code === "23503" || error.code === "23514") {
    return new DomainError(
      "CONFLICT",
      "Installment references missing or incompatible data.",
      { details: { source: "database" } },
    );
  }

  if (error.code === "22P02") {
    return new DomainError(
      "VALIDATION_FAILED",
      "Installment input is invalid.",
    );
  }

  if (error.code === "PGRST116") {
    return new DomainError("NOT_FOUND", "Installment plan was not found.");
  }

  return new DomainError(
    "UNEXPECTED",
    "Unexpected installment storage error.",
    { details: { source: "database" } },
  );
}
