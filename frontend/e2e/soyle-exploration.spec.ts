import {expect,test,type Page,type APIRequestContext} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test.setTimeout(180_000);
const API='http://localhost:8011';
type Room={id:number;engine:{mechanic:string;version_id:number;content:{exploration:{key:string;title:string;objects:{id:string;hit_point:[number,number]}[]}}}};
type Snapshot={id:string;revision:number;state:{status:string;index:number;order:string[];round:{audio_ready:boolean;resolved:boolean}};scene:{objects:{id:string;hit_point:[number,number]}[]}};
async function csrf(request:APIRequestContext){return(await request.storageState()).cookies.find(c=>c.name==='soyle_csrf')?.value||'';}
async function setup(page:Page){
 let failNext=false;
 await page.route('http://localhost:8010/**',route=>{const path=new URL(route.request().url()).pathname;
  if(path==='/api/tts')return route.fulfill({status:503,body:'{}'});
  if(failNext&&path.endsWith('/events')&&route.request().postDataJSON()?.action==='select'){failNext=false;return route.fulfill({status:503,body:'{"detail":"Временный сбой сохранения"}',contentType:'application/json'});}
  return route.continue({url:route.request().url().replace(':8010',':8011')});
 });
 await page.addInitScript(()=>{
  class Voice{onend:(()=>void)|null=null;onerror:(()=>void)|null=null;}
  Object.defineProperty(window,'SpeechSynthesisUtterance',{value:Voice,configurable:true});
  Object.defineProperty(window,'speechSynthesis',{value:{cancel(){},getVoices:()=>[],speak:(v:Voice)=>setTimeout(()=>{if((window as typeof window&{failSpeech?:boolean}).failSpeech)v.onerror?.();else v.onend?.();},0)},configurable:true});
 });
 const admin=await page.request.post(`${API}/api/auth/login`,{data:{username:'admin',password:'Admin123!'}});expect(admin.ok()).toBe(true);
 const drafts=await(await page.request.get(`${API}/api/admin/exercise-drafts`)).json();
 for(const draft of drafts.filter((d:{version:{mechanic:string}})=>d.version.mechanic==='scene_search')){
  expect(draft.valid).toBe(true);const r=await page.request.post(`${API}/api/admin/exercise-drafts/${draft.version.id}/publish`,{headers:{'X-CSRF-Token':await csrf(page.request)}});expect(r.ok()).toBe(true);
 }
 const rooms=(await(await page.request.get(`${API}/api/exercises`)).json() as Room[]).filter(e=>e.engine.mechanic==='scene_search');expect(rooms).toHaveLength(4);
 await page.context().clearCookies();await page.goto('/app');await page.getByRole('button',{name:'Ребёнок',exact:true}).click();await page.getByLabel('Логин ребёнка',{exact:true}).fill('alikhan');await page.getByLabel('PIN-код',{exact:true}).fill('1234');await page.getByRole('button',{name:'Начать заниматься',exact:true}).click();await expect(page.locator('.child-room-home')).toBeVisible();
 return {rooms,failSelect:()=>{failNext=true;}};
}
async function games(page:Page){await page.locator('.room-doors').getByRole('button',{name:'Занятия',exact:true}).click();await expect(page.getByRole('heading',{name:'Исследуй мир',exact:true})).toBeVisible();}
async function open(page:Page,room:Room){await page.locator('.explore-location').filter({hasText:room.engine.content.exploration.title}).click();await expect(page.locator('.explore-welcome')).toBeVisible();}
async function tap(page:Page,point:[number,number]){
 const viewport=page.locator('.explore-viewport');await viewport.evaluate(el=>el.scrollIntoView({block:'center'}));
 await viewport.evaluate(el=>new Promise<void>(resolve=>{
  let previous='',stable=0,frames=0;
  const sample=()=>{const r=el.querySelector('svg')!.getBoundingClientRect(),now=[r.x,r.y,r.width,r.height,el.scrollLeft,el.scrollTop].map(v=>Math.round(v*10)).join(':');stable=now===previous?stable+1:0;previous=now;if(stable>=6||++frames>180)resolve();else requestAnimationFrame(sample);};sample();
 }));
 await viewport.evaluate((el,point)=>{const canvas=el.querySelector('svg')!;const r=canvas.getBoundingClientRect();el.scrollTo({left:point[0]*r.width-el.clientWidth/2,top:point[1]*r.height-el.clientHeight/2});},point);
 await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
 const rect=await page.locator('.explore-canvas').boundingBox();expect(rect).toBeTruthy();const x=rect!.x+point[0]*rect!.width,y=rect!.y+point[1]*rect!.height;
 expect(await page.evaluate(({x,y})=>Boolean(document.elementFromPoint(x,y)?.closest('.explore-canvas')),{x,y}),`Scene point ${point} must be visible and unobscured at ${x},${y}`).toBe(true);
 if(await page.evaluate(()=>navigator.maxTouchPoints>0))await page.touchscreen.tap(x,y);else await page.mouse.click(x,y);
}
function eventResponse(page:Page,action:string){return page.waitForResponse(r=>r.url().includes('/api/exploration/runs/')&&r.url().endsWith('/events')&&r.request().method()==='POST'&&r.request().postDataJSON()?.action===action,{timeout:15_000});}
test('administrator sees all scene maps and preview leaves child history unchanged',async({page},info)=>{
 test.skip(info.project.name!=='desktop','The same immutable map is inspected once; child interactions run at every viewport.');
 await page.route('http://localhost:8010/**',route=>new URL(route.request().url()).pathname==='/api/tts'?route.fulfill({status:503,body:'{}'}):route.continue({url:route.request().url().replace(':8010',':8011')}));
 await page.addInitScript(()=>{class Voice{onend:(()=>void)|null=null;}Object.defineProperty(window,'SpeechSynthesisUtterance',{value:Voice,configurable:true});Object.defineProperty(window,'speechSynthesis',{value:{cancel(){},getVoices:()=>[],speak:(v:Voice)=>setTimeout(()=>v.onend?.(),0)},configurable:true});});
 expect((await page.request.post(`${API}/api/auth/login`,{data:{username:'admin',password:'Admin123!'}})).ok()).toBe(true);
 const drafts=await(await page.request.get(`${API}/api/admin/exercise-drafts`)).json();
 const scenes=drafts.filter((d:{version:{mechanic:string}})=>d.version.mechanic==='scene_search') as {version:{id:number;title:string;content:{exploration:{key:string}}}}[];expect(scenes).toHaveLength(4);
 const children=await(await page.request.get(`${API}/api/children`)).json();const child=children[0].id;
 const before=await(await page.request.get(`${API}/api/vocabulary/${child}`)).json();
 await page.goto('/app');await page.getByRole('tab',{name:'Задания',exact:true}).click();
 for(const source of scenes){
  await page.locator('.draft-list article').filter({hasText:source.version.title}).getByRole('button',{name:'Открыть проверку',exact:true}).click();
  await expect(page.locator('.exploration-review > svg path')).toHaveCount(12);await page.locator('.exploration-review > svg').screenshot({path:info.outputPath(`map-${source.version.content.exploration.key}.png`)});
  if(source===scenes[0]){
   await page.getByRole('button',{name:'Preview механики',exact:true}).click();const opened=page.waitForResponse(r=>r.url().includes('/api/exploration/previews/')&&r.request().method()==='POST');await page.getByRole('button',{name:'Послушать и начать',exact:true}).click();const preview=await(await opened).json() as Snapshot;
   await expect(page.locator('.explore-main-controls').getByRole('button',{name:'Повторить',exact:true})).toBeEnabled();const obj=preview.scene.objects.find(o=>o.id===preview.state.order[0])!;const response=eventResponse(page,'select');await tap(page,obj.hit_point);expect((await(await response).json()).preview).toBe(true);
   await page.locator('.draft-runner-shell > header').getByRole('button',{name:'Закрыть',exact:true}).click();
  }
  await page.locator('.review-workspace-head').getByRole('button',{name:'Закрыть',exact:true}).click();
 }
 expect(await(await page.request.get(`${API}/api/vocabulary/${child}`)).json()).toEqual(before);
});

