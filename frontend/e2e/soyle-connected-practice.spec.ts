import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const API = "http://localhost:8011";

test("a family accepts a goal-linked recommendation and its result returns to the specialist", async ({ page, request }, info) => {
  test.setTimeout(90_000);
  const suffix = `${info.project.name}-${Date.now()}`;
  const password = "LinkedPractice123!";
  const register = async (prefix: string) => {
    const response = await request.post(`${API}/api/auth/register`, { headers: {"X-Soyle-Auth-Mode": "bearer"}, data: {username: `${prefix}-${suffix}`, password, full_name: prefix === "family" ? "Родитель" : "Специалист"} });
    expect(response.status()).toBe(201);
    const body = await response.json();
    return {user: body.user, auth: {Authorization: `Bearer ${body.access_token}`}};
  };
  const parent = await register("family"), specialist = await register("specialist");
  const adminLogin = await request.post(`${API}/api/auth/login`, {headers: {"X-Soyle-Auth-Mode": "bearer"}, data: {username: "admin", password: "Admin123!"}});
  const admin = {Authorization: `Bearer ${(await adminLogin.json()).access_token}`};
  expect((await request.patch(`${API}/api/admin/users/${specialist.user.id}/role`, {headers: admin, data: {role: "specialist"}})).status()).toBe(200);
  const childResponse = await request.post(`${API}/api/children`, {headers: parent.auth, data: {name: "Тестовый ребёнок", birth_date: "2021-01-01"}});
  const child = (await childResponse.json()).id;
  await request.put(`${API}/api/children/${child}/consent`, {headers: parent.auth, data: {privacy_accepted: true, specialist_sharing: true}});
  await request.post(`${API}/api/children/${child}/specialists`, {headers: parent.auth, data: {username: specialist.user.username}});
  const goalResponse = await request.post(`${API}/api/practice-goals`, {headers: parent.auth, data: {child_id: child, template_key: "recognise-five-objects", baseline: "Выбирает знакомые предметы", help_level: "minimal"}});
  const goal = await goalResponse.json();
  await page.route("http://localhost:8010/**", route => route.continue({url: route.request().url().replace(":8010", ":8011")}));
  const login = async (username: string) => {
    await page.goto("/app");
    await page.getByLabel("Логин", {exact: true}).fill(username);
    await page.getByLabel("Пароль", {exact: true}).fill(password);
    await page.getByRole("button", {name: "Войти", exact: true}).click();
  };
  await login(specialist.user.username);
  await page.getByRole("button", {name: /Тестовый ребёнок Открыть наблюдения/}).click();
  await page.getByRole("link", {name: "Рекомендации", exact: true}).click();
  await page.getByLabel("Цель рекомендации").selectOption(String(goal.id));
  await expect(page.getByRole("combobox", {name: "Упражнение", exact: true}).locator("option")).toHaveCount(4);
  await page.getByRole("combobox", {name: "Упражнение", exact: true}).selectOption({label: "Домашние животные"});
  await page.getByLabel("Как поддержать ребёнка").fill("Начните с выбора знакомого животного. Дождитесь ответа.");
  await page.getByRole("button", {name: "Сохранить рекомендацию", exact: true}).click();
  await expect(page.getByText("Ожидает решения семьи", {exact: true})).toBeVisible();
  await page.getByRole("button", {name: "Выйти из аккаунта", exact: true}).click();
  await login(parent.user.username);
  const advice = page.locator(".parent-specialist-advice");
  await advice.getByRole("button", {name: "Включить в план", exact: true}).click();
  await expect(advice.getByText("Семья включила в практику", {exact: true})).toBeVisible();
  const axe = await new AxeBuilder({page}).analyze();
  expect(axe.violations.filter(item => ["serious", "critical"].includes(item.impact || ""))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path: info.outputPath("accepted-recommendation.png"), fullPage: true});
  await advice.getByRole("button", {name: "Начать по рекомендации", exact: true}).click();
  await expect(page.getByRole("heading", {name: "Короткая практика шаг за шагом"})).toBeVisible();
  await expect(page.locator(".session-steps")).toContainText("Узнавать 5 знакомых предметов");
  await page.evaluate(() => {
    Math.random = () => 0.999;
    class Voice {
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
    }
    Object.defineProperty(window, "SpeechSynthesisUtterance", {value: Voice, configurable: true});
    Object.defineProperty(window, "speechSynthesis", {value: {cancel() {}, getVoices: () => [], speak: (voice: Voice) => setTimeout(() => voice.onend?.(), 0)}, configurable: true});
  });
  await page.route("http://localhost:8010/api/tts", route => route.fulfill({status: 503, body: "{}"}));
  await page.getByRole("button", {name: /Начать с разминки|Начать первое задание/}).click();
  await page.getByRole("button", {name: /Понятно, начать/}).click();
  for (let round = 0; round < 4; round++) {
    await page.locator(".picture-options button").nth(0).click();
    await expect(page.getByText("Получилось", {exact: true})).toBeVisible();
    await page.getByRole("button", {name: round === 3 ? "Завершить" : "Дальше", exact: true}).click();
  }
  await expect(page.getByRole("heading", {name: "Задание завершено", exact: true})).toBeVisible();
  // Read the same persisted result through the specialist UI in another login.
  await page.goto("/app");
  await expect(page.locator(".parent-specialist-advice")).toBeVisible();
  const menu = page.getByRole("button", {name: "Открыть меню", exact: true});
  if (await menu.isVisible()) await menu.click();
  await page.locator(".sidebar-logout").click();
  await login(specialist.user.username);
  await page.getByRole("button", {name: /Тестовый ребёнок Открыть наблюдения/}).click();
  await page.getByRole("link", {name: "Рекомендации", exact: true}).click();
  await expect(page.getByText("Практика по рекомендации состоялась. Это не подтверждение освоения навыка.")).toBeVisible();
  await expect(page.getByText(/Последняя попытка: Задание выполнено/)).toContainText("4 из 4");
  await page.screenshot({path: info.outputPath("specialist-result.png"), fullPage: true});
});
