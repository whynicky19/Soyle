import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

async function prepare(page: Page) {
  await page.addInitScript(() => {
    const state = window as typeof window & { __spoken?: string[] };
    state.__spoken = [];
    class Utterance { text: string; onend?: () => void; constructor(text: string) { this.text = text; } }
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: Utterance, configurable: true });
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
      cancel() {}, getVoices() { return []; },
      speak(utterance: Utterance) { state.__spoken?.push(utterance.text); setTimeout(() => utterance.onend?.(), 0); },
    } });
  });
  await page.route("http://localhost:8010/**", (route) => route.request().url().endsWith("/api/tts")
    ? route.fulfill({ status: 503, contentType: "application/json", body: "{}" })
    : route.continue({ url: route.request().url().replace(":8010", ":8011") }));
}

async function login(page: Page, student = false) {
  await prepare(page);
  await page.goto("/app");
  if (student) await page.getByRole("button", { name: "Ребёнок", exact: true }).click();
  await page.getByLabel(student ? "Логин ребёнка" : "Логин", { exact: true }).fill(student ? "alikhan" : "parent");
  await page.getByLabel(student ? "PIN-код" : "Пароль", { exact: true }).fill(student ? "1234" : "Parent123!");
  await page.getByRole("button", { name: student ? "Начать заниматься" : "Войти", exact: true }).click();
  await expect(page.locator(".soyle-unified")).toBeVisible();
}

async function navigate(page: Page, name: string) {
  const menu = page.getByRole("button", { name: "Открыть меню", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.locator("#primary-navigation nav").getByRole("button", { name, exact: true }).click();
}

test("free AAC speaks a combination and offers household vocabulary", async ({ page }) => {
  await login(page, true);
  await navigate(page, "Мои слова");
  for (const label of ["Что это?", "Устал"]) {
    await page.locator(".aac-card-main").filter({ has: page.locator("strong", { hasText: new RegExp(`^${label.replace(/[?]/g, "\\?")}$`) }) }).click();
  }
  await expect(page.locator(".speak-button")).toBeEnabled();
  const composed = page.waitForResponse((response) => response.url().includes("/api/aac/compose"));
  await page.locator(".speak-button").click();
  expect((await (await composed).json()).phrase).toBe("Что это? Я устал");
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __spoken?: string[] }).__spoken)).toContain("Что это? Я устал");
  await page.locator(".primary-aac-tabs").getByRole("button", { name: /^Ещё/ }).click();
  await page.getByRole("button", { name: /^Быт/ }).click();
  await expect(page.locator(".aac-card-main")).toHaveCount(6);
  await expect(page.locator(".aac-card-main").filter({ hasText: "Чашка" })).toBeVisible();
});

test("parent can upload multiple named photos, rename and speak one, and use styled cabinet links", async ({ page }, info) => {
  await login(page);
  await navigate(page, "Кабинет родителя");
  await page.getByRole("link", {name: "Материалы", exact: true}).click();
  const tools = page.locator(".v2-parent-cabinet-links");
  await expect(tools.getByRole("button")).toHaveCount(4);
  await expect(tools.getByRole("button").first()).toHaveCSS("border-radius", "18px");
  await page.screenshot({ path: info.outputPath("parent-cabinet.png"), fullPage: true });
  await tools.getByRole("button", { name: /Фотографии ребёнка/ }).click();
  const suffix = info.project.name;
  const names = [`Мой мяч ${suffix}`, `Моя вода ${suffix}`];
  const files = ["aac-ball.webp", "aac-water.webp"].map((file) => path.resolve("public/app-illustrations", file));
  await page.locator('input[type="file"]').setInputFiles(files);
  await expect(page.locator(".v2-photo-upload-preview")).toHaveCount(2);
  for (let index = 0; index < names.length; index++) {
    await page.getByLabel(`Название фото ${index + 1}`).fill(names[index]);
  }
  // Every project runs against the same temporary database: remove its earlier copies first.
  page.on("dialog", (dialog) => dialog.accept());
  const existing = page.locator(".v2-photo-card");
  while (await existing.count()) { const count = await existing.count(); await existing.first().getByRole("button", { name: /^Удалить/ }).click(); await expect(existing).toHaveCount(count - 1); }
  await page.getByRole("button", { name: "Сохранить фотографии", exact: true }).click();
  await expect(page.locator(".v2-photo-card")).toHaveCount(2);
  const photo = page.locator(".v2-photo-card").filter({ has: page.locator("footer strong", { hasText: names[0] }) });
  const image = photo.locator(".v2-photo-image-button");
  const bounds = await image.boundingBox();
  expect(bounds!.width).toBeGreaterThan(100);
  expect(bounds!.height).toBeGreaterThan(75);
  await expect.poll(() => image.locator("img").evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await photo.getByRole("button", { name: "Название", exact: true }).click();
  const renamed = `Любимый мяч ${suffix}`;
  await photo.getByLabel("Название фотографии").fill(renamed);
  await photo.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page.getByRole("button", { name: `Произнести: ${renamed}`, exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __spoken?: string[] }).__spoken)).toContain(renamed);
  await page.screenshot({ path: info.outputPath("world-two-photos.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await navigate(page, "Кабинет родителя");
  await page.getByRole("link", {name: "Материалы", exact: true}).click();
  await page.locator(".v2-parent-cabinet-links").getByRole("button", { name: /Фотографии ребёнка/ }).click();
  await expect(page.locator(".v2-photo-card")).toHaveCount(2);
  // A duplicate must not prevent the next valid file in the same batch from being saved.
  await page.locator('input[type="file"]').setInputFiles([files[0], path.resolve("public/app-illustrations/aac-cat.webp")]);
  await page.getByLabel("Название фото 1").fill("Повторный мяч");
  await page.getByLabel("Название фото 2").fill(`Мой кот ${suffix}`);
  await page.getByRole("button", { name: "Сохранить фотографии", exact: true }).click();
  await expect(page.locator(".v2-photo-card")).toHaveCount(3);
  await expect(page.locator(".v2-photo-upload-preview")).toHaveCount(1);
  await expect(page.locator(".v2-world").getByRole("alert")).toContainText("уже есть");
});
