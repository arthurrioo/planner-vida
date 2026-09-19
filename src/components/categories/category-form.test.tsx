import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CategoryForm } from "./category-form";
import type { CategoryRecord } from "@/domain/categories";
import { asUserId } from "@/domain/shared";

const action = vi.fn();
const userId = asUserId("00000000-0000-4000-8000-000000000811");

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

describe("CategoryForm", () => {
  it("renders root/subcategory controls with accessible field errors", () => {
    render(
      <CategoryForm
        action={action}
        initialState={{
          errors: {
            name: "Expected at least 1 characters.",
            parentId: "Phase 1 supports only category and subcategory.",
          },
          message: "Category input is invalid.",
          status: "error",
          values: {
            colorToken: "",
            iconKey: "",
            name: "",
            parentId: "root-a",
            sortOrder: "",
            type: "variable_expense",
          },
        }}
        rootCategories={[category({ id: "root-a" as CategoryRecord["id"] })]}
        submitLabel="Criar categoria"
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Category input is invalid.",
    );
    expect(screen.getByLabelText("Nome")).toHaveAttribute(
      "aria-describedby",
      expect.stringContaining("category-name-error"),
    );
    expect(screen.getByLabelText("Categoria pai")).toHaveTextContent(
      "Moradia - Despesa fixa",
    );
  });

  it("disables editing archived categories", () => {
    render(
      <CategoryForm
        action={action}
        category={category({ archivedAt: "2026-09-19T00:00:00.000Z" })}
        rootCategories={[]}
        submitLabel="Salvar categoria"
      />,
    );

    expect(screen.getByLabelText("Nome")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Salvar categoria" }),
    ).toBeDisabled();
  });
});
