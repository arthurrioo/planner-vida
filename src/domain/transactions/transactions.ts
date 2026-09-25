import {
  assertOwnedByContext,
  createAuditEvent,
  createStructuredLogEvent,
  DEFAULT_CURRENCY_CODE,
  DomainError,
  enumField,
  localDateField,
  moneyField,
  paymentMethods,
  transactionStatuses,
  transactionTypes,
  type AccountStatus,
  type AccountType,
  type AuditService,
  type CategoryType,
  type Logger,
  type LocalDate,
  type Money,
  type OriginType,
  type PaymentMethod,
  type RepositoryContext,
  type TransactionStatus,
  type TransactionType,
  type UserId,
  type ValidationIssue,
  type ValidationResult,
} from "@/domain/shared";
import type { AccountId } from "@/domain/accounts";
import type { CategoryId } from "@/domain/categories";
import type { TransferId } from "@/domain/transfers";

export type TransactionId = string & { readonly __brand: "TransactionId" };
export type CreditCardId = string & { readonly __brand: "CreditCardId" };

export type TransactionRecord = Readonly<{
  accountId: AccountId | null;
  amount: Money;
  categoryId: CategoryId | null;
  competenceDate: LocalDate;
  competenceMonth: LocalDate;
  createdAt?: string;
  creditCardId: CreditCardId | null;
  currency: typeof DEFAULT_CURRENCY_CODE;
  description: string | null;
  externalFingerprint: string | null;
  id: TransactionId;
  notes: string | null;
  originType: OriginType;
  paymentMethod: PaymentMethod;
  postedAt: string | null;
  reversalOfTransactionId: TransactionId | null;
  reversalReason: string | null;
  reversedAt: string | null;
  reversedByTransactionId: TransactionId | null;
  sourceId: string | null;
  sourceType: string | null;
  status: TransactionStatus;
  subcategoryId: CategoryId | null;
  transferId: TransferId | null;
  transactionDate: LocalDate;
  transactionType: TransactionType;
  updatedAt?: string;
  userId: UserId;
  voidedAt: string | null;
}>;

export type TransactionSearch = Readonly<{
  accountId?: AccountId;
  categoryId?: CategoryId;
  creditCardId?: CreditCardId;
  dateFrom?: LocalDate;
  dateTo?: LocalDate;
  limit?: number;
  offset?: number;
  paymentMethod?: PaymentMethod;
  query?: string;
  status?: TransactionStatus;
  transactionType?: TransactionType;
}>;

export type TransactionCommandInput = Readonly<{
  accountId?: unknown;
  amount?: unknown;
  categoryId?: unknown;
  competenceDate?: unknown;
  creditCardId?: unknown;
  description?: unknown;
  externalFingerprint?: unknown;
  notes?: unknown;
  paymentMethod?: unknown;
  sourceId?: unknown;
  sourceType?: unknown;
  transactionDate?: unknown;
  transactionType?: unknown;
}>;

export type TransactionMutation = Readonly<{
  accountId: AccountId | null;
  amount: Money;
  categoryId: CategoryId | null;
  competenceDate: LocalDate;
  competenceMonth: LocalDate;
  creditCardId: CreditCardId | null;
  description: string;
  externalFingerprint: string | null;
  notes: string | null;
  originType: OriginType;
  paymentMethod: PaymentMethod;
  sourceId: string | null;
  sourceType: string | null;
  status: "posted";
  subcategoryId: CategoryId | null;
  transactionDate: LocalDate;
  transactionType: Exclude<TransactionType, "transfer">;
}>;

export type TransactionVoidInput = Readonly<{
  reason?: unknown;
}>;

export type TransactionReferenceRepository = Readonly<{
  findAccountById(
    context: RepositoryContext,
    id: AccountId,
  ): Promise<AccountReference | null>;
  findCategoryById(
    context: RepositoryContext,
    id: CategoryId,
  ): Promise<CategoryReference | null>;
  findCreditCardById(
    context: RepositoryContext,
    id: CreditCardId,
  ): Promise<CreditCardReference | null>;
  listAccounts(context: RepositoryContext): Promise<AccountReference[]>;
  listCategories(context: RepositoryContext): Promise<CategoryReference[]>;
  listCreditCards(context: RepositoryContext): Promise<CreditCardReference[]>;
}>;

