import {
  accountStatuses,
  accountTypes,
  addMoney,
  assertOwnedByContext,
  createAuditEvent,
  createStructuredLogEvent,
  DEFAULT_CURRENCY_CODE,
  DomainError,
  enumField,
  invalid,
  localDateField,
  moneyField,
  normalizeDisplayText,
  normalizeName,
  parseMoney,
  subtractMoney,
  type AccountStatus,
  type AccountType,
  type AuditService,
  type Logger,
  type LocalDate,
  type Money,
  type RepositoryContext,
  type UserId,
  type ValidationIssue,
  type ValidationResult,
} from "@/domain/shared";

export type AccountId = string & { readonly __brand: "AccountId" };

export type AccountRecord = Readonly<{
  archivedAt: string | null;
  createdAt?: string;
  currency: typeof DEFAULT_CURRENCY_CODE;
  description: string | null;
  id: AccountId;
  institution: string | null;
  name: string;
  normalizedName: string;
  openingBalance: Money;
  openingBalanceDate: LocalDate;
  overdraftLimit: Money;
  status: AccountStatus;
  type: AccountType;
  updatedAt?: string;
  userId: UserId;
}>;

export type AccountWithBalance = AccountRecord &
  Readonly<{
    balance: Money;
    dependencyCount: number;
  }>;

export type AccountLifecycleAction =
  "archive" | "close" | "delete" | "reactivate" | "update";

export type AccountDeleteResult =
  | Readonly<{ account: AccountRecord; mode: "deleted" }>
  | Readonly<{
      account: AccountRecord;
      dependencyCount: number;
      mode: "blocked";
    }>;

export type AccountCommandInput = Readonly<{
  description?: unknown;
  institution?: unknown;
  name?: unknown;
  openingBalance?: unknown;
  openingBalanceDate?: unknown;
  overdraftLimit?: unknown;
  type?: unknown;
}>;

export type AccountMutation = Readonly<{
  description: string | null;
  institution: string | null;
  name: string;
  normalizedName: string;
  openingBalance: Money;
  openingBalanceDate: LocalDate;
  overdraftLimit: Money;
  type: AccountType;
}>;

export type AccountBalanceMovements = Readonly<{
  income: Money;
  invoicePayments: Money;
  outgoingTransfers: Money;
  expense: Money;
  incomingTransfers: Money;
  investment: Money;
}>;

export type AccountRepository = Readonly<{
  countDependencies(context: RepositoryContext, id: AccountId): Promise<number>;
  create(
    context: RepositoryContext,
    mutation: AccountMutation,
  ): Promise<AccountRecord>;
  delete(context: RepositoryContext, id: AccountId): Promise<void>;
  findActiveByNormalizedName(
    context: RepositoryContext,
    normalizedName: string,
  ): Promise<AccountRecord | null>;
  findById(
    context: RepositoryContext,
    id: AccountId,
  ): Promise<AccountRecord | null>;
  getBalanceMovements(
    context: RepositoryContext,
    account: AccountRecord,
  ): Promise<AccountBalanceMovements>;
  list(context: RepositoryContext): Promise<AccountRecord[]>;
  update(
    context: RepositoryContext,
    id: AccountId,
    mutation: AccountMutation,
  ): Promise<AccountRecord>;
  updateStatus(
    context: RepositoryContext,
    id: AccountId,
    status: AccountStatus,
    archivedAt: string | null,
  ): Promise<AccountRecord>;
}>;

export type AccountServiceOptions = Readonly<{
  audit?: AuditService;
  logger?: Logger;
  now?: () => Date;
  repository: AccountRepository;
}>;

export class AccountService {
  private readonly audit?: AuditService;
  private readonly logger?: Logger;
  private readonly now: () => Date;
  private readonly repository: AccountRepository;

  constructor(options: AccountServiceOptions) {
    this.audit = options.audit;
    this.logger = options.logger;
    this.now = options.now ?? (() => new Date());
    this.repository = options.repository;
  }

  async listAccounts(context: RepositoryContext) {
    const accounts = await this.repository.list(context);

    return Promise.all(
      accounts.map(async (account) =>
        this.withCalculatedBalance(context, account),
      ),
    );
  }

