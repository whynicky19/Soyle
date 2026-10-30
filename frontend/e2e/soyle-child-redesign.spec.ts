import {test,expect,type Page} from '@playwright/test';
test.setTimeout(90000);
async function navigate(page:Page,name:string){
 const menu=page.getByRole('button',{name:'Открыть меню',exact:true});
 if(await menu.isVisible())await menu.click();
 const entry=page.locator('#primary-navigation nav').getByRole('button',{name,exact:true});
 if(await entry.isVisible())await entry.click();
 else {await page.locator('#primary-navigation nav').getByRole('button',{name:'Ещё',exact:true}).click();await page.locator('.v2-child-more-grid').getByRole('button',{name:new RegExp(name)}).click();}
}
test('original navigation opens photos and games directly and preserves the new home',async({page},info)=>{
 await page.route('http://localhost:8010/**',r=>r.continue({url:r.request().url().replace(':8010',':8011')}));
 await page.goto('/app');await page.getByRole('button',{name:'Ребёнок',exact:true}).click();
 await page.getByLabel('Логин ребёнка',{exact:true}).fill('alikhan');await page.getByLabel('PIN-код',{exact:true}).fill('1234');
 await page.getByRole('button',{name:'Начать заниматься',exact:true}).click();
 await expect(page.locator('.child-room-home')).toBeVisible();
 await expect(page.locator('.room-doors button')).toHaveCount(3);
 await expect(page.locator('.room-guide')).toBeVisible();
 await expect(page.locator('.child-bottom-nav,.child-hub')).toHaveCount(0);
 await navigate(page,'Мой мир');await expect(page.getByRole('heading',{name:'Мой мир',exact:true})).toBeVisible();
 await expect(page.locator('.child-hub')).toHaveCount(0);
 await page.screenshot({path:info.outputPath('original-world.png'),fullPage:true});
 await navigate(page,'Занятия');await expect(page.getByRole('heading',{name:'Выбери игру',exact:true})).toBeVisible();
 await navigate(page,'Достижения');await expect(page.locator('.v2-achievement-hero')).toBeVisible();
 await navigate(page,'Навыки');await expect(page.getByRole('heading',{name:"Карта навыков",exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Настройки',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Мой питомец',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await navigate(page,'Главная');await expect(page.locator('.room-guide')).toBeVisible();
});
