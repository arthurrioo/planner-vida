import { expect, test } from "@playwright/test";

test("anonymous users are routed to the login screen", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  await expect(page.getByText("Autenticação indisponível")).toBeVisible();
});

test("protected app shell rejects anonymous access", async ({ page }) => {
  await page.goto("/app/profile");

  await expect(page).toHaveURL("/login?next=%2Fapp%2Fprofile");
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
});

test("phase 1 navigation routes preserve exact protected deep links", async ({
  page,
}) => {
  const routes = [
    "/app",
    "/app/calendario",
    "/app/planner",
    "/app/financeiro",
    "/app/financeiro/contas",
    "/app/financeiro/categorias",
    "/app/compras",
    "/app/patrimonio",
    "/app/recorrentes",
    "/app/configuracoes",
  ];

  for (const route of routes) {
    await page.goto(route);

    await expect(page).toHaveURL(`/login?next=${encodeURIComponent(route)}`);
    await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  }
});

test("direct refresh of protected deep links preserves exact next target", async ({
  page,
}) => {
  const routes = [
    "/app",
    "/app/profile",
    "/app/financeiro/contas",
    "/app/financeiro/categorias",
  ];

  for (const route of routes) {
    await page.goto(route);
    await page.reload();

    await expect(page).toHaveURL(`/login?next=${encodeURIComponent(route)}`);
  }
});

test("mobile protected deep links preserve exact next target", async ({
  page,
}) => {
  await page.setViewportSize({ height: 812, width: 375 });
  await page.goto("/app/financeiro");

  await expect(page).toHaveURL("/login?next=%2Fapp%2Ffinanceiro");
});

test("compact landscape protected deep links preserve exact next target", async ({
  page,
}) => {
  await page.setViewportSize({ height: 390, width: 844 });
  await page.goto("/app/profile");

  await expect(page).toHaveURL("/login?next=%2Fapp%2Fprofile");
});

test("login surface supports keyboard navigation smoke", async ({ page }) => {
  await page.goto("/login");

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Planner Vida" })).toBeFocused();
});
