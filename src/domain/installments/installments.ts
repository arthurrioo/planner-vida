import { asAccountId, type AccountId } from "@/domain/accounts";
import { asCategoryId, type CategoryId } from "@/domain/categories";
import {
  addMonthsClamped,
  assertOwnedByContext,
  createAuditEvent,
  createStructuredLogEvent,
  DEFAULT_CURRENCY_CODE,
  DomainError,
  enumField,
  installmentPlanStatuses,
  installmentStatuses,
  localDateField,
  moneyField,
  moneyFromMinorUnits,
  normalizeDisplayText,
  normalizeName,
  paymentMethods,
  type AccountStatus,
  type AccountType,
  type AuditService,
  type CategoryType,
  type CanonicalEnumValue,
  type Logger,
  type LocalDate,
  type Money,
  type OriginType,
  type PaymentMethod,
  type RepositoryContext,
  type UserId,
  type ValidationIssue,
} from "@/domain/shared";
import {
  asCreditCardId,
  type CreditCardId,
  type TransactionId,
} from "@/domain/transactions";

export type InstallmentPlanId = string & {
  readonly __brand: "InstallmentPlanId";
};
export type InstallmentId = string & { readonly __brand: "InstallmentId" };
export type FinancialCommitmentId = string & {
  readonly __brand: "FinancialCommitmentId";
};

export type InstallmentPlanStatus =
  CanonicalEnumValue<"installment_plan_status">;
export type InstallmentStatus = CanonicalEnumValue<"installment_status">;

export const INSTALLMENT_DOMAIN_MAX = 60;
export const INSTALLMENT_ORDINARY_PURCHASE_UI_MAX = 24;

export type InstallmentPlanRecord = Readonly<{
  accountId: AccountId | null;
  categoryId: CategoryId | null;
  createdAt?: string;
  creditCardId: CreditCardId | null;
  currency: typeof DEFAULT_CURRENCY_CODE;
  description: string;
  firstDueDate: LocalDate;
  id: InstallmentPlanId;
  merchantKey: string | null;
  merchantName: string | null;
  originType: OriginType;
  paymentMethod: PaymentMethod;
  purchaseDate: LocalDate;
  sourceId: string | null;
  sourceType: string | null;
  status: InstallmentPlanStatus;
  subcategoryId: CategoryId | null;
  totalAmount: Money;
  totalInstallments: number;
  updatedAt?: string;
  userId: UserId;
}>;

export type InstallmentRecord = Readonly<{
  amount: Money;
  competenceDate: LocalDate | null;
  createdAt?: string;
  dueDate: LocalDate;
  financialCommitmentId: FinancialCommitmentId | null;
  id: InstallmentId;
  importItemId: string | null;
  installmentNumber: number;
  invoiceId: string | null;
  planId: InstallmentPlanId;
  status: InstallmentStatus;
  transactionId: TransactionId | null;
  updatedAt?: string;
  userId: UserId;
}>;

export type InstallmentPlanWithInstallments = Readonly<{
  installments: readonly InstallmentRecord[];
  plan: InstallmentPlanRecord;
}>;

export type InstallmentPlanSummary = InstallmentPlanWithInstallments &
  Readonly<{
    accountName: string | null;
    categoryName: string | null;
    creditCardName: string | null;
    postedAmount: Money;
    scheduledAmount: Money;
  }>;

export type InstallmentPlanCommandInput = Readonly<{
  accountId?: unknown;
  categoryId?: unknown;
  creditCardId?: unknown;
  description?: unknown;
  firstDueDate?: unknown;
  merchantName?: unknown;
  paymentMethod?: unknown;
  purchaseDate?: unknown;
  totalAmount?: unknown;
  totalInstallments?: unknown;
}>;

