import Link from "next/link";
import { notFound } from "next/navigation";

import {
  archiveCategoryAction,
  deleteCategoryAction,
  updateCategoryAction,
} from "../actions";
import { createCategoryService } from "@/application/categories/category-service";
import { CategoryForm } from "@/components/categories/category-form";
import { CategoryLifecycleActions } from "@/components/categories/category-lifecycle-actions";
import { CategoryStatusMessage } from "@/components/categories/category-status-message";
import { ModulePage } from "@/components/app/module-page";
import { ProtectedAppShell } from "@/components/app/protected-app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { asCategoryId, type CategoryRecord } from "@/domain/categories";
import { asUserId, DomainError, getEnumLabel } from "@/domain/shared";
import { getAuthenticatedSession } from "@/lib/auth/session";

type PageProps = {
  params: Promise<{ categoryId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CategoryDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { categoryId } = await params;
  const query = (await searchParams) ?? {};
  const path = `/app/financeiro/categorias/${categoryId}`;
  const { user } = await getAuthenticatedSession(path);
  const context = { userId: asUserId(user.id) };
  const service = await createCategoryService();
  let category: CategoryRecord;
  let dependencyCount = 0;
  let categoryChildren: readonly CategoryRecord[] = [];

  try {
    const lifecycle = await service.getCategoryLifecycleState(
      context,
      asCategoryId(categoryId),
    );
    category = lifecycle.category;
    dependencyCount = lifecycle.dependencyCount;
    categoryChildren = lifecycle.children;
  } catch (error) {
    if (
      error instanceof DomainError &&
      (error.code === "NOT_FOUND" || error.code === "VALIDATION_FAILED")
    ) {
      notFound();
    }

    throw error;
  }

  const categoryTree = await service.listCategoryTree(context);
  const rootCategories = categoryTree.filter(
    (item) =>
      item.parentId === null &&
      (item.archivedAt === null || item.id === category.parentId),
  );
  const childrenRows = categoryChildren.map((subcategory) => ({
    id: subcategory.id,
    name: (
      <Link
        className="text-primary font-semibold hover:underline"
        href={`/app/financeiro/categorias/${subcategory.id}`}
      >
        {subcategory.name}
      </Link>
    ),
    status: subcategory.archivedAt ? "Arquivada" : "Ativa",
    type: getEnumLabel("category_type", subcategory.type),
  }));

  return (
    <ProtectedAppShell nextPath={path}>
      <ModulePage
        description="Edicao controlada da taxonomia canonica, com historico preservado por arquivamento quando ha vinculos."
        eyebrow="Financeiro"
        title={category.name}
      >
        <CategoryStatusMessage searchParams={query} />

        <div className="grid gap-4 lg:grid-cols-[1fr_0.85fr]">
          <Card>
            <CardHeader>
              <CardTitle>Editar categoria</CardTitle>
            </CardHeader>
            <CardContent>
              <CategoryForm
                action={updateCategoryAction.bind(null, category.id)}
                category={category}
                rootCategories={rootCategories}
                submitLabel="Salvar categoria"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Estado</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <dl className="grid gap-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Tipo</dt>
                  <dd className="font-medium">
                    {getEnumLabel("category_type", category.type)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Nivel</dt>
                  <dd className="font-medium">
                    {category.parentId ? "Subcategoria" : "Categoria raiz"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="font-medium">
                    {category.archivedAt ? "Arquivada" : "Ativa"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Vinculos</dt>
                  <dd className="font-medium">{dependencyCount}</dd>
                </div>
              </dl>
              <CategoryLifecycleActions
                archiveAction={archiveCategoryAction.bind(null, category.id)}
                archivedAt={category.archivedAt}
                deleteAction={deleteCategoryAction.bind(null, category.id)}
                dependencyCount={dependencyCount}
              />
            </CardContent>
          </Card>
        </div>

        {childrenRows.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Subcategorias</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveTable
                columns={[
                  { header: "Nome", key: "name" },
                  { header: "Tipo", key: "type" },
                  { header: "Status", key: "status" },
                ]}
                getRowKey={(row) => String(row.id)}
                rows={childrenRows}
              />
            </CardContent>
          </Card>
        ) : null}
      </ModulePage>
    </ProtectedAppShell>
  );
}