export type TransactionRepository = Readonly<{
  create(
    context: RepositoryContext,
    mutation: TransactionMutation,
  ): Promise<TransactionRecord>;
  findByExternalFingerprint(
    context: RepositoryContext,
    fingerprint: string,
  ): Promise<TransactionRecord | null>;
  findById(
    context: RepositoryContext,
    id: TransactionId,
  ): Promise<TransactionRecord | null>;
  list(
    context: RepositoryContext,
    search?: TransactionSearch,
  ): Promise<TransactionRecord[]>;
  reverse(
    context: RepositoryContext,
    original: TransactionRecord,
    reversal: TransactionReversalMutation,
  ): Promise<
    Readonly<{ original: TransactionRecord; reversal: TransactionRecord }>
  >;
  correct(
    context: RepositoryContext,
    original: TransactionRecord,
    reversal: TransactionReversalMutation,
    replacement: TransactionMutation,
  ): Promise<
    Readonly<{
      original: TransactionRecord;
      replacement: TransactionRecord;
      reversal: TransactionRecord;
    }>
  >;
  voidPosted(
    context: RepositoryContext,
    id: TransactionId,
    voidedAt: string,
    reason: string,
  ): Promise<TransactionRecord>;
}>;

export type AccountReference = Readonly<{
  id: AccountId;
  name: string;
  status: AccountStatus;
  type: AccountType;
  userId: UserId;
}>;

export type CategoryReference = Readonly<{
  archivedAt: string | null;
  id: CategoryId;
  name: string;
  parentId: CategoryId | null;
  type: CategoryType;
  userId: UserId;
}>;

export type CreditCardReference = Readonly<{
  id: CreditCardId;
  name: string;
  status: string;
  userId: UserId;
}>;

export type TransactionServiceOptions = Readonly<{
  audit?: AuditService;
  logger?: Logger;
  now?: () => Date;
  references: TransactionReferenceRepository;
  repository: TransactionRepository;
}>;

export type TransactionReversalMutation = TransactionMutation &
  Readonly<{
    reversalOfTransactionId: TransactionId;
    reversalReason: string;
  }>;

const accountImpactPaymentMethods: readonly PaymentMethod[] = [
  "cash",
  "debit",
  "pix",
  "bank_transfer",
  "boleto",
  "benefit_food",
  "benefit_meal",
  "benefit_culture",
  "other",
];

const benefitPaymentMethods: readonly PaymentMethod[] = [
  "benefit_food",
  "benefit_meal",
  "benefit_culture",
];

export class TransactionService {
  private readonly audit?: AuditService;
  private readonly logger?: Logger;
  private readonly now: () => Date;
  private readonly references: TransactionReferenceRepository;
  private readonly repository: TransactionRepository;

  constructor(options: TransactionServiceOptions) {
    this.audit = options.audit;
    this.logger = options.logger;
    this.now = options.now ?? (() => new Date());
    this.references = options.references;
    this.repository = options.repository;
  }

  async listTransactions(
    context: RepositoryContext,
    search: TransactionSearch = {},
  ) {
    return this.repository.list(context, search);
  }

  async listFormOptions(context: RepositoryContext) {
    const [accounts, categories, creditCards] = await Promise.all([
      this.references.listAccounts(context),
      this.references.listCategories(context),
      this.references.listCreditCards(context),
    ]);

    return {
      accounts: accounts.filter((account) => account.status === "active"),
      categories: categories.filter((category) => category.archivedAt === null),
      creditCards: creditCards.filter((card) => card.status === "active"),
    };
  }

  async getTransaction(context: RepositoryContext, id: TransactionId) {
    const transaction = await this.requireTransaction(context, id);

    return transaction;
  }

  async createTransaction(
    context: RepositoryContext,
    input: TransactionCommandInput,
  ) {
    const mutation = await this.prepareMutation(context, input);

    if (mutation.externalFingerprint) {
      const existing = await this.repository.findByExternalFingerprint(
        context,
        mutation.externalFingerprint,
      );

      if (existing) {
        throw new DomainError(
          "IDEMPOTENCY_CONFLICT",
          "Transaction external fingerprint already exists.",
          { details: { field: "externalFingerprint" } },
        );
      }
    }

    const transaction = await this.repository.create(context, mutation);
    await this.recordTransactionAudit(
      context,
      transaction,
      "transactions.create",
    );

    return transaction;
  }