export type InstallmentPlanMutation = Readonly<{
  accountId: AccountId | null;
  categoryId: CategoryId | null;
  creditCardId: CreditCardId | null;
  description: string;
  firstDueDate: LocalDate;
  installments: readonly InstallmentMutation[];
  merchantKey: string | null;
  merchantName: string | null;
  originType: "manual";
  paymentMethod: PaymentMethod;
  purchaseDate: LocalDate;
  sourceId: string | null;
  sourceType: "manual";
  subcategoryId: CategoryId | null;
  totalAmount: Money;
  totalInstallments: number;
}>;

export type InstallmentMutation = Readonly<{
  amount: Money;
  competenceDate: LocalDate;
  dueDate: LocalDate;
  installmentNumber: number;
  status: "scheduled";
}>;

export type InstallmentCancellationInput = Readonly<{
  reason?: unknown;
}>;

export type InstallmentRealizationInput = Readonly<{
  transactionDate?: unknown;
}>;

export type InstallmentRepository = Readonly<{
  cancelPlan(
    context: RepositoryContext,
    plan: InstallmentPlanRecord,
    reason: string,
  ): Promise<InstallmentPlanWithInstallments>;
  createPlan(
    context: RepositoryContext,
    mutation: InstallmentPlanMutation,
  ): Promise<InstallmentPlanWithInstallments>;
  findPlanById(
    context: RepositoryContext,
    id: InstallmentPlanId,
  ): Promise<InstallmentPlanWithInstallments | null>;
  findInstallmentById(
    context: RepositoryContext,
    id: InstallmentId,
  ): Promise<InstallmentPlanWithInstallments | null>;
  listPlans(
    context: RepositoryContext,
  ): Promise<InstallmentPlanWithInstallments[]>;
  realizeInstallment(
    context: RepositoryContext,
    plan: InstallmentPlanRecord,
    installment: InstallmentRecord,
    transactionDate: LocalDate,
  ): Promise<InstallmentPlanWithInstallments>;
}>;

export type InstallmentReferenceRepository = Readonly<{
  findAccountById(
    context: RepositoryContext,
    id: AccountId,
  ): Promise<InstallmentAccountReference | null>;
  findCategoryById(
    context: RepositoryContext,
    id: CategoryId,
  ): Promise<InstallmentCategoryReference | null>;
  findCreditCardById(
    context: RepositoryContext,
    id: CreditCardId,
  ): Promise<InstallmentCreditCardReference | null>;
  listAccounts(
    context: RepositoryContext,
  ): Promise<InstallmentAccountReference[]>;
  listCategories(
    context: RepositoryContext,
  ): Promise<InstallmentCategoryReference[]>;
  listCreditCards(
    context: RepositoryContext,
  ): Promise<InstallmentCreditCardReference[]>;
}>;

export type InstallmentAccountReference = Readonly<{
  id: AccountId;
  name: string;
  status: AccountStatus;
  type: AccountType;
  userId: UserId;
}>;

export type InstallmentCategoryReference = Readonly<{
  archivedAt: string | null;
  id: CategoryId;
  name: string;
  parentId: CategoryId | null;
  type: CategoryType;
  userId: UserId;
}>;

export type InstallmentCreditCardReference = Readonly<{
  id: CreditCardId;
  name: string;
  status: string;
  userId: UserId;
}>;

