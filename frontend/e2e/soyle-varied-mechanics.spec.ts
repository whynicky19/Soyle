import AxeBuilder from '@axe-core/playwright';
import {expect,test,type Page} from '@playwright/test';
const API='http://localhost:8011';
test.setTimeout(90_000);
type Card={key:string;label:string;media_ref:string;category_key?:string};
type Task={key:string;instruction:string;cards:Card[];targets?:Card[];correct_order?:string[];pairs?:{object_key:string;target_key:string}[]};
type Version={id:number;exercise_id:number;title:string;mechanic:string;content:{categories?:Card[];sort_items?:Card[];tasks?:Task[];default_rounds:number}};
test.beforeEach(async({page})=>{
  await page.addInitScript(()=>{
    class Voice {text:string;onend:(()=>void)|null=null;onerror:(()=>void)|null=null;constructor(text:string){this.text=text;}}
    Object.defineProperty(window,'SpeechSynthesisUtterance',{value:Voice,configurable:true});
    Object.defineProperty(window,'speechSynthesis',{value:{cancel(){},getVoices:()=>[],speak:(voice:Voice)=>{
      const state=window as typeof window & {__lastTask?:string;__failVoice?:boolean};state.__lastTask=voice.text;
      setTimeout(()=>state.__failVoice ? voice.onerror?.() : voice.onend?.(),0);
    }},configurable:true});
  });
  await page.route('http://localhost:8010/**',route=>new URL(route.request().url()).pathname==='/api/tts'
    ? route.fulfill({status:503,body:'{}'}) : route.continue({url:route.request().url().replace(':8010',':8011')}));
});
async function login(page:Page,admin=true){
  await page.goto('/app');
  if(!admin)await page.getByRole('button',{name:'Ребёнок',exact:true}).click();
  await page.getByLabel(admin?'Логин':'Логин ребёнка',{exact:true}).fill(admin?'admin':'alikhan');
  await page.getByLabel(admin?'Пароль':'PIN-код',{exact:true}).fill(admin?'Admin123!':'1234');
  await page.getByRole('button',{name:admin?'Войти':'Начать заниматься',exact:true}).click();
  await expect(page.getByRole('button',{name:'Выйти из аккаунта',exact:true,includeHidden:true})).toBeAttached();
}
async function csrf(page:Page){return(await page.context().cookies()).find(c=>c.name==='soyle_csrf')?.value||'';}
async function clone(page:Page,mechanic:string,suffix:string){
  const drafts=await(await page.request.get(`${API}/api/admin/exercise-drafts`)).json();
  const source=drafts.find((item:{version:Version})=>item.version.mechanic===mechanic).version;
  const response=await page.request.post(`${API}/api/admin/exercise-drafts`,{headers:{'X-CSRF-Token':await csrf(page)},data:{...source,title:`Новая механика · ${suffix}`}});
  expect(response.status()).toBe(201);return(await response.json()).version as Version;
}
async function publish(page:Page,version:Version){expect((await page.request.post(`${API}/api/admin/exercise-drafts/${version.id}/publish`,{headers:{'X-CSRF-Token':await csrf(page)},data:{comment:'Проверка взаимодействий'}})).status()).toBe(200);}
async function cleanup(page:Page,version:Version){
  await page.request.post(`${API}/api/auth/login`,{data:{username:'admin',password:'Admin123!'}});
  expect((await page.request.delete(`${API}/api/admin/exercises/${version.exercise_id}`,{headers:{'X-CSRF-Token':await csrf(page)}})).status()).toBe(204);
}
async function catalog(page:Page,version:Version){
  const menu=page.getByRole('button',{name:'Открыть меню'});if(await menu.isVisible())await menu.click();
  await page.getByRole('button',{name:'Занятия',exact:true}).click();
  const button=page.getByRole('button',{name:new RegExp(version.title)}).first();
  if(!await button.isVisible())await page.locator('.child-more-games summary').click();
  await button.click();
}
async function childGame(page:Page,version:Version){
  await page.context().clearCookies();await login(page,false);await catalog(page,version);
  await page.getByRole('button',{name:'Послушать и начать',exact:true}).click();
  await expect(page.getByRole('button',{name:'Показать образец',exact:true})).toBeEnabled();
}
async function currentTask(page:Page,version:Version){
  if(version.mechanic==='action_sequence'){
    const spoken=await page.evaluate(()=>(window as typeof window & {__lastTask?:string}).__lastTask);
    const task=version.content.tasks!.find(task=>task.instruction===spoken);
    expect(task).toBeTruthy();return task!;
  }
  const labels=await page.locator('.match-columns section').first().locator('button strong').allTextContents();
  const task=version.content.tasks!.find(task=>task.cards.every(card=>labels.includes(card.label)));
  expect(task).toBeTruthy();return task!;
}
async function complete(page:Page,version:Version,wrong=false){
  if(version.mechanic==='category_sort'){
    const label=await page.locator('.varied-object figcaption').innerText();
    const item=version.content.sort_items!.find(item=>item.label===label)!;
    if(wrong){const other=version.content.categories!.find(group=>group.key!==item.category_key)!;await page.getByRole('button',{name:new RegExp(`^${other.label}`)}).click();}
    const group=version.content.categories!.find(group=>group.key===item.category_key)!;
    await page.getByRole('button',{name:new RegExp(`^${group.label}`)}).click();
  }else if(version.mechanic==='action_sequence'){
    const task=await currentTask(page,version);
    if(wrong){
      for(const key of [...task.correct_order!].reverse())await page.locator('.varied-card-bank').getByRole('button',{name:task.cards.find(c=>c.key===key)!.label,exact:true}).click();
      await page.getByRole('button',{name:'Проверить порядок',exact:true}).click();
      for(let i=0;i<task.correct_order!.length;i++)await page.getByRole('button',{name:'Отменить последний',exact:true}).click();
    }
    for(const key of task.correct_order!){const button=page.locator('.varied-card-bank').getByRole('button',{name:task.cards.find(c=>c.key===key)!.label,exact:true});await expect(button).toBeEnabled();await button.focus();await button.press('Enter');}
    await page.getByRole('button',{name:'Проверить порядок',exact:true}).click();
  }else{
    const task=await currentTask(page,version);
    if(wrong){const pair=task.pairs![0];await page.getByRole('button',{name:`Предмет: ${task.cards.find(c=>c.key===pair.object_key)!.label}`,exact:true}).click();await page.getByRole('button',{name:`Действие: ${task.targets!.find(c=>c.key!==pair.target_key)!.label}`,exact:true}).click();}
    for(const pair of task.pairs!){await page.getByRole('button',{name:`Предмет: ${task.cards.find(c=>c.key===pair.object_key)!.label}`,exact:true}).click();await page.getByRole('button',{name:`Действие: ${task.targets!.find(c=>c.key===pair.target_key)!.label}`,exact:true}).click();}
    await expect(page.locator('.matched-pairs li')).toHaveCount(3);
  }
  await expect(page.getByRole('button',{name:/^(Дальше|Завершить)$/})).toBeVisible();
}
for(const mechanic of ['category_sort','action_sequence','object_match']){
  test(`${mechanic} saves corrections replay and model separately`,async({page},info)=>{
    await login(page);const version=await clone(page,mechanic,`${mechanic} ${info.project.name}`);
    try{
      await publish(page,version);await childGame(page,version);
      const audit=await new AxeBuilder({page}).include('.varied-runner').analyze();
      expect(audit.violations.filter(item=>['critical','serious'].includes(item.impact||'')).map(item=>({id:item.id,nodes:item.nodes.map(n=>n.target)}))).toEqual([]);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      await page.evaluate(()=>window.scrollTo(0,0));
      await page.screenshot({path:info.outputPath(`${mechanic}.png`),fullPage:true});
      const saved:Record<string,unknown>[]=[];page.on('request',request=>{if(new URL(request.url()).pathname==='/api/sessions'&&request.method()==='POST')saved.push(request.postDataJSON());});
      const total=mechanic==='category_sort'?18:12;
      for(let round=0;round<total;round++){
        if(round===1)await page.getByRole('button',{name:'Повторить',exact:true}).click();
        if(round===2)await page.getByRole('button',{name:'Показать образец',exact:true}).click();else await complete(page,version,round===0);
        if(round===version.content.default_rounds-1){expect(saved).toHaveLength(0);await page.getByRole('button',{name:'Продолжить с новыми заданиями',exact:true}).click();await expect(page.getByRole('button',{name:'Показать образец',exact:true})).toBeEnabled();}
        else if(round<total-1){await page.getByRole('button',{name:'Дальше',exact:true}).click();await expect(page.getByRole('button',{name:'Показать образец',exact:true})).toBeEnabled();}
      }
      const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/sessions'&&r.request().method()==='POST');
      await page.getByRole('button',{name:'Завершить',exact:true}).click();expect((await response).status()).toBe(201);
      expect(saved).toHaveLength(1);expect(saved[0]).toMatchObject({attempt_status:'completed',attempts_count:total,correct_answers:total-1,independent_completions:total-3,prompted_completions:2});
      const details=saved[0].details as {mechanic:string;round_outcomes:{outcome:string;supports:string[]}[]};
      expect(details.mechanic).toBe(mechanic);expect(details.round_outcomes).toHaveLength(total);
      expect(details.round_outcomes[0].outcome).toBe('prompted');expect(details.round_outcomes[1].supports).toContain('repeat_audio');expect(details.round_outcomes[2].outcome).toBe('modelled');
    }finally{await cleanup(page,version);}
  });
  test(`${mechanic} preview never writes child results`,async({page})=>{
    await login(page);const drafts=await(await page.request.get(`${API}/api/admin/exercise-drafts`)).json();
    const version=drafts.find((item:{version:Version})=>item.version.mechanic===mechanic).version;
    await page.getByRole('tab',{name:'Задания',exact:true}).click();
    await page.locator('.draft-list article').filter({hasText:version.title}).getByRole('button',{name:'Открыть проверку'}).click();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.getByRole('button',{name:'Preview механики'}).click();
    let saves=0;page.on('request',r=>{if(new URL(r.url()).pathname==='/api/sessions'&&r.method()==='POST')saves++;});
    await page.getByRole('button',{name:'Послушать и начать',exact:true}).click();await page.getByRole('button',{name:'Показать образец',exact:true}).click();
    await page.getByRole('button',{name:'Дальше',exact:true}).click();await page.getByRole('button',{name:'Перерыв',exact:true}).first().click();expect(saves).toBe(0);
  });
}
test('partial order break and unavailable sound save without scoring',async({page},info)=>{
  await login(page);const version=await clone(page,'action_sequence',`пауза ${info.project.name}`);
  try{
    await publish(page,version);await childGame(page,version);await page.locator('.varied-card-bank button').first().click();
    let request=page.waitForRequest(r=>new URL(r.url()).pathname==='/api/sessions'&&r.method()==='POST');
    await page.getByRole('button',{name:'Перерыв',exact:true}).first().click();const body=(await request).postDataJSON();
    expect(body.attempt_status).toBe('break');expect(body.attempts_count).toBeUndefined();expect(body.details.unfinished_round.order).toHaveLength(1);
    await page.reload();await catalog(page,version);await page.evaluate(()=>{(window as typeof window & {__failVoice?:boolean}).__failVoice=true;});
    await page.getByRole('button',{name:'Послушать и начать',exact:true}).click();await expect(page.getByRole('button',{name:'Вернуться без оценки',exact:true})).toBeVisible();
    request=page.waitForRequest(r=>new URL(r.url()).pathname==='/api/sessions'&&r.method()==='POST');
    await page.getByRole('button',{name:'Вернуться без оценки',exact:true}).click();expect((await request).postDataJSON()).toMatchObject({attempt_status:'technical_error'});
  }finally{await cleanup(page,version);}
});