  async listSelectableAccounts(
    context: RepositoryContext,
    options: Readonly<{ includeStatuses?: readonly AccountStatus[] }> = {},
  ) {
    const includeStatuses = options.includeStatuses ?? ["active"];
    const accounts = await this.listAccounts(context);

    return accounts.filter((account) =>
      includeStatuses.includes(account.status),
    );
  }

  async getAccount(context: RepositoryContext, id: AccountId) {
    const account = await this.requireAccount(context, id);

    return this.withCalculatedBalance(context, account);
  }

  async createAccount(context: RepositoryContext, input: AccountCommandInput) {
    const mutation = parseAccountMutation(input);
    await this.assertNoActiveNameConflict(context, mutation.normalizedName);

    const account = await this.repository.create(context, mutation);
    await this.recordAccountAudit(context, account, "accounts.create");

    return account;
  }

  async updateAccount(
    context: RepositoryContext,
    id: AccountId,
    input: AccountCommandInput,
  ) {
    const existing = await this.requireAccount(context, id);

    this.assertLifecycleAllowed(existing, "update");

    const mutation = parseAccountMutation(input);

    if (existing.status === "active") {
      await this.assertNoActiveNameConflict(
        context,
        mutation.normalizedName,
        existing.id,
      );
    }

    const account = await this.repository.update(context, id, mutation);
    await this.recordAccountAudit(context, account, "accounts.update");

    return account;
  }

  async archiveAccount(context: RepositoryContext, id: AccountId) {
    const account = await this.requireAccount(context, id);

    if (account.status === "archived") {
      return account;
    }

    this.assertLifecycleAllowed(account, "archive");

    const archived = await this.repository.updateStatus(
      context,
      id,
      "archived",
      this.now().toISOString(),
    );
    await this.recordAccountAudit(context, archived, "accounts.archive");

    return archived;
  }

  async reactivateAccount(context: RepositoryContext, id: AccountId) {
    const account = await this.requireAccount(context, id);

    if (account.status === "active") {
      return account;
    }

    this.assertLifecycleAllowed(account, "reactivate");
    await this.assertNoActiveNameConflict(
      context,
      account.normalizedName,
      account.id,
    );

    const reactivated = await this.repository.updateStatus(
      context,
      id,
      "active",
      null,
    );
    await this.recordAccountAudit(context, reactivated, "accounts.reactivate");

    return reactivated;
  }

  async closeAccount(context: RepositoryContext, id: AccountId) {
    const account = await this.requireAccount(context, id);

    if (account.status === "closed") {
      return account;
    }

    this.assertLifecycleAllowed(account, "close");

    const closed = await this.repository.updateStatus(
      context,
      id,
      "closed",
      this.now().toISOString(),
    );
    await this.recordAccountAudit(context, closed, "accounts.close");

    return closed;
  }

  async deleteAccountIfSafe(
    context: RepositoryContext,
    id: AccountId,
  ): Promise<AccountDeleteResult> {
    const account = await this.requireAccount(context, id);
    const dependencyCount = await this.repository.countDependencies(
      context,
      id,
    );

    if (dependencyCount > 0) {
      return { account, dependencyCount, mode: "blocked" };
    }

    await this.repository.delete(context, id);
    await this.recordAccountAudit(context, account, "accounts.delete");

    return { account, mode: "deleted" };
  }

  async deleteOrArchiveAccount(context: RepositoryContext, id: AccountId) {
    const account = await this.requireAccount(context, id);
    const dependencyCount = await this.repository.countDependencies(
      context,
      id,
    );

    if (dependencyCount > 0) {
      return {
        account: await this.archiveAccount(context, id),
        mode: "archived",
      } as const;
    }

    await this.repository.delete(context, id);
    await this.recordAccountAudit(context, account, "accounts.delete");

    return { account, mode: "deleted" } as const;
  }

  async calculateAccountBalance(
    context: RepositoryContext,
    account: AccountRecord,
  ) {
    assertOwnedByContext(context, account);
    const movements = await this.repository.getBalanceMovements(
      context,
      account,
    );

    return calculateAccountBalance(account, movements);
  }

