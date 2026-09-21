import { asAccountId, type AccountId } from "@/domain/accounts";
import {
  assertOwnedByContext,
  createAuditEvent,
  createStructuredLogEvent,
  DEFAULT_CURRENCY_CODE,
  DomainError,
  localDateField,
  moneyField,
  type AccountStatus,
  type AccountType,
  type AuditService,
  type LocalDate,
  type Logger,
  type Money,
  type OriginType,
  type RepositoryContext,
  type TransactionStatus,
  type UserId,
  type ValidationIssue,
  type ValidationResult,
} from "@/domain/shared";
import type { TransactionId, TransactionRecord } from "@/domain/transactions";

export type TransferId = string & { readonly __brand: "TransferId" };

export type TransferRecord = Readonly<{
  amount: Money;
  createdAt?: string;
  currency: typeof DEFAULT_CURRENCY_CODE;
  description: string;
  destinationAccountId: AccountId;
  id: TransferId;
  inflowTransactionId: TransactionId | null;
  originType: OriginType;
  outflowTransactionId: TransactionId | null;
  sourceAccountId: AccountId;
  status: Extract<TransactionStatus, "posted" | "voided" | "reversed">;
  transferDate: LocalDate;
  updatedAt?: string;
  userId: UserId;
}>;

export type TransferWithTransactions = Readonly<{
  inflow: TransactionRecord;
  outflow: TransactionRecord;
  transfer: TransferRecord;
}>;

export type TransferCorrectionResult = Readonly<{
  original: TransferRecord;
  replacement: TransferWithTransactions;
  reversalInflow: TransactionRecord;
  reversalOutflow: TransactionRecord;
}>;

export type TransferCommandInput = Readonly<{
  amount?: unknown;
  description?: unknown;
  destinationAccountId?: unknown;
  sourceAccountId?: unknown;
  transferDate?: unknown;
}>;

export type TransferMutation = Readonly<{
  amount: Money;
  description: string;
  destinationAccountId: AccountId;
  originType: "manual";
  sourceAccountId: AccountId;
  transferDate: LocalDate;
}>;

export type TransferReversalInput = Readonly<{
  reason?: unknown;
}>;

export type TransferRepository = Readonly<{
  correct(
    context: RepositoryContext,
    original: TransferRecord,
    reason: string,
    replacement: TransferMutation,
  ): Promise<TransferCorrectionResult>;
  create(
    context: RepositoryContext,
    mutation: TransferMutation,
  ): Promise<TransferWithTransactions>;
  findById(
    context: RepositoryContext,
    id: TransferId,
  ): Promise<TransferRecord | null>;
  list(context: RepositoryContext): Promise<TransferRecord[]>;
  reverse(
    context: RepositoryContext,
    original: TransferRecord,
    reason: string,
  ): Promise<
    Readonly<{
      original: TransferRecord;
      reversalInflow: TransactionRecord;
      reversalOutflow: TransactionRecord;
    }>
  >;
}>;

export type TransferReferenceRepository = Readonly<{
  findAccountById(
    context: RepositoryContext,
    id: AccountId,
  ): Promise<TransferAccountReference | null>;
  listAccounts(context: RepositoryContext): Promise<TransferAccountReference[]>;
}>;

export type TransferAccountReference = Readonly<{
  id: AccountId;
  name: string;
  status: AccountStatus;
  type: AccountType;
  userId: UserId;
}>;

export type TransferServiceOptions = Readonly<{
  audit?: AuditService;
  logger?: Logger;
  now?: () => Date;
  references: TransferReferenceRepository;
  repository: TransferRepository;
}>;

export class TransferService {
  private readonly audit?: AuditService;
  private readonly logger?: Logger;
  private readonly now: () => Date;
  private readonly references: TransferReferenceRepository;
  private readonly repository: TransferRepository;

  constructor(options: TransferServiceOptions) {
    this.audit = options.audit;
    this.logger = options.logger;
    this.now = options.now ?? (() => new Date());
    this.references = options.references;
    this.repository = options.repository;
  }

  async listTransfers(context: RepositoryContext) {
    return this.repository.list(context);
  }

  async listDisplayAccounts(context: RepositoryContext) {
    return this.references.listAccounts(context);
  }

  async listFormOptions(context: RepositoryContext) {
    const accounts = await this.references.listAccounts(context);

    return {
      accounts: accounts.filter((account) => account.status === "active"),
    };
  }

