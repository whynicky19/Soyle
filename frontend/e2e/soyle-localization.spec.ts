import { test, expect } from '@playwright/test';
test.use({storageState:{cookies:[],origins:[]}});

test('first use, Kazakh authentication, switching and reload preserve locale', async ({ page }) => {
  await page.goto('/app');
  const dialog = page.getByRole('dialog', {name:'Выберите язык / Тілді таңдаңыз'});
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', {name:'Қазақша',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Аккаунтқа кіру',exact:true})).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang','kk-KZ');
  await page.reload();
  await expect(page.getByRole('heading',{name:'Аккаунтқа кіру',exact:true})).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button',{name:'Русский',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Вход в аккаунт',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Қазақша',exact:true}).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({path:`../output/locale-auth-${test.info().project.name}.png`,fullPage:true});
});

test('parent preference is saved without changing other settings', async ({ page }) => {
  await page.goto('/app');
  await page.getByRole('dialog').getByRole('button',{name:'Қазақша',exact:true}).click();
  await page.getByLabel('Логин',{exact:true}).fill('parent');
  await page.getByLabel('Құпиясөз',{exact:true}).fill('Parent123!');
  await page.getByRole('button',{name:'Кіру',exact:true}).click();
  await expect.poll(async () => page.evaluate(async () => (await (await fetch('/api/settings')).json()).language)).toBe('kk');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang','kk-KZ');
  const settings = await page.evaluate(async () => (await fetch('/api/settings')).json());
  expect(settings.theme).toBe('peach');
  expect(settings.sound_enabled).toBe(true);
  await page.context().clearCookies();
  await page.reload();
  await expect(page.getByRole('heading',{name:'Аккаунтқа кіру',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Русский',exact:true}).click();
  await page.getByLabel('Логин',{exact:true}).fill('parent');
  await page.getByLabel('Пароль',{exact:true}).fill('Parent123!');
  await page.getByRole('button',{name:'Войти',exact:true}).click();
  await expect(page.locator('.parent-shell')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang','kk-KZ');

});


test('child settings switch both ways and keep saved progress', async ({ page }) => {
  await page.goto('/app');
  await page.getByRole('dialog').getByRole('button',{name:'Русский',exact:true}).click();
  await page.getByRole('button',{name:'Ребёнок',exact:true}).click();
  await page.getByLabel('Логин ребёнка',{exact:true}).fill('alikhan');
  await page.getByLabel('PIN-код',{exact:true}).fill('1234');
  await page.getByRole('button',{name:'Начать заниматься',exact:true}).click();
  await expect(page.locator('.child-room-home')).toBeVisible();
  const before = await page.evaluate(async () => {
    const me = await (await fetch('/api/auth/me')).json();
    return (await fetch(`/api/dashboard/${me.child_id}`)).json();
  });
  const menu = page.getByRole('button',{name:'Открыть меню',exact:true});
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button',{name:/^(Настройки|Баптаулар)$/}).click();
  await page.getByRole('button',{name:'Қазақша',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Саған қалай ыңғайлы?'})).toBeVisible();
  await expect.poll(async () => page.evaluate(async () => (await (await fetch('/api/settings')).json()).language)).toBe('kk');
  await page.getByRole('button',{name:'Русский',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Как тебе удобнее?'})).toBeVisible();
  await expect.poll(async () => page.evaluate(async () => (await (await fetch('/api/settings')).json()).language)).toBe('ru');
  const after = await page.evaluate(async () => {
    const me = await (await fetch('/api/auth/me')).json();
    return (await fetch(`/api/dashboard/${me.child_id}`)).json();
  });
  expect(after.stars).toBe(before.stars);
  expect(after.total_sessions).toBe(before.total_sessions);
});


test('landing copy and AAC demonstration follow the selected language', async ({page}) => {
  await page.goto('/');
  await page.getByRole('dialog').getByRole('button',{name:'Қазақша',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Әр сөз — шағын жаңалық.'})).toBeVisible();
  await expect(page.locator('.sl-aac > p')).toHaveText('Су ішкім келеді.');
  await page.locator('.sl-aac').getByRole('button',{name:'Алма',exact:true}).click();
  await expect(page.locator('.sl-aac > p')).toHaveText('Алма жегім келеді.');
  await page.locator('.sl-footer').getByRole('button',{name:'Русский',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Каждое слово — маленькое открытие.'})).toBeVisible();
});


test('header language buttons stay aligned inside the header', async ({page}, info) => {
  await page.goto('/');
  await page.getByRole('dialog').getByRole('button',{name:'Қазақша',exact:true}).click();
  const picker = page.locator('.sl-header .locale-picker--compact');
  const buttons = picker.getByRole('button');
  await expect(picker).toBeVisible();
  const first = await buttons.nth(0).boundingBox();
  const second = await buttons.nth(1).boundingBox();
  const header = await page.locator('.sl-header').boundingBox();
  expect(first && second && header).toBeTruthy();
  expect(Math.abs(first!.y-second!.y)).toBeLessThan(1);
  expect(first!.height).toBe(second!.height);
  expect(second!.x+second!.width).toBeLessThanOrEqual(info.project.use.viewport!.width);
  expect(second!.y+second!.height).toBeLessThanOrEqual(header!.y+header!.height);
  await page.screenshot({path:`../output/header-language-${info.project.name}.png`});
});


test('specialist forms and navigation switch languages without clearing entered observations', async ({page}) => {
  await page.addInitScript(() => localStorage.setItem('soyle-language','kk-KZ'));
  let language = 'kk';
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({json:{id:9001,username:'specialist-test',full_name:'Маман',role:'specialist',is_active:true,created_at:'2026-11-01'}});
    if (path === '/api/settings') {
      if (route.request().method() === 'PUT') language = route.request().postDataJSON().language;
      return route.fulfill({json:{language,language_configured:true,camera_enabled:false,sound_enabled:true,calm_mode:false,theme:'peach'}});
    }
    if (path === '/api/children') return route.fulfill({json:[{id:1,name:'Бала',parent_id:1,birth_date:'2020-01-01',avatar_color:'#fff',primary_module:'sensory'}]});
    if (path === '/api/specialist/children/1') return route.fulfill({json:{practice_goals:[],available_exercises:[],observations:[],recommendations:[],dashboard:{recent:[],total_sessions:0}}});
    return route.fulfill({json:[]});
  });
  await page.goto('/app?cabinet=specialist&section=observations');
  await expect(page.getByRole('button',{name:'Бақылауды сақтау',exact:true})).toBeVisible();
  await page.getByRole('textbox',{name:'Байқалған әрекеттер',exact:true}).fill('Бала өздігінен су сұрады.');
  await page.getByRole('button',{name:'Русский',exact:true}).click();
  await expect(page.getByRole('button',{name:'Сохранить наблюдение',exact:true})).toBeVisible();
  await expect(page.getByRole('textbox',{name:'Наблюдаемые действия',exact:true})).toHaveValue('Бала өздігінен су сұрады.');
  await page.getByRole('button',{name:'Қазақша',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Байқалған әрекеттер',exact:true})).toHaveValue('Бала өздігінен су сұрады.');
});
