import AxeBuilder from '@axe-core/playwright';
import {expect,test,type Page} from '@playwright/test';
const API='http://localhost:8011';
test.setTimeout(120_000);
test.use({actionTimeout:15000});
async function csrf(page:Page){return(await page.context().cookies()).find(c=>c.name==='soyle_csrf')?.value||'';}
async function login(page:Page){
  const ready=page.waitForResponse(r=>r.url().includes('/api/auth/me'));
  await page.goto('/app');await ready;
  await page.getByRole('button',{name:'Ребёнок',exact:true}).click();
  await page.getByLabel('Логин ребёнка',{exact:true}).fill('alikhan');await page.getByLabel('PIN-код',{exact:true}).fill('1234');
  await page.getByRole('button',{name:'Начать заниматься',exact:true}).click();await expect(page.locator('.child-room-home')).toBeVisible();
}
async function home(page:Page){const entry=page.locator('#primary-navigation nav').getByRole('button',{name:'Главная',exact:true});const menu=page.getByRole('button',{name:'Открыть меню',exact:true});if(await menu.isVisible())await menu.click();await entry.click();await expect(page.locator('.child-room-home')).toBeVisible();}
test('room navigation, phone layout, saved stars, retry, replay, calm and reduced motion',async({page},info)=>{
  await page.emulateMedia({reducedMotion:'no-preference'});
  let failSave=true;
  await page.route('http://localhost:8010/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/api/tts')return route.fulfill({status:503,body:'{}'});
    if(path==='/api/sessions'&&route.request().method()==='POST'&&failSave){failSave=false;return route.fulfill({status:503,body:'{"detail":"Проверка недоступного сохранения"}',contentType:'application/json'});}
    return route.continue({url:route.request().url().replace(':8010',':8011')});
  });
  await page.addInitScript(()=>{
    class Voice{text:string;onend:(()=>void)|null=null;constructor(text:string){this.text=text;}}
    Object.defineProperty(window,'SpeechSynthesisUtterance',{value:Voice,configurable:true});
    Object.defineProperty(window,'speechSynthesis',{value:{cancel(){},getVoices:()=>[],speak:(voice:Voice)=>setTimeout(()=>voice.onend?.(),0)},configurable:true});
  });
  await page.request.post(`${API}/api/auth/login`,{data:{username:'admin',password:'Admin123!'}});
  const drafts=await(await page.request.get(`${API}/api/admin/exercise-drafts`)).json();
  const source=drafts.find((v:{version:{content:{presentation?:string}}})=>v.version.content.presentation==='picture_description').version;
  const created=await page.request.post(`${API}/api/admin/exercise-drafts`,{headers:{'X-CSRF-Token':await csrf(page)},data:{...source,title:`Награда комнаты ${info.project.name}`}});
  expect(created.status()).toBe(201);const version=(await created.json()).version;
  expect((await page.request.post(`${API}/api/admin/exercise-drafts/${version.id}/publish`,{headers:{'X-CSRF-Token':await csrf(page)}})).status()).toBe(200);
  await page.context().clearCookies();await login(page);
  const me=await(await page.request.get(`${API}/api/auth/me`)).json();
  const before=await(await page.request.get(`${API}/api/dashboard/${me.child_id}`)).json();
  await expect(page.getByRole('button',{name:'Послушать пингвина'})).toBeVisible();
  const navigation=page.locator('#primary-navigation');
  const opener=page.getByRole('button',{name:'Открыть меню',exact:true});
  if(info.project.name==='desktop'){
    await page.getByRole('button',{name:'Свернуть меню',exact:true}).click();
    await expect(navigation).toHaveCSS('width','112px');
    await page.getByRole('button',{name:'Развернуть меню',exact:true}).click();
    await expect(navigation).toHaveCSS('width','276px');
  }else{
    await opener.click();await expect(navigation).toHaveAttribute('aria-modal','true');
    await expect(navigation.getByRole('button',{name:'Занятия',exact:true})).toBeVisible();
    await page.keyboard.press('Escape');await expect(opener).toBeFocused();
    await expect(navigation).toHaveAttribute('inert','');
  }
  expect((await new AxeBuilder({page}).include('.child-room-home').analyze()).violations).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('room-home.png'),fullPage:true});
  async function games(){await page.locator('.room-doors').getByRole('button',{name:'Занятия',exact:true}).click();}
  await games();
  const entry=page.getByRole('button',{name:new RegExp(version.title)}).first();if(!await entry.isVisible())await page.locator('.child-more-games summary').click();await entry.click();
  await page.getByRole('button',{name:'Послушать и начать',exact:true}).click();
  for(let round=0;round<12;round++){
    await expect(page.getByRole('button',{name:'Показать образец',exact:true})).toBeEnabled();
    const src=await page.locator('.observation-scene img').getAttribute('src');
    const scene=version.content.scenes.find((item:{media_ref:string})=>decodeURIComponent(src||'').includes(item.media_ref));
    for(let part=0;part<3;part++){
      const word=page.getByRole('button',{name:scene.parts[part],exact:true});await expect(word).toBeEnabled();await word.click();
    }
    const next=page.getByRole('button',{name:round===11?'Завершить серию':'Следующая картинка',exact:true});await expect(next).toBeEnabled();
    if(round<11)await next.click();
  }
  await page.getByRole('button',{name:'Завершить серию',exact:true}).click();
  await expect(page.getByText('Результат не сохранён. Нажми ещё раз.',{exact:true})).toBeVisible();await expect(page.locator('.starlight-reward')).toHaveCount(0);
  const afterFailure=await(await page.request.get(`${API}/api/dashboard/${me.child_id}`)).json();expect(afterFailure.stars).toBe(before.stars);
  const saved=page.waitForResponse(r=>r.url().includes('/api/sessions')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Завершить серию',exact:true}).click();const response=await saved;expect(response.ok()).toBe(true);
  const body=response.request().postDataJSON();const result=await response.json();expect(result.awarded_stars).toBe(1);
  await expect(page.locator('.starlight-reward')).toBeVisible();await expect(page.locator('.starlight-card h2')).toHaveText('+1 звезда!');
  await expect(page.locator('.starlight-card')).toContainText(`В твоей копилке: ${before.stars+1}`);
  expect((await new AxeBuilder({page}).include('.starlight-card').analyze()).violations).toEqual([]);
  await page.waitForTimeout(650);await page.screenshot({path:info.outputPath('star-celebration.png')});
  await page.emulateMedia({reducedMotion:'reduce'});await expect(page.locator('.starlight-particles')).toBeHidden();
  await page.getByRole('button',{name:'Закрыть поздравление',exact:true}).click();await expect(page.locator('.starlight-reward')).toHaveCount(0);
  const replay=await page.request.post(`${API}/api/sessions`,{headers:{'X-CSRF-Token':await csrf(page)},data:body});expect(replay.ok()).toBe(true);expect((await replay.json()).awarded_stars).toBe(0);
  await page.reload();await expect(page.locator('.child-room-home')).toBeVisible();await expect(page.locator('.topbar .star-vault')).toContainText(`${before.stars+1}`);await expect(page.locator('.starlight-reward')).toHaveCount(0);
  const settings=await(await page.request.get(`${API}/api/settings`)).json();expect((await page.request.put(`${API}/api/settings`,{headers:{'X-CSRF-Token':await csrf(page)},data:{...settings,calm_mode:true}})).ok()).toBe(true);
  await page.reload();await expect(page.locator('.child-room-home')).toBeVisible();
  if(info.project.name==='desktop'){
    await games();
    const quietEntry=page.getByRole('button',{name:new RegExp(version.title)}).first();if(!await quietEntry.isVisible())await page.locator('.child-more-games summary').click();await quietEntry.click();
    await page.getByRole('button',{name:'Послушать и начать',exact:true}).click();
    for(let round=0;round<12;round++){
      const src=await page.locator('.observation-scene img').getAttribute('src');const scene=version.content.scenes.find((item:{media_ref:string})=>decodeURIComponent(src||'').includes(item.media_ref));
      for(const part of scene.parts){const word=page.getByRole('button',{name:part,exact:true});await expect(word).toBeEnabled();await word.click();}
      const next=page.getByRole('button',{name:round===11?'Завершить серию':'Следующая картинка',exact:true});await expect(next).toBeEnabled();await next.click();
    }
    await expect(page.locator('.starlight-reward')).toHaveAttribute('data-calm','true');await expect(page.locator('.starlight-particles')).toBeHidden();await expect(page.locator('.starlight-hero')).toHaveCSS('animation-name','none');
    await page.getByRole('button',{name:'Закрыть поздравление',exact:true}).click();await home(page);
  }
  // Create a real active session, then verify its home controls preserve it.
  expect((await page.request.post(`${API}/api/learning-sessions`,{headers:{'X-CSRF-Token':await csrf(page)},data:{child_id:me.child_id,exercise_ids:[version.exercise_id],target_minutes:3}})).status()).toBe(201);
  await page.reload();await expect(page.locator('.room-start-button')).toHaveText('Продолжить');
  if(info.project.name==='desktop'){
    await page.setViewportSize({width:1280,height:600});
    await expect.poll(async()=>{const start=await page.locator('.room-start').boundingBox();return start!.y>=0&&start!.y+start!.height<=600;}).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollHeight-window.innerHeight)).toBe(0);
    await page.screenshot({path:info.outputPath('room-active-short.png')});
  }
  await page.locator('.room-start-button').click();await expect(page.getByRole('heading',{name:'Короткая практика шаг за шагом'})).toBeVisible();
  await page.getByRole('button',{name:'Сделать паузу',exact:true}).click();await home(page);
  await expect.poll(async()=> (await(await page.request.get(`${API}/api/children/${me.child_id}/active-session`)).json())?.status).toBe('paused');
  await page.locator('.room-start-button').click();await expect(page.getByRole('heading',{name:'Короткая практика шаг за шагом'})).toBeVisible();
});
