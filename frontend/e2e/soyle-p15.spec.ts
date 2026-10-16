import AxeBuilder from "@axe-core/playwright";
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
  if (await menu.isVisible()) await menu.click();
  const target = page.getByRole("button", { name, exact: true });
  if (await target.count() === 0 || !(await target.first().isVisible())) {
    await page.getByRole("button", { name: "Ещё", exact: true }).click();
  }
  await page.getByRole("button", { name, exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await prepareSpeech(page);
});

test("child choice runner handles audio, wrong answer, hint, repeat and saved completion", async ({ page }) => {
  await login(page, "alikhan", "1234", true);
  await page.evaluate(() => { Math.random = () => 0.999; });
  await openMainSection(page, "Занятия");
  await expect(page.getByText("Понимание слов: игрушки")).toHaveCount(0);
  await page.getByRole("button", { name: /Игрушки/ }).first().click();
  await page.getByRole("button", { name: /Понятно, начать/ }).click();
  const options = page.locator(".picture-options button");
  await expect(options).toHaveCount(2);
  await options.nth(1).click();
  await expect(page.getByText("Можно попробовать ещё")).toBeVisible();
  await page.getByRole("button", { name: "Повторить" }).click();
  await options.nth(0).click();
  await expect(page.getByText("Получилось", { exact: true })).toBeVisible();

  for (const correctIndex of [1, 0, 1]) {
    await page.getByRole("button", { name: /Дальше|Завершить/ }).click();
    await expect(page.locator(".picture-options button")).toHaveCount(2);
    await page.locator(".picture-options button").nth(correctIndex).click();
  }
  await page.getByRole("button", { name: "Завершить" }).click();
  await expect(page.getByRole("heading", { name: "Готово!" })).toBeVisible();
  await expect(page.getByText("Попытка сохранена. Выбери, продолжить или вернуться к занятиям.", { exact: true })).toBeVisible();
});

test("animal choices use one consistent illustrated pictogram set", async ({ page }) => {
  await login(page, "alikhan", "1234", true);
  await openMainSection(page, "Занятия");
  await page.getByRole("button", { name: /Я вижу/ }).click();
  await page.locator(".aac-card-main").filter({ has: page.locator("strong", { hasText: /^Мама$/ }) }).click();
  await page.locator(".speak-button").click();
  await page.getByRole("button", { name: "Закончить практику" }).click();
  await page.locator("details.child-more-games > summary").click();
  await page.getByRole("button", { name: /Домашние животные/ }).click();
  await page.locator(".runner-levels button").filter({ hasText: /^4$/ }).click();
  await page.getByRole("button", { name: /Понятно, начать/ }).click();

  const pictures = page.locator(".picture-options img");
  await expect(pictures).toHaveCount(4);
  const pictureSources = await pictures.evaluateAll((images) => images.map((image) => {
    const source = image.getAttribute("src") || "";
    const parsed = new URL(source, window.location.href);
    return parsed.searchParams.get("url") || parsed.pathname;
  }));
  for (const source of pictureSources) {
    expect(source).toMatch(/^\/aac-pictograms\/(cat|dog|fish|bird|rabbit|turtle|snail|bug)\.png$/);
  }
});

test("break and refusal are accepted without exposing a draft", async ({ page }) => {
  await login(page, "alikhan", "1234", true);
  await openMainSection(page, "Занятия");
  await page.getByRole("button", { name: /Игрушки/ }).first().click();
  await page.getByRole("button", { name: "Перерыв" }).click();
  await expect(page.getByRole("heading", { name: "Выбери одну игру" })).toBeVisible();
  await page.getByRole("button", { name: /Игрушки/ }).first().click();
  await page.getByRole("button", { name: "Не хочу" }).click();
  await expect(page.getByRole("heading", { name: "Сообщение принято" })).toBeVisible();
});

test("adult preview never creates a child session and child practice remains explicit", async ({ page }) => {
  await login(page, "parent", "Parent123!");
  await openMainSection(page, "Занятия");
  await expect(page.getByRole("button", { name: "Предпросмотр взрослого" })).toHaveAttribute("aria-pressed", "true");
  let sessionRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/sessions" && request.method() === "POST") sessionRequests += 1;
  });
  await page.getByRole("button", { name: /Игрушки/ }).first().click();
  await expect(page.getByText("Ответы не сохраняются в профиль ребёнка.")).toBeVisible();
  await page.getByRole("button", { name: "Не хочу" }).click();
  await expect(page.getByRole("heading", { name: "Предпросмотр завершён" })).toBeVisible();
  expect(sessionRequests).toBe(0);

  await page.getByRole("button", { name: "Закончить практику" }).click();
  await page.getByRole("button", { name: "Практика ребёнка" }).click();
  await page.getByRole("button", { name: /Игрушки/ }).first().click();
  await page.getByRole("button", { name: "Не хочу" }).click();
  await expect(page.getByRole("heading", { name: "Сообщение принято" })).toBeVisible();
  expect(sessionRequests).toBe(1);
});

