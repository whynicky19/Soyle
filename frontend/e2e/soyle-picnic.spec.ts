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
        getVoices() { return [{lang:"ru-RU",localService:true}]; },
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


const stage = (page: Page) => page.getByTestId("book-stage");
async function openPicnic(page: Page) {
  await login(page, "parent", "Parent123!");
  await openMainSection(page, "Кабинет родителя");
  const response = page.waitForResponse(response => response.url().includes("/picnic") && response.request().method() === "GET");
  await page.getByRole("link", { name: "Материалы", exact: true }).click();
  await page.getByRole("button", { name: "Открыть комикс", exact: true }).click();
  const loaded = await response;
  expect(loaded.status()).toBe(200);
  const saved = await loaded.json();
  await expect(page.getByRole("button", { name: /Открыть книгу|Продолжить чтение|Перечитать/, exact: true })).toBeVisible();
  const status = await page.evaluate(async ({ saved, url }) => {
    const csrf = document.cookie.split("; ").find(value => value.startsWith("soyle_csrf="))?.split("=")[1] || "";
    return (await fetch(url + "/events", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-CSRF-Token": decodeURIComponent(csrf) }, body: JSON.stringify({ version: 1, expected_revision: saved.revision, scene_id: saved.definition.scenes[saved.state.scene_index].id, event_id: crypto.randomUUID(), action: "restart" }) })).status;
  }, { saved, url: loaded.url().replace(":8011", ":8010") });
  expect(status).toBe(200);
  await page.getByRole("button", { name: "В кабинет", exact: true }).click();
  await page.getByRole("link", { name: "Материалы", exact: true }).click();
  await page.getByRole("button", { name: "Открыть комикс", exact: true }).click();
  await page.getByRole("button", { name: /Открыть книгу|Продолжить чтение/, exact: true }).click();
  await expect(stage(page)).toHaveAttribute("data-scene", "01");
}
async function nextScene(page: Page, id: string) {
  await page.getByRole("button", { name: "Дальше", exact: true }).click();
  await expect(stage(page)).toHaveAttribute("data-scene", id);
}
for (const toy of ["Мяч", "Книга"]) for (const message of ["Помоги", "Показать на корзину"]) for (const fruit of ["Яблоко", "Банан"]) {
  test(`picnic full branch ${toy}, ${message}, ${fruit}`, async ({ page }, info) => {
    test.setTimeout(90000);
    await openPicnic(page);
    await nextScene(page, "02");
    const toyButton = page.getByRole("button", { name: toy, exact: true });
    await toyButton.focus(); await page.keyboard.press("Enter");
    await nextScene(page, "03");
    await page.getByRole("button", { name: "Стакан", exact: true }).click();
    await page.getByRole("button", { name: "В сумку", exact: true }).click();
    await expect(page.locator(".book-result-shown")).toBeVisible();
    await nextScene(page, "04");
    await page.getByRole("button", { name: message, exact: true }).click();
    await nextScene(page, "05");
    await nextScene(page, "06");
    await nextScene(page, "07-ball");
    await expect(page.locator(".book-world > .book-illustration").first()).toHaveAttribute("src", new RegExp(toy === "Мяч" ? "07-ball" : "07-book"));
    if (message === "Помоги" && fruit === "Яблоко") {
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      await expect(page.getByLabel("Мягкие движения", { exact: true })).toBeDisabled();
      await page.screenshot({ path: `../docs/content-review/picnic-${toy === "Мяч" ? "ball" : "book"}-${info.project.name}.png`, fullPage: true });
      const result = await new AxeBuilder({ page }).analyze();
      expect(result.violations.filter(item => ["serious", "critical"].includes(item.impact || ""))).toEqual([]);
    }
    await nextScene(page, "08");
    await page.getByRole("button", { name: fruit, exact: true }).click();
    await expect(page.locator(".book-result-shown")).toHaveAttribute("src", new RegExp(fruit === "Яблоко" ? "08-apple" : "08-banana"));
    await nextScene(page, "09");
    await nextScene(page, "10");
    await page.getByRole("button", { name: "Стакан", exact: true }).click();
    await page.getByRole("button", { name: "В сумку", exact: true }).click();
    await expect(page.locator(".book-result-shown")).toHaveAttribute("src", /10-packed/);
    await nextScene(page, "11");
    await nextScene(page, "12");
    await page.getByRole("button", { name: "Закончить книгу", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Побудем вместе" })).toBeVisible();
    await expect(page.locator(".book-choice-memory")).toContainText(`${toy} · ${fruit}`);
  });
}

test("picnic refusal, refresh, back and failed voice preserve truthful state", async ({ page }) => {
  test.setTimeout(90000);
  await openPicnic(page);
  await nextScene(page, "02");
  await page.getByRole("button", { name: "Книга", exact: true }).click();
  await nextScene(page, "03");
  await page.getByRole("button", { name: "Не хочу", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("main")).toBeVisible();
  await openMainSection(page, "Кабинет родителя");
  await page.getByRole("link", { name: "Материалы", exact: true }).click();
  await page.getByRole("button", { name: "Открыть комикс", exact: true }).click();
  await page.getByRole("button", { name: "Продолжить чтение", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Продолжить", exact: true }).click();
  await expect(stage(page)).toHaveAttribute("data-scene", "03");
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await expect(stage(page)).toHaveAttribute("data-scene", "02");
  await expect(stage(page)).toHaveAttribute("data-ready", "true");
  await nextScene(page, "03");
  await page.route("**/learning-core/picnic/audio/**", route => route.fulfill({ status: 503, body: "test audio unavailable" }));
  await page.evaluate(() => { window.speechSynthesis.speak = voice => queueMicrotask(() => voice.onerror?.(new Event("error") as SpeechSynthesisErrorEvent)); });
  await page.getByRole("button", { name: "Послушать ещё раз", exact: true }).click();
  await expect(page.getByText("Не удалось включить звук. Можно продолжать по картинкам.", { exact: true })).toBeVisible();
  await page.locator(".book-adult-help summary").click();
  await page.getByRole("button", { name: "Помочь вместе", exact: true }).click();
  await expect(stage(page)).toHaveAttribute("data-ready", "true");
});
