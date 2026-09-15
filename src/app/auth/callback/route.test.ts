import { describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const exchangeCodeForSessionMock = vi.hoisted(() => vi.fn());
const ensureProfileForUserMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/profile", () => ({
  ensureProfileForUser: ensureProfileForUserMock,
}));

vi.mock("@/lib/supabase/config", () => ({
  hasPublicSupabaseConfig: () => true,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => ({
    auth: {
      exchangeCodeForSession: exchangeCodeForSessionMock,
    },
  }),
}));

describe("auth callback route", () => {
  it("preserves the password recovery reset destination after session exchange", async () => {
    exchangeCodeForSessionMock.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const response = await GET(
      new Request(
        "http://localhost:3000/auth/callback?code=recovery-code&next=/auth/reset",
      ) as never,
    );

    expect(exchangeCodeForSessionMock).toHaveBeenCalledWith("recovery-code");
    expect(ensureProfileForUserMock).toHaveBeenCalledWith(expect.anything(), {
      id: "user-1",
    });
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/auth/reset",
    );
  });
});