test('four rooms: all 48 actual hotspots, panning/zoom, hints, retry, resume and shared results',async({page},info)=>{
 const {rooms,failSelect}=await setup(page);await games(page);
 let child=0;
 for(let roomIndex=0;roomIndex<rooms.length;roomIndex++){
  const room=rooms[roomIndex];await open(page,room);await page.getByRole('button',{name:'Найди предмет',exact:true}).click();await page.getByRole('button',{name:'12 предметов',exact:true}).click();
  const began=page.waitForResponse(r=>r.url().endsWith('/runs')&&r.request().method()==='POST');await page.getByRole('button',{name:'Послушать и начать',exact:true}).click();let current=(await(await began).json()) as Snapshot;
  const me=await(await page.request.get(`${API}/api/auth/me`)).json();child=me.child_id;
  const seen=new Set<string>();
  for(let index=0;index<12;index++){
   await expect(page.locator('.explore-main-controls').getByRole('button',{name:'Повторить',exact:true})).toBeEnabled();
   current=await(await page.request.get(`${API}/api/exploration/runs/${current.id}`)).json();expect(current.state.index).toBe(index);const target=current.scene.objects.find(o=>o.id===current.state.order[index])!;seen.add(target.id);
   if(roomIndex===0&&index===0){
    let response=eventResponse(page,'select');await tap(page,[.5,.03]);let snap=await(await response).json();expect(snap.measurement.attempts_count).toBe(0);
    response=eventResponse(page,'hint');await page.getByRole('button',{name:'Подсказка',exact:true}).click();snap=await(await response).json();expect(snap.state.round.hint_level).toBe(1);await expect(page.locator('.explore-hint')).toBeVisible();await expect.poll(async()=>{const h=await page.locator('.explore-hint').boundingBox(),v=await page.locator('.explore-viewport').boundingBox();return Boolean(h&&v&&h.x>=v.x-4&&h.x+h.width<=v.x+v.width+4);}).toBe(true);
    response=eventResponse(page,'repeat');await page.locator('.explore-main-controls').getByRole('button',{name:'Повторить',exact:true}).click();await response;failSelect();
   }
   await expect(page.locator(`.explore-object[data-object-id="${target.id}"]`)).toHaveAttribute('aria-disabled','false');
   if(roomIndex===0&&index===3){const before=(await page.locator('.explore-canvas').boundingBox())!.width;await page.getByRole('button',{name:'Увеличить сцену',exact:true}).click();await expect.poll(async()=>(await page.locator('.explore-canvas').boundingBox())!.width).toBeGreaterThan(before);await page.getByRole('button',{name:'Уменьшить сцену',exact:true}).click();}
   const next=eventResponse(page,'next');let response=eventResponse(page,'select');
   if(index===11){const node=page.locator(`.explore-object[data-object-id="${target.id}"]`);await node.focus();await node.press('Enter');}else await tap(page,target.hit_point);
   let selected=await response;
   if(selected.status()===503){await expect(page.getByRole('alert').filter({hasText:'Временный сбой сохранения'})).toBeVisible();response=eventResponse(page,'select');await page.getByRole('button',{name:'Повторить действие',exact:true}).click();selected=await response;}
   expect(selected.ok()).toBe(true);const answer=await selected.json();expect(answer.state.round.resolved).toBe(true);expect(answer.state.round.responses.at(-1).object_id).toBe(target.id);
   if(index===0){expect((await new AxeBuilder({page}).include('.explore-game').analyze()).violations).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath(`${room.engine.content.exploration.key}-found.png`),fullPage:true});}
   current=await(await next).json();
   if(roomIndex===0&&index===0){
    await page.getByRole('button',{name:'Перерыв',exact:true}).first().click();await expect(page.locator('.explore-location-grid')).toBeVisible();await page.reload();await expect(page.locator('.child-room-home')).toBeVisible();await games(page);await open(page,room);await expect(page.getByText('Место сохранено. Найдено 1 из 12.',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Продолжить исследование',exact:true}).click();
   }
  }
  expect(seen.size).toBe(12);await expect(page.getByRole('heading',{name:'Готово!',exact:true})).toBeVisible();
  const celebration=page.getByRole('button',{name:'Закрыть поздравление',exact:true});await expect(celebration).toBeVisible();await celebration.click();
  await page.getByRole('button',{name:'Закончить практику',exact:true}).click();await expect(page.locator('.explore-location-grid')).toBeVisible();
 }
 const admin=await page.request.post(`${API}/api/auth/login`,{data:{username:'admin',password:'Admin123!'}});expect(admin.ok()).toBe(true);const words=await(await page.request.get(`${API}/api/vocabulary/${child}`)).json();expect(words.words).toHaveLength(48);expect(words.words.some((w:{with_help:number})=>w.with_help>0)).toBe(true);
});


