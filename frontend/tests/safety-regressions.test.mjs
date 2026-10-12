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

test("daily goal renders real weekday activity instead of filling dots by attempt count", async () => {
  const [app, api] = await Promise.all([
    readProjectFile("components/SoyleApp.tsx"),
    readProjectFile("lib/api.ts"),
  ]);
  assert.match(api, /week_activity:/);
  assert.match(app, /weekActivity\.map/);
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
