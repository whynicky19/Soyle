import { expect, test, type Page } from "@playwright/test";

const API_URL = "http://localhost:8011";
const BROWSER_API_URL = "http://localhost:8010";

async function prepareSpeech(page: Page) {
  await page.addInitScript(() => {
    const speechState = window as typeof window & { __soyleHoldSpeech?: boolean; __soyleFinishSpeech?: () => void };
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
      value: {
        cancel() {},
        getVoices() { return []; },
        speak(utterance: TestUtterance) {
          if (speechState.__soyleHoldSpeech) {
            speechState.__soyleFinishSpeech = () => {
              speechState.__soyleFinishSpeech = undefined;
              utterance.onend?.();
            };
          } else {
            setTimeout(() => utterance.onend?.(), 0);
          }
        },
      },
      configurable: true,
    });
  });
  await page.route(`${BROWSER_API_URL}/**`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/tts") {
      return route.fulfill({ status: 503, contentType: "application/json", body: '{"detail":"browser voice test fallback"}' });
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

async function openMainSection(page: Page, name: string) {
  const menu = page.getByRole("button", { name: "Открыть меню" });
  const openedMobileMenu = await menu.isVisible();
  if (openedMobileMenu) await menu.click();
  const target = page.getByRole("button", { name, exact: true });
  if (await target.count() > 0 && await target.first().isVisible()) {
    await target.first().click();
    return;
  }
  if (name === "Сегодня" && openedMobileMenu) {
    await page.locator("#primary-navigation nav").getByRole("button", { name: "Главная", exact: true }).click();
    return;
  }
  if (openedMobileMenu) await page.keyboard.press("Escape");
  if (name === "Занятия") {
    await page.getByRole("button", { name: /Занятия ребёнка/ }).click();
    return;
  }
  if (name === "Цели и занятия") {
    await page.getByRole("button", { name: /Цели и план/ }).click();
    return;
  }
  if (name === "Сегодня") {
    await page.locator(".brand").click();
    return;
  }
  if (name === "Прогресс") {
    await page.getByRole("button", { name: /История практики/ }).click();
    return;
  }
  throw new Error(`No product navigation path for ${name}`);
}

async function openCatalogExercise(page: Page, name: RegExp) {
  const exercise = page.getByRole("button", { name }).first();
  if (!await exercise.isVisible()) await page.locator(".child-more-games summary").click();
  await exercise.click();
}

async function openToysExercise(page: Page) {
  await openCatalogExercise(page, /Игрушки/);
}

test.beforeEach(async ({ page }) => {
  await prepareSpeech(page);
});

for (const material of [{ title: "Знакомые предметы: разные примеры", count: 8, name: "words" }, { title: "Что делает ребёнок: одинаковые предметы", count: 4, name: "actions" }]) test(`${material.name} preview loads complete art and stays unpublished`, async ({ page }, testInfo) => {
  await login(page, "admin", "Admin123!");
  await page.getByRole("tab", { name: "Задания", exact: true }).click();
  await page.locator(".draft-list article").filter({ hasText: material.title }).getByRole("button", { name: "Открыть проверку" }).click();
  await expect(page.locator(".stimulus-review-grid img")).toHaveCount(material.count);
  await expect(page.locator(".stimulus-review-grid img").first()).toBeVisible();
  for (const image of await page.locator(".stimulus-review-grid img").all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  await page.getByRole("button", { name: "Preview механики" }).click();
  await page.getByRole("button", { name: "Начать предпросмотр", exact: true }).click();
  await expect(page.locator(".p1-choice-grid button")).toHaveCount(3);
  await expect(page.locator(".p1-choice-grid img").first()).toHaveAttribute("src", /learning-core/);
  await expect(page.locator(".p1-choice-grid button").first()).toBeEnabled();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `../docs/content-review/${material.name}-${testInfo.project.name}.png`, fullPage: true });
  await page.getByRole("button", { name: "Перерыв", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Предпросмотр остановлен" })).toBeVisible();
});

test("repeat before first response saves supported evidence, refusal and break work", async ({ page }) => {
  await login(page, "alikhan", "1234", true);
  await page.evaluate(() => { Math.random = () => 0.999; });
  await openMainSection(page, "Занятия");
  await openToysExercise(page);
  await page.getByRole("button", { name: /Понятно, начать/ }).click();
  await expect(page.locator(".picture-options button").first()).toBeEnabled();
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await page.locator(".picture-options button").first().click();
  await expect(page.getByText("Получилось. Подсказка помогла найти картинку.", { exact: true })).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Дальше", exact: true }).click();
    await expect(page.locator(".picture-options button").first()).toBeEnabled();
    await page.locator(".picture-options button").first().click();
    await expect(page.getByText("Ты нашёл картинку самостоятельно.", { exact: true })).toBeVisible();
  }
  const saved = page.waitForRequest(request => new URL(request.url()).pathname === "/api/sessions" && request.method() === "POST");
  await page.getByRole("button", { name: "Завершить", exact: true }).click();
  const payload = (await saved).postDataJSON();
  expect(payload.independent_completions).toBe(3);
  expect(payload.details.round_outcomes[0].outcome).toBe("repeated");
  expect(payload.details.round_outcomes[0].supports).toContain("repeat_audio");
  await expect(page.getByRole("heading", { name: "Готово!" })).toBeVisible();
  await page.getByRole("button", { name: "Закончить практику" }).click();
  await openToysExercise(page);
  await page.getByRole("button", { name: "Перерыв", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Выбери игру", exact: true })).toBeVisible();
  await openToysExercise(page);
  await page.getByRole("button", { name: "Не хочу", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Сообщение принято" })).toBeVisible();
});

test("lost save response retries the same event and returns the same stored result", async ({ page }) => {
  await login(page, "alikhan", "1234", true);
  await page.evaluate(() => { Math.random = () => 0.999; });
  await openMainSection(page, "Занятия");
  await openToysExercise(page);
  await page.getByRole("button", { name: /Понятно, начать/ }).click();
  for (let index = 0; index < 4; index++) {
    await expect(page.locator(".picture-options button").first()).toBeEnabled();
    await page.locator(".picture-options button").first().click();
    if (index < 3) await page.getByRole("button", { name: "Дальше", exact: true }).click();
  }
  const payloads: unknown[] = [];
  let storedId: number | undefined;
  await page.route("**/api/sessions", async route => {
    payloads.push(route.request().postDataJSON());
    const stored = await route.fetch({ url: route.request().url().replace(":8010", ":8011") });
    expect(stored.ok()).toBe(true);
    const result = await stored.json();
    if (storedId === undefined) {
      storedId = result.id;
      await route.fulfill({ status: 503, contentType: "application/json", body: '{"detail":"test lost response"}' });
    } else {
      expect(result.id).toBe(storedId);
      await route.fulfill({ response: stored });
    }
  });
  await page.getByRole("button", { name: "Завершить", exact: true }).click();
  await expect(page.getByText(/Попытка осталась на экране/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Готово!" })).toHaveCount(0);
  await page.getByRole("button", { name: "Завершить", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Готово!" })).toBeVisible();
  expect(payloads).toHaveLength(2);
  expect(payloads[0]).toEqual(payloads[1]);
});

test("child sees no retired quiz and No to continuing is accepted as refusal", async ({ page }) => {
  await login(page, "alikhan", "1234", true);
  await openMainSection(page, "Истории");
  await expect(page.getByRole("heading", { name: "Истории" })).toBeVisible();
  await expect(page.getByRole("button", { name: /На прогулке|Собираемся спать|Идём кушать/ })).toHaveCount(0);
  await openMainSection(page, "Занятия");
  await openCatalogExercise(page, /Ответить.*да.*нет/);
  await page.locator(".aac-card-main").filter({ has: page.locator("strong", { hasText: /^Нет$/ }) }).click();
  const saved = page.waitForRequest(request => new URL(request.url()).pathname === "/api/sessions" && request.method() === "POST");
  await page.locator(".speak-button").click();
  expect((await saved).postDataJSON().attempt_status).toBe("refused");
  await expect(page.getByRole("heading", { name: "Сообщение принято" })).toBeVisible();
});
