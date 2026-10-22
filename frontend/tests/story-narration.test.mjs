import assert from "node:assert/strict";
import test from "node:test";
import { playNarration } from "../lib/storybook/cinematic/audio.ts";

test("story narration distinguishes ended, failed, unavailable and cancelled speech", async () => {
  const previous = { window: globalThis.window, speechSynthesis: globalThis.speechSynthesis, SpeechSynthesisUtterance: globalThis.SpeechSynthesisUtterance };
  class Voice { constructor(text) { this.text = text; } }
  globalThis.SpeechSynthesisUtterance = Voice;
  const voice = { cancel() {}, speak(value) { queueMicrotask(() => value.onend()); } };
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
