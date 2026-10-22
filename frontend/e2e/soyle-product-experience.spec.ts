import { expect, test, type Page } from "@playwright/test";

const BROWSER_API_URL = "http://localhost:8010";
const TEST_API_URL = "http://localhost:8011";

async function login(page: Page, role: "parent" | "student") {
  await page.route(`${BROWSER_API_URL}/**`, (route) => route.continue({ url: route.request().url().replace(BROWSER_API_URL, TEST_API_URL) }));
  await page.goto("/app");
  if (role === "student") await page.getByRole("button", { name: "Ребёнок" }).click();
  await page.getByLabel(role === "student" ? "Логин ребёнка" : "Логин", { exact: true }).fill(role === "student" ? "alikhan" : "parent");
  await page.getByLabel(role === "student" ? "PIN-код" : "Пароль", { exact: true }).fill(role === "student" ? "1234" : "Parent123!");
  await page.getByRole("button", { name: role === "student" ? "Начать заниматься" : "Войти", exact: true }).click();
  await expect(page.locator(".soyle-unified")).toBeVisible();
}

test("child sees dashboard, review-gated stories, AAC and achievements", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "Desktop walkthrough; mobile navigation is covered separately.");
  await login(page, "student");
  await expect(page.locator(".v2-dashboard")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Учимся общаться/ })).toBeVisible();
  await expect(page.locator(".v2-start-card h2")).toHaveCSS("color", "rgb(255, 255, 255)");
  await page.screenshot({ path: info.outputPath("child-home.png"), animations: "disabled" });

  await page.locator("#primary-navigation nav").getByRole("button", { name: "Истории" }).click();
  await expect(page.getByRole("heading", {name: "Истории готовятся"})).toBeVisible();
  await expect(page.locator(".v2-story-grid .v2-story-card")).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("child-story-review-gate.png"), animations: "disabled" });

  await page.locator("#primary-navigation nav").getByRole("button", { name: "Мои слова" }).click();
  await expect(page.getByRole("heading", { name: "Мои слова" })).toBeVisible();
  await expect(page.locator(".aac-card-grid .aac-card").first()).toBeVisible();
  await expect(page.locator(".aac-card-grid .aac-card .aac-pictogram-image").first()).toHaveAttribute("src", /\/app-illustrations\/aac-/);
  await page.screenshot({ path: info.outputPath("child-words.png"), animations: "disabled" });
  await page.locator("#primary-navigation nav").getByRole("button", { name: "Достижения" }).click();
  await expect(page.getByRole("heading", { name: "Мои достижения" })).toBeVisible();
  await expect(page.locator(".v2-achievement-grid img")).toHaveCount(5);
  await expect(page.locator(".v2-achievement-hero img")).toBeVisible();
  await expect.poll(() => page.locator(".v2-achievement-hero img").evaluate((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)).toBe(true);
  await page.screenshot({ path: info.outputPath("child-achievements.png"), animations: "disabled" });
  await page.getByRole("button", { name: "Открыть профиль" }).last().focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".v2-child-profile")).toBeVisible();
  await expect(page.locator(".v2-child-profile-hero img")).toBeVisible();
  await expect.poll(() => page.locator(".v2-child-profile-hero img").evaluate((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)).toBe(true);
  await page.screenshot({ path: info.outputPath("child-profile.png"), animations: "disabled" });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.setViewportSize({ width: 320, height: 820 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: info.outputPath("child-profile-mobile.png"), animations: "disabled" });
  await page.getByRole("button", { name: "Посмотреть достижения" }).click();
  await expect(page.locator(".v2-achievement-grid img")).toHaveCount(5);
  await page.screenshot({ path: info.outputPath("child-achievements-mobile.png"), animations: "disabled" });
});

test("parent has only three primary sections and working guide content", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "Desktop walkthrough; mobile navigation is covered separately.");
  await login(page, "parent");
  await expect(page.locator("#primary-navigation nav button")).toHaveCount(3);
  await expect(page.getByRole("heading", { name: "Каждый маленький шаг важен" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("parent-home.png"), animations: "disabled" });
  await page.locator("#primary-navigation nav").getByRole("button", { name: "Гайды" }).click();
  await page.getByRole("button", { name: /Как предлагать выбор/ }).click();
  await expect(page.getByRole("dialog")).toContainText("два понятных варианта");
  await page.screenshot({ path: info.outputPath("parent-guide.png"), animations: "disabled" });
});

test("child More page is mobile-only and the desktop sidebar can sign out", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "Desktop sidebar walkthrough.");
  await login(page, "student");
  await expect(page.locator("#primary-navigation nav").getByRole("button", { name: "Ещё" })).toBeHidden();
  await page.setViewportSize({ width: 320, height: 820 });
  await page.locator("#primary-navigation nav").getByRole("button", { name: "Ещё" }).click();
  const cards = page.locator(".v2-child-more-grid > button");
  await expect(cards).toHaveCount(4);
  await expect(page.locator(".v2-child-more-grid img")).toHaveCount(4);
  await expect.poll(() => page.locator(".v2-child-more img").evaluateAll((images) => images.slice(0, 3).every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await expect.poll(() => cards.evaluateAll(elements => {
    const [first, second] = elements.map(element => element.getBoundingClientRect());
    return second.y - first.bottom;
  })).toBeGreaterThanOrEqual(10);
  expect(await cards.first().evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(140);
  await expect(page.locator("#primary-navigation > .sidebar-logout")).toBeHidden();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: info.outputPath("child-more-mobile.png"), animations: "disabled" });
  await cards.filter({ hasText: "Мой мир" }).click();
  await expect(page.locator(".v2-world")).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  const logout = page.locator("#primary-navigation").getByRole("button", { name: "Выйти из аккаунта" });
  await expect(logout).toBeVisible();
  await logout.click();
  await expect(page.locator(".auth-page")).toBeVisible();
});
