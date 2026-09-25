import { render, screen } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DomainError } from "@/domain/shared";
import StatementPage from "./page";

const { getStatement } = vi.hoisted(() => ({
  getStatement: vi.fn(),
}));

vi.mock("@/components/app/module-page", () => ({
  ModulePage: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/components/app/protected-app-shell", () => ({
  ProtectedAppShell: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/application/statements/statement-service", () => ({
  createStatementService: vi.fn(async () => ({ getStatement })),
}));

vi.mock("@/lib/auth/session", () => ({
  getAuthenticatedSession: vi.fn(async () => ({
    user: { id: "00000000-0000-4000-8000-000000011991" },
  })),
}));

describe("StatementPage", () => {
  beforeEach(() => {
    getStatement.mockReset();
    getStatement.mockResolvedValue(emptyStatement());
  });

  it("renders normal date ranges", async () => {
    render(
      await StatementPage({
        searchParams: Promise.resolve({
          dateFrom: "2026-09-01",
          dateTo: "2026-09-30",
        }),
      }),
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(getStatement).toHaveBeenCalledWith(
      { userId: "00000000-0000-4000-8000-000000011991" },
      expect.objectContaining({
        dateFrom: "2026-09-01",
        dateTo: "2026-09-30",
      }),
    );
  });

  it("renders equal date ranges", async () => {
    render(
      await StatementPage({
        searchParams: Promise.resolve({
          dateFrom: "2026-09-15",
          dateTo: "2026-09-15",
        }),
      }),
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(getStatement).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        dateFrom: "2026-09-15",
        dateTo: "2026-09-15",
      }),
    );
  });

  it("renders an accessible validation alert for inverted date ranges while preserving typed filters", async () => {
    getStatement.mockRejectedValueOnce(
      new DomainError("VALIDATION_FAILED", "Statement filters are invalid."),
    );

    const { container } = render(
      await StatementPage({
        searchParams: Promise.resolve({
          dateFrom: "2026-09-30",
          dateTo: "2026-09-01",
          query: "mercado",
        }),
      }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Revise o periodo informado",
    );
    expect(
      container.querySelector<HTMLInputElement>("#statement-date-from"),
    ).toHaveValue("2026-09-30");
    expect(
      container.querySelector<HTMLInputElement>("#statement-date-to"),
    ).toHaveValue("2026-09-01");
    expect(
      screen.getByRole("textbox", { name: "Buscar descricao" }),
    ).toHaveValue("mercado");
  });

  it("keeps malformed date params safe without exposing raw storage errors", async () => {
    render(
      await StatementPage({
        searchParams: Promise.resolve({
          dateFrom: "not-a-date",
          dateTo: "2026-09-30",
        }),
      }),
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(getStatement).toHaveBeenCalledWith(
      expect.anything(),
      expect.not.objectContaining({ dateFrom: "not-a-date" }),
    );
  });
});

function emptyStatement() {
  return {
    accountBalances: [],
    entries: [],
    filters: {},
    hasNextPage: false,
    hasPreviousPage: false,
    options: { accounts: [], categories: [], creditCards: [] },
    page: 1,
    pageSize: 25,
  };
}
