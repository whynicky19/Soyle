import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const captureReports=process.env.SOYLE_CAPTURE_REPORTS==='1';
test.setTimeout(90000);
test.use({video:{mode:captureReports?'on':'retain-on-failure',size:{width:1440,height:1000}}});
const stage=(page:Page)=>page.getByTestId('book-stage');
async function openBook(page:Page){
  await page.addInitScript(()=>{
    class Voice{text:string;onend?:()=>void;constructor(text:string){this.text=text;}}
    Object.defineProperty(window,'SpeechSynthesisUtterance',{value:Voice,configurable:true});
    Object.defineProperty(window,'speechSynthesis',{value:{cancel(){},getVoices:()=>[{lang:"ru-RU",localService:true}],speak(voice:Voice){setTimeout(()=>voice.onend?.(),10);}},configurable:true});
  });
  await page.route('http://localhost:8010/**',route=>route.continue({url:route.request().url().replace(':8010',':8011')}));
  await page.goto('/app');
  await page.getByLabel('Логин',{exact:true}).fill('parent');await page.getByLabel('Пароль',{exact:true}).fill('Parent123!');await page.getByRole('button',{name:'Войти',exact:true}).click();
  await expect(page.locator('.soyle-unified')).toBeVisible();
  const menu=page.getByRole('button',{name:'Открыть меню',exact:true});if(await menu.isVisible())await menu.click();
  await page.locator('#primary-navigation nav').getByRole('button',{name:'Кабинет родителя',exact:true}).click();
  const response=page.waitForResponse(res=>res.url().includes('/api/interactive-storybooks/')&&res.request().method()==='GET');
  await page.getByRole('link',{name:'Материалы',exact:true}).click();await page.getByRole('button',{name:/Открыть книгу с играми/}).click();const loaded=await response;expect(loaded.status()).toBe(200);const saved=await loaded.json();
  const status=await page.evaluate(async({saved,url})=>{
    const csrf=document.cookie.split('; ').find(value=>value.startsWith('soyle_csrf='))?.split('=')[1]||'';
    return (await fetch(url+'/events',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json','X-CSRF-Token':decodeURIComponent(csrf)},body:JSON.stringify({version:3,expected_revision:saved.revision,scene_id:saved.definition.scenes[saved.state.scene_index].id,event_id:crypto.randomUUID(),action:'restart'})})).status;
  },{saved,url:loaded.url().replace(':8011',':8010')});expect(status).toBe(200);
  await page.getByRole('button',{name:'В кабинет',exact:true}).click();await page.getByRole('link',{name:'Материалы',exact:true}).click();await page.getByRole('button',{name:/Открыть книгу с играми/}).click();
  await page.getByRole('button',{name:/Открыть книгу|Продолжить чтение/,exact:true}).click();await expect(stage(page)).toHaveAttribute('data-scene','find');
}
async function next(page:Page,id:string){await page.getByRole('button',{name:'Дальше',exact:true}).click();await expect(stage(page)).toHaveAttribute('data-scene',id);}
async function noOverflow(page:Page){expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);}

test.describe('illustrated storybook with mini-games',()=>{
  test.use({reducedMotion:'no-preference'});
  test('six whole illustrations, contextual games, soft transfer and real browser video',async({page},info)=>{
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await openBook(page);
    await expect(page.locator('.sidebar,.topbar')).toHaveCount(0);
    const capture=async(name:string)=>{await page.waitForTimeout(info.project.name==='desktop'?1600:1000);await noOverflow(page);if(captureReports)await page.screenshot({path:info.outputPath(name+'.png'),fullPage:true});};
    await capture('01-find');
    await page.getByRole('button',{name:'Мяч на ковре',exact:true}).click();await expect(stage(page)).toHaveAttribute('data-ready','false');await expect(page.locator('.book-gentle-feedback')).toContainText('Мяч');
    await page.getByRole('button',{name:'Подсказка',exact:true}).click();await expect(page.getByRole('button',{name:'Мишка на полке',exact:true})).toHaveClass(/book-hotspot-hint/);
    await page.getByRole('button',{name:'Мишка на полке',exact:true}).click();await next(page,'match');await capture('02-match');
    await page.getByRole('button',{name:'Мишка',exact:true}).click();await expect(stage(page)).toHaveAttribute('data-ready','false');await page.getByRole('button',{name:'Поезд',exact:true}).click();await expect(page.locator('.book-match-reward')).toBeVisible();
    await next(page,'request');await capture('03-request');await page.getByRole('button',{name:'Помоги',exact:true}).click();
    await next(page,'help');await capture('04-help-before');await stage(page).getByRole('button',{name:'Передать мишку',exact:true}).click();await capture('04-help-after');await expect(page.locator('.book-result')).toHaveClass(/book-result-shown/);
    await next(page,'play');await capture('05-play-before');await stage(page).getByRole('button',{name:'Взять поезд',exact:true}).click();await expect(stage(page)).toHaveAttribute('data-step','1');await page.waitForTimeout(800);
    await stage(page).getByRole('button',{name:'Поставить на рельсы',exact:true}).click();await expect(stage(page)).toHaveAttribute('data-ready','true');await capture('05-play-after');await expect(page.locator('.book-train')).toHaveClass(/book-train-on-track/);
    await next(page,'finish');await capture('06-finish');await page.getByRole('button',{name:'Закончить книгу',exact:true}).click();await expect(page.getByRole('heading',{name:'Побудем вместе'})).toBeVisible();
    const a11y=await new AxeBuilder({page}).analyze();expect(a11y.violations.filter(item=>['serious','critical'].includes(item.impact||''))).toEqual([]);expect(errors).toEqual([]);
    if(captureReports&&['desktop','mobile-320'].includes(info.project.name)){
      const out=path.resolve('../output/storybook-book');await fs.mkdir(out,{recursive:true});
      for(const name of ['01-find','02-match','03-request','04-help-before','04-help-after','05-play-before','05-play-after','06-finish'])await fs.copyFile(info.outputPath(name+'.png'),path.join(out,`${name}-${info.project.name}.png`));
      if(info.project.name==='desktop'){const video=page.video();await page.context().close();if(video)await video.saveAs(path.join(out,'favorite-toy-storybook-walkthrough.webm'));}
    }
  });
});

test.describe('book recovery and accessible interaction',()=>{
  test.use({reducedMotion:'reduce'});
  test('320px keyboard, refusal, pause, authoritative resume and assisted page',async({page})=>{
    await page.setViewportSize({width:320,height:800});await openBook(page);await noOverflow(page);
    const teddy=page.getByRole('button',{name:'Мишка на полке',exact:true});await teddy.focus();await page.keyboard.press('Enter');await next(page,'match');
    const a11y=await new AxeBuilder({page}).analyze();expect(a11y.violations.filter(item=>['serious','critical'].includes(item.impact||''))).toEqual([]);
    await page.getByRole('button',{name:'Не хочу',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('dialog').getByRole('button',{name:'Выйти в кабинет',exact:true}).click();
    await page.getByRole('link',{name:'Материалы',exact:true}).click();await page.getByRole('button',{name:/Открыть книгу с играми/}).click();await page.getByRole('button',{name:'Продолжить чтение',exact:true}).click();await expect(stage(page)).toHaveAttribute('data-scene','match');await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('dialog').getByRole('button',{name:'Продолжить',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();
    await page.locator('.book-adult-help summary').click();await page.getByRole('button',{name:'Помочь вместе',exact:true}).click();await expect(stage(page)).toHaveAttribute('data-ready','true');await next(page,'request');await noOverflow(page);
    await expect(page.getByLabel('Мягкие движения',{exact:true})).toBeDisabled();
  });
});
