import type { SupabaseClient } from "@supabase/supabase-js";

import {
  asCategoryId,
  isCategoryType,
  type CategoryId,
  type CategoryMutation,
  type CategoryRecord,
  type CategoryRepository,
} from "@/domain/categories";
import {
  asUserId,
  DomainError,
  type AuditEvent,
  type AuditService,
  type RepositoryContext,
} from "@/domain/shared";

type CategoryRow = Readonly<{
  archived_at: string | null;
  color_token: string | null;
  created_at?: string;
  icon_key: string | null;
  id: string;
  is_system_default: boolean;
  name: string;
  normalized_name: string;
  parent_id: string | null;
  sort_order: number | null;
  type: string;
  updated_at?: string;
  user_id: string;
}>;

export const CATEGORY_DEPENDENCY_REFERENCES = [
  { column: "category_id", table: "annual_obligations" },
  { column: "subcategory_id", table: "annual_obligations" },
  { column: "category_id", table: "budget_lines" },
  { column: "subcategory_id", table: "budget_lines" },
  { column: "parent_id", table: "categories" },
  { column: "category_id", table: "events" },
  { column: "category_id", table: "financial_commitments" },
  { column: "subcategory_id", table: "financial_commitments" },
  { column: "category_id", table: "financial_goals" },
  { column: "subcategory_id", table: "financial_goals" },
  { column: "reviewed_category_id", table: "import_items" },
  { column: "reviewed_subcategory_id", table: "import_items" },
  { column: "suggested_category_id", table: "import_items" },
  { column: "suggested_subcategory_id", table: "import_items" },
  { column: "category_id", table: "installment_plans" },
  { column: "subcategory_id", table: "installment_plans" },
  { column: "category_id", table: "invoice_items" },
  { column: "subcategory_id", table: "invoice_items" },
  { column: "category_id", table: "merchant_category_mappings" },
  { column: "subcategory_id", table: "merchant_category_mappings" },
  { column: "category_id", table: "planning_items" },
  { column: "subcategory_id", table: "planning_items" },
  { column: "category_id", table: "shopping_list_items" },
  { column: "category_id", table: "subscriptions" },
  { column: "subcategory_id", table: "subscriptions" },
  { column: "category_id", table: "tasks" },
  { column: "category_id", table: "transactions" },
  { column: "subcategory_id", table: "transactions" },
  { column: "category_id", table: "wishlist_items" },
] as const;

export class SupabaseCategoryRepository implements CategoryRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async list(context: RepositoryContext) {
    const { data, error } = await this.supabase
      .from("categories")
      .select(categoryColumns)
      .eq("user_id", context.userId)
      .order("parent_id", { ascending: true, nullsFirst: true })
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true });

    if (error) {
      throw mapSupabaseError(error);
    }

    return (data ?? []).map((row) =>
      mapCategoryRow(row as unknown as CategoryRow),
    );
  }

  async findById(context: RepositoryContext, id: CategoryId) {
    const { data, error } = await this.supabase
      .from("categories")
      .select(categoryColumns)
      .eq("user_id", context.userId)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw mapSupabaseError(error);
    }

    return data ? mapCategoryRow(data as unknown as CategoryRow) : null;
  }

  async findActiveByParentAndNormalizedName(
    context: RepositoryContext,
    parentId: CategoryId | null,
    normalizedName: string,
  ) {
    let query = this.supabase
      .from("categories")
      .select(categoryColumns)
      .eq("user_id", context.userId)
      .eq("normalized_name", normalizedName)
      .is("archived_at", null);

    query = parentId
      ? query.eq("parent_id", parentId)
      : query.is("parent_id", null);

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw mapSupabaseError(error);
    }

    return data ? mapCategoryRow(data as unknown as CategoryRow) : null;
  }

  async listChildren(context: RepositoryContext, id: CategoryId) {
    const { data, error } = await this.supabase
      .from("categories")
      .select(categoryColumns)
      .eq("user_id", context.userId)
      .eq("parent_id", id)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true });

    if (error) {
      throw mapSupabaseError(error);
    }

    return (data ?? []).map((row) =>
      mapCategoryRow(row as unknown as CategoryRow),
    );
  }

  async create(context: RepositoryContext, mutation: CategoryMutation) {
    const { data, error } = await this.supabase
      .from("categories")
      .insert(toCategoryInsert(context, mutation))
      .select(categoryColumns)
      .single();

    if (error) {
      throw mapSupabaseError(error);
    }

    return mapCategoryRow(data as unknown as CategoryRow);
  }

  async update(
    context: RepositoryContext,
    id: CategoryId,
    mutation: CategoryMutation,
  ) {
    const { data, error } = await this.supabase
      .from("categories")
      .update(toCategoryUpdate(mutation))
      .eq("user_id", context.userId)
      .eq("id", id)
      .select(categoryColumns)
      .single();

    if (error) {
      throw mapSupabaseError(error);
    }

    return mapCategoryRow(data as unknown as CategoryRow);
  }

  async archive(
    context: RepositoryContext,
    id: CategoryId,
    archivedAt: string,
  ) {
    const { data, error } = await this.supabase
      .from("categories")
      .update({ archived_at: archivedAt })
      .eq("user_id", context.userId)
      .eq("id", id)
      .select(categoryColumns)
      .single();

    if (error) {
      throw mapSupabaseError(error);
    }

    return mapCategoryRow(data as unknown as CategoryRow);
  }

  async delete(context: RepositoryContext, id: CategoryId) {
    const { error } = await this.supabase
      .from("categories")
      .delete()
      .eq("user_id", context.userId)
      .eq("id", id);

    if (error) {
      throw mapSupabaseError(error);
    }
  }

  async countDependencies(context: RepositoryContext, id: CategoryId) {
    const counts = await Promise.all(
      CATEGORY_DEPENDENCY_REFERENCES.map((reference) =>
        this.countBy(reference.table, context, reference.column, id),
      ),
    );

    return counts.reduce((total, count) => total + count, 0);
  }

  private async countBy(
    table: string,
    context: RepositoryContext,
    column: string,
    id: CategoryId,
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
}

