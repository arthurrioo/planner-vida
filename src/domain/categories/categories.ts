import {
  assertOwnedByContext,
  categoryTypes,
  createAuditEvent,
  createStructuredLogEvent,
  DomainError,
  enumField,
  invalid,
  normalizeCategoryName,
  normalizeDisplayText,
  type AuditService,
  type CategoryType,
  type Logger,
  type RepositoryContext,
  type UserId,
  type ValidationIssue,
  type ValidationResult,
} from "@/domain/shared";

export type CategoryId = string & { readonly __brand: "CategoryId" };

export type CategoryRecord = Readonly<{
  archivedAt: string | null;
  colorToken: string | null;
  createdAt?: string;
  iconKey: string | null;
  id: CategoryId;
  isSystemDefault: boolean;
  name: string;
  normalizedName: string;
  parentId: CategoryId | null;
  sortOrder: number | null;
  type: CategoryType;
  updatedAt?: string;
  userId: UserId;
}>;

export type CategoryNode = CategoryRecord &
  Readonly<{
    dependencyCount: number;
    subcategories: readonly CategoryRecord[];
  }>;

export type CategoryDeleteResult =
  | Readonly<{
      category: CategoryRecord;
      dependencyCount: number;
      mode: "archived";
    }>
  | Readonly<{ category: CategoryRecord; mode: "deleted" }>;

export type CategoryCommandInput = Readonly<{
  colorToken?: unknown;
  iconKey?: unknown;
  name?: unknown;
  parentId?: unknown;
  sortOrder?: unknown;
  type?: unknown;
}>;

export type CategoryMutation = Readonly<{
  colorToken: string | null;
  iconKey: string | null;
  name: string;
  normalizedName: string;
  parentId: CategoryId | null;
  sortOrder: number | null;
  type: CategoryType;
}>;

export type CategoryRepository = Readonly<{
  archive(
    context: RepositoryContext,
    id: CategoryId,
    archivedAt: string,
  ): Promise<CategoryRecord>;
  countDependencies(
    context: RepositoryContext,
    id: CategoryId,
  ): Promise<number>;
  create(
    context: RepositoryContext,
    mutation: CategoryMutation,
  ): Promise<CategoryRecord>;
  delete(context: RepositoryContext, id: CategoryId): Promise<void>;
  findActiveByParentAndNormalizedName(
    context: RepositoryContext,
    parentId: CategoryId | null,
    normalizedName: string,
  ): Promise<CategoryRecord | null>;
  findById(
    context: RepositoryContext,
    id: CategoryId,
  ): Promise<CategoryRecord | null>;
  list(context: RepositoryContext): Promise<CategoryRecord[]>;
  listChildren(
    context: RepositoryContext,
    id: CategoryId,
  ): Promise<CategoryRecord[]>;
  update(
    context: RepositoryContext,
    id: CategoryId,
    mutation: CategoryMutation,
  ): Promise<CategoryRecord>;
}>;

export type CategoryServiceOptions = Readonly<{
  audit?: AuditService;
  logger?: Logger;
  now?: () => Date;
  repository: CategoryRepository;
}>;

export class CategoryService {
  private readonly audit?: AuditService;
  private readonly logger?: Logger;
  private readonly now: () => Date;
  private readonly repository: CategoryRepository;

  constructor(options: CategoryServiceOptions) {
    this.audit = options.audit;
    this.logger = options.logger;
    this.now = options.now ?? (() => new Date());
    this.repository = options.repository;
  }

  async listCategoryTree(context: RepositoryContext) {
    const categories = await this.repository.list(context);
    const childrenByParent = new Map<string, CategoryRecord[]>();

    for (const category of categories) {
      if (!category.parentId) {
        continue;
      }

      const children = childrenByParent.get(category.parentId) ?? [];
      children.push(category);
      childrenByParent.set(category.parentId, children);
    }

    const roots = categories.filter((category) => category.parentId === null);

    return Promise.all(
      roots.map(async (category) => ({
        ...category,
        dependencyCount: await this.repository.countDependencies(
          context,
          category.id,
        ),
        subcategories: childrenByParent.get(category.id) ?? [],
      })),
    );
  }

  async listSelectableCategories(
    context: RepositoryContext,
    options: Readonly<{ includeArchived?: boolean; type?: CategoryType }> = {},
  ) {
    const categories = await this.repository.list(context);
    const roots = new Map(
      categories
        .filter((category) => category.parentId === null)
        .map((category) => [category.id, category]),
    );

    return categories.filter((category) => {
      if (options.type && category.type !== options.type) {
        return false;
      }

      if (options.includeArchived) {
        return true;
      }

      if (category.archivedAt !== null) {
        return false;
      }

      if (!category.parentId) {
        return true;
      }

      return roots.get(category.parentId)?.archivedAt === null;
    });
  }

  async getCategory(context: RepositoryContext, id: CategoryId) {
    return this.requireCategory(context, id);
  }

