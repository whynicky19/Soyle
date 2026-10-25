import {expect,test} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test.setTimeout(90_000);
for(const key of ['toy','picnic'])test(`child reads, saves and reopens published ${key}`,async({page},info)=>{
  await page.route('http://localhost:8010/**',route=>route.continue({url:route.request().url().replace(':8010',':8011')}));
  await page.goto('/app');await page.getByRole('button',{name:'Ребёнок',exact:true}).click();
  await page.getByLabel('Логин ребёнка',{exact:true}).fill('alikhan');await page.getByLabel('PIN-код',{exact:true}).fill('1234');
  await page.getByRole('button',{name:'Начать заниматься',exact:true}).click();
  await expect(page.locator('.child-room-home')).toBeVisible();
  const me=await(await page.request.get('http://localhost:8011/api/auth/me')).json();
  const base=`http://localhost:8011/api/interactive-storybooks/${me.child_id}/${key}`;
  const snapshot=await(await page.request.get(base)).json();expect(snapshot.preview).toBe(false);
  const definition=snapshot.definition;
  await page.locator('.room-doors').getByRole('button',{name:'Истории',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Истории',exact:true})).toBeVisible();
  const featured=page.locator('.v2-story-hero');
  if(await featured.getByRole('heading',{name:definition.title,exact:true}).count())await featured.getByRole('button').click();
  else await page.locator('.v2-story-card').filter({has:page.getByText(definition.title,{exact:true})}).click();
  await expect(page.locator('.book-cover h1')).toHaveText(definition.title);
  await expect(page.locator('.book-preview-note')).toContainText('Твоя история');
  await expect(page.locator('.book-player')).not.toContainText('DRAFT');
  await page.getByRole('button',{name:'Выключить звук',exact:true}).click();
  await page.locator('.book-cover button').click();
  for(const scene of definition.scenes){
    await expect(page.locator('.book-context h1')).toHaveText(scene.title);
    const actions=key==='toy'?({find:['find_teddy'],match:['choose_teddy','choose_train'],request:['request_help'],help:['receive_teddy'],play:['pick_train','place_train']} as Record<string,string[]>)[scene.id]||[]:scene.kind==='instruction'?scene.sequence_steps:scene.kind==='choice'?[scene.options[0].key]:[];
    for(const action of actions){
      const option=scene.options.find((item:{key:string})=>item.key===action);
      const button=page.getByRole('button',{name:option.label,exact:true}).first();await expect(button).toBeEnabled();await button.click();
    }
    if(scene.id===definition.scenes[0].id){
      await page.getByRole('button',{name:'Пауза',exact:true}).click();await expect(page.getByRole('dialog',{name:'Книга на паузе'})).toBeVisible();
      await page.getByRole('button',{name:'Продолжить',exact:true}).click();
    }
    await page.getByRole('button',{name:scene.kind==='ending'?'Закончить книгу':'Дальше',exact:true}).click();
  }
  await expect(page.locator('.book-context h1')).toHaveText('Побудем вместе');
  expect((await new AxeBuilder({page}).include('.book-player').analyze()).violations).toEqual([]);
  await page.screenshot({path:info.outputPath(`published-${key}-complete.png`),fullPage:true});
  const saved=await(await page.request.get(base)).json();expect(saved.state.completed).toBe(true);expect(saved.preview).toBe(false);
  await page.getByRole('button',{name:'К историям',exact:true}).first().click();
  await expect(page.getByRole('heading',{name:'Истории',exact:true})).toBeVisible();
  await expect(page.locator('.v2-story-hero,.v2-story-card').filter({has:page.getByText(definition.title,{exact:true})})).toContainText(/История прочитана|Пройдено/);
  await page.screenshot({path:info.outputPath(`published-${key}-catalogue.png`),fullPage:true});
  await page.reload();await expect(page.locator('.child-room-home')).toBeVisible();
  expect((await(await page.request.get(base)).json()).state.completed).toBe(true);
});
