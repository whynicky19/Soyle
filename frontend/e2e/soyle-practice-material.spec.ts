import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.setTimeout(90_000);

test.beforeEach(async ({page}) => {
  await page.addInitScript(() => {
    class Utterance { onend: (() => void) | null = null; onerror: (() => void) | null = null; }
    Object.defineProperty(window, "SpeechSynthesisUtterance", {value: Utterance, configurable: true});
    Object.defineProperty(window, "speechSynthesis", {value: {cancel() {}, getVoices: () => [{lang:"ru-RU",localService:true}], speak: (voice: Utterance) => setTimeout(() => voice.onend?.(), 0)}, configurable: true});
  });
  await page.route("http://localhost:8010/**", route => {
    if (new URL(route.request().url()).pathname === "/api/tts") return route.fulfill({status: 503, body: "{}"});
    return route.continue({url: route.request().url().replace(":8010", ":8011")});
  });
  await page.goto("/app");
  await page.getByLabel("Логин", {exact: true}).fill("admin");
  await page.getByLabel("Пароль", {exact: true}).fill("Admin123!");
  await page.getByRole("button", {name: "Войти", exact: true}).click();
  await page.getByRole("tab", {name: "Задания", exact: true}).click();
});

test("actions contain twelve full illustrated scenes", async ({page}, info) => {
  await page.locator(".draft-list article").filter({hasText: "Знакомые действия: разные дети, одинаковые предметы"}).getByRole("button", {name: "Открыть проверку"}).click();
  await expect(page.locator(".stimulus-review-grid img")).toHaveCount(12);
  for (const image of await page.locator(".stimulus-review-grid img").all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  await page.getByRole("button", {name: "Preview механики"}).click();
  await page.getByRole("button", {name: "Начать предпросмотр", exact: true}).click();
  await expect(page.locator(".p1-choice-grid button")).toHaveCount(3);
  const paths = await page.locator(".p1-choice-grid img").evaluateAll(nodes => nodes.map(node => (node as HTMLImageElement).src));
  expect(paths.every(path => path.includes("actions%2F") || path.includes("actions/"))).toBe(true);
  const usesGirl = paths[0].includes("learning-practice");
  expect(paths.every(path => path.includes("learning-practice") === usesGirl)).toBe(true);
  const audit = await new AxeBuilder({page}).analyze();
  expect(audit.violations.filter(item => ["critical", "serious"].includes(item.impact || ""))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path: info.outputPath("action-variants.png"), fullPage: true});
});

for (const material of [
  {title: "Дай предмет: мишке или взрослому", relation: "give", rounds:16},
  {title: "Положи предмет: в коробку или на стол", relation: "in", rounds:24},
]) test(`${material.relation} instruction models show the action without scoring success`, async ({page}, info) => {
  let saved = 0;
  page.on("request", request => { if (new URL(request.url()).pathname === "/api/sessions" && request.method() === "POST") saved++; });
  await page.locator(".draft-list article").filter({hasText: material.title}).getByRole("button", {name: "Открыть проверку"}).click();
  await expect(page.locator(".scenario-review-list article")).toHaveCount(material.rounds);
  await page.evaluate(() => { Math.random = () => .999; });
  await page.getByRole("button", {name: "Preview механики"}).click();
  await page.getByRole("button", {name: `${material.rounds} заданий`, exact: true}).click();
  for (let round = 0; round < material.rounds; round++) {
    await expect(page.getByRole("button", {name: "Повторить", exact: true})).toBeDisabled();
    await page.getByRole("button", {name: "Послушать и выполнить", exact: true}).click();
    await expect(page.getByRole("heading", {name: "Послушай и выполни", exact: true})).toBeVisible();
    for (const image of await page.locator(".instruction-stage img").all()) {
      expect(await image.getAttribute("src")).not.toContain(".svg");
      await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    }
    await page.getByRole("button", {name: "Показать действие", exact: true}).click();
    await expect.poll(() => page.locator(".instruction-result img").evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect(page.getByText("Смотрим действие вместе", {exact: true})).toBeVisible();
    await expect(page.locator(".instruction-result")).toHaveAttribute("data-relation", material.relation === "in" && round >= 16 ? "on" : material.relation);
    if (!round) {
      const card = await page.locator(".published-instruction-card").boundingBox();
      for (const node of await page.locator(".published-instruction-card button, .published-instruction-card img").all()) {
        const bounds = await node.boundingBox();
        if (bounds && card) {
          expect(bounds.x).toBeGreaterThanOrEqual(card.x);
          expect(bounds.x + bounds.width).toBeLessThanOrEqual(card.x + card.width + 1);
        }
      }
      const audit = await new AxeBuilder({page}).analyze();
      expect(audit.violations.filter(item => ["critical", "serious"].includes(item.impact || ""))).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({path: info.outputPath(`${material.relation}-result.png`), fullPage: true});
    }
    await page.getByRole("button", {name: round === material.rounds - 1 ? "Завершить" : "Следующая инструкция", exact: true}).click();
  }
  await expect(page.getByRole("heading", {name: "Спокойное завершение", exact: true})).toBeVisible();
  await expect(page.getByText("Самостоятельных ответов: 0", {exact: true})).toBeVisible();
  await expect(page.getByText("Выполнено с подсказкой: 0", {exact: true})).toBeVisible();
  expect(saved).toBe(0);
});

test("a correct pair is recorded separately from a repeated instruction", async ({page}) => {
  await page.locator(".draft-list article").filter({hasText: "Положи предмет: в коробку или на стол"}).getByRole("button", {name: "Открыть проверку"}).click();
  await page.evaluate(() => { Math.random = () => .999; });
  await page.getByRole("button", {name: "Preview механики"}).click();
  for (let round = 0; round < 12; round++) {
    await page.getByRole("button", {name: "Послушать и выполнить", exact: true}).click();
    if (!round) await page.getByRole("button", {name: "Повторить", exact: true}).click();
    const sections = page.locator(".instruction-stage section");
    await sections.nth(0).getByRole("button").nth(0).click();
    await sections.nth(1).getByRole("button").nth(0).click();
    await expect(page.getByText(round ? "Инструкция выполнена самостоятельно." : "Инструкция выполнена с подсказкой.", {exact: true})).toBeVisible();
    await page.getByRole("button", {name: round === 11 ? "Завершить" : "Следующая инструкция", exact: true}).click();
  }
  await expect(page.getByText("Самостоятельных ответов: 11", {exact: true})).toBeVisible();
  await expect(page.getByText("Выполнено с подсказкой: 1", {exact: true})).toBeVisible();
});
