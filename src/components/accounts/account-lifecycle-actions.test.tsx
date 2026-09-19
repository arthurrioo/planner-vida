import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AccountLifecycleActions } from "./account-lifecycle-actions";
import type { AccountWithBalance } from "@/domain/accounts";
import { asUserId, parseLocalDate, parseMoney } from "@/domain/shared";

const userId = asUserId("00000000-0000-4000-8000-000000000701");
const noopAction = vi.fn();

function account(
  overrides: Partial<AccountWithBalance> = {},
): AccountWithBalance {
  return {
    archivedAt: null,
    balance: parseMoney("10"),
    currency: "BRL",
    dependencyCount: 0,
    description: null,
    id: "account-active" as AccountWithBalance["id"],
    institution: null,
    name: "Conta Ativa",
    normalizedName: "conta ativa",
    openingBalance: parseMoney("10"),
    openingBalanceDate: parseLocalDate("2026-09-15"),
    overdraftLimit: parseMoney("0"),
    status: "active",
    type: "checking",
    userId,
    ...overrides,
  };
}

function renderActions(target: AccountWithBalance) {
  return render(
    <AccountLifecycleActions
      account={target}
      archiveAction={noopAction}
      closeAction={noopAction}
      deleteAction={noopAction}
      reactivateAction={noopAction}
    />,
  );
}

describe("AccountLifecycleActions", () => {
  it("shows active lifecycle actions and safe delete only when eligible", () => {
    renderActions(account());

    expect(screen.getByRole("button", { name: "Arquivar" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Encerrar" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Excluir permanentemente" }),
    ).toBeVisible();
  });

  it("shows archive fallback guidance instead of hard delete when dependencies exist", () => {
    renderActions(account({ dependencyCount: 1 }));

    expect(
      screen.queryByRole("button", { name: "Excluir permanentemente" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/registros vinculados/)).toBeVisible();
  });

  it("shows archived lifecycle actions", () => {
    renderActions(account({ status: "archived" }));

    expect(screen.getByRole("button", { name: "Reativar" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Encerrar" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Arquivar" }),
    ).not.toBeInTheDocument();
  });

  it("keeps closed accounts without edit/archive/reactivate lifecycle actions", () => {
    renderActions(account({ status: "closed" }));

    expect(
      screen.queryByRole("button", { name: "Arquivar" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Reativar" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Encerrar" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Excluir permanentemente" }),
    ).toBeVisible();
  });
});