  async updateTransaction(
    context: RepositoryContext,
    id: TransactionId,
    input: TransactionCommandInput,
  ) {
    const existing = await this.requireTransaction(context, id);

    if (
      existing.status !== "posted" ||
      existing.originType !== "manual" ||
      existing.transactionType === "transfer" ||
      existing.transferId !== null
    ) {
      throw new DomainError(
        "CONFLICT",
        "Only manual posted non-transfer transactions can be corrected in Milestone 09.",
        { details: { transactionId: id } },
      );
    }

    const mutation = await this.prepareMutation(context, input, existing);
    const reason = "Corrected by manual edit.";
    const result = await this.repository.correct(
      context,
      existing,
      toReversalMutation(existing, reason),
      mutation,
    );
    await this.recordTransactionAudit(
      context,
      result.original,
      "transactions.reverse_for_correction",
      {
        replacementId: result.replacement.id,
        reversalId: result.reversal.id,
      },
    );
    await this.recordTransactionAudit(
      context,
      result.replacement,
      "transactions.correct",
      {
        originalId: result.original.id,
        reversalId: result.reversal.id,
      },
    );

    return result.replacement;
  }

  async voidTransaction(
    context: RepositoryContext,
    id: TransactionId,
    input: TransactionVoidInput,
  ) {
    const existing = await this.requireTransaction(context, id);

    assertPostedManual(existing);
    const reason = parseReason(input.reason);

    const voided = await this.repository.voidPosted(
      context,
      id,
      this.now().toISOString(),
      reason,
    );
    await this.recordTransactionAudit(context, voided, "transactions.void");

    return voided;
  }

  async reverseTransaction(
    context: RepositoryContext,
    id: TransactionId,
    input: TransactionVoidInput,
  ) {
    const existing = await this.requireTransaction(context, id);

    assertPostedManual(existing);
    const reason = parseReason(input.reason);
    const reversalMutation = toReversalMutation(existing, reason);
    const result = await this.repository.reverse(
      context,
      existing,
      reversalMutation,
    );
    await this.recordTransactionAudit(
      context,
      result.original,
      "transactions.reverse",
      { reversalId: result.reversal.id },
    );

    return result;
  }

  private async requireTransaction(
    context: RepositoryContext,
    id: TransactionId,
  ) {
    const transaction = await this.repository.findById(context, id);

    if (!transaction) {
      throw new DomainError("NOT_FOUND", "Transaction was not found.", {
        details: { transactionId: id },
      });
    }

    assertOwnedByContext(context, transaction);
    return transaction;
  }

  private async prepareMutation(
    context: RepositoryContext,
    input: TransactionCommandInput,
    current?: TransactionRecord,
  ): Promise<TransactionMutation> {
    const parsed = parseTransactionMutation(input);

    const category = parsed.categoryId
      ? await this.requireCategory(context, parsed.categoryId, {
          allowHistorical:
            current !== undefined &&
            (parsed.categoryId === current.categoryId ||
              parsed.categoryId === current.subcategoryId),
        })
      : null;
    const categoryPair = await this.resolveCategoryPair(
      context,
      parsed.transactionType,
      category,
      current,
    );
    const account = parsed.accountId
      ? await this.requireAccount(context, parsed.accountId, {
          allowHistorical:
            current !== undefined && parsed.accountId === current.accountId,
        })
      : null;
    const creditCard = parsed.creditCardId
      ? await this.requireCreditCard(context, parsed.creditCardId)
      : null;

    validatePaymentTarget({
      account,
      creditCard,
      paymentMethod: parsed.paymentMethod,
      transactionType: parsed.transactionType,
    });

    if (
      current?.externalFingerprint &&
      parsed.externalFingerprint &&
      current.externalFingerprint !== parsed.externalFingerprint
    ) {
      const existing = await this.repository.findByExternalFingerprint(
        context,
        parsed.externalFingerprint,
      );

      if (existing && existing.id !== current.id) {
        throw new DomainError(
          "IDEMPOTENCY_CONFLICT",
          "Transaction external fingerprint already exists.",
          { details: { field: "externalFingerprint" } },
        );
      }
    }

    return {
      ...parsed,
      accountId: account?.id ?? null,
      categoryId: categoryPair.categoryId,
      creditCardId: creditCard?.id ?? null,
      status: "posted",
      subcategoryId: categoryPair.subcategoryId,
    };
  }

