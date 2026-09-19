import { describe, expect, it } from "vitest";

import {
  asCategoryId,
  CategoryService,
  parseCategoryMutation,
  type CategoryRecord,
  type CategoryRepository,
} from "./categories";
import {
  asUserId,
  DomainError,
  type AuditEvent,
  type AuditService,
  type RepositoryContext,
} from "@/domain/shared";

const userA = asUserId("00000000-0000-4000-8000-000000000801");
const userB = asUserId("00000000-0000-4000-8000-000000000802");
const contextA: RepositoryContext = { userId: userA };

function category(overrides: Partial<CategoryRecord> = {}): CategoryRecord {
  return {
    archivedAt: null,
    colorToken: null,
    iconKey: null,
    id: "category-a" as CategoryRecord["id"],
    isSystemDefault: false,
    name: "Moradia",
    normalizedName: "moradia",
    parentId: null,
    sortOrder: null,
    type: "fixed_expense",
    userId: userA,
    ...overrides,
  };
}

function createRepository(
  categories: CategoryRecord[] = [],
  dependencyCounts: Readonly<Record<string, number>> = {},
): CategoryRepository & {
  getRecord: (id: CategoryRecord["id"]) => CategoryRecord | undefined;
} {
  const records = new Map(categories.map((item) => [item.id, item]));

  return {
    async archive(context, id, archivedAt) {
      const existing = records.get(id);

      if (!existing || existing.userId !== context.userId) {
        throw new DomainError("NOT_FOUND", "Missing category.");
      }

      const updated = { ...existing, archivedAt };
      records.set(id, updated);
      return updated;
    },
    async countDependencies(_context, id) {
      return dependencyCounts[id] ?? 0;
    },
    async create(context, mutation) {
      const created = category({
        ...mutation,
        archivedAt: null,
        id: `category-${records.size + 1}` as CategoryRecord["id"],
        userId: context.userId,
      });
      records.set(created.id, created);
      return created;
    },
    async delete(_context, id) {
      records.delete(id);
    },
    async findActiveByParentAndNormalizedName(
      context,
      parentId,
      normalizedName,
    ) {
      return (
        [...records.values()].find(
          (item) =>
            item.userId === context.userId &&
            item.parentId === parentId &&
            item.normalizedName === normalizedName &&
            item.archivedAt === null,
        ) ?? null
      );
    },
    async findById(context, id) {
      const record = records.get(id);
      return record && record.userId === context.userId ? record : null;
    },
    async list(context) {
      return [...records.values()].filter(
        (item) => item.userId === context.userId,
      );
    },
    async listChildren(context, id) {
      return [...records.values()].filter(
        (item) => item.userId === context.userId && item.parentId === id,
      );
    },
    async update(context, id, mutation) {
      const existing = records.get(id);

      if (!existing || existing.userId !== context.userId) {
        throw new DomainError("NOT_FOUND", "Missing category.");
      }

      const updated = { ...existing, ...mutation };
      records.set(id, updated);
      return updated;
    },
    getRecord(id) {
      return records.get(id);
    },
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    name: "Aluguel",
    type: "fixed_expense",
    ...overrides,
  };
}

function auditRecorder(): AuditService & { events: AuditEvent[] } {
  return {
    events: [],
    async record(event) {
      this.events.push(event);
    },
  };
}

describe("parseCategoryMutation", () => {
  it("normalizes display and search names with canonical category types", () => {
    const mutation = parseCategoryMutation({
      colorToken: "  green  ",
      iconKey: "  home  ",
      name: "  Moradia   Básica  ",
      sortOrder: "2",
      type: "fixed_expense",
    });

    expect(mutation).toMatchObject({
      colorToken: "green",
      iconKey: "home",
      name: "Moradia Básica",
      normalizedName: "moradia basica",
      parentId: null,
      sortOrder: 2,
      type: "fixed_expense",
    });
  });

  it("rejects invalid names, category types, and sort order", () => {
    expect(() =>
      parseCategoryMutation({
        name: "",
        sortOrder: "-1",
        type: "variavel",
      }),
    ).toThrow(DomainError);
  });
});

