import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
const API = 'http://localhost:8011';
const wav = Buffer.alloc(44 + 48000);
wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);
wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(24000,24);wav.writeUInt32LE(48000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(48000,40);
for(let i=0;i<24000;i++)wav.writeInt16LE(Math.round(Math.sin(i*Math.PI/30)*400),44+i*2);

test('reviewer uploads, listens, approves and publishes the exact recording',async({page},info)=>{
  test.setTimeout(150_000);
  await page.route('http://localhost:8010/**',route=>route.continue({url:route.request().url().replace(':8010',':8011')}));
  expect((await page.request.post(`${API}/api/auth/login`,{data:{username:'admin',password:'Admin123!'}})).ok()).toBe(true);
  const csrf=(await page.context().cookies()).find(c=>c.name==='soyle_csrf')!.value;
  const headers={'X-CSRF-Token':csrf};
  const source=JSON.parse(execFileSync('.venv/bin/python',['-c', 'import json; from app.core_content import WORD_CORE; print(json.dumps(dict(WORD_CORE, language="ru")))'],{cwd:'../backend',encoding:'utf8'}));
  const title=`Проверка озвучки ${info.project.name}`;
  const created=await page.request.post(`${API}/api/admin/exercise-drafts`,{headers,data:{...source,title}});
  expect(created.status()).toBe(201);
  const version=(await created.json()).version;
  const manifest=await (await page.request.get(`${API}/api/admin/exercise-drafts/${version.id}/audio`)).json();
  const pending=manifest.items[0];
  for(const item of manifest.items.slice(1)){
    const base=`${API}/api/admin/audio/${version.id}/${item.key}/${item.mode}`;
    let prepared=await page.request.post(`${base}/prepare`,{headers,data:{source:'manual',audio_base64:wav.toString('base64')}});
    if (prepared.status() === 429) {
      // The real limiter is shared by desktop/mobile fixtures; honor it rather than disabling it.
      await page.waitForTimeout((Number(prepared.headers()["retry-after"]) || 60) * 1000 + 100);
      prepared=await page.request.post(`${base}/prepare`,{headers,data:{source:"manual",audio_base64:wav.toString("base64")}});
    }
    expect(prepared.status()).toBe(200);
    const {digest}=await prepared.json();
    for(const action of ['listened','approved'])expect((await page.request.post(`${base}/review`,{headers,data:{digest,action}})).status()).toBe(200);
  }
  expect((await page.request.post(`${API}/api/admin/exercise-drafts/${version.id}/publish`,{headers})).status()).toBe(409);
  await page.goto('/app');
  await page.getByLabel('Поиск по названию').fill(title);
  await page.locator('.admin-review-item').filter({hasText:title}).getByRole('button',{name:/проверить|проверку|открыть/i}).click();
  const section=page.locator('section.review-section').filter({has:page.getByRole('heading',{name:'Текст, произношение и интонация',exact:true})});
  const row=section.locator('.scenario-review-list article').first();
  const approve=row.getByRole('button',{name:'Утвердить текст и произношение',exact:true});
  await expect(approve).toBeDisabled();
  await row.locator('input[type=file]').setInputFiles({name:'question.wav',mimeType:'audio/wav',buffer:wav});
  const listen=row.getByRole('button',{name:'Прослушать запись',exact:true});
  await expect(listen).toBeEnabled();
  await expect(approve).toBeDisabled();
  await listen.click();
  await row.getByRole('button',{name:'Стоп',exact:true}).click();
  await expect(approve).toBeDisabled();
  await expect(listen).toBeEnabled();
  await listen.click();
  await expect(approve).toBeEnabled();
  await approve.click();
  await expect(row.getByRole('button',{name:'Утверждено',exact:true})).toBeVisible();
  const publish=page.getByRole('button',{name:'Проверено — опубликовать',exact:true});
  await expect(publish).toBeEnabled();
  await publish.click();
  await expect(page.locator('.content-review-workspace')).toHaveCount(0);
  const audio=await page.request.post(`${API}/api/tts`,{headers,data:{text:pending.text,language:pending.language,mode:pending.mode,version_id:version.id}});
  expect(audio.headers()['x-soyle-tts']).toBe('reviewed');
  expect(await audio.body()).toEqual(wav);
});
