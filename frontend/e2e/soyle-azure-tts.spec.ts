import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

// Exercise the existing child screen and real browser audio, without an Azure account.
test("child speech controls send normal/slow mode and repeat the same word", async ({page}) => {
  const requests: {text:string;language:string;mode:string}[] = [];
  const audio = readFileSync(new URL('../public/audio/tts-unlock.wav', import.meta.url));
  await page.route('http://localhost:8010/**', async route => {
    if (new URL(route.request().url()).pathname === '/api/tts') {
      requests.push(route.request().postDataJSON());
      await route.fulfill({status:200,contentType:'audio/wav',headers:{'X-Soyle-TTS':'azure','Access-Control-Allow-Origin':'http://localhost:3003','Access-Control-Allow-Credentials':'true','Access-Control-Expose-Headers':'X-Soyle-TTS'},body:audio});
    } else await route.continue({url:route.request().url().replace(':8010', ':8011')});
  });
  await page.goto('/app');
  await page.getByRole('button',{name:'Ребёнок',exact:true}).click();
  await page.getByLabel('Логин ребёнка',{exact:true}).fill('alikhan');
  await page.getByLabel('PIN-код',{exact:true}).fill('1234');
  await page.getByRole('button',{name:'Начать заниматься',exact:true}).click();
  await expect(page.locator('.child-room-home')).toBeVisible();
  const menu = page.getByRole('button',{name:'Открыть меню',exact:true});
  if (await menu.isVisible()) await menu.click();
  await page.locator('#primary-navigation').getByRole('button',{name:'Занятия',exact:true}).click();
  const toys = page.getByRole('button',{name:/Игрушки/}).first();
  if (!await toys.isVisible()) await page.locator('.child-more-games summary').click();
  await toys.click();
  await page.getByRole('button',{name:/Понятно, начать/}).click();
  const repeat = page.getByRole('button',{name:'Повторить',exact:true});
  await expect(repeat).toBeEnabled();
  await expect(page.getByText('Теперь покажи картинку',{exact:true})).toBeVisible();
  expect(requests.at(-1)).toMatchObject({language:'ru',mode:'normal'});
  const word = requests.at(-1)!.text;
  await page.getByRole('button',{name:'Медленно',exact:true}).click();
  await repeat.click();
  await expect.poll(()=>requests.at(-1)?.mode).toBe('slow');
  await expect(repeat).toBeEnabled();
  expect(requests.at(-1)?.text).toBe(word);
  await page.getByRole('button',{name:'Обычно',exact:true}).click();
  await repeat.click();
  await expect.poll(()=>requests.at(-1)?.mode).toBe('normal');
  await expect(repeat).toBeEnabled();
  expect(requests.at(-1)?.text).toBe(word);
  await expect(page.locator('.picture-options button').first()).toBeEnabled();
});
