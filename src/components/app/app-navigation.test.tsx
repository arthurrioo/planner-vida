import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppNavigation } from "./app-navigation";
import { appNavigationItems } from "./navigation";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/financeiro",
}));

describe("AppNavigation", () => {
  it("renders every canonical Milestone 05 navigation item", () => {
    render(<AppNavigation />);

    for (const item of appNavigationItems) {
      expect(
        screen.getAllByRole("link", { name: new RegExp(item.label, "i") })
          .length,
      ).toBeGreaterThan(0);
    }
  });

  it("marks the active section for keyboard and screen reader users", () => {
    render(<AppNavigation />);

    const activeLinks = screen.getAllByRole("link", {
      current: "page",
    });

    expect(activeLinks).toHaveLength(2);
  });
});