  private async requireAccount(context: RepositoryContext, id: AccountId) {
    const account = await this.repository.findById(context, id);

    if (!account) {
      throw new DomainError("NOT_FOUND", "Account was not found.", {
        details: { accountId: id },
      });
    }

    assertOwnedByContext(context, account);
    return account;
  }

  private async withCalculatedBalance(
    context: RepositoryContext,
    account: AccountRecord,
  ): Promise<AccountWithBalance> {
    const [balance, dependencyCount] = await Promise.all([
      this.calculateAccountBalance(context, account),
      this.repository.countDependencies(context, account.id),
    ]);

    return { ...account, balance, dependencyCount };
  }

  private async assertNoActiveNameConflict(
    context: RepositoryContext,
    normalizedName: string,
    currentId?: AccountId,
  ) {
    const existing = await this.repository.findActiveByNormalizedName(
      context,
      normalizedName,
    );

    if (existing && existing.id !== currentId) {
      throw new DomainError(
        "CONFLICT",
        "An active account already uses this name.",
        { details: { field: "name" } },
      );
    }
  }

  private assertLifecycleAllowed(
    account: AccountRecord,
    action: AccountLifecycleAction,
  ) {
    const allowed = isLifecycleActionAllowed(account.status, action);

    if (allowed) {
      return;
    }

    throw new DomainError("CONFLICT", lifecycleErrorMessage(action), {
      details: {
        action,
        status: account.status,
      },
    });
  }

  private async recordAccountAudit(
    context: RepositoryContext,
    account: AccountRecord,
    action: string,
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
            id: account.id,
            ownerUserId: account.userId,
            type: "account",
          },
          metadata: {
            accountStatus: account.status,
            accountType: account.type,
            requestId: context.requestId ?? null,
          },
          occurredAt: this.now().toISOString(),
          originType: "manual",
          severity: "info",
        }),
      );
    } catch (error) {
      this.logger?.emit(
        createStructuredLogEvent({
          context: "AccountService.recordAccountAudit",
          level: "error",
          message: "Audit write failed after persisted account mutation.",
          occurredAt: this.now().toISOString(),
          requestId: context.requestId,
          userId: context.userId,
          metadata: {
            action,
            errorCode: error instanceof DomainError ? error.code : "UNEXPECTED",
            resourceId: account.id,
            resourceType: "account",
          },
        }),
      );
    }
  }
}

export function asAccountId(value: string): AccountId {
  if (!value.trim()) {
    throw new DomainError("VALIDATION_FAILED", "AccountId is required.", {
      details: { field: "accountId" },
    });
  }

  return value as AccountId;
}

export function parseAccountMutation(
  input: AccountCommandInput,
): AccountMutation {
  const issues: ValidationIssue[] = [];
  const nameResult = stringFromInput(input.name, "name", {
    maxLength: 120,
    minLength: 1,
  });
  const institutionResult = nullableStringFromInput(
    input.institution,
    "institution",
    { maxLength: 120 },
  );
  const descriptionResult = nullableStringFromInput(
    input.description,
    "description",
    { maxLength: 500 },
  );
  const typeResult = enumField(accountTypes)(input.type, "type");
  const openingBalanceResult = moneyField({
    allowNegative: true,
  })(input.openingBalance, "openingBalance");
  const openingBalanceDateResult = localDateField()(
    input.openingBalanceDate,
    "openingBalanceDate",
  );
  const overdraftLimitResult = moneyField({
    allowNegative: false,
  })(input.overdraftLimit ?? "0", "overdraftLimit");

  for (const result of [
    nameResult,
    institutionResult,
    descriptionResult,
    typeResult,
    openingBalanceResult,
    openingBalanceDateResult,
    overdraftLimitResult,
  ]) {
    if (!result.ok) {
      issues.push(...result.issues);
    }
  }

  if (issues.length > 0) {
    throw validationError(issues);
  }

  const accountType = unwrapValidationResult(typeResult);
  const overdraftLimit = unwrapValidationResult(overdraftLimitResult);

  if (
    accountType === "benefit" &&
    overdraftLimit.amount !== zeroMoney().amount
  ) {
    throw validationError([
      {
        code: "benefit_overdraft_not_allowed",
        message: "Benefit accounts cannot carry overdraft metadata.",
        path: "overdraftLimit",
      },
    ]);
  }

  const name = normalizeDisplayText(unwrapValidationResult(nameResult));

  return {
    description: unwrapValidationResult(descriptionResult),
    institution: unwrapValidationResult(institutionResult),
    name,
    normalizedName: normalizeName(name),
    openingBalance: unwrapValidationResult(openingBalanceResult),
    openingBalanceDate: unwrapValidationResult(openingBalanceDateResult),
    overdraftLimit,
    type: accountType,
  };
}

