import { beforeEach, describe, expect, it, vi } from "vitest";

import { deleteAccountAction } from "./actions";

const redirectMock = vi.hoisted(() =>
  vi.fn((destination: string) => {
    throw new Error(`NEXT_REDIRECT:${destination}`);
  }),
);
const serviceMock = vi.hoisted(() => ({
  deleteAccountIfSafe: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/auth/session", () => ({
  getAuthenticatedSession: vi.fn(async () => ({
    user: { id: "00000000-0000-4000-8000-000000000731" },
  })),
}));

vi.mock("@/application/accounts/account-service", () => ({
  createAccountService: vi.fn(async () => serviceMock),
}));

const accountId = "account-a";

describe("account actions", () => {
  beforeEach(() => {
    redirectMock.mockClear();
    serviceMock.deleteAccountIfSafe.mockReset();
  });

  it("redirects to the list after a hard delete without swallowing NEXT_REDIRECT", async () => {
    serviceMock.deleteAccountIfSafe.mockResolvedValueOnce({
      account: { id: accountId },
      mode: "deleted",
    });

    await expect(deleteAccountAction(accountId)).rejects.toThrow(
      "NEXT_REDIRECT:/app/financeiro/contas?message=Conta+excluida+permanentemente.",
    );
  });

  it("redirects to detail when dependencies block permanent account delete", async () => {
    serviceMock.deleteAccountIfSafe.mockResolvedValueOnce({
      account: { id: accountId },
      dependencyCount: 1,
      mode: "blocked",
    });

    await expect(deleteAccountAction(accountId)).rejects.toThrow(
      `NEXT_REDIRECT:/app/financeiro/contas/${accountId}?error=Conta+possui+registros+vinculados+e+nao+pode+ser+excluida+permanentemente.`,
    );
  });
});
