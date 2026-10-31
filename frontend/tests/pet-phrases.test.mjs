import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/pet.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { createPetPhraseSelector, petReactions } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("correct answers cycle through all encouragements even with greetings and hints", () => {
  const select = createPetPhraseSelector();
  const actual = [];
  for (let i = 0; i < 8; i++) {
    select("greeting");
    select("hint");
    actual.push(select("correct"));
    select("complete");
  }
  assert.deepEqual(actual, [...petReactions.correct.phrases, ...petReactions.correct.phrases]);
});

test("adjacent events do not repeat their shared greeting", () => {
  const select = createPetPhraseSelector();
  const events = ["greeting", "tap", "greeting", "tap", "tap", "correct"];
  let previous;
  for (let i = 0; i < 8; i++) for (const event of events) {
    const phrase = select(event);
    assert.notEqual(phrase, previous);
    assert.ok(petReactions[event].phrases.includes(phrase));
    previous = phrase;
  }
});

test("correct-answer narration stays on the exercise audio path with a silent pet reaction", async () => {
  const app = await readFile(new URL("../components/SoyleApp.tsx", import.meta.url), "utf8");
  const start = app.indexOf('    if (index === roundData.target) {');
  const end = app.indexOf('    const nextWrongChoices', start);
  const correctAnswer = app.slice(start, end);
  assert.match(correctAnswer, /pet\("correct", \{ phrase: praise, silent: true \}\)/);
  assert.match(correctAnswer, /speak\(praise, speechRate, soundEnabled, language, "exercise", exercise\?\.engine\?\.version_id, "pet"\)/);
  assert.doesNotMatch(correctAnswer, /preferences|speakPet/);
  assert.match(correctAnswer, /language === "kk" \? "Жарайсың!" : nextPetPhrase\("correct"\)/);
});

test("retry speaks encouragement before the word, holds the audio lock and respects cancellation", async () => {
  const app = await readFile(new URL("../components/SoyleApp.tsx", import.meta.url), "utf8");
  const snippet = app.slice(app.indexOf("  const playWord = async"), app.indexOf("  const beginRound = async"));
  for (const cancelled of [false, true]) {
    const calls = [];
    const audioLockRef = { current: false }, stoppedRef = { current: false };
    let finishEncouragement;
    const context = {
      roundData: {target: 0}, audioLockRef, stoppedRef, phase: "playing",
      setAudioPending() {}, setAudioPlayed() {}, setPhase() {},
      items: [{speech: "Мяч", word: "Мяч"}], speechRate: .78, soundEnabled: true,
      exercise: {engine: {language: "ru", version_id: 7}},
      speak(text) {
        calls.push(text);
        return calls.length === 1 ? new Promise(resolve => { finishEncouragement = resolve; }) : Promise.resolve(true);
      },
    };
    const compiled = ts.transpileModule(snippet + "\nreturn playWord;", {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText;
    const playWord = new Function(...Object.keys(context), compiled)(...Object.values(context));
    const pending = playWord(0, false, "Подумай ещё раз.");
    assert.equal(audioLockRef.current, true);
    assert.deepEqual(calls, ["Подумай ещё раз."]);
    await playWord(0, false, "Повторный клик");
    assert.equal(calls.length, 1);
    finishEncouragement(!cancelled);
    await pending;
    assert.deepEqual(calls, cancelled ? ["Подумай ещё раз."] : ["Подумай ещё раз.", "Мяч"]);
    assert.equal(audioLockRef.current, false);
  }
});
