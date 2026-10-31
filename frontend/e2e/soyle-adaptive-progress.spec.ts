import {expect,test} from '@playwright/test';
const API='http://localhost:8011';
test.setTimeout(60_000);
test.use({actionTimeout:15_000,navigationTimeout:15_000});
test('stable results become three real choices and the next plan keeps the measured level',async({page,request},info)=>{
  const username=`adaptive-${info.project.name}-${Date.now()}`,password='AdaptiveTest123!';
  const registration=await request.post(`${API}/api/auth/register`,{headers:{'X-Soyle-Auth-Mode':'bearer'},data:{username,password,full_name:'Проверка адаптации'}});
  expect(registration.status()).toBe(201);const auth={Authorization:`Bearer ${(await registration.json()).access_token}`};
  const child=(await(await request.post(`${API}/api/children`,{headers:auth,data:{name:'Проверка плана',birth_date:'2021-01-01'}})).json()).id;
  expect((await request.put(`${API}/api/children/${child}/consent`,{headers:auth,data:{privacy_accepted:true}})).status()).toBe(200);
  const goal=(await(await request.post(`${API}/api/practice-goals`,{headers:auth,data:{child_id:child,template_key:'recognise-five-objects',baseline:'Выбирает знакомые предметы',help_level:'minimal'}})).json()).id;
  const catalogue=await(await request.get(`${API}/api/exercises`,{headers:auth})).json();
  const animal=catalogue.find((item:{target:string})=>item.target==='animals');
  expect((await request.put(`${API}/api/practice-preferences/${child}`,{headers:auth,data:{avoided_exercise_ids:catalogue.filter((item:{target:string})=>['food','toys'].includes(item.target)).map((item:{id:number})=>item.id),preferred_exercise_ids:[]}})).status()).toBe(200);
  for(let index=0;index<3;index++)expect((await request.post(`${API}/api/sessions`,{headers:auth,data:{child_id:child,exercise_id:animal.id,module:'sensory',duration_seconds:20,score:100,actor_role:'parent',response_owner:'child',support_context:'independent',attempt_status:'completed',attempts_count:12,correct_answers:12,independent_completions:12,prompted_completions:0,prompt_level:'independent',details:{difficulty_level:1,option_count:2,round_count:12}}})).status()).toBe(201);
  await page.addInitScript(()=>{
    class Voice {onend:(()=>void)|null=null;}
    Object.defineProperty(window,'SpeechSynthesisUtterance',{value:Voice,configurable:true});
    Object.defineProperty(window,'speechSynthesis',{value:{cancel(){},getVoices:()=>[{lang:"ru-RU",localService:true}],speak:(voice:Voice)=>setTimeout(()=>voice.onend?.(),0)},configurable:true});
  });
  await page.route('http://localhost:8010/**',route=>new URL(route.request().url()).pathname==='/api/tts'?route.fulfill({status:503,body:'{}'}):route.continue({url:route.request().url().replace(':8010',':8011')}));
  const authReady=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/auth/me');
  await page.goto('/app');await authReady;await page.getByLabel('Логин',{exact:true}).fill(username);await page.getByLabel('Пароль',{exact:true}).fill(password);await page.getByRole('button',{name:'Войти',exact:true}).click();
  await page.locator('.v2-parent-actions button').filter({hasText:'Цели и план'}).click();
  await expect(page.locator('.goal-practice-progress')).toContainText('пока нет');
  const prepared=page.waitForResponse(r=>new URL(r.url()).pathname===`/api/adaptive-plans/${child}`&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Подготовить план',exact:true}).click();
  const plan=await(await prepared).json();expect(plan.items).toHaveLength(1);expect(plan.items[0].goal_id).toBe(goal);expect(plan.items[0].difficulty_params).toMatchObject({difficulty_level:2,option_count:3,round_count:12});
  await expect(page.locator('.prepared-plan')).toContainText('3 варианта');
  await page.evaluate(()=>{Math.random=()=>.999;});
  await page.getByRole('button',{name:'Начать этот план',exact:true}).click();await page.getByRole('button',{name:'Начать первое задание',exact:true}).click();
  await expect(page.locator('.adaptive-runner-setting')).toContainText('3 картинки');
  await page.getByRole('button',{name:/Понятно, начать/}).click();
  for(let index=0;index<12;index++){
    await expect(page.locator('.picture-options button')).toHaveCount(3);
    await page.locator('.picture-options button').first().click();await expect(page.getByText('Получилось',{exact:true})).toBeVisible();
    if(index===0)await page.screenshot({path:info.outputPath('three-choice-plan.png'),fullPage:true});
    if(index<11)await page.getByRole('button',{name:'Дальше',exact:true}).click();
  }
  const completed=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/sessions'&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Завершить',exact:true}).click();const response=await completed;expect(response.status()).toBe(201);
  expect(response.request().postDataJSON().details).toMatchObject({difficulty_level:2,option_count:3,round_count:12});
  const goals=await(await request.get(`${API}/api/practice-goals/${child}`,{headers:auth})).json();
  expect(goals[0].progress).toMatchObject({completed_sessions:1,rounds:12,independent:12,independent_rate:100});
  const next=await(await request.post(`${API}/api/adaptive-plans/${child}`,{headers:auth,data:{target_minutes:3}})).json();
  expect(next.items[0].difficulty_params).toMatchObject({difficulty_level:2,option_count:3});
  expect(next.items[0].assignment_reason.evidence.current_level_results.recorded_sessions).toBe(1);
});
