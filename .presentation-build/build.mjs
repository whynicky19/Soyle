import fs from 'node:fs/promises';
import {Presentation,PresentationFile} from '@oai/artifact-tool';
import sharp from 'sharp';
import {finalizePresentation} from '/Users/whynicky/.codex/plugins/cache/openai-primary-runtime/presentations/26.1015.12040/skills/presentations/container_tools/artifact_tool_utils.mjs';
const root='/Users/whynicky/Desktop/Projects/Soyle';
const skill='/Users/whynicky/.codex/plugins/cache/openai-primary-runtime/presentations/26.1015.12040/skills/presentations';
const out=root+'/output/product', build=root+'/.presentation-build', assets=root+'/presentation_assets';
const font='Helvetica Neue';
const C={bg:'#F7F7F2',ink:'#1D2421',muted:'#626E6A',blue:'#2F6BC4',navy:'#142B48',pale:'#EAF1FB',mint:'#DDEDE3',green:'#173B32',coral:'#EF967E',white:'#FFFFFF',line:'#CDD5D0'};
const p=Presentation.create({slideSize:{width:1600,height:900}});
// Crops preserve actual UI pixels, removing the development header and unused viewport space.
const crops={
 'exercise-focus': ['exercise.png', {left:8,top:126,width:670,height:515}],
 'aac-focus':['aac.png',{left:12,top:76,width:662,height:678}],
 'plan-focus':['adaptive-plan.png',{left:16,top:72,width:654,height:675}],
 'goals-focus':['parent-goals-top.png',{left:16,top:72,width:654,height:660}],
 'home-focus':['child-home.png',{left:0,top:64,width:686,height:690}],
 'parent-focus':['parent-home.png',{left:16,top:72,width:654,height:690}],
 'catalog-focus':['child-catalog.png',{left:12,top:64,width:662,height:690}],
 'preferences-focus':['parent-goals.png',{left:16,top:482,width:654,height:320}],
 'reason-focus':['adaptive-plan.png',{left:38,top:264,width:610,height:282}],
 'flow-goal':['parent-goals-top.png',{left:38,top:401,width:610,height:170}],
 'flow-exercise':['exercise.png',{left:25,top:409,width:636,height:190}],
 'flow-plan':['adaptive-plan.png',{left:38,top:264,width:610,height:180}],
 'admin-focus':['admin-review.png',{left:34,top:132,width:620,height:512}],
};
for(const [name,[src,rect]] of Object.entries(crops)) await sharp(assets+'/'+src).extract(rect).png().toFile(assets+'/'+name+'.png');
const imageCache=new Map();
async function img(s,name,x,y,w,h,{fit='contain',round=0,rotation=0}={}){
 const path=assets+'/'+name; if(!imageCache.has(path)) imageCache.set(path,await fs.readFile(path)); const b=imageCache.get(path);
 const a=s.images.add({blob:b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),contentType:name.endsWith('.webp')?'image/webp':'image/png',alt:'Söyle: '+name,fit,position:{left:x,top:y,width:w,height:h},...(round?{geometry:'roundRect',borderRadius:round}:{})}); if(rotation)a.rotation=rotation;return a;
}
function txt(s,t,x,y,w,h,size=30,bold=false,color=C.ink){const a=s.shapes.add({geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});a.text=t;a.text.style={typeface:font,fontSize:size,bold,color,verticalAlignment:'top'};a.text.insets=0;return a;}
function line(s,x,y,w,h=0,color=C.line,width=1.5,arrow=false){return s.shapes.add({geometry:'connector',kind:'straight',position:{left:x,top:y,width:w,height:h},line:{fill:color,width},...(arrow?{tail:{type:'arrow',width:'med',length:'med'}}:{})});}
function rect(s,x,y,w,h,fill,stroke='none',radius=0){return s.shapes.add({geometry:radius?'roundRect':'rect',position:{left:x,top:y,width:w,height:h},fill,line:{fill:stroke,width:stroke==='none'?0:1.5},...(radius?{borderRadius:radius}:{})});}
function base(n,section,dark=false){const s=p.slides.add();s.background.fill=dark?C.navy:C.bg;txt(s,'Söyle',64,30,180,42,28,true,dark?C.white:C.blue);txt(s,section.toUpperCase(),260,38,1000,26,17,true,dark?'#A7BEDA':C.muted);txt(s,String(n).padStart(2,'0'),1480,36,55,28,18,false,dark?'#A7BEDA':C.muted);line(s,64,837,1472,0,dark?'#36506C':C.line,1);txt(s,'ПРОДУКТОВАЯ ПРЕЗЕНТАЦИЯ',64,853,720,23,13,true,dark?'#A7BEDA':C.muted);txt(s,'18 ОКТЯБРЯ 2026',1290,853,250,23,13,false,dark?'#A7BEDA':C.muted);return s;}
function title(s,t,{x=64,y=112,w=1440,h=150,size=58,dark=false}={}){txt(s,t,x,y,w,h,size,true,dark?C.white:C.ink);}
function note(s,sources,body=''){s.speakerNotes.text=body+'\n\nИсточники и границы: '+sources+'\nСрез локальной кодовой базы: 18.10.2026. Все скриншоты сняты в локальном демо на отдельной SQLite-базе. Демо-профили не являются результатами реальных детей.';}
function label(s,t,x,y,w=500,color=C.blue){txt(s,t,x,y,w,32,19,true,color);}
function stage(s,n,t,body,x,y,w=250,dark=false){label(s,n,x,y,w,dark?C.coral:C.blue);txt(s,t,x,y+46,w,90,31,true,dark?C.white:C.ink);txt(s,body,x,y+152,w,130,24,false,dark?'#BED0E1':C.muted);}
// 01: hero editorial with real product interfaces.
let s=base(1,'Human-centered technology');
await img(s,'soyle-icon.png',64,125,90,90);
txt(s,'Söyle.',64,235,700,140,112,true,C.blue);
txt(s,'Every voice\nmatters.',64,380,690,220,77,true);
txt(s,'Домашняя практика и доступная\nкоммуникация для ребёнка и семьи',68,650,710,92,31,false,C.muted);
await img(s,'home-focus.png',795,166,370,600,{rotation:-4});
await img(s,'aac-focus.png',1115,270,395,500,{rotation:4});
label(s,'РАБОТАЮЩИЙ ЛОКАЛЬНЫЙ MVP',800,766,700);
note(s,'README.md; frontend/components/SoyleApp.tsx; frontend/public/soyle-icon.png; child-home.png, aac.png.','Söyle организует домашнюю практику и коммуникацию. Приложение не ставит диагноз и не заменяет логопеда. Визуальная система сохраняет синий цвет актуального приложения и добавляет тёплый фон, мятный и коралловый акценты.');
// 02: photograph and human problem.
s=base(2,'Проблема');
await img(s,'family-hero.webp',64,112,775,669,{fit:'cover'});
title(s,'Развитие общения\nпродолжается дома',{x:900,y:120,w:630,h:180,size:57});
label(s,'РОДИТЕЛЬ',902,355);txt(s,'Какие задания выбрать\nи сколько помощи дать?',902,393,600,95,31);
label(s,'СПЕЦИАЛИСТ',902,516);txt(s,'Что происходит с практикой\nмежду встречами?',902,554,600,90,31);
label(s,'РЕБЁНОК',902,675);txt(s,'Как сказать «помоги»,\n«не хочу» или «перерыв»?',902,714,600,90,31);
note(s,'README.md; backend/app/practice_goals.py; frontend/components/SoyleApp.tsx; ASHA AAC Practice Portal https://www.asha.org/practice-portal/professional-issues/augmentative-and-alternative-communication/; family-hero.webp из frontend/public/landing/.','Потребности описаны как продуктовые задачи, а не как результаты пользовательского исследования. Изображение из существующих материалов проекта служит иллюстрацией домашней практики, а не фотографией участника пилота. Частоту и цели практики определяют семья и специалист с учётом состояния ребёнка.');
// 03: fragmented chain, native diagram.
s=base(3,'Контекст практики');title(s,'Между заданием и обратной связью\nлегко потерять контекст');
const chain=[['01','Специалист','Определяет цель'],['02','Задание','Нужно понять инструкцию'],['03','Родитель','Организует практику'],['04','Ребёнок','Отвечает доступным способом'],['05','Обратная\nсвязь','Нужен контекст помощи']];
chain.forEach((a,i)=>{let x=64+i*302;stage(s,...a,x,350,256);if(i<4)line(s,x+255,420,40,0,i===1||i===3?C.coral:C.blue,3,true);});
line(s,64,700,1472);txt(s,'Теряются детали: что выбрано, как выполнено,\nгде понадобилась помощь и что попробовать дальше.',64,732,1420,88,35,false,C.muted);
note(s,'Продуктовый анализ текущих процессов; backend/app/practice_goals.py; backend/app/main.py sessions/progress.','Схема показывает потенциальные разрывы процесса, а не измеренную частоту проблем. Специалист пока участвует вне приложения.');
// 04: dark solution emphasis.
s=base(4,'Решение',true);title(s,'Одна система.\nОбщая цель.',{w:770,size:80,dark:true});
await img(s,'parent-focus.png',875,120,590,590);
label(s,'РЕБЁНОК',67,409,400,C.coral);txt(s,'Короткие задания и AAC',67,447,720,60,35,true,C.white);
label(s,'РОДИТЕЛЬ',67,545,400,C.coral);txt(s,'Цель, наблюдения, следующий шаг',67,583,760,60,33,true,C.white);
label(s,'СПЕЦИАЛИСТ',67,680,500,C.coral);txt(s,'Сопровождение вне приложения',67,718,760,58,32,true,C.white);
txt(s,'Цифровой кабинет специалиста — следующий этап',876,744,620,58,23,false,'#BED0E1');
note(s,'frontend/components/SoyleApp.tsx; frontend/components/GoalsAndPractice.tsx; backend/app/security.py get_current_user.','В текущей версии работают ребёнок, родитель и администратор. Вход specialist запрещён сервером. Общая цель описывает продуктовую концепцию, не реализованный трёхсторонний workflow.');
// 05: ecosystem, no fabricated specialist screen.
s=base(5,'Экосистема');title(s,'Семья уже работает в продукте.\nСпециалист пока остаётся вне него',{size:52});
await img(s,'catalog-focus.png',64,290,520,490);
await img(s,'parent-focus.png',604,360,400,420);
label(s,'CHILD',65,264,300);label(s,'PARENT',605,321,300);
line(s,1050,300,0,482);label(s,'SPECIALIST',1102,322,400,C.muted);
txt(s,'Отдельного\nкабинета пока нет',1102,375,410,120,42,true);
txt(s,'Личные рекомендации\nи связь с семьёй проходят\nвне Söyle.',1102,532,400,145,29,false,C.muted);
txt(s,'План: назначения, доступ\nк закреплённым детям\nи согласованная обратная связь.',1102,685,400,115,25,false,C.blue);
note(s,'frontend/components/SoyleApp.tsx type Screen; backend/app/security.py; backend/app/main.py legacy specialist routes.','Не создавался вымышленный интерфейс специалиста. Будущий кабинет отмечен текстом как план. Админ-панель не подменяет кабинет логопеда.');
// 06: large real exercise + narrow callouts.
s=base(6,'Детский опыт');title(s,'Один шаг. Понятный выбор.',{size:62,h:85});
await img(s,'exercise-focus.png',64,255,965,530);
label(s,'01 / ПОСЛУШАТЬ',1100,268,420);txt(s,'Аудиоинструкция\nи повтор',1100,307,430,92,32,true);
label(s,'02 / ПОКАЗАТЬ',1100,454,420);txt(s,'Ответ касанием\nпо изображению',1100,493,430,92,32,true);
label(s,'03 / ПОЛУЧИТЬ ПОДДЕРЖКУ',1100,640,460);txt(s,'Подсказка, перерыв\nи отказ без штрафа',1100,682,430,90,30,true);
note(s,'frontend/components/SoyleApp.tsx SensoryGame, focus-safety-actions; frontend/lib/exerciseRuntime.ts; exercise.png.','Скриншот реального задания «Домашние животные». После ответа интерфейс даёт обратную связь и позволяет продолжить. Подсказки и статус попытки регистрируются отдельно. Упражнение относится к демонстрационному каталогу, не к методически утверждённому курсу.');
// 07 parent editorial layered.
s=base(7,'Родительский кабинет');
title(s,'Каждый шаг\nвиден семье',{w:670,h:230,size:73});
txt(s,'Домашняя цель задаёт смысл.\nИстория показывает участие\nи использованную помощь.',68,408,640,150,34,false,C.muted);
label(s,'НАБЛЮДЕНИЯ ОТДЕЛЬНО ОТ ИГРОВОГО БАЛЛА',68,647,660);
txt(s,'Предпочтения ребёнка влияют\nна следующий подготовленный план.',68,693,620,100,29);
await img(s,'goals-focus.png',810,128,650,578);
await img(s,'preferences-focus.png',760,585,725,220);
note(s,'frontend/components/GoalsAndPractice.tsx; backend/app/practice_goals.py; backend/app/adaptive_planner.py; frontend/components/FamilyPractice.tsx.','Родитель выбирает одну из шести домашних целей, указывает исходное наблюдение и помощь, меняет статус цели, сохраняет наблюдения, отмечает предпочтительные и исключённые задания, подготавливает план и читает причины. Цели родительские, не профессиональные назначения. История цифровых заданий не равна клинической динамике.');
// 08 content governance editable diagram.
s=base(8,'Специалист и управление');title(s,'Контент проходит проверку.\nКабинет специалиста ещё предстоит создать',{size:52});
await img(s,'admin-focus.png',64,299,720,414);
label(s,'РЕАЛЬНЫЙ ЭКРАН ПРОВЕРКИ ЧЕРНОВИКА',65,739,750);
label(s,'УПРАВЛЕНИЕ ВЕРСИЯМИ',878,303,650);
txt(s,'Черновик и предпросмотр',878,351,650,60,32,true);
txt(s,'Проверки перед публикацией',878,424,650,60,32,true);
txt(s,'История решений по версии',878,497,650,60,32,true);
line(s,878,590,650);
txt(s,'13 демозаданий доступны локально.\nПри строгой методической фильтрации\nкаталог пуст: независимое одобрение\nпока не подтверждено.',878,632,650,170,28,false,C.muted);
note(s,'frontend/components/ContentReviewWorkspace.tsx; frontend/components/SoyleApp.tsx AdminScreen; backend/app/exercise_engine.py published_exercise_rows, publish_version, submit_content_review; backend/app/security.py.','Админ имеет черновики, предварительный просмотр, формы проверок и контроль публикации. Специалист не может войти. Локальная проверка отдельной seeded SQLite: 13 доступных демозаданий, 0 при SOYLE_ALLOW_UNREVIEWED_DEMO_CONTENT=false. Статус review_status=approved у старых демоверсий не подтверждает независимую методическую проверку. Реальный экран ContentReviewWorkspace снят после разрешённого входа в демо-админ-панель. Администратор может выполнять техническую проверку; методическая, accessibility и release-проверки требуют отдельных полномочий. Решения не менялись.');
// 09 explainable adaptation.
s=base(9,'Персонализация',true);title(s,'Адаптация, которую\nможно объяснить',{size:66,w:1160,h:180,dark:true});
txt(s,'8',64,322,220,150,125,true,C.coral);txt(s,'последних завершённых\nрезультатов по навыку',235,356,660,90,31,false,C.white);
txt(s,'1.0—2.0',64,515,700,100,76,true,C.white);txt(s,'веса: новые результаты влияют сильнее',67,622,790,60,28,false,'#BED0E1');
await img(s,'reason-focus.png',914,311,620,300);
const algo=['Результаты','Точность и помощь','Правила уровня','Ротация','Задание с причиной'];
algo.forEach((t,i)=>{let x=64+i*300;txt(s,t,x,734,270,60,23,true,C.white);if(i<4)line(s,x+267,752,23,0,C.coral,2,true);});
txt(s,'Детерминированные правила. Без LLM и внешнего AI API.',914,644,610,75,27,false,'#BED0E1');
note(s,'backend/app/adaptive_planner.py RULES_VERSION p2.2-weighted-rotation-1, _evidence, _difficulty, create_plan; backend/app/main.py; frontend/components/GoalsAndPractice.tsx.','Окно до 8 завершённых результатов с response_owner=child и support_context independent/caregiver_supported. Веса линейно от 2.0 у нового до 1.0 у старого. Отдельно взвешиваются точность и самостоятельность. Уровень 2: минимум 3 результата, точность ≥76%, минимум 3 самостоятельных завершения, самостоятельность ≥50%. Уровень 3: 6 результатов, ≥88%, минимум 3 самостоятельных завершения, ≥80%. Эти пороги инженерные, клиническая валидность не доказана. Отказ, перерыв и technical_error не являются ошибками. Последнее бытовое with_help консервативно снижает уровень. Новые и реже назначенные упражнения приоритетны, предпочтения учитываются, исключения фильтруются. Сохраняются версии, параметры и причины. Быстрый план на 3/5/10 минут использует отдельную ротацию, не все пороги этого планировщика.');
// 10 AAC prominent.
s=base(10,'Коммуникация AAC');title(s,'Быть услышанным\nможно уже сейчас',{w:750,h:200,size:68});
txt(s,'«Помоги». «Стоп». «Перерыв».',64,386,720,110,43,true,C.blue);
txt(s,'Быстрые сообщения доступны\nотдельно от занятия.\n\nКарточки помогают собрать\nи озвучить собственную фразу.',68,527,690,230,32,false,C.muted);
await img(s,'aac-focus.png',864,118,660,670);
note(s,'frontend/components/SoyleApp.tsx PhraseGame freeMode, quickCommunicationMessages; frontend/lib/aacGrammar.ts; backend/app/aac_grammar.py; backend/app/database.py aac_cards; https://www.asha.org/practice-portal/professional-issues/augmentative-and-alternative-communication/.','AAC означает альтернативную и дополнительную коммуникацию. В проекте есть свободный режим без оценки, быстрые сообщения, карточки, избранное и озвучивание. В seeded базе 64 базовые карточки. Русская грамматика ограничена поддерживаемыми шаблонами. Наличие функций не доказывает индивидуальную пригодность системы AAC: подбор и оценка доступности требуют специалиста.');
// 11 full scenario.
s=base(11,'Полный процесс');title(s,'От домашней цели\nк следующему занятию',{size:62});
const flow=[['01','Цель','Узнавать знакомые\nпредметы'],['02','Подбор','Активная цель, история\nи разрешённый каталог'],['03','Практика','Послушать слово\nи выбрать картинку'],['04','Результат','Ответ, помощь\nи статус попытки'],['05','Новый план','Обновить подбор\nс учётом истории']];
flow.forEach((a,i)=>{stage(s,...a,64+i*302,332,258);if(i<4)line(s,322+i*302,405,36,0,C.blue,2,true);});
await img(s,'flow-goal.png',66,642,440,160);
await img(s,'flow-exercise.png',582,642,440,160);
await img(s,'flow-plan.png',1098,642,436,160);
note(s,'backend/app/practice_goals.py; backend/app/adaptive_planner.py; backend/app/main.py adaptive-plans, learning-sessions, sessions; frontend/components/GoalsAndPractice.tsx.','Реалистичный сценарий текущей реализации. В демонстрации создана родительская цель на тестовых данных. Специалист может рекомендовать цель вне платформы. Новый результат влияет на следующий сгенерированный план, а не самовольно изменяет текущий. Предпросмотр взрослого исключается из детского результата. Не представлены вымышленные достижения ребёнка.');
//12 architecture dark editable.
s=base(12,'Архитектура',true);title(s,'Компактная архитектура\nс локальной логикой адаптации',{size:59,dark:true});
const ax=445,aw=1088;
label(s,'КЛИЕНТ',64,325,300,C.coral);rect(s,ax,300,aw,100,'#203C5C');txt(s,'Next.js 16 / React 19 / TypeScript',ax+28,323,1000,46,34,true,C.white);
line(s,980,404,0,55,C.coral,3,true);txt(s,'JSON API · HttpOnly-cookie · CSRF',64,454,780,45,25,false,'#BED0E1');
label(s,'ПРИЛОЖЕНИЕ',64,535,340,C.coral);rect(s,ax,478,aw,150,'#203C5C');txt(s,'FastAPI / Python',ax+28,496,900,50,34,true,C.white);txt(s,'Авторизация     Упражнения     Цели     Планировщик правил',ax+28,561,1030,45,26,false,'#BED0E1');
line(s,980,630,0,50,C.coral,3,true);
label(s,'ДАННЫЕ',64,714,300,C.coral);rect(s,ax,681,aw,112,'#203C5C');txt(s,'SQLite локально / PostgreSQL для развёртывания',ax+28,701,1030,42,31,true,C.white);txt(s,'SQL и версионируемые миграции · Статические изображения и аудио',ax+28,752,1010,34,22,false,'#BED0E1');
note(s,'frontend/package.json; frontend/lib/api.ts; backend/requirements.txt; backend/app/main.py; database.py; migrations.py; security.py; adaptive_planner.py; tts_library.py.','Актуальный стек, не Nuxt/Vue и не Flutter. Схема показывает реализованные компоненты, не доказанную production-готовность. В тестовой базе 36 прикладных таблиц и схема миграции 16. Предпросмотр камеры MediaPipe остаётся внутренним прототипом, исключённым из публичного каталога. Адаптивная логика не отправляет данные внешней AI API. Подготовленное аудио и Web Speech API обслуживают озвучку, возможности зависят от устройства и браузера.');
//13 responsible boundaries.
s=base(13,'Безопасность');title(s,'Защита данных реализована.\nГотовность к пилоту требует проверки',{size:56});
label(s,'ЕСТЬ В КОДЕ',64,325,680,C.green);label(s,'ДО РЕАЛЬНОГО ПИЛОТА',876,325,650,C.blue);line(s,812,320,0,460);
const left=['HttpOnly-cookie и CSRF-защита','Argon2 и разграничение ролей','Изоляция данных семей и согласия','Экспорт, удаление и журнал действий'];
left.forEach((t,i)=>{txt(s,t,65,386+i*83,700,67,30,true);line(s,65,451+i*83,680,0,C.line,1);});
const right=['Независимая проверка контента','Юридическая проверка детских данных','Реальные устройства и доступность','Проверка развёртывания и восстановления'];
right.forEach((t,i)=>txt(s,t,877,386+i*83,650,73,29));
note(s,'backend/app/security.py; backend/app/main.py; frontend/lib/api.ts; backend/tests/test_workflows.py; test_p1.py; test_p21.py; SOYLE_ALALIA_AND_PLATFORM_AUDIT_2026-10-16.md; SOYLE_UI_UX_AUDIT_2026-10-16.md.','Контроли реализованы, но это не юридическое заключение, сертификация или доказательство полной безопасности. Текущий код уже исключает adult_preview из сохранённых детских результатов и содержит миграции/readiness; старые аудиты описывают исторический срез и не должны переноситься буквально. Русский — единственный включённый интерфейсный язык. Нужна независимая методическая проверка и работа с доступностью на реальных устройствах.');
//14 quantitative inventory.
s=base(14,'Масштаб MVP');title(s,'Работающий MVP.\nСледующий рубеж — безопасный пилот',{size:59});
const metrics=[['13','доступных демозаданий'],['64','базовые AAC-карточки'],['6','шаблонов домашних целей'],['3','уровня адаптивной сложности'],['101','автотест прошёл сейчас'],['1','включённый язык: русский']];
metrics.forEach(([n,t],i)=>{const x=64+(i%3)*503,y=326+Math.floor(i/3)*231;txt(s,n,x,y,450,126,104,true,i===4?C.green:C.blue);txt(s,t,x+2,y+132,445,66,28,false,C.muted);});
txt(s,'Сейчас: внутреннее демо. Реальный пилот пока не готов.',65,788,1460,34,23,true,C.green);
note(s,'Локальная инвентаризация 18.10.2026: published_exercise_rows; aac_cards; practice_goal_templates; adaptive_planner.py; frontend/lib/i18n.ts. pytest -q: 52 passed; npm test: 49 passed.','13 заданий = 10 guided_aac и 3 auditory_choice в локальном деморежиме. Не включены 11 черновиков и 6 камерных прототипов. Базовые AAC-карточки посчитаны в отдельной seeded SQLite-базе после миграций. Три уровня заданы правилами, реальные параметры зависят от версии контента. 101 = 52 backend + 49 frontend unit/regression, не E2E. Тесты не доказывают клиническую эффективность или production-готовность. При строгом фильтре методической публикации доступных заданий 0.');
//15 business model architecture.
s=base(15,'Бизнес-модель',true);title(s,'Подписка центра\nс доступом для семей',{w:1000,size:72,dark:true});label(s,'ПРЕДЛАГАЕМАЯ МОДЕЛЬ B2B2C',65,303,1100,C.coral);
const biz=[['Центр','Руководитель выбирает\nи оплачивает платформу'],['Söyle','Подписка на организацию\nи активные профили'],['Специалист','Ведёт домашнюю практику\nпосле запуска кабинета'],['Семья','Получает задания\nи доступ к коммуникации']];
biz.forEach((a,i)=>{let x=64+i*377;txt(s,a[0],x,398,330,75,42,true,C.white);txt(s,a[1],x,497,330,110,27,false,'#BED0E1');if(i<3)line(s,x+330,431,32,0,C.coral,2,true);});
line(s,64,648,1472,0,'#36506C');label(s,'ПОЧЕМУ ЧЕРЕЗ ЦЕНТР',65,678,670,C.coral);txt(s,'Один плательщик и сопровождение\nсемьи специалистом',65,717,700,75,27,false,'#BED0E1');label(s,'ЧТО ПРЕДСТОИТ ПРОВЕРИТЬ',842,678,680,C.coral);txt(s,'Долгие продажи и готовность платить.\nСемейный B2C возможен позднее.',842,717,690,75,27,false,'#BED0E1');
note(s,'Бизнес-гипотеза на основе продуктовой архитектуры.','Предложение: B2B SaaS, распространяемый по модели B2B2C. Пользуются ребёнок, родитель и будущий специалист. Решение и оплата у владельца/руководителя центра. Ценность подписки предполагается за повторяющуюся организацию домашней практики, поддержку и обновление проверенного контента. В продукте нет коммерческого биллинга, мультиорганизационного кабинета и работающего специалистского workflow. Для запуска нужны организация/tenant, назначения, согласия на обмен и коммерческие функции.');
//16 economics visually explicit scenario.
s=base(16,'Монетизация и экономика');title(s,'Выручка зависит от числа центров\nи подтверждённой ценности подписки',{size:54});
label(s,'СЦЕНАРИИ, НЕ ПРОДАЖИ И НЕ УТВЕРЖДЁННЫЕ ТАРИФЫ',65,287,1460,C.blue);
txt(s,'Организации × платёж = MRR',64,340,1470,85,56,true);
const econ=[['10','20 000 ₸','200 000 ₸'],['30','35 000 ₸','1 050 000 ₸'],['60','50 000 ₸','3 000 000 ₸']];
econ.forEach((a,i)=>{let y=449+i*91;txt(s,a[0]+' центров',64,y,350,65,32);txt(s,'× '+a[1]+' / мес.',450,y,510,65,32);txt(s,'= '+a[2],1000,y,520,65,40,true,i===2?C.green:C.blue);line(s,64,y+69,1472,0,C.line,1);});
txt(s,'Затраты: инфраструктура и хранение, разработка, методическая проверка,\nподдержка и привлечение центров. MRR здесь не означает прибыль.',65,750,1450,76,25,false,C.muted);
note(s,'Сценарная модель автора. Рыночный контекст: https://logoped.dzeytova.kz/ (прайс 7 000 ₸ за 30 минут); https://www.logopedy.kz/ceny/ (от 5 100 ₸ за занятие), проверено поиском 18.10.2026.','Все числа подписки гипотетические и требуют интервью о готовности платить. Сценарии различаются одновременно количеством организаций и средним платежом, это не прогноз роста и не фиксированная лестница тарифов. Малый кабинет: гипотеза 20 тыс. ₸, средний центр 35 тыс. ₸, организация с несколькими специалистами 50 тыс. ₸ в месяц. Прайсы логопедических занятий дают контекст расходов семьи, не оценку стоимости SaaS, размера рынка или готовности центра платить. MRR = 10×20000=200000; 30×35000=1050000; 60×50000=3000000. Разовые внедрения, скидки, налоги, churn, CAC и себестоимость не моделировались. B2B плюс: понятный плательщик, профессиональное сопровождение; минус: длиннее продажи и требования к доступам. B2B2C плюс: доступ семьям через доверенный центр; риск: зависимость активности от специалиста. B2C возможен позднее, но требует поддержки семей и отдельных затрат привлечения.');
//17 route deployment.
s=base(17,'Внедрение');title(s,'Сначала готовность к пилоту.\nЗатем проверка модели в центрах',{size:61});
const road=[['01','Подготовка','Методика, данные,\nустройства и доступность'],['02','Специалист','Назначения, согласия\nи доступ к детям'],['03','Пилот','Один или несколько\nцентров после допуска'],['04','Обратная связь','Удобство семьи, время\nспециалиста, возвраты'],['05','Внедрение','Готовность платить,\nподдержка и расширение']];
road.forEach((a,i)=>{let x=64+i*302;stage(s,...a,x,340,255);if(i<4)line(s,x+258,412,35,0,C.blue,2,true);});
line(s,64,680,1472);txt(s,'Критерий перехода',65,720,520,65,36,true,C.green);txt(s,'Согласованные проверки и наблюдаемые результаты этапа.\nПартнёрства и пилоты пока не подтверждены.',590,722,940,88,30,false,C.muted);
note(s,'План развития, не обязательства и не состоявшиеся партнёрства. README.md privacy restrictions; текущие ограничения specialist role, строгая фильтрация контента.','Для пилота сначала нужен формальный допуск после методической, юридической, технической проверки и проверки доступности. В пилоте следует измерять выполнимость сценариев, корректность сохранения помощи и отказов, трудозатраты взрослого, использование семей и проблемы поддержки. Речевые/клинические эффекты требуют отдельного корректного исследования. Готовность платить и принятие B2B2C не доказаны. Казахскую локализацию можно включать после самостоятельной языковой и методической проверки.');
//18 mission calm close.
s=base(18,'Every voice matters',true);
await img(s,'soyle-icon.png',65,125,104,104);
title(s,'Технологии,\nкоторые помогают\nбыть услышанным',{x:64,y:267,w:960,h:350,size:76,dark:true});
await img(s,'aac-focus.png',1085,190,410,510,{rotation:3});
txt(s,'Söyle поддерживает коммуникацию\nи спокойную домашнюю практику\nрядом с семьёй и специалистом.',68,661,990,120,32,false,'#BED0E1');
txt(s,'Вспомогательная система. Не заменяет логопеда или медицинскую помощь.',68,797,1460,28,20,false,'#BED0E1');
note(s,'README.md; подтверждённые функции, ограничения и бизнес-гипотезы в слайдах 5, 8, 13–17.','Söyle — вспомогательная система, не медицинская помощь, не диагностика и не лечение алалии. Доказательства клинической эффективности отсутствуют. Цель продукта — доступная коммуникация, организация практики и понятная поддержка семьи.');
await fs.writeFile(build+'/slides.json',JSON.stringify(p.slides.items.map((s,i)=>({number:i+1,notes:s.speakerNotes.text})),null,2));
await (await PresentationFile.exportPptx(p)).save(build+'/draft.pptx');
console.log('DRAFT_EXPORTED');
for(let i=0;i<p.slides.items.length;i++){
 try{const b=await p.export({slide:p.slides.items[i],format:'png',scale:1});await fs.writeFile(build+`/previews/slide-${String(i+1).padStart(2,'0')}.png`,new Uint8Array(await b.arrayBuffer()));console.log('RENDER',i+1);}catch(e){console.log('RENDER_ERROR',i+1,e.message);throw e;}
}
// PDF exported from finalized PPTX through local office converter.
const result=await finalizePresentation({workspaceDir:root,candidatePath:build+'/draft.pptx',finalPath:out+'/Soyle_Product_Presentation_v3.pptx',pythonExecutable:'/Users/whynicky/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3',integrityValidatorPath:skill+'/container_tools/inspect_presentation_package_integrity.py',layoutValidatorPath:skill+'/container_tools/inspect_presentation_layout_geometry.py',layoutArgs:['--expected-slide-size-emu','15240000,8572500','--validate-bullet-geometry','--validate-heading-fit'],explicitTotalSlideCount:18,requiredNativeTableOwnerSlides:[],requiredNativeChartOwnerSlides:[],fontPolicy:{basis:'design',families:[font]},verifyArtifactToolImport:true,receiptPath:build+'/validation-v3.json'});console.log(JSON.stringify(result));