test("two, three and four picture choices keep equal geometry at every viewport", async ({ page }) => {
  await login(page, "alikhan", "1234", true);
  await openMainSection(page, "Занятия");
  for (const optionCount of [2, 3, 4]) {
    await page.getByRole("button", { name: /Игрушки/ }).first().click();
    await page.locator(".runner-levels button").filter({ hasText: new RegExp(`^${optionCount}$`) }).click();
    await page.getByRole("button", { name: /Понятно, начать/ }).click();
    const options = page.locator(".picture-options button");
    await expect(options).toHaveCount(optionCount);
    const boxes = await options.evaluateAll((buttons) => buttons.map((button) => {
      const box = button.getBoundingClientRect();
      return { width: Math.round(box.width), height: Math.round(box.height) };
    }));
    expect(new Set(boxes.map((box) => box.width)).size).toBe(1);
    expect(new Set(boxes.map((box) => box.height)).size).toBe(1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "Вернуться к занятиям" }).click();
  }
});

test("spoken-options mode is explicit, keyboard reachable and excluded from scored results", async ({ page }) => {
  await login(page, "alikhan", "1234", true);
  await openMainSection(page, "Занятия");
  await page.getByRole("button", { name: /Игрушки/ }).first().click();
  await page.getByRole("button", { name: "Озвучивать все варианты" }).click();
  await expect(page.getByText(/отдельный доступный режим/)).toBeVisible();
  await page.getByRole("button", { name: /Понятно, начать/ }).click();

  const soundButton = page.getByRole("button", { name: "Прослушать слово" });
  await expect(soundButton).toBeFocused();
  const options = page.locator(".picture-options button");
  await expect(options).toHaveCount(2);
  const names = await options.evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")));
  expect(names.every((name) => Boolean(name) && !name?.startsWith("Вариант"))).toBe(true);
  await expect(page.getByText("Варианты озвучиваются. Эта попытка сохраняется без оценки правильности.")).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((item) => ["serious", "critical"].includes(item.impact || ""))).toEqual([]);
});

test("failed settings save rolls the toggle back and explains the error", async ({ page }) => {
  await login(page, "alikhan", "1234", true);
  await openMainSection(page, "Настройки");
  await page.route(`${BROWSER_API_URL}/api/settings`, async (route) => {
    if (route.request().method() === "PUT") {
      await route.fulfill({ status: 503, contentType: "application/json", body: '{"detail":"test settings outage"}' });
      return;
    }
    await route.continue({ url: route.request().url().replace(BROWSER_API_URL, API_URL) });
  });
  const soundToggle = page.getByRole("button", { name: /Звуковые подсказки/ });
  await expect(soundToggle).toHaveAttribute("aria-pressed", "true");
  await soundToggle.click();
  await expect(page.locator(".global-request-error")).toContainText("Настройки не сохранены и возвращены к предыдущим");
  await expect(soundToggle).toHaveAttribute("aria-pressed", "true");
});

test("offline banner states that an in-memory result can be lost", async ({ page }) => {
  await login(page, "alikhan", "1234", true);
  await page.context().setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(page.locator(".offline-banner")).toContainText("Результат не сохранится автоматически и пропадёт при обновлении или закрытии страницы");
  await page.context().setOffline(false);
});

test("I see message can be spoken and guided answers cannot accumulate duplicates", async ({ page }) => {
  await login(page, "alikhan", "1234", true);
  await openMainSection(page, "Занятия");
  await page.getByRole("button", { name: /Я вижу/ }).click();

  const card = (label: string) => page.locator(".aac-card-main").filter({ has: page.locator("strong", { hasText: new RegExp(`^${label}$`) }) });
  await card("Я").click();
  await card("Вижу").click();
  await card("Мама").click();

  await expect(page.getByText("Я вижу маму", { exact: true })).toBeVisible();
  const speakButton = page.locator(".speak-button");
  let completionRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/sessions" && request.method() === "POST") completionRequests += 1;
  });
  await expect(speakButton).toBeEnabled();
  await expect(card("Папа")).toBeDisabled();
  await page.evaluate(() => { (window as typeof window & { __soyleHoldSpeech?: boolean }).__soyleHoldSpeech = true; });
  await speakButton.click();
  await expect(speakButton).toBeDisabled();
  await expect(speakButton).toContainText("Озвучиваем…");
  await expect.poll(() => page.evaluate(() => Boolean((window as typeof window & { __soyleFinishSpeech?: () => void }).__soyleFinishSpeech))).toBe(true);
  await expect(page.getByRole("heading", { name: "Готово!" })).toHaveCount(0);
  expect(completionRequests).toBe(0);
  await page.evaluate(() => { (window as typeof window & { __soyleFinishSpeech?: () => void }).__soyleFinishSpeech?.(); });
  await expect(page.getByRole("heading", { name: "Готово!" })).toBeVisible();
  expect(completionRequests).toBe(1);
});

