import { expect, test } from "@playwright/test";

test("anonymous users are routed to the login screen", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  await expect(page.getByText("Autenticação indisponível")).toBeVisible();
});

test("protected app shell rejects anonymous access", async ({ page }) => {
  await page.goto("/app/profile");

  await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fprofile/);
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
});
