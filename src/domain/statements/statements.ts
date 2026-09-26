import {
  type AccountService,
  type AccountWithBalance,
  asAccountId,
} from "@/domain/accounts";
import { asCategoryId, type CategoryId } from "@/domain/categories";
import {
  assertOwnedByContext,
  DomainError,
  enumField,
  localDateField,
  type LocalDate,
  type PaymentMethod,
  type RepositoryContext,
  type TransactionStatus,
  type TransactionType,
  type ValidationIssue,
} from "@/domain/shared";
import {
  asCreditCardId,
  type AccountReference,
  type CategoryReference,
  type CreditCardId,
  type CreditCardReference,
  type TransactionRecord,
  type TransactionReferenceRepository,
  type TransactionRepository,
  type TransactionSearch,
} from "@/domain/transactions";

export type StatementQueryInput = Readonly<{
  accountId?: unknown;
  categoryId?: unknown;
  creditCardId?: unknown;
  dateFrom?: unknown;
  dateTo?: unknown;
  page?: unknown;
  pageSize?: unknown;
  paymentMethod?: unknown;
  query?: unknown;
  status?: unknown;
  transactionType?: unknown;
}>;

export type StatementFilter = Readonly<{
  accountId?: AccountReference["id"];
  categoryId?: CategoryId;
  creditCardId?: CreditCardId;
  dateFrom?: LocalDate;
  dateTo?: LocalDate;
  paymentMethod?: PaymentMethod;
  query?: string;
  status?: TransactionStatus;
  transactionType?: TransactionType;
}>;

export type StatementEntry = Readonly<{
  account: AccountReference | null;
  accountName: string | null;
  category: CategoryReference | null;
  categoryLabel: string | null;
  creditCard: CreditCardReference | null;
  creditCardName: string | null;
  detailPath: string;
  transaction: TransactionRecord;
}>;

export type StatementResult = Readonly<{
  accountBalances: readonly AccountWithBalance[];
  entries: readonly StatementEntry[];
  filters: StatementFilter;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  options: Readonly<{
    accounts: readonly AccountReference[];
    categories: readonly CategoryReference[];
    creditCards: readonly CreditCardReference[];
  }>;
  page: number;
  pageSize: number;
}>;

export type StatementServiceOptions = Readonly<{
  accountService: Pick<AccountService, "listAccounts">;
  references: Pick<
    TransactionReferenceRepository,
    "listAccounts" | "listCategories" | "listCreditCards"
  >;
  transactions: Pick<TransactionRepository, "list">;
}>;

type MutableTransactionSearch = {
  -readonly [TKey in keyof TransactionSearch]?: TransactionSearch[TKey];
};

const defaultPage = 1;
const defaultPageSize = 25;
const maxPageSize = 100;

export class StatementService {
  private readonly accountService: Pick<AccountService, "listAccounts">;
  private readonly references: Pick<
    TransactionReferenceRepository,
    "listAccounts" | "listCategories" | "listCreditCards"
  >;
  private readonly transactions: Pick<TransactionRepository, "list">;

  constructor(options: StatementServiceOptions) {
    this.accountService = options.accountService;
    this.references = options.references;
    this.transactions = options.transactions;
  }

  async getStatement(
    context: RepositoryContext,
    input: StatementQueryInput = {},
  ): Promise<StatementResult> {
    const parsed = parseStatementQuery(input);
    const [accounts, categories, creditCards, accountBalances] =
      await Promise.all([
        this.references.listAccounts(context),
        this.references.listCategories(context),
        this.references.listCreditCards(context),
        this.accountService.listAccounts(context),
      ]);

    for (const record of [
      ...accounts,
      ...categories,
      ...creditCards,
      ...accountBalances,
    ]) {
      assertOwnedByContext(context, record);
    }

    const rows = await this.transactions.list(context, {
      ...parsed.filters,
      limit: parsed.pageSize + 1,
      offset: (parsed.page - 1) * parsed.pageSize,
    });

    for (const row of rows) {
      assertOwnedByContext(context, row);
    }

    const entries = rows
      .slice(0, parsed.pageSize)
      .map((transaction) =>
        toStatementEntry(transaction, accounts, categories, creditCards),
      );

    return {
      accountBalances,
      entries,
      filters: parsed.filters,
      hasNextPage: rows.length > parsed.pageSize,
      hasPreviousPage: parsed.page > 1,
      options: { accounts, categories, creditCards },
      page: parsed.page,
      pageSize: parsed.pageSize,
    };
  }
}