test("parent creates a practical goal and sees an explained approved-only plan", async ({ page }) => {
  await login(page, "parent", "Parent123!");
  await openMainSection(page, "Цели и занятия");
  await expect(page.getByRole("heading", { name: "Практика под понятную цель" })).toBeVisible();
  if (await page.locator(".practice-goal-card").count() === 0) {
    await page.getByLabel("Что получается сейчас").fill("Выбирает знакомую картинку после показа взрослого");
    await page.getByRole("button", { name: "Добавить домашнюю цель" }).click();
    await expect(page.locator(".practice-goal-card")).toHaveCount(1);
  }
  await page.getByRole("button", { name: "Подготовить план" }).click();
  await expect(page.locator(".prepared-plan article").first()).toBeVisible();
  await page.locator(".prepared-plan details").first().click();
  await expect(page.getByText(/Связано с целью/).first()).toBeVisible();
  await expect(page.locator(".prepared-plan")).not.toContainText("мотор");
});

test("parent sees saved result and an active session survives reload", async ({ page }) => {
  await login(page, "parent", "Parent123!");
  await openMainSection(page, "Цели и занятия");
  if (await page.locator(".practice-goal-card").count() === 0) {
    await page.getByLabel("Что получается сейчас").fill("Выбирает знакомую картинку после показа взрослого");
    await page.getByRole("button", { name: "Добавить домашнюю цель" }).click();
    await expect(page.locator(".practice-goal-card")).toHaveCount(1);
  }
  await openMainSection(page, "Сегодня");
  await page.getByRole("button", { name: /Начать занятие|Продолжить занятие/ }).first().click();
  await expect(page.getByRole("heading", { name: "Короткая практика шаг за шагом" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Продолжить занятие" })).toBeVisible();
  await openMainSection(page, "Прогресс");
  await expect(page.getByRole("heading", { name: "Игровые ответы и участие" })).toBeVisible();
  await expect(page.getByText(/Отказ|Перерыв|% в игре/).first()).toBeVisible();
});

test("admin can preview DRAFT but cannot methodically approve or publish it", async ({ page }) => {
  await login(page, "admin", "Admin123!");
  await page.getByRole("tab", { name: "Задания" }).click();
  const card = page.locator(".draft-list article").filter({ hasText: "Понимание слов: игрушки" });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Открыть проверку" }).click();
  await expect(page.getByRole("heading", { name: "Понимание слов: игрушки" })).toBeVisible();
  await expect(page.getByText("Материал недоступен детям")).toBeVisible();
  await expect(page.getByRole("button", { name: "Preview механики" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Методическая экспертиза" })).toHaveAttribute("disabled", "");
  await expect(page.getByRole("option", { name: "Окончательное разрешение" })).toHaveAttribute("disabled", "");
  const drafts = await page.request.get(`${API_URL}/api/admin/exercise-drafts`);
  const version = (await drafts.json()).find((item: { version: { target: string } }) => item.version.target === "p15-nouns-toys");
  const publishStatus = await page.evaluate(async ({ browserApiUrl, versionId }) => {
    const csrf = decodeURIComponent(document.cookie.split("; ").find((item) => item.startsWith("soyle_csrf="))?.split("=", 2)[1] || "");
    const response = await fetch(`${browserApiUrl}/api/admin/exercise-drafts/${versionId}/publish`, {
      method: "POST",
      credentials: "include",
      headers: { "X-CSRF-Token": csrf },
    });
    return response.status;
  }, { browserApiUrl: BROWSER_API_URL, versionId: version.version.id });
  expect(publishStatus).toBe(409);
});

test("core screens have no serious axe violations and do not overflow", async ({ page }) => {
  await login(page, "alikhan", "1234", true);
  await expect(page.getByRole("heading", { name: /Готов к новому/ })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((item) => ["serious", "critical"].includes(item.impact || ""))).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("goals and practice screen is accessible without horizontal overflow", async ({ page }) => {
  await login(page, "parent", "Parent123!");
  await openMainSection(page, "Цели и занятия");
  await expect(page.getByRole("heading", { name: "Практика под понятную цель" })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((item) => ["serious", "critical"].includes(item.impact || ""))).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