export class SupabaseCategoryAuditService implements AuditService {
  constructor(private readonly supabase: SupabaseClient) {}

  async record(event: AuditEvent) {
    const requestId =
      typeof event.metadata?.requestId === "string"
        ? event.metadata.requestId
        : null;

    const { error } = await this.supabase.from("audit_logs").insert({
      action: event.action,
      actor_role: event.actor.role ?? "user",
      actor_user_id: event.actor.userId,
      correlation_id: requestId,
      metadata: event.metadata ?? {},
      resource_id: event.entity?.id ?? null,
      resource_type: event.entity?.type ?? "category",
      severity: event.severity,
      user_id: event.entity?.ownerUserId ?? event.actor.userId,
    });

    if (error) {
      throw mapSupabaseError(error);
    }
  }
}

const categoryColumns = [
  "id",
  "user_id",
  "parent_id",
  "name",
  "normalized_name",
  "type",
  "sort_order",
  "color_token",
  "icon_key",
  "is_system_default",
  "archived_at",
  "created_at",
  "updated_at",
].join(", ");

function mapCategoryRow(row: CategoryRow): CategoryRecord {
  if (!isCategoryType(row.type)) {
    throw new DomainError(
      "INVARIANT_VIOLATION",
      "Invalid category enum value.",
    );
  }

  return {
    archivedAt: row.archived_at,
    colorToken: row.color_token,
    createdAt: row.created_at,
    iconKey: row.icon_key,
    id: asCategoryId(row.id),
    isSystemDefault: row.is_system_default,
    name: row.name,
    normalizedName: row.normalized_name,
    parentId: row.parent_id ? asCategoryId(row.parent_id) : null,
    sortOrder: row.sort_order,
    type: row.type,
    updatedAt: row.updated_at,
    userId: asUserId(row.user_id),
  };
}

function toCategoryInsert(
  context: RepositoryContext,
  mutation: CategoryMutation,
) {
  return {
    color_token: mutation.colorToken,
    icon_key: mutation.iconKey,
    name: mutation.name,
    normalized_name: mutation.normalizedName,
    parent_id: mutation.parentId,
    sort_order: mutation.sortOrder,
    type: mutation.type,
    user_id: context.userId,
  };
}

function toCategoryUpdate(mutation: CategoryMutation) {
  return {
    color_token: mutation.colorToken,
    icon_key: mutation.iconKey,
    name: mutation.name,
    normalized_name: mutation.normalizedName,
    parent_id: mutation.parentId,
    sort_order: mutation.sortOrder,
    type: mutation.type,
  };
}

function mapSupabaseError(error: { code?: string; message: string }) {
  if (error.code === "23505") {
    return new DomainError(
      "CONFLICT",
      "Category conflicts with existing data.",
      {
        details: { source: "database" },
      },
    );
  }

  if (error.code === "42501" || error.code === "PGRST301") {
    return new DomainError("AUTHORIZATION_DENIED", "Category access denied.");
  }

  if (error.code === "23503") {
    return new DomainError(
      "CONFLICT",
      "Category is referenced by dependent records.",
      { details: { source: "database" } },
    );
  }

  return new DomainError("UNEXPECTED", error.message);
}