function parseStatementQuery(input: StatementQueryInput) {
  const issues: ValidationIssue[] = [];
  const filters: MutableTransactionSearch = {};
  const query = parseOptionalText(input.query);

  if (query) {
    filters.query = query;
  }

  if (input.dateFrom !== undefined && input.dateFrom !== "") {
    const dateFrom = localDateField()(input.dateFrom, "dateFrom");
    if (dateFrom.ok) {
      filters.dateFrom = dateFrom.value;
    } else {
      issues.push(...dateFrom.issues);
    }
  }

  if (input.dateTo !== undefined && input.dateTo !== "") {
    const dateTo = localDateField()(input.dateTo, "dateTo");
    if (dateTo.ok) {
      filters.dateTo = dateTo.value;
    } else {
      issues.push(...dateTo.issues);
    }
  }

  if (input.transactionType !== undefined && input.transactionType !== "") {
    const transactionType = enumField([
      "income",
      "expense",
      "transfer",
      "investment",
    ] as const)(input.transactionType, "transactionType");
    if (transactionType.ok) {
      filters.transactionType = transactionType.value;
    } else {
      issues.push(...transactionType.issues);
    }
  }

  if (input.status !== undefined && input.status !== "") {
    const status = enumField([
      "draft",
      "posted",
      "voided",
      "reversed",
    ] as const)(input.status, "status");
    if (status.ok) {
      filters.status = status.value;
    } else {
      issues.push(...status.issues);
    }
  }

  if (input.paymentMethod !== undefined && input.paymentMethod !== "") {
    const paymentMethod = enumField([
      "cash",
      "debit",
      "credit_card",
      "pix",
      "bank_transfer",
      "boleto",
      "benefit_food",
      "benefit_meal",
      "benefit_culture",
      "other",
    ] as const)(input.paymentMethod, "paymentMethod");
    if (paymentMethod.ok) {
      filters.paymentMethod = paymentMethod.value;
    } else {
      issues.push(...paymentMethod.issues);
    }
  }

  parseOptionalUuid(input.accountId, "accountId", asAccountId, issues, (id) => {
    filters.accountId = id;
  });
  parseOptionalUuid(
    input.categoryId,
    "categoryId",
    asCategoryId,
    issues,
    (id) => {
      filters.categoryId = id;
    },
  );
  parseOptionalUuid(
    input.creditCardId,
    "creditCardId",
    asCreditCardId,
    issues,
    (id) => {
      filters.creditCardId = id;
    },
  );

  if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
    issues.push({
      code: "invalid_range",
      message: "Start date must be before or equal to end date.",
      path: "dateFrom",
    });
  }

  if (issues.length > 0) {
    throw new DomainError(
      "VALIDATION_FAILED",
      "Statement filters are invalid.",
      {
        details: Object.fromEntries(
          issues.map((issue) => [issue.path, issue.message]),
        ),
      },
    );
  }

  return {
    filters,
    page: parsePositiveInteger(input.page, defaultPage),
    pageSize: Math.min(
      parsePositiveInteger(input.pageSize, defaultPageSize),
      maxPageSize,
    ),
  };
}

function parseOptionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parsePositiveInteger(value: unknown, fallback: number) {
  if (typeof value !== "string" && typeof value !== "number") {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseOptionalUuid<TValue>(
  value: unknown,
  field: string,
  parser: (value: string) => TValue,
  issues: ValidationIssue[],
  assign: (value: TValue) => void,
) {
  if (value === undefined || value === "") {
    return;
  }

  if (typeof value !== "string") {
    issues.push({
      code: "invalid_type",
      message: `${field} must be a string.`,
      path: field,
    });
    return;
  }

  try {
    assign(parser(value));
  } catch (error) {
    issues.push({
      code: "invalid_uuid",
      message:
        error instanceof DomainError ? error.message : `${field} is invalid.`,
      path: field,
    });
  }
}

function toStatementEntry(
  transaction: TransactionRecord,
  accounts: readonly AccountReference[],
  categories: readonly CategoryReference[],
  creditCards: readonly CreditCardReference[],
): StatementEntry {
  const account =
    accounts.find((candidate) => candidate.id === transaction.accountId) ??
    null;
  const category = resolveCategory(transaction, categories);
  const creditCard =
    creditCards.find(
      (candidate) => candidate.id === transaction.creditCardId,
    ) ?? null;

  return {
    account,
    accountName: account?.name ?? null,
    category,
    categoryLabel: category ? formatCategoryLabel(category, categories) : null,
    creditCard,
    creditCardName: creditCard?.name ?? null,
    detailPath:
      transaction.transactionType === "transfer" && transaction.transferId
        ? `/app/financeiro/transferencias/${transaction.transferId}`
        : `/app/financeiro/transacoes/${transaction.id}`,
    transaction,
  };
}

function resolveCategory(
  transaction: TransactionRecord,
  categories: readonly CategoryReference[],
) {
  const categoryId = transaction.subcategoryId ?? transaction.categoryId;

  return categoryId
    ? (categories.find((candidate) => candidate.id === categoryId) ?? null)
    : null;
}

function formatCategoryLabel(
  category: CategoryReference,
  categories: readonly CategoryReference[],
) {
  if (!category.parentId) {
    return category.name;
  }

  const parent = categories.find(
    (candidate) => candidate.id === category.parentId,
  );

  return parent ? `${parent.name} / ${category.name}` : category.name;
}