  async createCategory(
    context: RepositoryContext,
    input: CategoryCommandInput,
  ) {
    const mutation = await this.prepareMutation(context, input);
    await this.assertNoActiveNameConflict(
      context,
      mutation.parentId,
      mutation.normalizedName,
    );

    const category = await this.repository.create(context, mutation);
    await this.recordCategoryAudit(context, category, "categories.create");

    return category;
  }

  async updateCategory(
    context: RepositoryContext,
    id: CategoryId,
    input: CategoryCommandInput,
  ) {
    const existing = await this.requireCategory(context, id);

    if (existing.archivedAt) {
      throw new DomainError("CONFLICT", "Archived categories are read-only.", {
        details: { categoryId: existing.id },
      });
    }

    const mutation = await this.prepareMutation(context, input, existing);

    const shouldInspectChildren =
      mutation.parentId !== existing.parentId ||
      mutation.type !== existing.type;
    const children = shouldInspectChildren
      ? await this.repository.listChildren(context, existing.id)
      : [];

    if (mutation.parentId !== existing.parentId && children.length > 0) {
      throw new DomainError(
        "CONFLICT",
        "A category with subcategories cannot become a subcategory.",
        { details: { field: "parentId" } },
      );
    }

    if (mutation.type !== existing.type) {
      const dependencyCount = await this.repository.countDependencies(
        context,
        existing.id,
      );

      if (dependencyCount > 0 || children.length > 0) {
        throw new DomainError(
          "CONFLICT",
          "Category type cannot change while the category has dependencies or subcategories.",
          { details: { field: "type" } },
        );
      }
    }

    await this.assertNoActiveNameConflict(
      context,
      mutation.parentId,
      mutation.normalizedName,
      existing.id,
    );

    const category = await this.repository.update(context, id, mutation);
    await this.recordCategoryAudit(context, category, "categories.update");

    return category;
  }

  async archiveCategory(context: RepositoryContext, id: CategoryId) {
    const category = await this.requireCategory(context, id);

    if (category.archivedAt) {
      return category;
    }

    const archived = await this.repository.archive(
      context,
      id,
      this.now().toISOString(),
    );
    await this.recordCategoryAudit(context, archived, "categories.archive");

    return archived;
  }

  async deleteOrArchiveCategory(
    context: RepositoryContext,
    id: CategoryId,
  ): Promise<CategoryDeleteResult> {
    const category = await this.requireCategory(context, id);
    const dependencyCount = await this.repository.countDependencies(
      context,
      id,
    );

    if (dependencyCount > 0) {
      const archived = await this.archiveCategory(context, id);
      return { category: archived, dependencyCount, mode: "archived" };
    }

    await this.repository.delete(context, id);
    await this.recordCategoryAudit(context, category, "categories.delete");

    return { category, mode: "deleted" };
  }

  async deleteCategoryIfSafe(
    context: RepositoryContext,
    id: CategoryId,
  ): Promise<Extract<CategoryDeleteResult, { mode: "deleted" }>> {
    const category = await this.requireCategory(context, id);
    const dependencyCount = await this.repository.countDependencies(
      context,
      id,
    );

    if (dependencyCount > 0) {
      throw new DomainError(
        "CONFLICT",
        "Category has dependent records and cannot be deleted permanently.",
        { details: { dependencyCount } },
      );
    }

    await this.repository.delete(context, id);
    await this.recordCategoryAudit(context, category, "categories.delete");

    return { category, mode: "deleted" };
  }

  async getCategoryLifecycleState(context: RepositoryContext, id: CategoryId) {
    const category = await this.requireCategory(context, id);
    const [children, dependencyCount] = await Promise.all([
      this.repository.listChildren(context, id),
      this.repository.countDependencies(context, id),
    ]);

    return { category, children, dependencyCount };
  }

  private async prepareMutation(
    context: RepositoryContext,
    input: CategoryCommandInput,
    current?: CategoryRecord,
  ): Promise<CategoryMutation> {
    const mutation = parseCategoryMutation(input);
    const currentId = current?.id;

    if (!mutation.parentId) {
      return mutation;
    }

    if (mutation.parentId === currentId) {
      throw new DomainError("VALIDATION_FAILED", "Category input is invalid.", {
        details: { parentId: "A category cannot be its own parent." },
      });
    }

    const parent = await this.requireCategory(context, mutation.parentId);

    if (parent.archivedAt && parent.id !== current?.parentId) {
      throw new DomainError("CONFLICT", "Parent category is archived.", {
        details: { field: "parentId" },
      });
    }

    if (parent.parentId !== null) {
      throw new DomainError("VALIDATION_FAILED", "Category input is invalid.", {
        details: {
          parentId: "Phase 1 supports only category and subcategory.",
        },
      });
    }

    if (parent.type !== mutation.type) {
      throw new DomainError("VALIDATION_FAILED", "Category input is invalid.", {
        details: {
          type: "Subcategory type must match the parent category type.",
        },
      });
    }

    return mutation;
  }

  private async requireCategory(context: RepositoryContext, id: CategoryId) {
    const category = await this.repository.findById(context, id);

    if (!category) {
      throw new DomainError("NOT_FOUND", "Category was not found.", {
        details: { categoryId: id },
      });
    }

    assertOwnedByContext(context, category);
    return category;
  }

