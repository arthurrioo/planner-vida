import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "./app-shell";
import { appNavigationItems } from "./navigation";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app",
}));

vi.mock("@/app/auth/actions", () => ({
  signOutAction: vi.fn(),
}));

describe("AppShell", () => {
  it("reserves mobile vertical space for the fixed two-row bottom navigation", () => {
    render(
      <AppShell
        displayName="Arthur Rio"
        email="arthur@example.com"
        roleLabel="User"
      >
        <button type="button">Ultimo controle da pagina</button>
      </AppShell>,
    );

    const main = screen.getByRole("main");
    const mobileNavigation = screen.getByRole("navigation", {
      name: "Navegacao principal mobile",
    });

    expect(main).toHaveClass("pb-[calc(10rem+env(safe-area-inset-bottom))]");
    expect(mobileNavigation).toHaveClass("fixed", "bottom-0", "md:hidden");
    expect(
      screen.getAllByRole("link", {
        name: new RegExp(appNavigationItems.at(-1)?.shortLabel ?? ""),
      }).length,
    ).toBeGreaterThan(0);
  });
});
