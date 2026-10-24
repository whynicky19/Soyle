import AxeBuilder from '@axe-core/playwright';
import {expect,test,type Page,type BrowserContext} from '@playwright/test';
const API='http://localhost:8011';
const password='RoleChainTest123!';
test.setTimeout(90_000);
test.use({actionTimeout:15_000,navigationTimeout:15_000});
async function prepare(context:BrowserContext){
  await context.addInitScript(()=>{
    class Voice {onend:(()=>void)|null=null;onerror:(()=>void)|null=null;}
    Object.defineProperty(window,'SpeechSynthesisUtterance',{value:Voice,configurable:true});
    Object.defineProperty(window,'speechSynthesis',{value:{cancel(){},getVoices:()=>[],speak:(voice:Voice)=>setTimeout(()=>voice.onend?.(),0)},configurable:true});
  });
  await context.route('http://localhost:8010/**',route=>new URL(route.request().url()).pathname==='/api/tts'
    ?route.fulfill({status:503,body:'{}'}):route.continue({url:route.request().url().replace(':8010',':8011')}));
}
async function login(page:Page,username:string,student=false){
  await page.goto('/app');
  if(student)await page.getByRole('button',{name:'Ребёнок',exact:true}).click();
  await page.getByLabel(student?'Логин ребёнка':'Логин',{exact:true}).fill(username);
  await page.getByLabel(student?'PIN-код':'Пароль',{exact:true}).fill(student?'1234':password);
  await page.getByRole('button',{name:student?'Начать заниматься':'Войти',exact:true}).click();
  await expect(page.getByRole('button',{name:'Выйти из аккаунта',exact:true,includeHidden:true})).toBeAttached();
}
async function navigate(page:Page,name:string){
  const menu=page.getByRole('button',{name:'Открыть меню',exact:true});if(await menu.isVisible())await menu.click();
  await page.getByRole('button',{name,exact:true}).click();
}
async function returnTo(page:Page){await page.bringToFront();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));}

