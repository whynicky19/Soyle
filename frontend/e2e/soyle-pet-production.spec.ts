import {test,expect} from '@playwright/test';

for(const mode of ['animated','reduced','load-error'] as const){
 test(`production penguin stays visible: ${mode}`,async({page},info)=>{
  await page.emulateMedia({reducedMotion:mode==='reduced'?'reduce':'no-preference'});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  // Keep real application rendering and CSP, using only the isolated test database.
  await page.route('**/api/**',r=>r.continue({url:'http://localhost:8011'+new URL(r.request().url()).pathname,headers:{...r.request().headers(),origin:'http://localhost:3003'}}));
  let failedAsset=false;
  if(mode==='load-error')await page.route('**/mascot/soyle-mascot.riv',r=>{failedAsset=true;return r.fulfill({status:503,body:''});});
  await page.goto('/app');await page.getByRole('button',{name:'Ребёнок',exact:true}).click();
  await page.getByLabel('Логин ребёнка',{exact:true}).fill('alikhan');await page.getByLabel('PIN-код',{exact:true}).fill('1234');
  await page.getByRole('button',{name:'Начать заниматься',exact:true}).click();
  await expect(page.locator('.child-room-home')).toBeVisible();
  const pet=page.locator('.exercise-pet');
  if(mode==='load-error')await expect.poll(()=>failedAsset).toBe(true);
  else await expect(pet).toHaveAttribute('data-pet-ready','true',{timeout:25000});
  await expect(pet).toHaveAttribute('data-pet-renderer',mode==='animated'?'rive':'static');
  const visual=pet.locator(mode==='animated'?'canvas':'.pet-still');
  await expect(visual).toBeVisible();
  if(mode!=='animated')await expect.poll(()=>visual.evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  // Check actual character pixels, not merely a loaded runtime or an empty canvas.
  const capture=()=>visual.screenshot({omitBackground:true,style:'html,body {background:transparent!important} body * {visibility:hidden!important} .pet-button canvas,.pet-button .pet-still {visibility:visible!important}'});
  await expect.poll(async()=>(await capture()).length,{timeout:15000}).toBeGreaterThan(4000);
  await page.screenshot({path:info.outputPath(`penguin-${mode}.png`)});
  if(mode==='animated'){
   await page.emulateMedia({reducedMotion:'reduce'});await expect(pet).toHaveAttribute('data-pet-renderer','static');
   await page.emulateMedia({reducedMotion:'no-preference'});await expect(pet).toHaveAttribute('data-pet-renderer','rive');
  }
  expect(errors).toEqual([]);
 });
}
