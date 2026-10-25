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

test("child sees dashboard, published stories, AAC and achievements", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "Desktop walkthrough; mobile navigation is covered separately.");
  await login(page, "student");
  await expect(page.locator(".child-room-home")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Привет, Алихан/ })).toBeVisible();
  await expect(page.locator(".room-start-button")).toHaveCSS("color", "rgb(255, 255, 255)");
  await page.screenshot({ path: info.outputPath("child-home.png"), animations: "disabled" });

  await page.locator("#primary-navigation nav").getByRole("button", { name: "Истории" }).click();
  await expect(page.getByRole("heading", {name: "Истории"})).toBeVisible();
  await expect(page.locator(".v2-story-grid .v2-story-card")).toHaveCount(3);
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

test("full child menu works on phone and desktop and can sign out", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "This test owns both viewport sizes.");
  await login(page, "student");
  await page.getByRole("button", {name:"Свернуть меню",exact:true}).click();
  await expect(page.locator("#primary-navigation")).not.toHaveAttribute("inert");
  await expect(page.locator("#primary-navigation")).toHaveCSS("width","112px");
  await expect(page.locator("#primary-navigation .sidebar-close")).toHaveCount(0);
  await page.locator("#primary-navigation nav").getByRole("button",{name:"Мой мир",exact:true}).click();
  await expect(page.locator(".v2-world")).toBeVisible();
  const logo=page.locator("#primary-navigation .brand");
  await expect(logo).toHaveAccessibleName("Развернуть меню");
  await logo.focus();await page.keyboard.press("Enter");
  await expect(page.getByRole("button",{name:"Свернуть меню",exact:true})).toBeVisible();
  await expect(page.locator(".v2-world")).toBeVisible();
  await page.setViewportSize({ width: 320, height: 820 });
  await page.getByRole("button", {name:"Открыть меню",exact:true}).click();
  const menu=page.locator("#primary-navigation");
  for(const name of ["Главная","Истории","Занятия","Мои слова","Мой мир","Навыки","Достижения"]){
    await expect(menu.getByRole("button",{name,exact:true})).toBeVisible();
  }
  await page.screenshot({path:info.outputPath("child-full-menu-mobile.png"),animations:"disabled"});
  await menu.getByRole("button",{name:"Мой мир",exact:true}).click();
  await expect(page.locator(".v2-world")).toBeVisible();
  await expect(menu).toHaveAttribute("inert", "");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.setViewportSize({ width: 1440, height: 900 });
  await menu.getByRole("button", { name: "Выйти из аккаунта" }).click();
  await expect(page.locator(".auth-page")).toBeVisible();
});
