import { mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const API_URL = "http://localhost:8011";
const BROWSER_API_URL = "http://localhost:8010";
const SCREENSHOT_DIR = "/private/tmp/soyle-ui-ux-2026-10-16";

async function prepareApp(page: Page) {
  await page.addInitScript(() => {
    class TestUtterance {
      text: string;
      lang = "";
      rate = 1;
      pitch = 1;
      volume = 1;
      voice = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) { this.text = text; }
    }
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: TestUtterance, configurable: true });
    Object.defineProperty(window, "speechSynthesis", {
      value: { cancel() {}, getVoices() { return []; }, speak(utterance: TestUtterance) { setTimeout(() => utterance.onend?.(), 0); } },
      configurable: true,
    });
  });
  await page.route(`${BROWSER_API_URL}/**`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/tts") {
      return route.fulfill({ status: 503, contentType: "application/json", body: '{"detail":"visual test browser voice"}' });
    }
    return route.continue({ url: route.request().url().replace(BROWSER_API_URL, API_URL) });
  });
}

async function login(page: Page, username: string, password: string, student = false) {
  await page.goto("/app");
  if (student) await page.getByRole("button", { name: "Ребёнок" }).click();
  await page.getByLabel(student ? "Логин ребёнка" : "Логин", { exact: true }).fill(username);
  await page.getByLabel(student ? "PIN-код" : "Пароль", { exact: true }).fill(password);
  await page.getByRole("button", { name: student ? "Начать заниматься" : "Войти", exact: true }).click();
  await expect(page.getByRole("main")).toBeVisible();
}

async function openSection(page: Page, name: string) {
  const menu = page.getByRole("button", { name: "Открыть меню" });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name, exact: true }).click();
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test("visual UX pass at the five required widths", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The test explicitly owns all five audit widths.");
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  await prepareApp(page);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, "alikhan", "1234", true);

  for (const width of [320, 360, 390, 768, 1440]) {
    const height = width <= 390 ? 820 : 1000;
    await page.setViewportSize({ width, height });
    await openSection(page, "Главная");
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/${width}-child-home.png`, fullPage: true, animations: "disabled" });

    await openSection(page, "Занятия");
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/${width}-child-catalog.png`, fullPage: true, animations: "disabled" });
    await page.getByRole("button", { name: /Игрушки/ }).first().click();
    await page.getByRole("button", { name: /Понятно, начать/ }).click();
    await expectNoHorizontalOverflow(page);

    for (const selector of [".speech-rate button", ".focus-safety-actions button"]) {
      const boxes = await page.locator(selector).evaluateAll((elements) => elements.map((element) => {
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right, height: box.height };
      }));
      expect(boxes.every((box) => box.left >= -1 && box.right <= width + 1 && box.height >= 47)).toBe(true);
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/${width}-exercise-focus.png`, fullPage: false, animations: "disabled" });
    await page.getByRole("button", { name: "Вернуться к занятиям" }).click();

    if (width === 320) {
      await openSection(page, "Сказать");
      await expectNoHorizontalOverflow(page);
      await page.screenshot({ path: `${SCREENSHOT_DIR}/320-aac.png`, fullPage: true, animations: "disabled" });
      await openSection(page, "Настройки");
      await expectNoHorizontalOverflow(page);
      await page.screenshot({ path: `${SCREENSHOT_DIR}/320-child-settings.png`, fullPage: true, animations: "disabled" });
    }
  }

  await openSection(page, "Занятия");
  await page.getByRole("button", { name: /Я хочу/ }).first().click();
  const composerAlignment = await page.locator(".aac-composer-top .aac-sentence:not(.filled)").evaluate((sentence) => {
    const content = sentence.querySelector<HTMLElement>(".aac-empty-message");
    if (!content) return Number.POSITIVE_INFINITY;
    const sentenceBox = sentence.getBoundingClientRect();
    const contentBox = content.getBoundingClientRect();
    return Math.abs((sentenceBox.top + sentenceBox.height / 2) - (contentBox.top + contentBox.height / 2));
  });
  expect(composerAlignment).toBeLessThanOrEqual(2);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/1440-aac-empty-state.png`, fullPage: false, animations: "disabled" });
  await page.getByRole("button", { name: "Вернуться к занятиям" }).click();

  await page.setViewportSize({ width: 768, height: 1000 });
  await openSection(page, "Главная");
  await page.evaluate(() => {
    for (const element of document.querySelectorAll<HTMLElement>("h1,h2,h3,p,small,strong,button,label")) {
      if ([...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())) {
        element.style.fontSize = `${Number.parseFloat(getComputedStyle(element).fontSize) * 2}px`;
      }
    }
  });
  await expectNoHorizontalOverflow(page);
  const heroTitleFits = await page.locator(".child-hero h1").evaluate((element) => element.scrollWidth <= element.clientWidth + 1);
  expect(heroTitleFits).toBe(true);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/768-child-home-text-200.png`, fullPage: true, animations: "disabled" });
  const animationDuration = await page.locator(".page-enter").evaluate((element) => getComputedStyle(element).animationDuration);
  expect(Number.parseFloat(animationDuration || "0")).toBeLessThanOrEqual(0.01);

  await page.context().clearCookies();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, "parent", "Parent123!");
  await page.screenshot({ path: `${SCREENSHOT_DIR}/1440-parent-home.png`, fullPage: true, animations: "disabled" });
  await openSection(page, "Ещё");
  await page.screenshot({ path: `${SCREENSHOT_DIR}/1440-parent-more.png`, fullPage: true, animations: "disabled" });

  await page.context().clearCookies();
  await login(page, "admin", "Admin123!");
  await page.getByRole("tab", { name: "Задания" }).click();
  await page.locator(".draft-list article").first().getByRole("button", { name: "Открыть проверку" }).click();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/1440-admin-review.png`, fullPage: true, animations: "disabled" });
});