  async listCorrectionOptions(
    context: RepositoryContext,
    transfer: TransferRecord,
  ) {
    const accounts = await this.references.listAccounts(context);
    const accountById = new Map(
      accounts.map((account) => [account.id, account]),
    );
    const options = accounts.filter((account) => account.status === "active");

    for (const accountId of [
      transfer.sourceAccountId,
      transfer.destinationAccountId,
    ]) {
      const account = accountById.get(accountId);

      if (account && !options.some((option) => option.id === account.id)) {
        options.push(account);
      }
    }

    return {
      accounts: options,
    };
  }

  async getTransfer(context: RepositoryContext, id: TransferId) {
    return this.requireTransfer(context, id);
  }

  async createTransfer(
    context: RepositoryContext,
    input: TransferCommandInput,
  ) {
    const mutation = await this.prepareMutation(context, input);
    const result = await this.repository.create(context, mutation);

    await this.recordTransferAudit(
      context,
      result.transfer,
      "transfers.create",
      {
        destinationAccountId: result.transfer.destinationAccountId,
        inflowTransactionId: result.inflow.id,
        outflowTransactionId: result.outflow.id,
        sourceAccountId: result.transfer.sourceAccountId,
      },
    );

    return result;
  }

  async updateTransfer(
    context: RepositoryContext,
    id: TransferId,
    input: TransferCommandInput,
  ) {
    const existing = await this.requireTransfer(context, id);

    assertPostedManualTransfer(existing);
    const mutation = await this.prepareCorrectionMutation(
      context,
      input,
      existing,
    );
    const reason = "Corrected by manual edit.";
    const result = await this.repository.correct(
      context,
      existing,
      reason,
      mutation,
    );

    await this.recordTransferAudit(
      context,
      result.original,
      "transfers.reverse_for_correction",
      {
        replacementTransferId: result.replacement.transfer.id,
        reversalInflowTransactionId: result.reversalInflow.id,
        reversalOutflowTransactionId: result.reversalOutflow.id,
      },
    );
    await this.recordTransferAudit(
      context,
      result.replacement.transfer,
      "transfers.correct",
      {
        originalTransferId: result.original.id,
        replacementInflowTransactionId: result.replacement.inflow.id,
        replacementOutflowTransactionId: result.replacement.outflow.id,
      },
    );

    return result.replacement;
  }

  async reverseTransfer(
    context: RepositoryContext,
    id: TransferId,
    input: TransferReversalInput,
  ) {
    const existing = await this.requireTransfer(context, id);

    assertPostedManualTransfer(existing);
    const reason = parseReason(input.reason);
    const result = await this.repository.reverse(context, existing, reason);

    await this.recordTransferAudit(
      context,
      result.original,
      "transfers.reverse",
      {
        reversalInflowTransactionId: result.reversalInflow.id,
        reversalOutflowTransactionId: result.reversalOutflow.id,
      },
    );

    return result;
  }

  private async requireTransfer(context: RepositoryContext, id: TransferId) {
    const transfer = await this.repository.findById(context, id);

    if (!transfer) {
      throw new DomainError("NOT_FOUND", "Transfer was not found.", {
        details: { transferId: id },
      });
    }

    assertOwnedByContext(context, transfer);
    return transfer;
  }

  private async prepareMutation(
    context: RepositoryContext,
    input: TransferCommandInput,
  ): Promise<TransferMutation> {
    const parsed = parseTransferMutation(input);

    if (parsed.sourceAccountId === parsed.destinationAccountId) {
      throw validationError([
        {
          code: "same_account",
          message: "Source and destination accounts must differ.",
          path: "destinationAccountId",
        },
      ]);
    }

    const [source, destination] = await Promise.all([
      this.requireActiveAccount(
        context,
        parsed.sourceAccountId,
        "sourceAccountId",
      ),
      this.requireActiveAccount(
        context,
        parsed.destinationAccountId,
        "destinationAccountId",
      ),
    ]);

    return {
      ...parsed,
      destinationAccountId: destination.id,
      originType: "manual",
      sourceAccountId: source.id,
    };
  }

  private async prepareCorrectionMutation(
    context: RepositoryContext,
    input: TransferCommandInput,
    existing: TransferRecord,
  ): Promise<TransferMutation> {
    const parsed = parseTransferMutation(input);

    if (parsed.sourceAccountId === parsed.destinationAccountId) {
      throw validationError([
        {
          code: "same_account",
          message: "Source and destination accounts must differ.",
          path: "destinationAccountId",
        },
      ]);
    }

    const [source, destination] = await Promise.all([
      this.requireCorrectionAccount(
        context,
        parsed.sourceAccountId,
        "sourceAccountId",
        existing.sourceAccountId,
      ),
      this.requireCorrectionAccount(
        context,
        parsed.destinationAccountId,
        "destinationAccountId",
        existing.destinationAccountId,
      ),
    ]);

    return {
      ...parsed,
      destinationAccountId: destination.id,
      originType: "manual",
      sourceAccountId: source.id,
    };
  }