export type InstallmentServiceOptions = Readonly<{
  audit?: AuditService;
  logger?: Logger;
  now?: () => Date;
  references: InstallmentReferenceRepository;
  repository: InstallmentRepository;
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

export class InstallmentService {
  private readonly audit?: AuditService;
  private readonly logger?: Logger;
  private readonly now: () => Date;
  private readonly references: InstallmentReferenceRepository;
  private readonly repository: InstallmentRepository;

  constructor(options: InstallmentServiceOptions) {
    this.audit = options.audit;
    this.logger = options.logger;
    this.now = options.now ?? (() => new Date());
    this.references = options.references;
    this.repository = options.repository;
  }

  async listInstallmentPlans(context: RepositoryContext) {
    const plans = await this.repository.listPlans(context);
    const [accounts, categories, creditCards] = await Promise.all([
      this.references.listAccounts(context),
      this.references.listCategories(context),
      this.references.listCreditCards(context),
    ]);

    return plans.map((plan) =>
      summarizePlan(plan, { accounts, categories, creditCards }),
    );
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

  async getInstallmentPlan(context: RepositoryContext, id: InstallmentPlanId) {
    const plan = await this.requirePlan(context, id);
    const [accounts, categories, creditCards] = await Promise.all([
      this.references.listAccounts(context),
      this.references.listCategories(context),
      this.references.listCreditCards(context),
    ]);

    return summarizePlan(plan, { accounts, categories, creditCards });
  }

  async createInstallmentPurchase(
    context: RepositoryContext,
    input: InstallmentPlanCommandInput,
    options: Readonly<{ enforceUiLimit?: boolean }> = {},
  ) {
    const mutation = await this.prepareMutation(context, input, options);
    const created = await this.repository.createPlan(context, mutation);
    await this.recordPlanAudit(context, created.plan, "installments.create", {
      totalInstallments: created.plan.totalInstallments,
    });

    return created;
  }

  async cancelInstallmentPlan(
    context: RepositoryContext,
    id: InstallmentPlanId,
    input: InstallmentCancellationInput,
  ) {
    const existing = await this.requirePlan(context, id);
    const reason = parseReason(input.reason);
    const cancelled = await this.repository.cancelPlan(
      context,
      existing.plan,
      reason,
    );
    await this.recordPlanAudit(context, cancelled.plan, "installments.cancel", {
      reason,
    });

    return cancelled;
  }

  async realizeInstallment(
    context: RepositoryContext,
    id: InstallmentId,
    input: InstallmentRealizationInput = {},
  ) {
    const plan = await this.repository.findInstallmentById(context, id);

    if (!plan) {
      throw new DomainError("NOT_FOUND", "Installment was not found.", {
        details: { installmentId: id },
      });
    }

    const installment = plan.installments.find((item) => item.id === id);

    if (!installment) {
      throw new DomainError("NOT_FOUND", "Installment was not found.", {
        details: { installmentId: id },
      });
    }

    if (installment.status !== "scheduled" || installment.transactionId) {
      throw new DomainError(
        "CONFLICT",
        "Only scheduled installments without a transaction can be realized.",
        { details: { installmentId: id } },
      );
    }

    const transactionDate =
      typeof input.transactionDate === "string" && input.transactionDate.trim()
        ? readValue(localDateField()(input.transactionDate, "transactionDate"))
        : installment.dueDate;
    const realized = await this.repository.realizeInstallment(
      context,
      plan.plan,
      installment,
      transactionDate,
    );
    await this.recordPlanAudit(context, realized.plan, "installments.realize", {
      installmentId: id,
    });

    return realized;
  }

  private async requirePlan(context: RepositoryContext, id: InstallmentPlanId) {
    const plan = await this.repository.findPlanById(context, id);

    if (!plan) {
      throw new DomainError("NOT_FOUND", "Installment plan was not found.", {
        details: { installmentPlanId: id },
      });
    }

    assertOwnedByContext(context, plan.plan);
    return plan;
  }

  private async prepareMutation(
    context: RepositoryContext,
    input: InstallmentPlanCommandInput,
    options: Readonly<{ enforceUiLimit?: boolean }>,
  ): Promise<InstallmentPlanMutation> {
    const parsed = parseInstallmentPlanMutation(input, options);
    const category = parsed.categoryId
      ? await this.requireCategory(context, parsed.categoryId)
      : null;
    const categoryPair = await this.resolveCategoryPair(context, category);
    const account = parsed.accountId
      ? await this.requireAccount(context, parsed.accountId)
      : null;
    const creditCard = parsed.creditCardId
      ? await this.requireCreditCard(context, parsed.creditCardId)
      : null;

    validatePaymentTarget({
      account,
      creditCard,
      paymentMethod: parsed.paymentMethod,
    });

    return {
      ...parsed,
      accountId: account?.id ?? null,
      categoryId: categoryPair.categoryId,
      creditCardId: creditCard?.id ?? null,
      installments: buildInstallmentSchedule(parsed),
      subcategoryId: categoryPair.subcategoryId,
    };
  }

  private async requireAccount(context: RepositoryContext, id: AccountId) {
    const account = await this.references.findAccountById(context, id);

    if (!account) {
      throw new DomainError("NOT_FOUND", "Account was not found.", {
        details: { accountId: id },
      });
    }

    assertOwnedByContext(context, account);

    if (account.status !== "active") {
      throw new DomainError("CONFLICT", "Account must be active.", {
        details: { accountId: id },
      });
    }

    return account;
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

  private async requireCategory(context: RepositoryContext, id: CategoryId) {
    const category = await this.references.findCategoryById(context, id);

    if (!category) {
      throw new DomainError("NOT_FOUND", "Category was not found.", {
        details: { categoryId: id },
      });
    }

    assertOwnedByContext(context, category);

    if (category.archivedAt !== null) {
      throw new DomainError("CONFLICT", "Category must be active.", {
        details: { categoryId: id },
      });
    }

    return category;
  }

  private async resolveCategoryPair(
    context: RepositoryContext,
    category: InstallmentCategoryReference | null,
  ) {
    if (!category) {
      throw validationError([
        {
          code: "required",
          message: "Category is required.",
          path: "categoryId",
        },
      ]);
    }

    const root = category.parentId
      ? await this.requireCategory(context, category.parentId)
      : category;

    if (
      !["fixed_expense", "variable_expense"].includes(root.type) ||
      !["fixed_expense", "variable_expense"].includes(category.type) ||
      category.type !== root.type
    ) {
      throw validationError([
        {
          code: "invalid_category_type",
          message: "Installment purchases require an expense category.",
          path: "categoryId",
        },
      ]);
    }

    return category.parentId
      ? { categoryId: root.id, subcategoryId: category.id }
      : { categoryId: category.id, subcategoryId: null };
  }

  private async recordPlanAudit(
    context: RepositoryContext,
    plan: InstallmentPlanRecord,
    action: string,
    extraMetadata: Readonly<Record<string, string | number>> = {},
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
            id: plan.id,
            ownerUserId: plan.userId,
            type: "installment_plan",
          },
          metadata: {
            paymentMethod: plan.paymentMethod,
            requestId: context.requestId ?? null,
            status: plan.status,
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
          context: "InstallmentService.recordPlanAudit",
          level: "error",
          message: "Audit write failed after persisted installment mutation.",
          occurredAt: this.now().toISOString(),
          requestId: context.requestId,
          userId: context.userId,
          metadata: {
            action,
            errorCode: error instanceof DomainError ? error.code : "UNEXPECTED",
            resourceId: plan.id,
            resourceType: "installment_plan",
          },
        }),
      );
    }
  }
}

