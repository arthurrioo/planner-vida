import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  archiveCategoryAction,
  deleteCategoryAction,
  deleteOrArchiveCategoryAction,
} from "./actions";

const redirectMock = vi.hoisted(() =>
  vi.fn((destination: string) => {
    throw new Error(`NEXT_REDIRECT:${destination}`);
  }),
);
const serviceMock = vi.hoisted(() => ({
  archiveCategory: vi.fn(),
  deleteCategoryIfSafe: vi.fn(),
  deleteOrArchiveCategory: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/auth/session", () => ({
  getAuthenticatedSession: vi.fn(async () => ({
    user: { id: "00000000-0000-4000-8000-000000000831" },
  })),
}));

vi.mock("@/application/categories/category-service", () => ({
  createCategoryService: vi.fn(async () => serviceMock),
}));

const categoryId = "00000000-0000-4000-8000-000000000832";

describe("category actions", () => {
  beforeEach(() => {
    redirectMock.mockClear();
    serviceMock.archiveCategory.mockReset();
    serviceMock.deleteCategoryIfSafe.mockReset();
    serviceMock.deleteOrArchiveCategory.mockReset();
  });

  it("redirects to the list after a hard delete without swallowing NEXT_REDIRECT", async () => {
    serviceMock.deleteCategoryIfSafe.mockResolvedValueOnce({
      category: { id: categoryId },
      mode: "deleted",
    });

    await expect(deleteCategoryAction(categoryId)).rejects.toThrow(
      "NEXT_REDIRECT:/app/financeiro/categorias?message=Categoria+excluida+permanentemente.",
    );
  });

  it("redirects to detail after explicit archive without swallowing NEXT_REDIRECT", async () => {
    serviceMock.archiveCategory.mockResolvedValueOnce({ id: categoryId });

    await expect(archiveCategoryAction(categoryId)).rejects.toThrow(
      `NEXT_REDIRECT:/app/financeiro/categorias/${categoryId}?message=Categoria+arquivada.`,
    );
  });

  it("preserves legacy delete-or-archive hard-delete redirect semantics", async () => {
    serviceMock.deleteOrArchiveCategory.mockResolvedValueOnce({
      category: { id: categoryId },
      mode: "deleted",
    });

    await expect(deleteOrArchiveCategoryAction(categoryId)).rejects.toThrow(
      "NEXT_REDIRECT:/app/financeiro/categorias?message=Categoria+excluida+permanentemente.",
    );
  });

  it("preserves legacy delete-or-archive archive redirect semantics", async () => {
    serviceMock.deleteOrArchiveCategory.mockResolvedValueOnce({
      category: { id: categoryId },
      dependencyCount: 1,
      mode: "archived",
    });

    await expect(deleteOrArchiveCategoryAction(categoryId)).rejects.toThrow(
      `NEXT_REDIRECT:/app/financeiro/categorias/${categoryId}?message=Categoria+possui+vinculos+e+foi+arquivada.`,
    );
  });
});