  private async requireAccount(
    context: RepositoryContext,
    id: AccountId,
    options: Readonly<{ allowHistorical?: boolean }> = {},
  ) {
    const account = await this.references.findAccountById(context, id);

    if (!account) {
      throw new DomainError("NOT_FOUND", "Account was not found.", {
        details: { accountId: id },
      });
    }

    assertOwnedByContext(context, account);

    if (!options.allowHistorical && account.status !== "active") {
      throw new DomainError("CONFLICT", "Account must be active.", {
        details: { accountId: id },
      });
    }

    return account;
  }

  private async requireCategory(
    context: RepositoryContext,
    id: CategoryId,
    options: Readonly<{ allowHistorical?: boolean }> = {},
  ) {
    const category = await this.references.findCategoryById(context, id);

    if (!category) {
      throw new DomainError("NOT_FOUND", "Category was not found.", {
        details: { categoryId: id },
      });
    }

    assertOwnedByContext(context, category);

    if (!options.allowHistorical && category.archivedAt !== null) {
      throw new DomainError("CONFLICT", "Category must be active.", {
        details: { categoryId: id },
      });
    }

    return category;
  }

  private async requireCreditCard(
    context: RepositoryContext,
    id: CreditCardId,
  ) {
    const creditCard = await this.references.findCreditCardById(context, id);

    if (!creditCard) {
      throw new DomainError("NOT_FOUND", "Credit card was not found.", {
        details: { creditCardId: id },
      });
    }

    assertOwnedByContext(context, creditCard);

    if (creditCard.status !== "active") {
      throw new DomainError("CONFLICT", "Credit card must be active.", {
        details: { creditCardId: id },
      });
    }

    return creditCard;
  }

  private async resolveCategoryPair(
    context: RepositoryContext,
    transactionType: Exclude<TransactionType, "transfer">,
    category: CategoryReference | null,
    current?: TransactionRecord,
  ) {
    if (!category) {
      throw new DomainError(
        "VALIDATION_FAILED",
        "Transaction input is invalid.",
        {
          details: { categoryId: "Category is required." },
        },
      );
    }

    const root = category.parentId
      ? await this.requireCategory(context, category.parentId, {
          allowHistorical:
            current !== undefined && category.parentId === current.categoryId,
        })
      : category;
    const allowed = allowedCategoryTypesForTransaction(transactionType);

    if (!allowed.includes(root.type) || !allowed.includes(category.type)) {
      throw new DomainError(
        "VALIDATION_FAILED",
        "Transaction input is invalid.",
        {
          details: {
            categoryId: `Category type must match ${transactionType}.`,
          },
        },
      );
    }

    return category.parentId
      ? { categoryId: root.id, subcategoryId: category.id }
      : { categoryId: category.id, subcategoryId: null };
  }

  private async recordTransactionAudit(
    context: RepositoryContext,
    transaction: TransactionRecord,
    action: string,
    extraMetadata: Readonly<Record<string, string | null>> = {},
  ) {
    if (!this.audit) {
      return;
    }

    try {
      await this.audit.record(
        createAuditEvent({
          action,
          actor: { role: "user", userId: context.userId },
          entity: {
            id: transaction.id,
            ownerUserId: transaction.userId,
            type: "transaction",
          },
          metadata: {
            paymentMethod: transaction.paymentMethod,
            requestId: context.requestId ?? null,
            status: transaction.status,
            transactionType: transaction.transactionType,
            ...extraMetadata,
          },
          occurredAt: this.now().toISOString(),
          originType: "manual",
          severity: "info",
        }),
      );
    } catch (error) {
      this.logger?.emit(
        createStructuredLogEvent({
          context: "TransactionService.recordTransactionAudit",
          level: "error",
          message: "Audit write failed after persisted transaction mutation.",
          occurredAt: this.now().toISOString(),
          requestId: context.requestId,
          userId: context.userId,
          metadata: {
            action,
            errorCode: error instanceof DomainError ? error.code : "UNEXPECTED",
            resourceId: transaction.id,
            resourceType: "transaction",
          },
        }),
      );
    }
  }
}