export function parseInstallmentPlanMutation(
  input: InstallmentPlanCommandInput,
  options: Readonly<{ enforceUiLimit?: boolean }> = {},
): Omit<
  InstallmentPlanMutation,
  "accountId" | "categoryId" | "creditCardId" | "installments" | "subcategoryId"
> &
  Readonly<{
    accountId: AccountId | null;
    categoryId: CategoryId | null;
    creditCardId: CreditCardId | null;
  }> {
  const description = parseRequiredString(input.description, "description");
  const totalAmount = readValue(
    moneyField({ allowZero: false })(input.totalAmount, "totalAmount"),
  );
  const totalInstallments = parseInstallmentCount(
    input.totalInstallments,
    options,
  );
  const purchaseDate = readValue(
    localDateField()(input.purchaseDate, "purchaseDate"),
  );
  const firstDueDate = readValue(
    localDateField()(input.firstDueDate, "firstDueDate"),
  );
  const paymentMethod = readValue(
    enumField(paymentMethods)(input.paymentMethod, "paymentMethod"),
  );
  const merchantName = parseOptionalString(input.merchantName);
  const issues: ValidationIssue[] = [];

  if (totalAmount.amount.split(".")[1]?.slice(2).replaceAll("0", "")) {
    issues.push({
      code: "invalid_precision",
      message: "BRL installment totals must use cent precision.",
      path: "totalAmount",
    });
  }

  if (!description.trim()) {
    issues.push({
      code: "too_small",
      message: "Description is required.",
      path: "description",
    });
  }

  if (
    !["credit_card", ...accountImpactPaymentMethods].includes(paymentMethod)
  ) {
    issues.push({
      code: "unsupported",
      message: "Payment method is not supported for installments.",
      path: "paymentMethod",
    });
  }

  if (issues.length > 0) {
    throw validationError(issues);
  }

  return {
    accountId: parseOptionalId(input.accountId, asAccountId),
    categoryId: parseOptionalId(input.categoryId, asCategoryId),
    creditCardId: parseOptionalId(input.creditCardId, asCreditCardId),
    description: normalizeDisplayText(description),
    firstDueDate,
    merchantKey: merchantName ? normalizeName(merchantName) : null,
    merchantName,
    originType: "manual",
    paymentMethod,
    purchaseDate,
    sourceId: null,
    sourceType: "manual",
    totalAmount,
    totalInstallments,
  };
}

