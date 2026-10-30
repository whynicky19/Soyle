import { expect, test, type Page } from '@playwright/test';
const API = 'http://localhost:8011';
test.setTimeout(120_000);
test.use({actionTimeout:15000});
async function csrf(page: Page) { return (await page.context().cookies()).find(c => c.name === 'soyle_csrf')?.value || ''; }
async function nav(page: Page, name: string) {
  if(name === 'Настройки'){await page.getByRole('button',{name,exact:true}).click();return;}
  const opener = page.getByRole('button', { name: 'Открыть меню', exact: true });
  if (await opener.isVisible()) await opener.click();
  await page.locator('#primary-navigation').getByRole('button', { name, exact: true }).click();
}
test('existing penguin: live states, layout, reduced motion and child settings', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('http://localhost:8010/**', route => new URL(route.request().url()).pathname === '/api/tts'
    ? route.fulfill({ status: 503, body: '{}' }) : route.continue({ url: route.request().url().replace(':8010', ':8011') }));
  await page.addInitScript(() => {
    class Voice { text: string; onend: (() => void) | null = null; constructor(text: string) { this.text = text; } }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: Voice, configurable: true });
    Object.defineProperty(window, 'speechSynthesis', { value: { cancel() {}, getVoices: () => [], speak: (v: Voice) => setTimeout(() => v.onend?.(), 50) }, configurable: true });
  });
  await page.request.post(`${API}/api/auth/login`, { data: { username: 'admin', password: 'Admin123!' } });
  const drafts = await (await page.request.get(`${API}/api/admin/exercise-drafts`)).json();
  const source = drafts.find((v: { version: { content: { presentation?: string } } }) => v.version.content.presentation === 'picture_description').version;
  const created = await page.request.post(`${API}/api/admin/exercise-drafts`, { headers: { 'X-CSRF-Token': await csrf(page) }, data: { ...source, title: `Пингвин ${info.project.name}` } });
  expect(created.status()).toBe(201);
  const version = (await created.json()).version;
  expect((await page.request.post(`${API}/api/admin/exercise-drafts/${version.id}/publish`, { headers: { 'X-CSRF-Token': await csrf(page) } })).ok()).toBe(true);
  await page.context().clearCookies();
  await page.goto('/app');
  await page.getByRole('button', { name: 'Ребёнок', exact: true }).click();
  await page.getByLabel('Логин ребёнка', { exact: true }).fill('alikhan');
  await page.getByLabel('PIN-код', { exact: true }).fill('1234');
  await page.getByRole('button', { name: 'Начать заниматься', exact: true }).click();
  await expect(page.locator('.child-room-home')).toBeVisible();
  const me = await (await page.request.get(`${API}/api/auth/me`)).json();
  const petUrl = `${API}/api/children/${me.child_id}/pet-settings`;
  await page.request.put(petUrl, { headers: { 'X-CSRF-Token': await csrf(page) }, data: { visible: true, voice: false, motion: 'full' } });
  await page.reload(); await expect(page.locator('.child-room-home')).toBeVisible();
  async function openExercise() {
    await nav(page, 'Занятия');
    const entry = page.getByRole('button', { name: new RegExp(version.title) }).first();
    if (!await entry.isVisible()) await page.locator('.child-more-games summary').click();
    await entry.click();
  }
  await openExercise();
  const pet = page.locator('.exercise-pet');
  await expect(pet).toHaveCount(1);
  await expect(pet).toHaveAttribute('data-pet-ready', 'true', { timeout: 25000 });
  await expect(pet).toHaveAttribute('data-pet-motion', 'full');
  await expect(pet).toHaveAttribute('data-pet-state','idle',{timeout:6000});
  const dragButton=page.getByRole('button',{name:'Поздороваться с пингвином'});
  const beforeDrag=await dragButton.boundingBox();
  const x=beforeDrag!.x+beforeDrag!.width/2,y=beforeDrag!.y+beforeDrag!.height/2;
  if(info.project.name==='mobile-320'){
    const touch=await page.context().newCDPSession(page);
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(let step=1;step<=8;step++)await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-45*step/8,y:y+80*step/8}]});
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await touch.detach();
  }else{
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x-45,y+80,{steps:8});await page.mouse.up();
  }
  const afterDrag=await dragButton.boundingBox();
  expect(afterDrag!.y-beforeDrag!.y).toBeGreaterThan(60);
  await expect(pet).toHaveAttribute('data-pet-state','idle');
  await dragButton.focus();await page.keyboard.press('Home');
  expect(Math.abs((await dragButton.boundingBox())!.y-beforeDrag!.y)).toBeLessThan(2);

  const size = await page.locator('.pet-button').boundingBox();
  expect(size!.width).toBe(info.project.name === 'desktop' ? 144 : 104);
  await page.getByRole('button', { name: 'Поздороваться с пингвином' }).click();
  await expect(pet).toHaveAttribute('data-pet-state', 'tap');
  await expect(pet).toHaveAttribute('data-rive-state', /Greeting/);
  const phrase = await pet.locator('.pet-bubble').textContent();
  await page.getByRole('button', { name: 'Поздороваться с пингвином' }).click();
  await expect(pet.locator('.pet-bubble')).toHaveText(phrase!);
  await page.screenshot({ path: info.outputPath('penguin-in-exercise.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const boxes = await page.locator('.exercise-companion-instruction p, .pet-bubble, .pet-button').evaluateAll(nodes => nodes.map(n => { const b = n.getBoundingClientRect(); return { x: b.x, y: b.y, r: b.right, b: b.bottom }; }));
  expect(boxes[0].r <= boxes[1].x || boxes[0].b <= boxes[1].y).toBe(true);
  await expect(pet).toHaveAttribute('data-pet-state', 'idle', { timeout: 6000 });
  await expect(pet.locator('.pet-bubble')).toBeEmpty();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(pet).toHaveAttribute('data-pet-motion', 'reduced');
  await page.screenshot({ path: info.outputPath('penguin-static.png') });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('button', { name: 'Послушать и начать', exact: true }).click();
  for (let round = 0; round < 12; round++) {
    const src = await page.locator('.observation-scene img').getAttribute('src');
    const scene = version.content.scenes.find((s: { media_ref: string }) => decodeURIComponent(src || '').includes(s.media_ref));
    if (round === 0) {
      const incorrect = page.locator('.description-word').filter({ hasNotText: scene.parts[0] }).first();
      await expect(incorrect).toBeEnabled(); await incorrect.click();
      await expect(pet).toHaveAttribute('data-pet-state', 'incorrect');
      await expect(pet).toHaveAttribute('data-rive-state', /Encouragement/);
      await page.getByRole('button', { name: 'Показать образец', exact: true }).click();
      await expect(pet).toHaveAttribute('data-pet-state', 'hint');
      await expect(pet).toHaveAttribute('data-rive-state', /Thinking/);
      await page.getByRole('button', { name: 'Убрать последнюю часть', exact: true }).click();
      const last = page.getByRole('button', { name: scene.parts[2], exact: true });
      await expect(last).toBeEnabled(); await last.click();
    } else for (const part of scene.parts) { const word = page.getByRole('button', { name: part, exact: true }); await expect(word).toBeEnabled(); await word.click(); }
    await expect(pet).toHaveAttribute('data-pet-state', 'correct');
    await expect(pet).toHaveAttribute('data-rive-state', /Happy/);
    const next = page.getByRole('button', { name: round === 11 ? 'Завершить серию' : 'Следующая картинка', exact: true });
    await expect(next).toBeEnabled(); await next.click();
  }
  await expect(pet).toHaveAttribute('data-pet-state', 'complete');
  await expect(pet).toHaveAttribute('data-rive-state', /Celebrate/);
  await expect(pet).toHaveCount(1);
  const close = page.getByRole('button', { name: 'Закрыть поздравление', exact: true });
  if (await close.isVisible()) await close.click();
  await nav(page, 'Настройки');
  await expect(page.getByRole('heading', { name: 'Мой питомец' })).toBeVisible();
  await page.screenshot({path:info.outputPath('pet-settings.png'),fullPage:true});
  await expect(page.getByRole('switch', { name: 'Голос питомца', exact: true })).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('switch', { name: 'Показывать питомца', exact: true }).click();
  await expect.poll(async () => (await (await page.request.get(petUrl)).json()).visible).toBe(false);
  await page.reload(); await expect(page.locator('.child-room-home')).toBeVisible();
  await openExercise(); await expect(pet).toHaveCount(0);
  await page.getByRole('button', { name: 'Вернуться к занятиям', exact: true }).click();
  await nav(page, 'Настройки');
  await expect(page.getByRole('switch', { name: 'Показывать питомца', exact: true })).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('switch', { name: 'Показывать питомца', exact: true }).click();
  await page.getByRole('combobox', { name: 'Движения питомца', exact: true }).selectOption('off');
  await expect.poll(async () => (await (await page.request.get(petUrl)).json()).motion).toBe('off');
  await openExercise(); await expect(pet).toHaveAttribute('data-pet-ready', 'true');
  await expect(pet).toHaveAttribute('data-pet-motion', 'off');
  expect(errors).toEqual([]);
});
