import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readProjectFile = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("authentication stays in HttpOnly cookies and unsafe requests send CSRF", async () => {
  const api = await readProjectFile("lib/api.ts");
  assert.doesNotMatch(api, /localStorage\.setItem\(["']soyle-token/);
  assert.match(api, /credentials:\s*["']include["']/);
  assert.match(api, /X-CSRF-Token/);
});

test("successful empty API responses do not crash session recovery", async () => {
  const api = await readProjectFile("lib/api.ts");
  assert.match(api, /data && typeof data === ["']object["'] && ["']csrf_token["'] in data/);
});

test("TTS has a dedicated timeout longer than the ordinary API budget", async () => {
  const api = await readProjectFile("lib/api.ts");
  assert.match(api, /path === ["']\/api\/tts["'] \? 45_000 : 8_000/);
});

test("critical optimistic UI changes report failures and roll back", async () => {
  const app = await readProjectFile("components/SoyleApp.tsx");
  const notificationBlock = app.slice(app.indexOf("const markNotificationRead"), app.indexOf("const changeSettings"));
  const settingsBlock = app.slice(app.indexOf("const changeSettings"), app.indexOf("if (user.role === \"parent\" && childrenLoading"));
  assert.doesNotMatch(notificationBlock, /\.catch\(\(\) => null\)/);
  assert.match(notificationBlock, /Уведомление не отмечено прочитанным/);
  assert.match(settingsBlock, /setSettings\(previous\)/);
  assert.match(settingsBlock, /Настройки не сохранены и возвращены к предыдущим/);
});

test("offline copy does not claim an in-memory attempt is safely stored", async () => {
  const app = await readProjectFile("components/SoyleApp.tsx");
  assert.match(app, /Результат не сохранится автоматически и пропадёт при обновлении или закрытии страницы/);
});

test("frontend does not request blocked external fonts or unsupported image quality", async () => {
  const [styles, landing] = await Promise.all([
    readProjectFile("app/globals.css"),
    readProjectFile("components/LandingPage.tsx"),
  ]);
  assert.doesNotMatch(styles, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  assert.doesNotMatch(landing, /quality=\{92\}/);
  assert.match(landing, /quality=\{75\}/);
});

test("child AAC vocabulary is not persisted in browser storage", async () => {
  const app = await readProjectFile("components/SoyleApp.tsx");
  assert.doesNotMatch(app, /localStorage[^\n]*soyle-aac|soyle-aac[^\n]*localStorage/);
});

test("camera movement check stays local and cannot be completed by a timer", async () => {
  const [app, detector, packageJson] = await Promise.all([
    readProjectFile("components/SoyleApp.tsx"),
    readProjectFile("lib/motorDetection.ts"),
    readProjectFile("package.json"),
  ]);
  assert.match(app, /FaceLandmarker|@mediapipe|detectForVideo/);
  assert.match(packageJson, /@mediapipe\/tasks-vision/);
  assert.match(app, /local-face-movement-check/);
  assert.match(app, /checked=\{consent\.camera_processing\}/);
  assert.match(app, /navigator\.mediaDevices\?\.getUserMedia/);
  assert.doesNotMatch(app, /cameraEnabled=/);
  assert.match(app, /Кадры анализируются только в этом браузере/);
  assert.match(app, /media_sent_to_server:\s*false/);
  assert.match(app, /practice\.phase !== "matched"/);
  assert.match(app, /Движение пока не найдено/);
  assert.match(detector, /changeFromBaseline/);
  assert.doesNotMatch(app, /storage\.googleapis|cdn\.jsdelivr|unpkg\.com/);
});

test("only the reviewed Russian interface is selectable", async () => {
  const [i18n, landing] = await Promise.all([
    readProjectFile("lib/i18n.ts"),
    readProjectFile("components/LandingPage.tsx"),
  ]);
  assert.match(i18n, /supportedInterfaceLanguages[^=]*=\s*\["ru"\]/);
  assert.doesNotMatch(i18n, /MutationObserver|translateTree|createTreeWalker/);
  assert.doesNotMatch(landing, /nextLanguage|landing-language/);
});

test("service worker never caches API or private responses", async () => {
  const worker = await readProjectFile("public/sw.js");
  assert.match(worker, /pathname\.startsWith\("\/api\/"\)/);
  assert.match(worker, /headers\.has\("authorization"\)/);
  assert.match(worker, /private\|no-store/);
});

test("security headers cover framing, MIME sniffing and browser capabilities", async () => {
  const config = await readProjectFile("next.config.ts");
  assert.match(config, /frame-ancestors 'none'/);
  assert.match(config, /X-Content-Type-Options/);
  assert.match(config, /Permissions-Policy/);
  assert.match(config, /object-src 'none'/);
  assert.match(config, /wasm-unsafe-eval/);
});

test("parent home avoids a fabricated daily quota and shows a bounded observation", async () => {
  const [app, api] = await Promise.all([
    readProjectFile("components/SoyleApp.tsx"),
    readProjectFile("lib/api.ts"),
  ]);
  assert.match(api, /week_activity:/);
  assert.match(app, /parent-observation/);
  assert.doesNotMatch(app, /weekActivity\.map/);
  assert.doesNotMatch(app, /day\s*<\s*Math\.min\(dashboard\?\.week_sessions/);
});

test("child-facing copy does not require a streak or fixed daily quota", async () => {
  const app = await readProjectFile("components/SoyleApp.tsx");
  assert.doesNotMatch(app, /Серия:/);
  assert.doesNotMatch(app, /ПЛАН НА СЕГОДНЯ/);
  assert.doesNotMatch(app, /дней подряд/);
  assert.match(app, /Можно сделать паузу в любой момент/);
});

test("public child navigation does not expose motor prototypes", async () => {
  const app = await readProjectFile("components/SoyleApp.tsx");
  const modulesBlock = app.slice(app.indexOf("const modules = ["), app.indexOf("const moduleImages"));
  assert.doesNotMatch(modulesBlock, /id:\s*["']motor["']/);
  assert.match(app, /\["all","sensory","mixed"\]/);
});

test("sensory practice always exposes break and refusal actions", async () => {
  const app = await readProjectFile("components/SoyleApp.tsx");
  assert.match(app, /sensory-stop-actions/);
  assert.match(app, /stopExercise\("break"\)/);
  assert.match(app, /stopExercise\("refused"\)/);
});

test("closed mobile navigation is inert and returns focus", async () => {
  const app = await readProjectFile("components/SoyleApp.tsx");
  assert.match(app, /inert=\{sidebarIsDialog && !sidebarOpen/);
  assert.match(app, /aria-hidden=\{sidebarIsDialog && !sidebarOpen/);
  assert.match(app, /menuButtonRef\.current\?\.focus/);
  assert.match(app, /event\.key === "Escape"/);
});

test("AAC prevents duplicate cards and exposes Stop as an immediate message", async () => {
  const app = await readProjectFile("components/SoyleApp.tsx");
  assert.match(app, /selected\.some\(\(item\) => item\.id === card\.id\)/);
  assert.match(app, /"Стоп"/);
  assert.match(app, /quickCards = \["Помоги", "Больно", "Стоп"/);
});

test("sensory stimuli come from the versioned exercise payload", async () => {
  const app = await readProjectFile("components/SoyleApp.tsx");
  const api = await readProjectFile("lib/api.ts");
  assert.match(app, /exercise\?\.engine\?\.content\.stimuli/);
  assert.match(api, /version_id: number/);
  assert.match(api, /matching_stimulus_key|completion_rule/);
});

test("P1 family screens keep observations separate and drafts review-gated", async () => {
  const [app, family, preview] = await Promise.all([
    readProjectFile("components/SoyleApp.tsx"),
    readProjectFile("components/FamilyPractice.tsx"),
    readProjectFile("components/P1ExerciseRunners.tsx"),
  ]);
  assert.match(app, /FunctionalSkillMap/);
  assert.match(app, /HomePracticeLibrary/);
  assert.match(app, /P1ResultsSummary/);
  assert.match(family, /Это не тест и не расчёт речевого возраста/);
  assert.match(family, /методической проверке/);
  assert.doesNotMatch(family, /процент развития речи/i);
  assert.match(preview, /DRAFT · ТОЛЬКО ПРЕДПРОСМОТР/);
  assert.match(preview, /Результат не сохраняется/);
  assert.match(preview, /PublishedInstructionRunner/);
  assert.match(app, /mechanic === "tap_instruction"/);
});

test("guided AAC requires a scenario-valid message and an explicit final action", async () => {
  const app = await readProjectFile("components/SoyleApp.tsx");
  assert.match(app, /evaluateAACScenario/);
  assert.match(app, /!scenarioEvaluation\.complete/);
  assert.match(app, /scenarioEvaluation\.actionLabel/);
  assert.match(app, /Шаг 1 из 2|stepLabel/);
  assert.doesNotMatch(app, /Засчитывается любое понятное сообщение/);
});

test("P2.1 goals use a deterministic review-gated planner instead of AI", async () => {
  const [app, goals, api] = await Promise.all([
    readProjectFile("components/SoyleApp.tsx"),
    readProjectFile("components/GoalsAndPractice.tsx"),
    readProjectFile("lib/api.ts"),
  ]);
  assert.match(app, /\/api\/adaptive-plans\/\$\{child\.id\}/);
  assert.doesNotMatch(app, /api<AIPlan>\(`\/api\/ai\/plan/);
  assert.match(goals, /Локальная адаптация/);
  assert.match(goals, /Без внешней AI API/);
  assert.match(goals, /Домашние практические цели/);
  assert.match(goals, /Черновики не используются/);
  assert.match(goals, /Почему предложено/);
  assert.doesNotMatch(goals, /речевой возраст|процент развития речи/i);
  assert.match(api, /goal_version: number/);
  assert.match(api, /difficulty_params: AdaptiveDifficultyParams/);
  assert.match(api, /assignment_reason: AdaptiveAssignmentReason/);
});

test("adaptive analysis has no external model SDK or API key dependency", async () => {
  const [requirements, helper, launcher] = await Promise.all([
    readFile(new URL("../../backend/requirements.txt", import.meta.url), "utf8"),
    readFile(new URL("../../backend/app/ai_assistant.py", import.meta.url), "utf8"),
    readFile(new URL("../../start.sh", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(requirements, /^openai\b/im);
  assert.doesNotMatch(helper, /OpenAI|OPENAI_API_KEY|responses\.create|from openai/i);
  assert.doesNotMatch(launcher, /OPENAI_API_KEY|SOYLE_OPENAI_MODEL|import uvicorn, openai/);
  assert.match(helper, /local rule-based helper/i);
});

test("adaptive runner applies the planned option count instead of a numeric label alone", async () => {
  const app = await readProjectFile("components/SoyleApp.tsx");
  assert.match(app, /exercise\?\.adaptive\?\.difficulty_params\.difficulty_level/);
  assert.match(app, /Выбрано по домашней практической цели/);
  assert.match(app, /exercise\.adaptive\.assignment_reason\.messages\[0\]/);
});
