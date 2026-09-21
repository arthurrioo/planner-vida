import type React from "react";
import { describe, expect, it, vi } from "vitest";

import TransferDetailPage from "./page";

const { notFound } = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({
  notFound,
}));

vi.mock("@/components/app/module-page", () => ({
  ModulePage: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/components/app/protected-app-shell", () => ({
  ProtectedAppShell: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/application/transfers/transfer-service", () => ({
  createTransferService: vi.fn(async () => ({
    getTransfer: vi.fn(),
    listCorrectionOptions: vi.fn(),
    listDisplayAccounts: vi.fn(),
  })),
}));

vi.mock("@/lib/auth/session", () => ({
  getAuthenticatedSession: vi.fn(async () => ({
    user: { id: "00000000-0000-4000-8000-000000000001" },
  })),
}));

describe("TransferDetailPage", () => {
  it("converts malformed route transfer ids to notFound", async () => {
    await expect(
      TransferDetailPage({
        params: Promise.resolve({ transferId: "not-a-uuid" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalledTimes(1);
  });
});
