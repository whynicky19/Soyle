import { expect, test, type Page } from "@playwright/test";

const BROWSER_API = "http://localhost:8010";
const TEST_API = "http://localhost:8011";

async function login(page: Page, role: "student" | "parent") {
  await page.route(`${BROWSER_API}/**`, (route) => route.continue({ url: route.request().url().replace(BROWSER_API, TEST_API) }));
  await page.goto("/app");
  if (role === "student") await page.getByRole("button", { name: "Ребёнок" }).click();
  await page.getByLabel(role === "student" ? "Логин ребёнка" : "Логин", { exact: true }).fill(role === "student" ? "alikhan" : "parent");
  await page.getByLabel(role === "student" ? "PIN-код" : "Пароль", { exact: true }).fill(role === "student" ? "1234" : "Parent123!");
  await page.getByRole("button", { name: role === "student" ? "Начать заниматься" : "Войти", exact: true }).click();
  await expect(page.locator(".soyle-unified")).toBeVisible();
}

async function openNav(page: Page, _role: "student" | "parent", name: string) {
  const menu = page.getByRole("button", { name: "Открыть меню" });
  if ((page.viewportSize()?.width || 1440) > 1050) await expect(menu).toBeHidden();
  else { await expect(menu).toBeVisible(); await menu.click(); }
  await page.locator("#primary-navigation nav").getByRole("button", { name, exact: true }).click();
}

async function noHorizontalOverflow(page: Page) {
  const width = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(width).toBeLessThanOrEqual(1);
}

test("new child experience stays usable from 320 to 1440 pixels", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "This test owns five explicit viewport widths.");
  test.setTimeout(120_000);
  await login(page, "student");
  for (const width of [320, 360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width < 400 ? 820 : 1000 });
    await openNav(page, "student", "Главная");
    await expect(page.locator(".child-room-home")).toBeVisible();
    await noHorizontalOverflow(page);
    await page.screenshot({ path: info.outputPath(`${width}-child-home.png`), fullPage: true, animations: "disabled" });

    await openNav(page, "student", "Истории");
    await expect(page.getByRole("heading", {name: "Истории"})).toBeVisible();
    await expect(page.locator(".v2-story-card")).toHaveCount(3);
    await noHorizontalOverflow(page);
    await page.screenshot({ path: info.outputPath(`${width}-child-stories.png`), fullPage: true, animations: "disabled" });

    await openNav(page, "student", "Мои слова");
    await expect(page.locator(".aac-card-grid .aac-card").first()).toBeVisible();
    await noHorizontalOverflow(page);
    await page.screenshot({ path: info.outputPath(`${width}-child-words.png`), animations: "disabled" });
  }
});

test("parent landing, cabinet and guides use one shell", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "This test owns two explicit viewport widths.");
  test.setTimeout(90_000);
  await login(page, "parent");
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await openNav(page, "parent", "Главная");
    await expect(page.locator(".v2-parent-overview")).toBeVisible();
    await noHorizontalOverflow(page);
    await page.screenshot({ path: info.outputPath(`${width}-parent-home.png`), fullPage: true, animations: "disabled" });

    await openNav(page, "parent", "Гайды");
    await expect(page.locator(".v2-guides")).toBeVisible();
    await noHorizontalOverflow(page);
    await page.screenshot({ path: info.outputPath(`${width}-parent-guides.png`), fullPage: true, animations: "disabled" });

    await openNav(page, "parent", "Кабинет родителя");
    await page.getByRole("link", {name: "Материалы", exact: true}).click();
    await expect(page.locator(".v2-parent-cabinet-links")).toBeVisible();
    await noHorizontalOverflow(page);
  }
});