export function isLifecycleActionAllowed(
  status: AccountStatus,
  action: AccountLifecycleAction,
) {
  if (action === "update") {
    return status !== "closed";
  }

  if (action === "archive") {
    return status === "active" || status === "archived";
  }

  if (action === "reactivate") {
    return status === "active" || status === "archived";
  }

  if (action === "close") {
    return status === "active" || status === "archived" || status === "closed";
  }

  if (action === "delete") {
    return true;
  }

  return false;
}

function lifecycleErrorMessage(action: AccountLifecycleAction) {
  switch (action) {
    case "archive":
      return "Closed accounts cannot be archived.";
    case "close":
      return "Account cannot be closed from its current status.";
    case "delete":
      return "Account cannot be deleted from its current status.";
    case "reactivate":
      return "Closed accounts cannot be reactivated.";
    case "update":
      return "Closed accounts are read-only.";
  }
}

export function calculateAccountBalance(
  account: AccountRecord,
  movements: AccountBalanceMovements,
) {
  return subtractMoney(
    subtractMoney(
      subtractMoney(
        addMoney(
          addMoney(account.openingBalance, movements.income),
          movements.incomingTransfers,
        ),
        movements.expense,
      ),
      movements.investment,
    ),
    addMoney(movements.outgoingTransfers, movements.invoicePayments),
  );
}

export function zeroMoney() {
  return parseMoney("0", { currency: DEFAULT_CURRENCY_CODE });
}

export function isAccountStatus(value: string): value is AccountStatus {
  return accountStatuses.includes(value as AccountStatus);
}

export function isAccountType(value: string): value is AccountType {
  return accountTypes.includes(value as AccountType);
}

function stringFromInput(
  value: unknown,
  path: string,
  options: Readonly<{ maxLength: number; minLength: number }>,
): ValidationResult<string> {
  if (typeof value !== "string") {
    return invalid({
      code: "invalid_type",
      message: "Expected a string.",
      path,
    });
  }

  const normalized = normalizeDisplayText(value);

  if (normalized.length < options.minLength) {
    return invalid({
      code: "too_small",
      message: `Expected at least ${options.minLength} characters.`,
      path,
    });
  }

  if (normalized.length > options.maxLength) {
    return invalid({
      code: "too_big",
      message: `Expected at most ${options.maxLength} characters.`,
      path,
    });
  }

  return { ok: true, value: normalized } as const;
}

function nullableStringFromInput(
  value: unknown,
  path: string,
  options: Readonly<{ maxLength: number }>,
): ValidationResult<string | null> {
  if (value === null || value === undefined || value === "") {
    return { ok: true, value: null } as const;
  }

  const result = stringFromInput(value, path, {
    maxLength: options.maxLength,
    minLength: 0,
  });

  if (!result.ok) {
    return result;
  }

  return { ok: true, value: result.value || null } as const;
}

function validationError(issues: ValidationIssue[]) {
  return new DomainError("VALIDATION_FAILED", "Account input is invalid.", {
    details: issues.reduce<Record<string, string>>((details, issue) => {
      details[issue.path] = issue.message;
      return details;
    }, {}),
  });
}

function unwrapValidationResult<TValue>(result: ValidationResult<TValue>) {
  if (!result.ok) {
    throw validationError(result.issues);
  }

  return result.value;
}