  private async assertNoActiveNameConflict(
    context: RepositoryContext,
    parentId: CategoryId | null,
    normalizedName: string,
    currentId?: CategoryId,
  ) {
    const existing = await this.repository.findActiveByParentAndNormalizedName(
      context,
      parentId,
      normalizedName,
    );

    if (existing && existing.id !== currentId) {
      throw new DomainError(
        "CONFLICT",
        "An active category already uses this name at this level.",
        { details: { field: "name" } },
      );
    }
  }

  private async recordCategoryAudit(
    context: RepositoryContext,
    category: CategoryRecord,
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
            id: category.id,
            ownerUserId: category.userId,
            type: "category",
          },
          metadata: {
            categoryType: category.type,
            parentId: category.parentId,
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
          context: "CategoryService.recordCategoryAudit",
          level: "error",
          message: "Audit write failed after persisted category mutation.",
          occurredAt: this.now().toISOString(),
          requestId: context.requestId,
          userId: context.userId,
          metadata: {
            action,
            errorCode: error instanceof DomainError ? error.code : "UNEXPECTED",
            resourceId: category.id,
            resourceType: "category",
          },
        }),
      );
    }
  }
}

export function asCategoryId(value: string): CategoryId {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new DomainError("VALIDATION_FAILED", "CategoryId is required.", {
      details: { field: "categoryId" },
    });
  }

  if (!isUuid(trimmed)) {
    throw new DomainError("VALIDATION_FAILED", "CategoryId is invalid.", {
      details: { field: "categoryId" },
    });
  }

  return trimmed as CategoryId;
}

export function parseCategoryMutation(
  input: CategoryCommandInput,
): CategoryMutation {
  const issues: ValidationIssue[] = [];
  const nameResult = stringFromInput(input.name, "name", {
    maxLength: 120,
    minLength: 1,
  });
  const parentIdResult = nullableCategoryIdFromInput(
    input.parentId,
    "parentId",
  );
  const typeResult = enumField(categoryTypes)(input.type, "type");
  const sortOrderResult = nullableIntegerFromInput(
    input.sortOrder,
    "sortOrder",
  );
  const colorTokenResult = nullableTokenFromInput(
    input.colorToken,
    "colorToken",
  );
  const iconKeyResult = nullableTokenFromInput(input.iconKey, "iconKey");

  for (const result of [
    nameResult,
    parentIdResult,
    typeResult,
    sortOrderResult,
    colorTokenResult,
    iconKeyResult,
  ]) {
    if (!result.ok) {
      issues.push(...result.issues);
    }
  }

  if (issues.length > 0) {
    throw validationError(issues);
  }

  const name = normalizeDisplayText(unwrapValidationResult(nameResult));

  return {
    colorToken: unwrapValidationResult(colorTokenResult),
    iconKey: unwrapValidationResult(iconKeyResult),
    name,
    normalizedName: normalizeCategoryName(name),
    parentId: unwrapValidationResult(parentIdResult),
    sortOrder: unwrapValidationResult(sortOrderResult),
    type: unwrapValidationResult(typeResult),
  };
}

export function isCategoryType(value: string): value is CategoryType {
  return categoryTypes.includes(value as CategoryType);
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

  return { ok: true, value: normalized };
}

function nullableCategoryIdFromInput(
  value: unknown,
  path: string,
): ValidationResult<CategoryId | null> {
  if (value === null || value === undefined || value === "") {
    return { ok: true, value: null };
  }

  if (typeof value !== "string" || !value.trim()) {
    return invalid({
      code: "invalid_type",
      message: "Expected a category id string.",
      path,
    });
  }

  const trimmed = value.trim();

  if (!isUuid(trimmed)) {
    return invalid({
      code: "invalid_uuid",
      message: "Expected a valid category id.",
      path,
    });
  }

  return { ok: true, value: trimmed as CategoryId };
}

function nullableIntegerFromInput(
  value: unknown,
  path: string,
): ValidationResult<number | null> {
  if (value === null || value === undefined || value === "") {
    return { ok: true, value: null };
  }

  const parsed = typeof value === "number" ? value : Number(String(value));

  if (
    !Number.isInteger(parsed) ||
    parsed < -2147483648 ||
    parsed > 2147483647
  ) {
    return invalid({
      code: "invalid_integer",
      message: "Expected a PostgreSQL integer value.",
      path,
    });
  }

  return { ok: true, value: parsed };
}

function nullableTokenFromInput(
  value: unknown,
  path: string,
): ValidationResult<string | null> {
  if (value === null || value === undefined || value === "") {
    return { ok: true, value: null };
  }

  const result = stringFromInput(value, path, {
    maxLength: 80,
    minLength: 0,
  });

  if (!result.ok) {
    return result;
  }

  return { ok: true, value: result.value || null };
}

function validationError(issues: ValidationIssue[]) {
  return new DomainError("VALIDATION_FAILED", "Category input is invalid.", {
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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
