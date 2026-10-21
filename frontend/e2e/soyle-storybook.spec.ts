import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

test.use({ video: { mode: "on", size: { width: 1440, height: 1000 } } });

async function openBook(page: Page) {
  await page.addInitScript(() => {
    class Voice { text: string; onend?: () => void; constructor(text: string) { this.text = text; } }
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: Voice, configurable: true });
    Object.defineProperty(window, "speechSynthesis", { value: { cancel() {}, getVoices() { return []; }, speak(voice: Voice) { setTimeout(() => voice.onend?.(), 5); } }, configurable: true });
  });
  await page.route("http://localhost:8010/**", (route) => route.request().url().endsWith("/api/tts")
    ? route.fulfill({ status: 503, contentType: "application/json", body: "{}" })
    : route.continue({ url: route.request().url().replace(":8010", ":8011") }));
  await page.goto("/app");
  await page.getByLabel("Логин", { exact: true }).fill("parent");
  await page.getByLabel("Пароль", { exact: true }).fill("Parent123!");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page.locator(".soyle-unified")).toBeVisible();
  const menu = page.getByRole("button", { name: "Открыть меню", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.locator("#primary-navigation nav").getByRole("button", { name: "Кабинет родителя", exact: true }).click();
  const response = page.waitForResponse((res) => res.url().includes("/api/storybooks/") && res.request().method() === "GET");
  await page.getByRole("button", { name: /Открыть живую историю/ }).click();
  const snapshot = await (await response).json();
  // Preview progress belongs to this parent, so reset only this disposable test profile.
  const reset = await page.evaluate(async ({ snapshot }) => {
    const csrf = document.cookie.split("; ").find((value) => value.startsWith("soyle_csrf="))?.split("=")[1] || "";
    const res = await fetch("http://localhost:8010/api/storybooks/1/toy/events", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-CSRF-Token": decodeURIComponent(csrf) }, body: JSON.stringify({ version: snapshot.definition.version, expected_revision: snapshot.revision, scene_id: snapshot.definition.scenes[snapshot.state.scene_index].id, event_id: crypto.randomUUID(), action: "restart" }) });
    return res.status;
  }, { snapshot });
  expect(reset).toBe(200);
  // Re-enter to read the authoritative reset, without reloading the app's navigation state.
  await page.getByRole("button", { name: "В кабинет", exact: true }).click();
  await page.getByRole("button", { name: /Открыть живую историю/ }).click();
  await page.getByRole("button", { name: /Открыть книгу|Продолжить историю/ }).click();
  await expect(page.locator(".sb-player")).toBeVisible();
}

async function settled(page: Page) {
  await expect(page.locator(".sb-save-state")).not.toContainText("Сохраняем");
  await page.evaluate(async () => { await Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity && Number(a.effect?.getTiming().duration) <= 2000).map((a) => a.finished.catch(() => {}))); });
}

async function forward(page: Page) { await page.getByRole("button", { name: "Дальше", exact: true }).click(); await settled(page); }

test.describe("live storybook", () => {
  test.use({ reducedMotion: "no-preference" });
  test("six scenes use objects, communication, visible transfer and chosen play", async ({ page }, info) => {
    const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    await openBook(page);
    await expect(page.locator(".sidebar")).toHaveCount(0);
    await expect(page.locator(".topbar")).toHaveCount(0);
    const capture = async (number: number) => {
      await settled(page);
      await page.screenshot({ path: info.outputPath(`scene-${number}.png`), fullPage: true });
      await page.locator(".sb-stage").screenshot({ path: info.outputPath(`composition-${number}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    };
    await capture(1);
    await page.locator('[data-layer="train"]').click();
    await expect(page.locator(".sb-live-reaction")).toContainText("Поезд");
    await forward(page); await capture(2);
    await page.locator('[data-layer="ball"]').click();
    await expect(page.locator(".sb-live-reaction")).toContainText("Это мяч");
    await expect(page.getByRole("button", { name: "Дальше", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Подсказка", exact: true }).click();
    await expect(page.locator('[data-layer="teddy"]')).toHaveClass(/sb-highlight/);
    await page.locator('[data-layer="teddy"]').click();
    await forward(page); await capture(3);
    await page.getByRole("button", { name: "Помоги", exact: true }).click();
    await forward(page); await capture(4);
    const shelf = await page.locator('[data-layer="teddy"]').boundingBox();
    await page.locator('[data-layer="teddy"]').click(); await settled(page);
    const hand = await page.locator('[data-layer="teddy"]').boundingBox();
    expect(Math.abs(shelf!.x - hand!.x)).toBeGreaterThan(10);
    await page.locator('[data-layer="misha"]').click(); await settled(page);
    const child = await page.locator('[data-layer="teddy"]').boundingBox();
    expect(Math.abs(hand!.x - child!.x)).toBeGreaterThan(10);
    await page.screenshot({ path: info.outputPath("mother-gives-teddy.png"), fullPage: true });
    await forward(page); await capture(5);
    await page.locator('[data-layer="train"]').click();
    await expect(page.locator('[data-layer="train"]')).toHaveClass(/sb-rolling/);
    await settled(page);
    await page.locator('[data-layer="basket"]').click();
    await forward(page); await capture(6);
    await page.getByRole("button", { name: "Закончить", exact: true }).click();
    await expect(page.locator(".sb-completed")).toContainText("История закончилась");
    expect(errors).toEqual([]);
    if (info.project.name === "desktop") {
      const destination = path.resolve("../output/storybook/screenshots"); await fs.mkdir(destination, { recursive: true });
      for (let i = 1; i <= 6; i++) { await fs.copyFile(info.outputPath(`scene-${i}.png`), path.join(destination, `scene-${i}-desktop.png`)); await fs.copyFile(info.outputPath(`composition-${i}.png`), path.join(destination, `composition-${i}.png`)); }
      await fs.copyFile(info.outputPath("mother-gives-teddy.png"), path.join(destination, "mother-gives-teddy.png"));
    } else if (info.project.name === "mobile") {
      const destination = path.resolve("../output/storybook/screenshots"); await fs.mkdir(destination, { recursive: true });
      await fs.copyFile(info.outputPath("scene-4.png"), path.join(destination, "scene-4-mobile.png"));
    }
  });
});

test("pause, reduced motion, assistance and saved progress remain usable", async ({ page }) => {
  await openBook(page);
  await expect(page.getByLabel("Мягкие движения", { exact: false })).toBeDisabled();
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations.filter((item) => ["serious", "critical"].includes(item.impact || ""))).toEqual([]);
  await page.getByRole("button", { name: "Помочь вместе", exact: true }).click();
  await page.getByRole("button", { name: "Сделать вместе со взрослым", exact: true }).click();
  await forward(page);
  await page.getByRole("button", { name: "Перерыв", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Закрыть книгу", exact: true }).click();
  await page.getByRole("button", { name: /Открыть живую историю/ }).click();
  await page.getByRole("button", { name: "Продолжить историю", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Продолжить", exact: true }).click();
  await expect(page.locator("#sb-scene-title")).toHaveText("Где мишка?");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".sb-stage")).toHaveClass(/sb-still/);
});
