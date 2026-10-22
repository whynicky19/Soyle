import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = (await readFile(new URL("../lib/speech.ts", import.meta.url), "utf8"))
  .replace('import { API_URL, getCsrfToken } from "./api";', 'const API_URL = ""; const getCsrfToken = () => "csrf";');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { speak, stopCurrentSpeech } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("speech settles, cancels safely and retries the server after failures", async (t) => {
  const originals = Object.fromEntries(["window", "Audio", "SpeechSynthesisUtterance", "fetch", "setTimeout"].map(key => [key, globalThis[key]]));
  let audios = [], voices = [], revoked = [];
  const createURL = URL.createObjectURL, revokeURL = URL.revokeObjectURL;
  URL.createObjectURL = () => `blob:test-${audios.length}`;
  URL.revokeObjectURL = url => revoked.push(url);
  globalThis.Audio = class { constructor() { audios.push(this); } pause() { this.paused = true; } play() { return Promise.resolve(); } };
  globalThis.SpeechSynthesisUtterance = class {};
  globalThis.window = { speechSynthesis: { getVoices: () => [], speak: value => voices.push(value), cancel() {} } };
  const ok = () => Promise.resolve({ ok: true, blob: async () => new Blob(["sound"]) });
  const tick = () => new Promise(resolve => originals.setTimeout(resolve, 0));
  t.after(() => { stopCurrentSpeech(); Object.assign(globalThis, originals); URL.createObjectURL = createURL; URL.revokeObjectURL = revokeURL; });
  await t.test("success requires an ended event and releases its URL", async () => {
    globalThis.fetch = ok;
    const result = speak("Привет"); await tick();
    audios.at(-1).onended(); assert.equal(await result, true); assert.equal(revoked.length, 1);
  });
  await t.test("stopping a pending response never starts late audio or fallback", async () => {
    let release;
    globalThis.fetch = () => new Promise(resolve => { release = resolve; });
    const result = speak("Стоп"); stopCurrentSpeech(); release(await ok());
    assert.equal(await result, false); assert.equal(audios.length, 1); assert.equal(voices.length, 0);
  });
  await t.test("server failure falls back only for this attempt", async () => {
    globalThis.fetch = async () => ({ ok: false, status: 503 });
    const result = speak("Помоги"); await tick(); voices.at(-1).onend(); assert.equal(await result, true);
    globalThis.fetch = ok;
    const next = speak("Помоги"); await tick(); audios.at(-1).onerror(); assert.equal(await next, false);
    assert.equal(audios.length, 2);
  });
  await t.test("expired authentication does not speak through a local fallback", async () => {
    globalThis.fetch = async () => ({ ok: false, status: 401 });
    assert.equal(await speak("Привет"), false); assert.equal(voices.length, 1);
  });
  await t.test("both a hung browser voice and hung audio settle within their budget", async () => {
    globalThis.setTimeout = (fn, ms) => originals.setTimeout(fn, ms === 30000 ? 5 : ms);
    globalThis.fetch = async () => ({ ok: false, status: 503 });
    assert.equal(await speak("Помоги"), false);
    globalThis.fetch = ok; assert.equal(await speak("Помоги"), false);
  });
  await t.test("a request timeout falls back, while an explicit abort does not", async () => {
    globalThis.setTimeout = (fn, ms) => originals.setTimeout(fn, ms === 12000 ? 5 : ms);
    globalThis.fetch = (_, options) => new Promise((_, reject) => options.signal.addEventListener("abort", () => reject(new DOMException("Stopped", "AbortError"))));
    const result = speak("Помоги"); await new Promise(resolve => originals.setTimeout(resolve, 10));
    voices.at(-1).onend(); assert.equal(await result, true);
    const count = voices.length; const cancelled = speak("Стоп"); stopCurrentSpeech();
    assert.equal(await cancelled, false); assert.equal(voices.length, count);
  });
});