test('advanced instructions, spoken labels and failed audio preserve measurement boundaries',async({page,request})=>{
 const {rooms}=await setup(page);await games(page);const room=rooms.find(r=>r.engine.content.exploration.key==='kitchen')!;
 const me=await(await page.request.get(`${API}/api/auth/me`)).json();expect((await request.post(`${API}/api/auth/login`,{data:{username:'admin',password:'Admin123!'}})).ok()).toBe(true);
 const before=await(await request.get(`${API}/api/vocabulary/${me.child_id}`)).json();
 await open(page,room);await page.getByRole('button',{name:'Признаки и расположение',exact:true}).click();await page.getByLabel('Называть предметы при выборе с клавиатуры').check();
 const begun=page.waitForResponse(r=>r.url().endsWith('/runs')&&r.request().method()==='POST');await page.getByRole('button',{name:'Послушать и начать',exact:true}).click();let snap=await(await begun).json() as Snapshot;expect((snap.state as Snapshot['state']&{level:number}).level).toBe(3);
 const result=page.waitForResponse(r=>r.url().includes('/api/sessions')&&r.request().method()==='POST');
 for(let i=0;i<4;i++){
  await expect(page.locator('.explore-main-controls').getByRole('button',{name:'Повторить',exact:true})).toBeEnabled();snap=await(await page.request.get(`${API}/api/exploration/runs/${snap.id}`)).json();
  const node=page.locator(`.explore-object[data-object-id="${snap.state.order[i]}"]`);const next=eventResponse(page,'next');await node.focus();await node.press('Enter');snap=await(await next).json();
 }
 const response=await result;expect(response.ok()).toBe(true);expect((await response.json()).attempt_status).toBe('participated');
 await page.getByRole('button',{name:'Закрыть поздравление',exact:true}).click();await page.getByRole('button',{name:'Закончить практику',exact:true}).click();expect(await(await request.get(`${API}/api/vocabulary/${me.child_id}`)).json()).toEqual(before);
 await open(page,room);await page.evaluate(()=>{(window as typeof window&{failSpeech?:boolean}).failSpeech=true;});await page.getByRole('button',{name:'Послушать и начать',exact:true}).click();
 await expect(page.getByRole('button',{name:'Вернуться без оценки',exact:true})).toBeVisible();const failure=page.waitForResponse(r=>r.url().includes('/api/sessions')&&r.request().method()==='POST');await page.getByRole('button',{name:'Вернуться без оценки',exact:true}).click();const saved=await failure;expect(saved.ok()).toBe(true);const payload=await saved.json();expect(payload.attempt_status).toBe('technical_error');expect(payload.awarded_stars).toBe(0);expect(await(await request.get(`${API}/api/vocabulary/${me.child_id}`)).json()).toEqual(before);
});

