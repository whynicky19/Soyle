import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../lib/speech.ts", import.meta.url), "utf8")
  .replace('import { API_URL, getCsrfToken } from "./api";', 'const API_URL = ""; const getCsrfToken = () => "csrf-test";')
  .replace(/^export /gm, "");
const script = ts.transpileModule(source + `
  document.querySelector('#normal').onclick = () => { void speak('Мяч', .78, true, 'ru').then(ok => document.querySelector('#result').textContent=String(ok)); };
  document.querySelector('#slow').onclick = () => { void speak('Доп', .65, true, 'kk').then(ok => document.querySelector('#result').textContent=String(ok)); };
  document.querySelector('#repeat').onclick = () => { void repeatSpeech().then(ok => document.querySelector('#result').textContent=String(ok)); };
  document.querySelector('#stop').onclick = stopCurrentSpeech;
  subscribeSpeech(() => { document.querySelector('#state').textContent=JSON.stringify(getSpeechState()); });
`, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
// Valid PCM fixture: tests the browser's actual media decoder/play() lifecycle.
const wav = Buffer.alloc(44 + 24000);
wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write("data",36); wav.writeUInt32LE(24000,40);
for (let i=0;i<12000;i++) wav.writeInt16LE(Math.round(Math.sin(i * Math.PI / 30) * 400),44+i*2);

for (const [button, language, mode] of [["normal","ru","normal"],["slow","kk","slow"],["slow","ru","slow"],["normal","kk","normal"]]) {
  test(`${language} ${mode}: delayed audio, repeat, stop and gesture reuse`, async ({page}) => {
    const requests: Record<string, unknown>[] = [];
    await page.route("http://soyle.test/**", async route => {
      if (route.request().url().endsWith("/api/tts")) {
        requests.push(route.request().postDataJSON());
        await new Promise(resolve => setTimeout(resolve,150));
        await route.fulfill({status:200,contentType:"audio/wav",headers:{"X-Soyle-TTS":"azure"},body:wav});
      } else if (route.request().url().endsWith("/audio/tts-unlock.wav")) await route.fulfill({contentType:"audio/wav",body:readFileSync(new URL("../public/audio/tts-unlock.wav",import.meta.url))});
      else await route.fulfill({contentType:"text/html",body:'<button id="normal">Normal</button><button id="slow">Slow</button><button id="repeat">Repeat</button><button id="stop">Stop</button><output id="result"></output><output id="state"></output>'});
    });
    await page.goto("http://soyle.test/");
    await page.addScriptTag({content:script.replace("speak('Мяч', .78, true, 'ru')", `speak('${language === "kk" ? "Доп" : "Мяч"}', .78, true, '${language}')`).replace("speak('Доп', .65, true, 'kk')", `speak('${language === "kk" ? "Доп" : "Мяч"}', .65, true, '${language}')`)});
    await page.locator(`#${button}`).click();
    await expect(page.locator("#state")).toContainText('"isLoading":true');
    await expect(page.locator("#result")).toHaveText("true");
    expect(requests[0]).toMatchObject({language,mode});
    await page.locator("#result").evaluate(el => { el.textContent = ""; });
    await page.locator("#repeat").click();
    await expect(page.locator("#result")).toHaveText("true");
    expect(requests[1]).toEqual(requests[0]);
    await page.locator(`#${button}`).click();
    await page.locator("#stop").click();
    await expect(page.locator("#result")).toHaveText("false");
    await expect(page.locator("#state")).toHaveText('{"isSpeaking":false,"isLoading":false}');
    await page.waitForTimeout(500);
    await expect(page.locator("#state")).toHaveText('{"isSpeaking":false,"isLoading":false}');
    await page.locator(`#${button}`).click();
    await expect(page.locator("#result")).toHaveText("true");
  });
}