describe("CategoryService", () => {
  it("creates root categories scoped to the repository context user", async () => {
    const service = new CategoryService({ repository: createRepository() });

    const created = await service.createCategory(contextA, input());

    expect(created.userId).toBe(userA);
    expect(created.normalizedName).toBe("aluguel");
    expect(created.parentId).toBeNull();
  });

  it("creates subcategories only under active root categories with matching type", async () => {
    const root = category({
      id: asCategoryId("root-a"),
      name: "Casa",
      normalizedName: "casa",
      type: "fixed_expense",
    });
    const service = new CategoryService({
      repository: createRepository([root]),
    });

    const created = await service.createCategory(contextA, {
      ...input({ name: "Condominio", parentId: root.id }),
    });

    expect(created.parentId).toBe(root.id);
    expect(created.type).toBe(root.type);
  });

  it("blocks max-depth violations and parent type mismatch", async () => {
    const root = category({
      id: asCategoryId("root-a"),
      type: "fixed_expense",
    });
    const child = category({
      id: asCategoryId("child-a"),
      parentId: root.id,
      type: "fixed_expense",
    });
    const service = new CategoryService({
      repository: createRepository([root, child]),
    });

    await expect(
      service.createCategory(contextA, {
        ...input({ parentId: root.id, type: "variable_expense" }),
      }),
    ).rejects.toThrow(DomainError);
    await expect(
      service.createCategory(contextA, {
        ...input({ parentId: child.id }),
      }),
    ).rejects.toThrow(DomainError);
  });

  it("blocks duplicate active normalized names per user and parent", async () => {
    const root = category({ id: asCategoryId("root-a") });
    const service = new CategoryService({
      repository: createRepository([
        root,
        category({
          id: asCategoryId("subcategory-a"),
          name: "Aluguel",
          normalizedName: "aluguel",
          parentId: root.id,
        }),
      ]),
    });

    await expect(
      service.createCategory(contextA, {
        ...input({ name: "  ALUGUÉL  ", parentId: root.id }),
      }),
    ).rejects.toThrow(DomainError);
    await expect(
      service.createCategory(contextA, input({ name: "Aluguel" })),
    ).resolves.toMatchObject({ parentId: null });
  });

  it("ignores archived duplicates when enforcing active-name uniqueness", async () => {
    const service = new CategoryService({
      repository: createRepository([
        category({
          archivedAt: "2026-09-19T00:00:00.000Z",
          normalizedName: "aluguel",
        }),
      ]),
    });

    await expect(
      service.createCategory(contextA, input({ name: "Aluguel" })),
    ).resolves.toMatchObject({ normalizedName: "aluguel" });
  });

  it("rejects cross-user parent references as not found", async () => {
    const foreignRoot = category({
      id: asCategoryId("foreign-root"),
      userId: userB,
    });
    const service = new CategoryService({
      repository: createRepository([foreignRoot]),
    });

    await expect(
      service.createCategory(contextA, {
        ...input({ parentId: foreignRoot.id }),
      }),
    ).rejects.toThrow(DomainError);
  });

  it("archives categories with dependencies instead of hard-deleting them", async () => {
    const root = category({ id: asCategoryId("root-a") });
    const audit = auditRecorder();
    const service = new CategoryService({
      audit,
      now: () => new Date("2026-09-19T10:00:00.000Z"),
      repository: createRepository([root], { [root.id]: 3 }),
    });

    const result = await service.deleteOrArchiveCategory(contextA, root.id);

    expect(result).toMatchObject({ dependencyCount: 3, mode: "archived" });
    expect(result.category.archivedAt).toBe("2026-09-19T10:00:00.000Z");
    expect(audit.events.at(-1)?.action).toBe("categories.archive");
  });

  it("hard-deletes categories only when there are no dependencies", async () => {
    const root = category({ id: asCategoryId("root-a") });
    const repository = createRepository([root]);
    const service = new CategoryService({ repository });

    await expect(
      service.deleteOrArchiveCategory(contextA, root.id),
    ).resolves.toMatchObject({ mode: "deleted" });
    expect(repository.getRecord(root.id)).toBeUndefined();
  });

  it("keeps selectors active-only by default and filters children of archived roots", async () => {
    const activeRoot = category({ id: asCategoryId("active-root") });
    const archivedRoot = category({
      archivedAt: "2026-09-19T00:00:00.000Z",
      id: asCategoryId("archived-root"),
    });
    const childOfArchivedRoot = category({
      id: asCategoryId("child-of-archived-root"),
      parentId: archivedRoot.id,
    });
    const service = new CategoryService({
      repository: createRepository([
        activeRoot,
        archivedRoot,
        childOfArchivedRoot,
      ]),
    });

    await expect(service.listSelectableCategories(contextA)).resolves.toEqual([
      activeRoot,
    ]);
    await expect(
      service.listSelectableCategories(contextA, { includeArchived: true }),
    ).resolves.toHaveLength(3);
  });
});