export function buildInstallmentSchedule(
  input: Readonly<{
    firstDueDate: LocalDate;
    totalAmount: Money;
    totalInstallments: number;
  }>,
): readonly InstallmentMutation[] {
  const totalCents = moneyToMinorUnits(input.totalAmount);
  const count = BigInt(input.totalInstallments);
  const base = totalCents / count;
  const residual = totalCents % count;

  return Array.from({ length: input.totalInstallments }, (_, index) => {
    const installmentIndex = BigInt(index);
    const cents = base + (installmentIndex < residual ? BigInt(1) : BigInt(0));
    const dueDate = addMonthsClamped(input.firstDueDate, index);

    return {
      amount: moneyFromMinorUnits(cents, { allowZero: false }),
      competenceDate: dueDate,
      dueDate,
      installmentNumber: index + 1,
      status: "scheduled",
    };
  });
}

export function sumInstallments(installments: readonly InstallmentRecord[]) {
  return installments.reduce(
    (total, installment) => total + moneyToMinorUnits(installment.amount),
    BigInt(0),
  );
}

export function asInstallmentPlanId(value: string): InstallmentPlanId {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new DomainError(
      "VALIDATION_FAILED",
      "InstallmentPlanId is required.",
      { details: { field: "installmentPlanId" } },
    );
  }

  if (!isUuid(trimmed)) {
    throw new DomainError(
      "VALIDATION_FAILED",
      "InstallmentPlanId is invalid.",
      { details: { field: "installmentPlanId" } },
    );
  }

  return trimmed as InstallmentPlanId;
}

export function asInstallmentId(value: string): InstallmentId {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new DomainError("VALIDATION_FAILED", "InstallmentId is required.", {
      details: { field: "installmentId" },
    });
  }

  if (!isUuid(trimmed)) {
    throw new DomainError("VALIDATION_FAILED", "InstallmentId is invalid.", {
      details: { field: "installmentId" },
    });
  }

  return trimmed as InstallmentId;
}

export function asFinancialCommitmentId(value: string): FinancialCommitmentId {
  const trimmed = value.trim();

  if (!isUuid(trimmed)) {
    throw new DomainError(
      "VALIDATION_FAILED",
      "FinancialCommitmentId is invalid.",
      { details: { field: "financialCommitmentId" } },
    );
  }

  return trimmed as FinancialCommitmentId;
}

export function isInstallmentPlanStatus(
  value: string,
): value is InstallmentPlanStatus {
  return installmentPlanStatuses.includes(value as InstallmentPlanStatus);
}

export function isInstallmentStatus(value: string): value is InstallmentStatus {
  return installmentStatuses.includes(value as InstallmentStatus);
}

export function moneyToMinorUnits(value: Money) {
  const [integerPart, fractionPart = ""] = value.amount.split(".");
  const cents = `${integerPart}${fractionPart.padEnd(2, "0").slice(0, 2)}`;

  return BigInt(cents);
}

