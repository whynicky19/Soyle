import AxeBuilder from '@axe-core/playwright';
import {expect,test,type Page} from '@playwright/test';
const API='http://localhost:8011';
test.setTimeout(120_000);
type Scene={key:string;parts:string[];media_ref:string};
async function csrf(page:Page){return(await page.context().cookies()).find(c=>c.name==='soyle_csrf')?.value||'';}
async function login(page:Page,student=false){
  const ready=page.waitForResponse(r=>r.url().includes('/api/auth/me'));
  await page.goto('/app');await ready;
  if(student)await page.getByRole('button',{name:'Ребёнок',exact:true}).click();
  await page.getByLabel(student?'Логин ребёнка':'Логин',{exact:true}).fill(student?'alikhan':'admin');
  await page.getByLabel(student?'PIN-код':'Пароль',{exact:true}).fill(student?'1234':'Admin123!');
  await page.getByRole('button',{name:student?'Начать заниматься':'Войти',exact:true}).click();
  await expect(page.getByRole('button',{name:'Выйти из аккаунта',exact:true,includeHidden:true})).toBeAttached();
}
test('picture bank: progressive phrases, corrections, model, all 24 images and saved evidence',async({page},testInfo)=>{
  await page.route('http://localhost:8010/**',route=>new URL(route.request().url()).pathname==='/api/tts'
    ? route.fulfill({status:503,body:'{}'}) : route.continue({url:route.request().url().replace(':8010',':8011')}));
  await page.addInitScript(()=>{
    class Voice{text:string;onend:(()=>void)|null=null;onerror:(()=>void)|null=null;constructor(text:string){this.text=text;}}
    Object.defineProperty(window,'SpeechSynthesisUtterance',{value:Voice,configurable:true});
    Object.defineProperty(window,'speechSynthesis',{value:{cancel(){},getVoices:()=>[],speak:(voice:Voice)=>{const state=window as typeof window & {__holdVoice?:boolean;__failVoice?:boolean};if(!state.__holdVoice)setTimeout(()=>state.__failVoice?voice.onerror?.():voice.onend?.(),0);}},configurable:true});
  });
  await login(page);
  const drafts=await(await page.request.get(`${API}/api/admin/exercise-drafts`)).json();
  const source=drafts.find((item:{version:{content:{presentation?:string}}})=>item.version.content.presentation==='picture_description').version;
  const created=await page.request.post(`${API}/api/admin/exercise-drafts`,{headers:{'X-CSRF-Token':await csrf(page)},data:{...source,title:'Я вижу: опиши картинку'}});
  expect(created.status()).toBe(201);const version=(await created.json()).version;
  const result=await page.request.post(`${API}/api/admin/exercise-drafts/${version.id}/publish`,{headers:{'X-CSRF-Token':await csrf(page)},data:{comment:'Проверка новой версии'}});
  expect(result.status()).toBe(200);
  for(const scene of version.content.scenes as Scene[])expect((await page.request.get(scene.media_ref)).status()).toBe(200);
  await page.context().clearCookies();await login(page,true);
  const menu=page.getByRole('button',{name:'Открыть меню'});if(await menu.isVisible())await menu.click();
  await page.getByRole('button',{name:'Занятия',exact:true}).click();
  const button=page.getByRole('button',{name:new RegExp(version.title)}).first();
  if(!await button.isVisible())await page.locator('.child-more-games summary').click();
  await button.click();
  await page.getByRole('button',{name:'Послушать и начать',exact:true}).click();
  const seen=new Set<string>();
  for(let index=0;index<24;index++){
    await expect(page.getByRole('button',{name:'Показать образец',exact:true})).toBeEnabled();
    const src=await page.locator('.observation-scene img').getAttribute('src');
    const scene=(version.content.scenes as Scene[]).find(item=>decodeURIComponent(src||'').includes(item.media_ref))!;
    expect(scene).toBeTruthy();expect(seen.has(scene.key)).toBe(false);seen.add(scene.key);
    const target=index<4?1:index<8?2:3;
    if(index===1){
      const wrong=page.locator('.description-word').filter({hasNotText:scene.parts[0]}).first();await wrong.click();
      await expect(page.getByText('Посмотри ещё раз. Можно послушать слова или посмотреть образец.',{exact:true})).toBeVisible();
    }
    if(index===2){await page.getByRole('button',{name:'Показать образец',exact:true}).click();}
    else{
      for(let word=0;word<target;word++){
        const option=page.getByRole('button',{name:scene.parts[word],exact:true});await expect(option).toBeEnabled();await option.focus();await option.press('Enter');
      }
    }
    await expect(page.getByRole('button',{name:'Следующая картинка',exact:true}).or(page.getByRole('button',{name:'Завершить серию',exact:true}))).toBeEnabled();
    if(index===9)await page.screenshot({path:testInfo.outputPath('picture-description-full-phrase.png'),fullPage:true});
    if(index===3){
      expect((await new AxeBuilder({page}).include('.observation-exercise').analyze()).violations).toEqual([]);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
      await page.screenshot({path:testInfo.outputPath('picture-description.png'),fullPage:true});
    }
    if(index===11||index===17)await page.getByRole('button',{name:'Ещё 6 новых картинок',exact:true}).click();
    else if(index===23){
      const response=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes('/api/sessions'));
      await page.getByRole('button',{name:'Завершить серию',exact:true}).click();
      const saved=await response;expect(saved.ok()).toBe(true);
      const payload=saved.request().postDataJSON();
      expect(payload.attempt_status).toBe('participated');expect(payload.details.descriptions).toHaveLength(24);
      expect(payload.details.descriptions.map((item:{parts_count:number})=>item.parts_count)).toEqual([...Array(4).fill(1),...Array(4).fill(2),...Array(16).fill(3)]);
      expect(payload.details.descriptions[1].supports).toContain('retry');expect(payload.details.descriptions[2].supports).toContain('model');
    }else await page.getByRole('button',{name:'Следующая картинка',exact:true}).click();
  }
  expect(seen.size).toBe(24);
  async function reopen(){
    await page.reload();
    await expect(page.getByRole('button',{name:'Выйти из аккаунта',exact:true,includeHidden:true})).toBeAttached();
    const menu=page.getByRole('button',{name:'Открыть меню'});if(await menu.isVisible())await menu.click();
    await page.getByRole('button',{name:'Занятия',exact:true}).click();
    const entry=page.getByRole('button',{name:new RegExp(version.title)}).first();
    if(!await entry.isVisible())await page.locator('.child-more-games summary').click();
    await entry.click();
  }
  await reopen();
  await page.evaluate(()=>{(window as typeof window & {__holdVoice:boolean}).__holdVoice=true;});
  await page.getByRole('button',{name:'Послушать и начать',exact:true}).click();
  await expect(page.getByText('Слушаем…',{exact:true})).toBeVisible();
  const paused=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes('/api/sessions'));
  await page.getByRole('button',{name:'Перерыв',exact:true}).first().click();
  const pause=await paused;expect(pause.ok()).toBe(true);
  expect(pause.request().postDataJSON().attempt_status).toBe('break');
  expect(pause.request().postDataJSON().details.descriptions).toEqual([]);
  expect(pause.request().postDataJSON().details.unfinished_description.words).toEqual([]);
  await reopen();
  await page.evaluate(()=>{(window as typeof window & {__failVoice:boolean}).__failVoice=true;});
  await page.getByRole('button',{name:'Послушать и начать',exact:true}).click();
  await expect(page.getByText('Озвучка недоступна. Результат без звука не засчитывается.',{exact:true})).toBeVisible();
  const failed=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes('/api/sessions'));
  await page.getByRole('button',{name:'Вернуться без оценки',exact:true}).click();
  const failure=await failed;expect(failure.ok()).toBe(true);expect(failure.request().postDataJSON().attempt_status).toBe('technical_error');
  await page.request.post(`${API}/api/auth/login`,{data:{username:'admin',password:'Admin123!'}});
  expect((await page.request.delete(`${API}/api/admin/exercises/${version.exercise_id}`,{headers:{'X-CSRF-Token':await csrf(page)}})).status()).toBe(204);
});
