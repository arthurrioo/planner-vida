import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CategorySelector } from "./category-selector";
import type { CategoryRecord } from "@/domain/categories";
import { asUserId } from "@/domain/shared";

const userId = asUserId("00000000-0000-4000-8000-000000000812");

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
    userId,
    ...overrides,
  };
}

describe("CategorySelector", () => {
  it("renders root categories and subcategories grouped by canonical type", () => {
    const root = category({ id: "root-a" as CategoryRecord["id"] });

    render(
      <CategorySelector
        categories={[
          root,
          category({
            id: "child-a" as CategoryRecord["id"],
            name: "Aluguel",
            parentId: root.id,
          }),
          category({
            id: "income-root" as CategoryRecord["id"],
            name: "Salario",
            type: "income",
          }),
        ]}
        type="fixed_expense"
      />,
    );

    expect(screen.getByRole("option", { name: "Moradia" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Aluguel" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Salario - Receita" }),
    ).not.toBeInTheDocument();
  });
});