  private async requireActiveAccount(
    context: RepositoryContext,
    id: AccountId,
    field: "destinationAccountId" | "sourceAccountId",
  ) {
    const account = await this.references.findAccountById(context, id);

    if (!account) {
      throw new DomainError("NOT_FOUND", "Account was not found.", {
        details: { [field]: id },
      });
    }

    assertOwnedByContext(context, account);

    if (account.status !== "active") {
      throw new DomainError("CONFLICT", "Account must be active.", {
        details: { [field]: id },
      });
    }

    return account;
  }

  private async requireCorrectionAccount(
    context: RepositoryContext,
    id: AccountId,
    field: "destinationAccountId" | "sourceAccountId",
    originalId: AccountId,
  ) {
    const account = await this.references.findAccountById(context, id);

    if (!account) {
      throw new DomainError("NOT_FOUND", "Account was not found.", {
        details: { [field]: id },
      });
    }

    assertOwnedByContext(context, account);

    if (account.status !== "active" && id !== originalId) {
      throw new DomainError("CONFLICT", "Account must be active.", {
        details: { [field]: id },
      });
    }

    return account;
  }

  private async recordTransferAudit(
    context: RepositoryContext,
    transfer: TransferRecord,
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
            id: transfer.id,
            ownerUserId: transfer.userId,
            type: "transfer",
          },
          metadata: {
            destinationAccountId: transfer.destinationAccountId,
            requestId: context.requestId ?? null,
            sourceAccountId: transfer.sourceAccountId,
            status: transfer.status,
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
          context: "TransferService.recordTransferAudit",
          level: "error",
          message: "Audit write failed after persisted transfer mutation.",
          occurredAt: this.now().toISOString(),
          requestId: context.requestId,
          userId: context.userId,
          metadata: {
            action,
            errorCode: error instanceof DomainError ? error.code : "UNEXPECTED",
            resourceId: transfer.id,
            resourceType: "transfer",
          },
        }),
      );
    }
  }
}

export function asTransferId(value: string): TransferId {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new DomainError("VALIDATION_FAILED", "TransferId is required.", {
      details: { field: "transferId" },
    });
  }

  if (!isUuid(trimmed)) {
    throw new DomainError("VALIDATION_FAILED", "TransferId is invalid.", {
      details: { field: "transferId" },
    });
  }

  return trimmed as TransferId;
}

export function parseTransferMutation(
  input: TransferCommandInput,
): Omit<TransferMutation, "originType"> {
  const description = parseRequiredString(input.description, "description");
  const amount = readValue(
    moneyField({ allowZero: false })(input.amount, "amount"),
  );
  const transferDate = readValue(
    localDateField()(input.transferDate, "transferDate"),
  );
  const sourceAccountId = parseRequiredId(
    input.sourceAccountId,
    asAccountId,
    "sourceAccountId",
  );
  const destinationAccountId = parseRequiredId(
    input.destinationAccountId,
    asAccountId,
    "destinationAccountId",
  );
  const issues: ValidationIssue[] = [];

  if (!description.trim()) {
    issues.push({
      code: "too_small",
      message: "Description is required.",
      path: "description",
    });
  }

  if (issues.length > 0) {
    throw validationError(issues);
  }

  return {
    amount,
    description: description.trim(),
    destinationAccountId,
    sourceAccountId,
    transferDate,
  };
}

function assertPostedManualTransfer(transfer: TransferRecord) {
  if (transfer.status !== "posted" || transfer.originType !== "manual") {
    throw new DomainError(
      "CONFLICT",
      "Only manual posted transfers can be reversed or corrected.",
      { details: { transferId: transfer.id } },
    );
  }
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

function parseRequiredId<TValue extends string>(
  value: unknown,
  parser: (value: string) => TValue,
  path: string,
) {
  if (typeof value !== "string" || !value.trim()) {
    throw validationError([
      { code: "required", message: "Identifier is required.", path },
    ]);
  }

  try {
    return parser(value.trim());
  } catch (error) {
    if (error instanceof DomainError) {
      throw validationError([
        { code: "invalid_id", message: "Identifier is invalid.", path },
      ]);
    }

    throw error;
  }
}

function readValue<TValue>(result: ValidationResult<TValue>) {
  if (!result.ok) {
    throw validationError(result.issues);
  }

  return result.value;
}

function validationError(issues: ValidationIssue[]) {
  return new DomainError("VALIDATION_FAILED", "Transfer input is invalid.", {
    details: issues.reduce<Record<string, string>>((details, issue) => {
      details[issue.path] = issue.message;
      return details;
    }, {}),
  });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
