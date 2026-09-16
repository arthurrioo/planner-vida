import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestPasswordRecoveryAction } from "./actions";

const redirectMock = vi.hoisted(() =>
  vi.fn((destination: string) => {
    throw new Error(`NEXT_REDIRECT:${destination}`);
  }),
);
const resetPasswordForEmailMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/auth/profile", () => ({
  ensureProfileForUser: vi.fn(),
}));

vi.mock("@/lib/supabase/config", () => ({
  getAppUrl: () => "https://planner.example",
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => ({
    auth: {
      resetPasswordForEmail: resetPasswordForEmailMock,
    },
  }),
}));

describe("auth actions", () => {
  beforeEach(() => {
    redirectMock.mockClear();
    resetPasswordForEmailMock.mockReset();
  });

  it("requests password recovery with a callback that returns to the reset page", async () => {
    resetPasswordForEmailMock.mockResolvedValueOnce({ error: null });

    const formData = new FormData();
    formData.set("email", "User@Example.com ");

    await expect(requestPasswordRecoveryAction(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/login?message=",
    );

    expect(resetPasswordForEmailMock).toHaveBeenCalledWith("user@example.com", {
      redirectTo: "https://planner.example/auth/callback?next=/auth/reset",
    });
  });
});