export function asTransactionId(value: string): TransactionId {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new DomainError("VALIDATION_FAILED", "TransactionId is required.", {
      details: { field: "transactionId" },
    });
  }

  if (!isUuid(trimmed)) {
    throw new DomainError("VALIDATION_FAILED", "TransactionId is invalid.", {
      details: { field: "transactionId" },
    });
  }

  return trimmed as TransactionId;
}

export function asCreditCardId(value: string): CreditCardId {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new DomainError("VALIDATION_FAILED", "CreditCardId is required.", {
      details: { field: "creditCardId" },
    });
  }

  if (!isUuid(trimmed)) {
    throw new DomainError("VALIDATION_FAILED", "CreditCardId is invalid.", {
      details: { field: "creditCardId" },
    });
  }

  return trimmed as CreditCardId;
}

export function parseTransactionMutation(input: TransactionCommandInput): Omit<
  TransactionMutation,
  "accountId" | "categoryId" | "creditCardId" | "status" | "subcategoryId"
> &
  Readonly<{
    accountId: AccountId | null;
    categoryId: CategoryId | null;
    creditCardId: CreditCardId | null;
    transactionType: Exclude<TransactionType, "transfer">;
  }> {
  const description = parseRequiredString(input.description, "description");
  const notes = parseOptionalString(input.notes);
  const transactionType = readEnum(
    enumField(transactionTypes)(input.transactionType, "transactionType"),
  );
  const paymentMethod = readEnum(
    enumField(paymentMethods)(input.paymentMethod, "paymentMethod"),
  );
  const amount = readValue(
    moneyField({ allowZero: false })(input.amount, "amount"),
  );
  const transactionDate = readValue(
    localDateField()(input.transactionDate, "transactionDate"),
  );
  const competenceDate =
    typeof input.competenceDate === "string" && input.competenceDate.trim()
      ? readValue(localDateField()(input.competenceDate, "competenceDate"))
      : transactionDate;

  const issues: ValidationIssue[] = [];

  if (!description.trim()) {
    issues.push({
      code: "too_small",
      message: "Description is required.",
      path: "description",
    });
  }

  if (transactionType === "transfer") {
    issues.push({
      code: "unsupported",
      message: "Transfers must be created by the transfer service.",
      path: "transactionType",
    });
  }

  if (issues.length > 0) {
    throw validationError(issues);
  }

  const supportedTransactionType = transactionType as Exclude<
    TransactionType,
    "transfer"
  >;

  return {
    accountId: parseOptionalId(input.accountId, asAccountIdLoose),
    amount,
    categoryId: parseOptionalId(input.categoryId, asCategoryIdLoose),
    competenceDate,
    competenceMonth: toCompetenceMonth(competenceDate),
    creditCardId: parseOptionalId(input.creditCardId, asCreditCardId),
    description: description.trim(),
    externalFingerprint: null,
    notes,
    originType: "manual",
    paymentMethod,
    sourceId: null,
    sourceType: "manual",
    transactionDate,
    transactionType: supportedTransactionType,
  };
}

export function isTransactionType(value: string): value is TransactionType {
  return transactionTypes.includes(value as TransactionType);
}

export function isTransactionStatus(value: string): value is TransactionStatus {
  return transactionStatuses.includes(value as TransactionStatus);
}

export function isPaymentMethod(value: string): value is PaymentMethod {
  return paymentMethods.includes(value as PaymentMethod);
}

export function toCompetenceMonth(value: LocalDate): LocalDate {
  return `${value.slice(0, 7)}-01` as LocalDate;
}

function assertPostedManual(transaction: TransactionRecord) {
  if (
    transaction.status !== "posted" ||
    transaction.originType !== "manual" ||
    transaction.transactionType === "transfer" ||
    transaction.transferId !== null
  ) {
    throw new DomainError(
      "CONFLICT",
      "Only manual posted non-transfer transactions can be voided or reversed.",
      { details: { transactionId: transaction.id } },
    );
  }
}

function allowedCategoryTypesForTransaction(
  transactionType: Exclude<TransactionType, "transfer">,
): readonly CategoryType[] {
  if (transactionType === "income") {
    return ["income"];
  }

  if (transactionType === "investment") {
    return ["investment"];
  }

  return ["fixed_expense", "variable_expense"];
}

