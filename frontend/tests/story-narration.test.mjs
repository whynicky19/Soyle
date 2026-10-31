import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const speech = (await readFile(new URL("../lib/speech.ts", import.meta.url), "utf8")).replace('import { API_URL, getCsrfToken } from "./api";', 'const API_URL = ""; const getCsrfToken = () => "";');
const narration = (await readFile(new URL("../lib/storybook/cinematic/audio.ts", import.meta.url), "utf8")).replace(/^import .*;\n/, "");
const compiled = ts.transpileModule(speech + narration, {compilerOptions: {target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {playNarration} = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("story narration distinguishes ended, failed, unavailable and cancelled speech", async () => {
  const previous = { Audio: globalThis.Audio, fetch: globalThis.fetch, window: globalThis.window, speechSynthesis: globalThis.speechSynthesis, SpeechSynthesisUtterance: globalThis.SpeechSynthesisUtterance };
  globalThis.Audio = class { play() {return Promise.resolve();} pause() {} };
  globalThis.fetch = async () => ({ok:false,status:503});
  class Voice { constructor(text) { this.text = text; } }
  globalThis.SpeechSynthesisUtterance = Voice;
  const voice = { getVoices: () => [{lang:"ru-RU",localService:true}], cancel() {}, speak(value) { queueMicrotask(() => value.onend()); } };
  globalThis.speechSynthesis = voice;
  globalThis.window = { speechSynthesis: voice, setTimeout, clearTimeout };
  try {
    await playNarration("Миша идёт", new AbortController().signal);
    voice.speak = value => queueMicrotask(() => value.onerror());
    await assert.rejects(playNarration("Миша идёт", new AbortController().signal), /озвучку/);
    delete globalThis.window.speechSynthesis;
    await assert.rejects(playNarration("Миша идёт", new AbortController().signal), /недоступна/);
    globalThis.window.speechSynthesis = voice;
    voice.speak = () => {};
    const controller = new AbortController();
    const pending = playNarration("Миша идёт", controller.signal);
    controller.abort();
    await pending;
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});
