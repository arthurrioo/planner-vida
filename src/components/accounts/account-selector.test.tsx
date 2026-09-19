import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AccountSelector } from "./account-selector";
import type { AccountWithBalance } from "@/domain/accounts";
import { asUserId, parseLocalDate, parseMoney } from "@/domain/shared";

const userId = asUserId("00000000-0000-4000-8000-000000000701");

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

describe("AccountSelector", () => {
  it("defaults to active accounts only", () => {
    render(
      <AccountSelector
        accounts={[
          account(),
          account({
            id: "account-archived" as AccountWithBalance["id"],
            name: "Conta Arquivada",
            status: "archived",
          }),
          account({
            id: "account-closed" as AccountWithBalance["id"],
            name: "Conta Encerrada",
            status: "closed",
          }),
        ]}
        id="account"
        name="accountId"
      />,
    );

    expect(screen.getByRole("option", { name: /Conta Ativa/ })).toBeVisible();
    expect(
      screen.queryByRole("option", { name: /Conta Arquivada/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /Conta Encerrada/ }),
    ).not.toBeInTheDocument();
  });

  it("supports explicit status opt-in for historical consumers", () => {
    render(
      <AccountSelector
        accounts={[
          account(),
          account({
            id: "account-closed" as AccountWithBalance["id"],
            name: "Conta Encerrada",
            status: "closed",
          }),
        ]}
        id="account"
        includeStatuses={["active", "closed"]}
        name="accountId"
      />,
    );

    expect(
      screen.getByRole("option", { name: /Conta Encerrada/ }),
    ).toBeVisible();
  });
});