test('parent goal → specialist advice → separate child account → matching result in both adult accounts',async({browser,request},info)=>{
  const suffix=`${info.project.name}-${Date.now()}`;
  const register=async(prefix:string)=>{
    const response=await request.post(`${API}/api/auth/register`,{headers:{'X-Soyle-Auth-Mode':'bearer'},data:{username:`${prefix}-${suffix}`,password,full_name:prefix==='family'?'Родитель проверки':'Специалист проверки'}});
    expect(response.status()).toBe(201);const data=await response.json();return{user:data.user,headers:{Authorization:`Bearer ${data.access_token}`}};
  };
  const parent=await register('family'),specialist=await register('specialist');
  const adminLogin=await request.post(`${API}/api/auth/login`,{headers:{'X-Soyle-Auth-Mode':'bearer'},data:{username:'admin',password:'Admin123!'}});
  const admin={Authorization:`Bearer ${(await adminLogin.json()).access_token}`};
  expect((await request.patch(`${API}/api/admin/users/${specialist.user.id}/role`,{headers:admin,data:{role:'specialist'}})).status()).toBe(200);
  const childResponse=await request.post(`${API}/api/children`,{headers:parent.headers,data:{name:'Ребёнок проверки',birth_date:'2021-01-01'}});
  expect(childResponse.status()).toBe(201);const child=(await childResponse.json()).id;
  expect((await request.put(`${API}/api/children/${child}/consent`,{headers:parent.headers,data:{privacy_accepted:true,specialist_sharing:true}})).status()).toBe(200);
  expect((await request.post(`${API}/api/children/${child}/specialists`,{headers:parent.headers,data:{username:specialist.user.username}})).status()).toBe(201);
  const childLogin=`kid-${suffix}`;
  expect((await request.post(`${API}/api/children/${child}/student-account`,{headers:parent.headers,data:{username:childLogin,pin:'1234'}})).status()).toBe(200);
  const options={baseURL:'http://localhost:3003',viewport:info.project.use.viewport,isMobile:info.project.use.isMobile,hasTouch:info.project.use.hasTouch,deviceScaleFactor:info.project.use.deviceScaleFactor,reducedMotion:'reduce' as const};
  const contexts=await Promise.all([browser.newContext(options),browser.newContext(options),browser.newContext(options)]);
  try{
    for(const context of contexts)await prepare(context);
    const [familyPage,specialistPage,childPage]=await Promise.all(contexts.map(context=>context.newPage()));
    // The child tab is already open before an adult prepares the recommendation plan.
    await login(childPage,childLogin,true);
    await expect(childPage.getByRole('button',{name:'Начать занятие',exact:true})).toBeVisible();
    await login(familyPage,parent.user.username);
    await familyPage.locator('.v2-parent-actions button').filter({hasText:'Цели и план'}).click();
    await familyPage.getByRole('combobox',{name:'Подготовленная цель',exact:true}).selectOption('recognise-five-objects');
    await familyPage.getByLabel('Что получается сейчас',{exact:true}).fill('Выбирает знакомые предметы с напоминанием');
    await familyPage.getByRole('combobox',{name:'Какая помощь обычно нужна',exact:true}).selectOption('minimal');
    const createdGoal=familyPage.waitForResponse(r=>new URL(r.url()).pathname==='/api/practice-goals'&&r.request().method()==='POST');
    await familyPage.getByRole('button',{name:'Добавить домашнюю цель',exact:true}).click();
    const goalResponse=await createdGoal;expect(goalResponse.status()).toBe(201);const goal=await goalResponse.json();
    await expect(familyPage.locator('.practice-goal-card')).toContainText('Узнавать 5 знакомых предметов');
    await login(specialistPage,specialist.user.username);
    await specialistPage.getByRole('button',{name:/Ребёнок проверки Открыть наблюдения/}).click();
    await specialistPage.getByRole('link',{name:'Рекомендации',exact:true}).click();
    await specialistPage.getByRole('combobox',{name:'Цель рекомендации',exact:true}).selectOption(String(goal.id));
    await expect(specialistPage.getByRole('combobox',{name:'Упражнение',exact:true}).locator('option')).toHaveCount(4);
    await specialistPage.getByRole('combobox',{name:'Упражнение',exact:true}).selectOption({label:'Домашние животные'});
    await specialistPage.getByLabel('Как поддержать ребёнка',{exact:true}).fill('Дайте время на ответ. При необходимости повторите слово.');
    const recommended=specialistPage.waitForResponse(r=>new URL(r.url()).pathname==='/api/specialist/recommendations'&&r.request().method()==='POST');
    await specialistPage.getByRole('button',{name:'Сохранить рекомендацию',exact:true}).click();
    expect((await recommended).status()).toBe(201);
    const recommendations=await(await request.get(`${API}/api/children/${child}/specialist-recommendations`,{headers:parent.headers})).json();
    const recommendation=recommendations[0];expect(recommendation.goal_id).toBe(goal.id);
    await returnTo(familyPage);await navigate(familyPage,'Главная');
    const advice=familyPage.locator('.parent-specialist-advice');
    await expect(advice).toContainText('Дайте время на ответ');
    await expect(advice.getByRole('button',{name:'Просмотреть задание',exact:true})).toHaveClass(/secondary-button/);
    await advice.getByRole('button',{name:'Включить в план',exact:true}).click();
    await expect(advice).toContainText('Семья включила в практику');
    if(info.project.name==='mobile-320'){
      await advice.getByRole('button',{name:'Все рекомендации',exact:true}).click();
      await familyPage.locator('.cabinet-entry').filter({hasText:'Дайте время на ответ'}).getByRole('button',{name:'Начать по рекомендации',exact:true}).click();
    }else await advice.getByRole('button',{name:'Начать по рекомендации',exact:true}).click();
    await expect(familyPage.locator('.session-steps')).toContainText(goal.title);
    await navigate(familyPage,'Главная');
    // No full reload: the old child tab must discover the plan on return.
    await returnTo(childPage);
    await expect(childPage.getByRole('button',{name:'Продолжить занятие',exact:true})).toBeVisible();
    await childPage.getByRole('button',{name:'Продолжить занятие',exact:true}).click();
    await expect(childPage.locator('.session-steps')).toContainText(goal.title);
    await childPage.evaluate(()=>{Math.random=()=>.999;});
    await childPage.getByRole('button',{name:'Начать первое задание',exact:true}).click();
    await childPage.getByRole('button',{name:/Понятно, начать/}).click();
    const rounds=Number(await childPage.getByRole('progressbar',{name:'Ход задания'}).getAttribute('aria-valuemax'));
    for(let index=0;index<rounds;index++){
      if(index===1)await childPage.getByRole('button',{name:'Повторить',exact:true}).click();
      await childPage.locator('.picture-options button').first().click();
      await expect(childPage.getByText('Получилось',{exact:true})).toBeVisible();
      if(index<rounds-1)await childPage.getByRole('button',{name:'Дальше',exact:true}).click();
    }
    const saved=childPage.waitForResponse(r=>new URL(r.url()).pathname==='/api/sessions'&&r.request().method()==='POST');
    await childPage.getByRole('button',{name:'Завершить',exact:true}).click();
    const response=await saved;expect(response.status()).toBe(201);
    expect(response.request().postDataJSON()).toMatchObject({actor_role:'student',response_owner:'child',attempts_count:rounds,correct_answers:rounds,independent_completions:rounds-1,prompted_completions:1});
    const result=await response.json();
    // The two adults keep their original tabs open throughout the child's practice.
    await returnTo(familyPage);
    await expect(advice).toContainText('Практика по рекомендации состоялась');
    await expect(advice).toContainText(`${rounds} из ${rounds}`);
    await expect(advice).toContainText(`Самостоятельно: ${rounds-1}, с помощью: 1`);
    await expect(familyPage.locator('.v2-parent-stat-row')).toContainText('1');
    const goalRecords=await(await request.get(`${API}/api/practice-goals/${child}`,{headers:parent.headers})).json();
    const goalProgress=goalRecords.find((item:{id:number})=>item.id===goal.id).progress;
    expect(goalProgress).toMatchObject({completed_sessions:1,rounds,independent:rounds-1,prompted:1,without_child_answer:0});
    await familyPage.locator('.v2-parent-actions button').filter({hasText:'Цели и план'}).click();
    await expect(familyPage.locator('.goal-practice-progress')).toContainText(`Самостоятельно: ${rounds-1}, с помощью: 1`);
    await expect(familyPage.locator('.goal-practice-progress')).toContainText('Наблюдения дома: 0');
    const accessibility=await new AxeBuilder({page:familyPage}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    expect(accessibility.violations).toEqual([]);
    expect(await familyPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await familyPage.screenshot({path:info.outputPath('goal-practice-progress.png'),fullPage:true});
    await navigate(familyPage,'Главная');
    await familyPage.screenshot({path:info.outputPath('parent-linked-result.png'),fullPage:true});
    // The parent's previous mode was child practice. Preview must explicitly reset it.
    let previewSaves=0;
    familyPage.on('request',r=>{if(new URL(r.url()).pathname==='/api/sessions'&&r.method()==='POST')previewSaves++;});
    await advice.getByRole('button',{name:'Просмотреть задание',exact:true}).click();
    await expect(familyPage.locator('.adult-preview-banner')).toContainText('Ответы не сохраняются');
    await familyPage.evaluate(()=>{Math.random=()=>.999;});
    await familyPage.getByRole('button',{name:/Понятно, начать/}).click();
    for(let index=0;index<rounds;index++){
      await familyPage.locator('.picture-options button').first().click();
      await expect(familyPage.getByText('Получилось',{exact:true})).toBeVisible();
      await familyPage.getByRole('button',{name:index===rounds-1?'Завершить':'Дальше',exact:true}).click();
    }
    await expect(familyPage.getByRole('heading',{name:'Предпросмотр завершён',exact:true})).toBeVisible();
    expect(previewSaves).toBe(0);
    await returnTo(specialistPage);
    const entry=specialistPage.locator('.cabinet-entry').filter({hasText:'Домашние животные'});
    await expect(entry).toContainText('Практика по рекомендации состоялась');
    await expect(entry).toContainText(`${rounds} из ${rounds}`);
    await expect(entry).toContainText(`Самостоятельно: ${rounds-1}, с помощью: 1`);
    await specialistPage.getByRole('link',{name:'Цели и история',exact:true}).click();
    await expect(specialistPage.locator('.goal-practice-progress')).toContainText(`Самостоятельно: ${rounds-1}, с помощью: 1`);
    const audit=await new AxeBuilder({page:specialistPage}).analyze();
    expect(audit.violations.filter(item=>['serious','critical'].includes(item.impact||''))).toEqual([]);
    await specialistPage.screenshot({path:info.outputPath('specialist-linked-result.png'),fullPage:true});
    const parentResult=(await(await request.get(`${API}/api/children/${child}/specialist-recommendations`,{headers:parent.headers})).json()).find((item:{id:number})=>item.id===recommendation.id);
    const loginSpec=await request.post(`${API}/api/auth/login`,{headers:{'X-Soyle-Auth-Mode':'bearer'},data:{username:specialist.user.username,password}});
    const specHeaders={Authorization:`Bearer ${(await loginSpec.json()).access_token}`};
    const workspace=await(await request.get(`${API}/api/specialist/children/${child}`,{headers:specHeaders})).json();
    const specResult=workspace.recommendations.find((item:{id:number})=>item.id===recommendation.id);
    expect(parentResult.attempt_count).toBe(1);expect(parentResult.latest_attempt.id).toBe(result.id);expect(specResult.latest_attempt).toEqual(parentResult.latest_attempt);
    expect(workspace.practice_goals.find((item:{id:number})=>item.id===goal.id).status).toBe('active');
  }finally{await Promise.all(contexts.map(context=>context.close()));}
});
