import Link from "next/link";

import { createCategoryAction } from "./actions";
import { createCategoryService } from "@/application/categories/category-service";
import { CategoryForm } from "@/components/categories/category-form";
import { CategoryStatusMessage } from "@/components/categories/category-status-message";
import { ModulePage } from "@/components/app/module-page";
import { ProtectedAppShell } from "@/components/app/protected-app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { asUserId, getEnumLabel, type CategoryType } from "@/domain/shared";
import { getAuthenticatedSession } from "@/lib/auth/session";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CategoriesPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const { user } = await getAuthenticatedSession("/app/financeiro/categorias");
  const service = await createCategoryService();
  const context = { userId: asUserId(user.id) };
  const categoryTree = await service.listCategoryTree(context);
  const rootCategories = categoryTree.filter(
    (category) => category.parentId === null && category.archivedAt === null,
  );
  const rows = categoryTree.flatMap((category) => [
    toRow(category, "Categoria"),
    ...category.subcategories.map((subcategory) =>
      toRow(subcategory, `Subcategoria de ${category.name}`),
    ),
  ]);

  return (
    <ProtectedAppShell nextPath="/app/financeiro/categorias">
      <ModulePage
        description="Taxonomia financeira canonica para receitas, despesas, investimentos e transferencias."
        eyebrow="Financeiro"
        title="Categorias"
      >
        <CategoryStatusMessage searchParams={params} />

        <div className="grid gap-4 lg:grid-cols-[1fr_0.85fr]">
          <Card>
            <CardHeader>
              <CardTitle>Categorias cadastradas</CardTitle>
            </CardHeader>
            <CardContent>
              {rows.length > 0 ? (
                <ResponsiveTable
                  columns={[
                    { header: "Nome", key: "name" },
                    { header: "Nivel", key: "level" },
                    { header: "Tipo", key: "type" },
                    { header: "Status", key: "status" },
                  ]}
                  getRowKey={(row) => String(row.id)}
                  rows={rows}
                />
              ) : (
                <EmptyState
                  description="Crie a primeira categoria para classificar fatos financeiros futuros."
                  title="Nenhuma categoria cadastrada"
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Nova categoria</CardTitle>
            </CardHeader>
            <CardContent>
              <CategoryForm
                action={createCategoryAction}
                rootCategories={rootCategories}
                submitLabel="Criar categoria"
              />
            </CardContent>
          </Card>
        </div>
      </ModulePage>
    </ProtectedAppShell>
  );
}

function toRow(
  category: {
    archivedAt: string | null;
    id: string;
    name: string;
    type: CategoryType;
  },
  level: string,
) {
  return {
    id: category.id,
    level,
    name: (
      <Link
        className="text-primary font-semibold hover:underline"
        href={`/app/financeiro/categorias/${category.id}`}
      >
        {level === "Categoria" ? category.name : `- ${category.name}`}
      </Link>
    ),
    status: category.archivedAt ? "Arquivada" : "Ativa",
    type: getEnumLabel("category_type", category.type),
  };
}