test('native touch panning is not an answer and hotspots survive screen resizing',async({page},info)=>{
 test.skip(info.project.name!=='mobile-320'&&info.project.name!=='tablet','Native gestures are checked on the narrow phone and tablet.');
 const {rooms}=await setup(page);await games(page);await open(page,rooms[0]);
 const opened=page.waitForResponse(r=>r.url().endsWith('/runs')&&r.request().method()==='POST');await page.getByRole('button',{name:'Послушать и начать',exact:true}).click();let snap=await(await opened).json() as Snapshot;
 await expect(page.locator('.explore-main-controls').getByRole('button',{name:'Повторить',exact:true})).toBeEnabled();
 const viewport=page.locator('.explore-viewport');await viewport.evaluate(el=>{el.scrollIntoView({block:'center'});el.scrollTo({left:0,top:0});});
 const rect=(await viewport.boundingBox())!,y=Math.max(180,Math.min(rect.y+rect.height/2,page.viewportSize()!.height-60)),start=rect.x+rect.width*.8,end=rect.x+rect.width*.25;
 const gesture=await page.context().newCDPSession(page);
 await gesture.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:start,y}]});
 for(let i=1;i<=8;i++){
  await gesture.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start+(end-start)*i/8,y}]});
  await page.waitForTimeout(20); // Input sampling over real frames allows the browser to recognise a pan.
 }
 await gesture.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await gesture.detach();
 await expect.poll(()=>viewport.evaluate(el=>el.scrollLeft)).toBeGreaterThan(20);
 snap=await(await page.request.get(`${API}/api/exploration/runs/${snap.id}`)).json();expect(snap.state.index).toBe(0);expect((snap as Snapshot&{measurement:{attempts_count:number}}).measurement.attempts_count).toBe(0);
 await page.setViewportSize({width:390,height:844});await expect.poll(()=>viewport.evaluate(el=>el.clientWidth)).toBeLessThan(390);
 const object=snap.scene.objects.find(o=>o.id===snap.state.order[0])!,selected=eventResponse(page,'select');await tap(page,object.hit_point);expect((await(await selected).json()).state.round.resolved).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('touch-and-resize.png')});
 await page.getByRole('button',{name:'Не хочу',exact:true}).first().click();await expect(page.locator('.explore-location-grid')).toBeVisible();
});