function validatePaymentTarget(
  input: Readonly<{
    account: AccountReference | null;
    creditCard: CreditCardReference | null;
    paymentMethod: PaymentMethod;
    transactionType: Exclude<TransactionType, "transfer">;
  }>,
) {
  if (input.paymentMethod === "credit_card") {
    if (!input.creditCard) {
      throw new DomainError(
        "VALIDATION_FAILED",
        "Transaction input is invalid.",
        {
          details: { creditCardId: "Credit card is required." },
        },
      );
    }

    if (input.account) {
      throw new DomainError(
        "VALIDATION_FAILED",
        "Transaction input is invalid.",
        {
          details: {
            accountId: "Credit-card purchases must not carry account impact.",
          },
        },
      );
    }

    if (input.transactionType === "income") {
      throw new DomainError(
        "VALIDATION_FAILED",
        "Transaction input is invalid.",
        {
          details: { paymentMethod: "Income cannot use credit card payment." },
        },
      );
    }

    return;
  }

  if (!accountImpactPaymentMethods.includes(input.paymentMethod)) {
    throw new DomainError(
      "VALIDATION_FAILED",
      "Transaction input is invalid.",
      {
        details: { paymentMethod: "Unsupported payment method." },
      },
    );
  }

  if (!input.account) {
    throw new DomainError(
      "VALIDATION_FAILED",
      "Transaction input is invalid.",
      {
        details: { accountId: "Account is required for this payment method." },
      },
    );
  }

  if (input.creditCard) {
    throw new DomainError(
      "VALIDATION_FAILED",
      "Transaction input is invalid.",
      {
        details: {
          creditCardId: "Credit card can only be used with credit_card method.",
        },
      },
    );
  }

  if (
    benefitPaymentMethods.includes(input.paymentMethod) &&
    input.account.type !== "benefit"
  ) {
    throw new DomainError(
      "VALIDATION_FAILED",
      "Transaction input is invalid.",
      {
        details: {
          accountId: "Benefit payment methods require a benefit account.",
        },
      },
    );
  }
}

function toReversalMutation(
  original: TransactionRecord,
  reason: string,
): TransactionReversalMutation {
  return {
    accountId: original.accountId,
    amount: original.amount,
    categoryId: original.categoryId,
    competenceDate: original.competenceDate,
    competenceMonth: original.competenceMonth,
    creditCardId: original.creditCardId,
    description: `Reversal: ${original.description ?? original.id}`,
    externalFingerprint: null,
    notes: original.notes,
    originType: "manual",
    paymentMethod: original.paymentMethod,
    reversalOfTransactionId: original.id,
    reversalReason: reason,
    sourceId: null,
    sourceType: "manual_reversal",
    status: "posted",
    subcategoryId: original.subcategoryId,
    transactionDate: original.transactionDate,
    transactionType: original.transactionType as Exclude<
      TransactionType,
      "transfer"
    >,
  };
}

function parseReason(value: unknown) {
  const reason = parseRequiredString(value, "reason");

  if (reason.length < 3) {
    throw validationError([
      {
        code: "too_small",
        message: "Reason must have at least 3 characters.",
        path: "reason",
      },
    ]);
  }

  return reason;
}

function parseRequiredString(value: unknown, path: string) {
  if (typeof value !== "string") {
    throw validationError([
      { code: "invalid_type", message: "Expected a string.", path },
    ]);
  }

  return value.trim();
}

function parseOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseOptionalId<TValue extends string>(
  value: unknown,
  parser: (value: string) => TValue,
) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? parser(trimmed) : null;
}

function readEnum<TValue>(result: ValidationResult<TValue>) {
  return readValue(result);
}

function readValue<TValue>(result: ValidationResult<TValue>) {
  if (!result.ok) {
    throw validationError(result.issues);
  }

  return result.value;
}

function validationError(issues: ValidationIssue[]) {
  return new DomainError("VALIDATION_FAILED", "Transaction input is invalid.", {
    details: issues.reduce<Record<string, string>>((details, issue) => {
      details[issue.path] = issue.message;
      return details;
    }, {}),
  });
}

function asAccountIdLoose(value: string): AccountId {
  return value as AccountId;
}

function asCategoryIdLoose(value: string): CategoryId {
  return value as CategoryId;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
