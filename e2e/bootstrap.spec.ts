import { expect, test } from "@playwright/test";

test("Planner Vida bootstrap page is reachable", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Planner Vida" }),
  ).toBeVisible();
  await expect(page.getByText("Sem lógica financeira")).toBeVisible();
});
