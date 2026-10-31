import AxeBuilder from "@axe-core/playwright";
import {expect, test, type Page} from "@playwright/test";

test.setTimeout(60_000);
test.beforeEach(async ({page}) => {
  await page.addInitScript(() => {
    class Utterance { onend: (() => void) | null = null; onerror: (() => void) | null = null; }
    Object.defineProperty(window, "SpeechSynthesisUtterance", {value: Utterance, configurable: true});
    Object.defineProperty(window, "speechSynthesis", {value: {cancel() {}, getVoices: () => [{lang:"ru-RU",localService:true}], speak: (voice: Utterance) => setTimeout(() => voice.onend?.(), 0)}, configurable: true});
  });
  await page.route("http://localhost:8010/**", route => new URL(route.request().url()).pathname === "/api/tts"
    ? route.fulfill({status:503, body:"{}"})
    : route.continue({url:route.request().url().replace(":8010", ":8011")}));
});

async function login(page: Page, admin = true) {
  await page.goto("/app");
  if (!admin) await page.getByRole("button", {name:"Ребёнок", exact:true}).click();
  await page.getByLabel(admin ? "Логин" : "Логин ребёнка", {exact:true}).fill(admin ? "admin" : "alikhan");
  await page.getByLabel(admin ? "Пароль" : "PIN-код", {exact:true}).fill(admin ? "Admin123!" : "1234");
  await page.getByRole("button", {name:admin ? "Войти" : "Начать заниматься", exact:true}).click();
  if (!admin) await expect(page.locator(".child-room-home")).toBeVisible();
}

async function openDraft(page: Page, title: string) {
  await page.getByRole("tab", {name:"Задания", exact:true}).click();
  await page.locator(".draft-list article").filter({hasText:title}).getByRole("button", {name:"Открыть проверку"}).click();
}

test("review shows twelve full-width clothing illustrations", async ({page}, info) => {
  await login(page);
  await openDraft(page, "Понимание слов: одежда");
  const images = page.locator(".stimulus-review-grid img");
  await expect(images).toHaveCount(12);
  for (const image of await images.all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const fill = await image.evaluate(node => node.getBoundingClientRect().width / node.closest("figure")!.getBoundingClientRect().width);
    expect(fill).toBeGreaterThan(.98);
  }
  await page.locator(".stimulus-review-grid article").nth(6).screenshot({path:info.outputPath("full-clothing-card.png")});
  const audit = await new AxeBuilder({page}).analyze();
  expect(audit.violations.filter(item => ["critical","serious"].includes(item.impact || "")).map(item => ({id:item.id, targets:item.nodes.map(node => node.target)}))).toEqual([]);
});

test("word series covers twelve concepts then continues and saves eighteen outcomes once", async ({page}, info) => {
  await login(page, false);
  await page.evaluate(() => { Math.random = () => .999; });
  const menu = page.getByRole("button", {name:"Открыть меню"});
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("navigation", {name:"Основное меню"}).getByRole("button", {name:"Занятия", exact:true}).click();
  const exercise = page.getByRole("button", {name:/Игрушки/}).first();
  if (!await exercise.isVisible()) await page.locator(".child-more-games summary").click();
  await exercise.click();
  await expect(page.getByRole("button", {name:"12 заданий", exact:true})).toHaveAttribute("aria-pressed", "true");
  let saved: Record<string, unknown>[] = [];
  page.on("request", request => {if (new URL(request.url()).pathname === "/api/sessions" && request.method() === "POST") saved = [...saved, request.postDataJSON()];});
  await page.getByRole("button", {name:/Понятно, начать/}).click();
  const concepts: string[] = [];
  for (let round = 0; round < 18; round++) {
    const options = page.locator(".picture-options button");
    await expect(options).toHaveCount(2);
    if (!round) {
      for (const image of await page.locator(".picture-options img").all()) {
        await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
        const size = await image.evaluate(node => ({image:node.getBoundingClientRect().width, card:node.closest("button")!.getBoundingClientRect().width}));
        expect(size.image).toBeGreaterThan(size.card - 6);
      }
      await page.locator(".picture-options").screenshot({path:info.outputPath("full-word-cards.png")});
    }
    await options.nth(0).click();
    await expect(page.getByText("Получилось", {exact:true})).toBeVisible();
    concepts.push(await page.locator(".picture-options button.answer strong").innerText());
    if (round === 11) {
      expect(saved).toHaveLength(0);
      expect(new Set(concepts).size).toBe(12);
      await page.getByRole("button", {name:"Ещё 6 заданий", exact:true}).click();
      await expect(page.getByRole("progressbar", {name:"Ход задания"})).toHaveAttribute("aria-valuemax", "18");
    } else if (round < 17) await page.getByRole("button", {name:"Дальше", exact:true}).click();
  }
  const response = page.waitForResponse(r => new URL(r.url()).pathname === "/api/sessions" && r.request().method() === "POST");
  await page.getByRole("button", {name:"Завершить", exact:true}).click();
  expect((await response).status()).toBe(201);
  expect(saved).toHaveLength(1);
  expect(saved[0].attempts_count).toBe(18);
  expect(saved[0].independent_completions).toBe(18);
  const details = saved[0].details as {round_count:number; round_outcomes:unknown[]};
  expect(details.round_count).toBe(18);
  expect(details.round_outcomes).toHaveLength(18);
});

test("instruction continuation uses the four remaining new situations", async ({page}) => {
  await login(page);
  await openDraft(page, "Дай предмет: мишке или взрослому");
  await page.getByRole("button", {name:"Preview механики", exact:true}).click();
  const instructions: string[] = [];
  for (let round = 0; round < 16; round++) {
    await page.getByRole("button", {name:"Послушать и выполнить", exact:true}).click();
    await page.getByRole("button", {name:"Показать действие", exact:true}).click();
    instructions.push(await page.locator(".instruction-heading h3").innerText());
    if (round === 11) await page.getByRole("button", {name:"Продолжить с новыми заданиями", exact:true}).click();
    else await page.getByRole("button", {name:round === 15 ? "Завершить" : "Следующая инструкция", exact:true}).click();
  }
  expect(new Set(instructions).size).toBe(16);
  await expect(page.getByRole("heading", {name:"Спокойное завершение", exact:true})).toBeVisible();
  await expect(page.getByText("Самостоятельных ответов: 0", {exact:true})).toBeVisible();
});
