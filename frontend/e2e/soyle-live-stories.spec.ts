import {expect,test,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test.setTimeout(90_000);
async function enter(page:Page,key:string){
  await page.addInitScript(()=>{
    class Voice{text:string;onend:(()=>void)|null=null;constructor(text:string){this.text=text;}}
    Object.defineProperty(window,'SpeechSynthesisUtterance',{value:Voice,configurable:true});
    Object.defineProperty(window,'speechSynthesis',{value:{cancel(){},getVoices:()=>[{lang:"ru-RU",localService:true}],speak:(voice:Voice)=>setTimeout(()=>voice.onend?.(),0)},configurable:true});
  });
  await page.route('http://localhost:8010/**',route=>new URL(route.request().url()).pathname==='/api/tts'?route.fulfill({status:503,body:'{}'}):route.continue({url:route.request().url().replace(':8010',':8011')}));
  await page.goto('/app');await page.getByRole('button',{name:'Ребёнок',exact:true}).click();await page.getByLabel('Логин ребёнка',{exact:true}).fill('alikhan');await page.getByLabel('PIN-код',{exact:true}).fill('1234');await page.getByRole('button',{name:'Начать заниматься',exact:true}).click();
  await expect(page.locator('.child-room-home')).toBeVisible();
  const me=await(await page.request.get('http://localhost:8011/api/auth/me')).json();
  const books=await(await page.request.get(`http://localhost:8011/api/stories/${me.child_id}`)).json();expect(books).toHaveLength(4);
  const book=books.find((item:{key:string})=>item.key===key);
  await page.locator('.room-doors').getByRole('button',{name:'Истории',exact:true}).click();
  const hero=page.locator('.v2-story-hero');
  if(await hero.getByRole('heading',{name:book.title,exact:true}).count())await hero.getByRole('button').click();else await page.locator('.v2-story-card').filter({hasText:book.title}).click();
  return me.child_id as number;
}
test('six live scenes open for a child, move objects, pause and save completion',async({page},info)=>{
  const child=await enter(page,'living-toy');await expect(page.locator('.sb-welcome')).not.toContainText('DRAFT');
  await page.locator('.sb-welcome-bottom .sb-primary').click();
  const actions=[['Мяч'],['Нашёл мишку'],['Помоги'],['Взять мишку с полки','Передать мишку Мише'],['Обнять мишку','Положить рядом'],[]];
  for(let i=0;i<actions.length;i++){
    if(i===0){await page.getByRole('button',{name:'Перерыв',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'Продолжить',exact:true}).click();}
    for(const label of actions[i]){const target=page.getByRole('button',{name:label,exact:true}).first();await expect(target).toBeEnabled();await target.click();}
    const next=page.getByRole('button',{name:i===5?'Закончить':'Дальше',exact:true});await expect(next).toBeEnabled();await next.click();
  }
  await expect(page.getByRole('heading',{name:'Мишка дома. История закончилась.'})).toBeVisible();
  expect((await new AxeBuilder({page}).include('.sb-player').analyze()).violations).toEqual([]);
  await page.screenshot({path:info.outputPath('living-toy-complete.png'),fullPage:true});
  const saved=await(await page.request.get(`http://localhost:8011/api/storybooks/${child}/toy`)).json();expect(saved.state.completed).toBe(true);expect(saved.preview).toBe(false);
  await page.getByRole('button',{name:'Закрыть книгу',exact:true}).click();await expect(page.locator('.v2-story-hero,.v2-story-card').filter({hasText:'Любимая игрушка — живая история'})).toContainText(/История прочитана|Пройдено/);
});
test('continuous animation saves a child request, hug and immediate exit',async({page},info)=>{
  const child=await enter(page,'misha-help');await expect(page.locator('.cinema-player')).not.toContainText('DRAFT');
  await page.getByRole('button',{name:'Выключить звук',exact:true}).click();
  await page.getByRole('button',{name:/Начать сцену|Продолжить сцену|Пересмотреть сцену/}).click();
  const request=page.getByRole('button',{name:'Показать на мишку',exact:true});await expect(request).toBeEnabled();
  await page.getByRole('button',{name:'Перерыв',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'Продолжить',exact:true}).click();
  await expect(request).toBeEnabled();await request.click();
  await expect(page.getByRole('button',{name:'Обнять мишку',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Обнять мишку',exact:true}).click();
  await expect(page.locator('.cinema-end')).toBeVisible();
  expect((await new AxeBuilder({page}).include('.cinema-player').analyze()).violations).toEqual([]);
  await page.screenshot({path:info.outputPath('misha-help-complete.png'),fullPage:true});
  await page.locator('.cinema-end').getByRole('button',{name:'К историям',exact:true}).click();
  await expect(page.locator('.v2-story-hero,.v2-story-card').filter({hasText:'Миша просит помощь'})).toContainText(/История прочитана|Пройдено/);
  const saved=await(await page.request.get(`http://localhost:8011/api/cinematic-storybooks/${child}/toy`)).json();expect(saved.state.completed).toBe(true);expect(saved.state.communication_method).toBe('point');expect(saved.preview).toBe(false);
});