function summarizePlan(
  plan: InstallmentPlanWithInstallments,
  references: Readonly<{
    accounts: readonly InstallmentAccountReference[];
    categories: readonly InstallmentCategoryReference[];
    creditCards: readonly InstallmentCreditCardReference[];
  }>,
): InstallmentPlanSummary {
  const postedCents = plan.installments
    .filter((installment) => installment.status === "posted")
    .reduce(
      (total, installment) => total + moneyToMinorUnits(installment.amount),
      BigInt(0),
    );
  const scheduledCents = plan.installments
    .filter((installment) => installment.status === "scheduled")
    .reduce(
      (total, installment) => total + moneyToMinorUnits(installment.amount),
      BigInt(0),
    );

  return {
    ...plan,
    accountName:
      references.accounts.find((account) => account.id === plan.plan.accountId)
        ?.name ?? null,
    categoryName:
      references.categories.find(
        (category) =>
          category.id === (plan.plan.subcategoryId ?? plan.plan.categoryId),
      )?.name ?? null,
    creditCardName:
      references.creditCards.find((card) => card.id === plan.plan.creditCardId)
        ?.name ?? null,
    postedAmount: moneyFromMinorUnits(postedCents),
    scheduledAmount: moneyFromMinorUnits(scheduledCents),
  };
}

function validatePaymentTarget(
  input: Readonly<{
    account: InstallmentAccountReference | null;
    creditCard: InstallmentCreditCardReference | null;
    paymentMethod: PaymentMethod;
  }>,
) {
  if (input.paymentMethod === "credit_card") {
    if (!input.creditCard) {
      throw validationError([
        {
          code: "required",
          message: "Credit card is required.",
          path: "creditCardId",
        },
      ]);
    }

    if (input.account) {
      throw validationError([
        {
          code: "not_allowed",
          message: "Credit-card installments must not carry account impact.",
          path: "accountId",
        },
      ]);
    }

    return;
  }

  if (!accountImpactPaymentMethods.includes(input.paymentMethod)) {
    throw validationError([
      {
        code: "unsupported",
        message: "Unsupported installment payment method.",
        path: "paymentMethod",
      },
    ]);
  }

  if (!input.account) {
    throw validationError([
      {
        code: "required",
        message: "Account is required.",
        path: "accountId",
      },
    ]);
  }

  if (input.creditCard) {
    throw validationError([
      {
        code: "not_allowed",
        message: "Credit card can only be used with credit_card method.",
        path: "creditCardId",
      },
    ]);
  }

  if (
    benefitPaymentMethods.includes(input.paymentMethod) &&
    input.account.type !== "benefit"
  ) {
    throw new DomainError(
      "VALIDATION_FAILED",
      "Installment input is invalid.",
      {
        details: {
          accountId: "Benefit payment methods require a benefit account.",
        },
      },
    );
  }
}

function parseInstallmentCount(
  value: unknown,
  options: Readonly<{ enforceUiLimit?: boolean }>,
) {
  const count =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : Number.NaN;
  const maximum = options.enforceUiLimit
    ? INSTALLMENT_ORDINARY_PURCHASE_UI_MAX
    : INSTALLMENT_DOMAIN_MAX;

  if (!Number.isInteger(count) || count < 1 || count > maximum) {
    throw validationError([
      {
        code: "out_of_range",
        message: `Installment count must be between 1 and ${maximum}.`,
        path: "totalInstallments",
      },
    ]);
  }

  return count;
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

  const trimmed = normalizeDisplayText(value);
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

function readValue<TValue>(
  result:
    | Readonly<{ ok: true; value: TValue }>
    | Readonly<{ ok: false; issues: ValidationIssue[] }>,
) {
  if (result.ok) {
    return result.value;
  }

  throw validationError(result.issues);
}

function validationError(issues: readonly ValidationIssue[]) {
  return new DomainError("VALIDATION_FAILED", "Installment input is invalid.", {
    details: Object.fromEntries(
      issues.map((issue) => [issue.path, issue.message]),
    ),
  });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
