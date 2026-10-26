import {expect,test,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const API='http://localhost:8011';
type Stimulus={key:string;label:string;media_ref:string;hint:string;distractor_keys:string[]};
type Bank={id:number;title:string;target:string;engine:{version_id:number;content:{bank_key?:string;stimuli:Stimulus[]}}};
test.setTimeout(120_000);
test.use({actionTimeout:15_000});

async function setup(page:Page){
 await page.addInitScript(()=>{
  class Voice{onend:(()=>void)|null=null;}
  Object.defineProperty(window,'SpeechSynthesisUtterance',{value:Voice,configurable:true});
  Object.defineProperty(window,'speechSynthesis',{value:{cancel(){},getVoices:()=>[],speak:(v:Voice)=>setTimeout(()=>v.onend?.(),0)},configurable:true});
 });
 await page.route('http://localhost:8010/**',route=>new URL(route.request().url()).pathname==='/api/tts'?route.fulfill({status:503,body:'{}'}):route.continue({url:route.request().url().replace(':8010',':8011')}));
 expect((await page.request.post(`${API}/api/auth/login`,{data:{username:'admin',password:'Admin123!'}})).ok()).toBe(true);
 const csrf=(await page.request.storageState()).cookies.find(c=>c.name==='soyle_csrf')!.value;
 const drafts=await(await page.request.get(`${API}/api/admin/exercise-drafts`)).json();
 for(const d of drafts.filter((d:{version:{content:{bank_key?:string}}})=>d.version.content.bank_key?.startsWith('scene-words-'))){
  expect(d.valid).toBe(true);expect((await page.request.post(`${API}/api/admin/exercise-drafts/${d.version.id}/publish`,{headers:{'X-CSRF-Token':csrf}})).ok()).toBe(true);
 }
 const banks=(await(await page.request.get(`${API}/api/exercises`)).json() as Bank[]).filter(e=>e.engine.content.bank_key?.startsWith('scene-words-'));expect(banks).toHaveLength(4);
 const gaps=await(await page.request.get(`${API}/api/admin/vocabulary-content-gaps`)).json();expect(gaps).toHaveLength(48);expect(gaps.every((g:{status:string})=>g.status==='available')).toBe(true);
 await page.context().clearCookies();await page.goto('/app');await page.getByRole('button',{name:'Ребёнок',exact:true}).click();await page.getByLabel('Логин ребёнка',{exact:true}).fill('alikhan');await page.getByLabel('PIN-код',{exact:true}).fill('1234');await page.getByRole('button',{name:'Начать заниматься',exact:true}).click();await expect(page.locator('.child-room-home')).toBeVisible();
 await page.evaluate(()=>{Math.random=()=>.999;});
 await page.locator('.room-doors').getByRole('button',{name:'Занятия',exact:true}).click();
 return banks;
}

function imagePath(src:string){const u=new URL(src,'http://localhost:3003');return u.pathname==='/_next/image'?u.searchParams.get('url'):u.pathname;}

test('four published word banks: all 48 words, curated options, meaningful help and shared word history',async({page},info)=>{
 const banks=await setup(page);
 const child=(await(await page.request.get(`${API}/api/auth/me`)).json()).child_id;
 for(let bankIndex=0;bankIndex<banks.length;bankIndex++){
  const bank=banks[bankIndex];await page.getByRole('button',{name:new RegExp(bank.title)}).click();
  await expect(page.getByRole('button',{name:'12 заданий',exact:true})).toHaveAttribute('aria-pressed','true');
  const optionCount=bankIndex===0?2:bankIndex===1?3:4;
  await page.locator('.runner-levels').getByRole('button',{name:String(optionCount),exact:true}).click();
  await page.getByRole('button',{name:/Понятно, начать/}).click();
  const seen=new Set<string>();
  for(let round=0;round<12;round++){
   const target=bank.engine.content.stimuli[round],options=page.locator('.picture-options button');
   await expect(options).toHaveCount(optionCount);await expect(options.first()).toBeEnabled();
   await expect(page.locator('.picture-options strong')).toHaveCount(0);
   const paths=await page.locator('.picture-options img').evaluateAll(nodes=>nodes.map(n=>(n as HTMLImageElement).src));
   const keys=paths.map(src=>bank.engine.content.stimuli.find(s=>s.media_ref===imagePath(src))!.key);
   expect(keys[0]).toBe(target.key);expect(keys.filter(k=>k!==target.key).every(k=>target.distractor_keys.includes(k))).toBe(true);
   for(const image of await page.locator('.picture-options img').all()){
    await expect.poll(()=>image.evaluate(n=>(n as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    expect(await image.evaluate(n=>n.getBoundingClientRect().width/n.closest('button')!.getBoundingClientRect().width)).toBeGreaterThan(.95);
   }
   if(round===0){
    expect((await new AxeBuilder({page}).include('.game-page').analyze()).violations).toEqual([]);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.locator('.picture-options').screenshot({path:info.outputPath(bank.target+'-cards.png')});
    if(bankIndex===0){await page.getByRole('button',{name:'Подсказка',exact:true}).click();await expect(page.getByText(target.hint,{exact:true})).toBeVisible();}
    if(bankIndex===1)await page.getByRole('button',{name:'Повторить',exact:true}).click();
    if(bankIndex>=2){await options.nth(1).click();await expect(options.first()).toBeEnabled();}
    if(bankIndex===3){await options.nth(2).click();await expect(page.locator('.picture-options.reduced button')).toHaveCount(2);}
   }
   await expect(options.first()).toBeEnabled();await options.first().click();await expect(page.getByText('Получилось',{exact:true})).toBeVisible();
   expect(await page.locator('.picture-options .answer strong').innerText()).toBe(target.label);seen.add(target.key);
   if(round<11)await page.getByRole('button',{name:'Дальше',exact:true}).click();
  }
  expect(seen.size).toBe(12);
  const saving=page.waitForResponse(r=>r.url().includes('/api/sessions')&&r.request().method()==='POST');await page.getByRole('button',{name:'Завершить',exact:true}).click();
  const response=await saving;expect(response.ok()).toBe(true);
  const body=response.request().postDataJSON();expect(body.independent_completions).toBe(11);expect(body.prompted_completions).toBe(1);expect(body.details.round_outcomes[0].outcome).toBe('prompted');expect(body.details.round_outcomes).toHaveLength(12);
  await page.getByRole('button',{name:'Закрыть поздравление',exact:true}).click();await page.getByRole('button',{name:'Закончить практику',exact:true}).click();
 }
 expect((await page.request.post(`${API}/api/auth/login`,{data:{username:'admin',password:'Admin123!'}})).ok()).toBe(true);
 const words=await(await page.request.get(`${API}/api/vocabulary/${child}`)).json();expect(words.words).toHaveLength(48);
 expect(words.words.every((w:{content_pending:boolean})=>!w.content_pending)).toBe(true);
 for(const bank of banks){const first=words.words.find((w:{concept_id:string})=>w.concept_id===bank.engine.content.stimuli[0].key);expect(first.with_help).toBeGreaterThan(0);}
});
