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

test("camera is a local mirror without MediaPipe analysis", async () => {
  const [app, packageJson] = await Promise.all([
    readProjectFile("components/SoyleApp.tsx"),
    readProjectFile("package.json"),
  ]);
  assert.doesNotMatch(app, /FaceLandmarker|@mediapipe|detectForVideo/);
  assert.doesNotMatch(packageJson, /@mediapipe/);
  assert.match(app, /local-camera-mirror/);
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
});
