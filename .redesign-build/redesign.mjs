import {deck,slide,head,text,tag,image,screen,notes,render,shape,dot,ln,C,F,PresentationFile,build,out,assets,root,fs,prepare} from './common.mjs';
import {applyPresentationChartFont} from '/Users/whynicky/.codex/plugins/cache/openai-primary-runtime/presentations/26.1015.12040/skills/presentations/container_tools/artifact_tool_utils.mjs';
await prepare(); const p=deck();let s;
const code='backend/app/adaptive_planner.py; backend/app/practice_goals.py; frontend/components/GoalsAndPractice.tsx';
function n(s,body,sources){notes(s,body+'\nИсточники: '+sources);}
function chart(s,type,cfg){let c=s.charts.add(type,cfg);applyPresentationChartFont(c,{fontFamily:F.body});return c;}
const axis={textStyle:{fontSize:23,fill:C.grey},line:{fill:C.line,width:1},majorGridlines:{fill:C.line,width:1}};
// 01 · launch hero. Three real UI planes, a central product, no split layout.
s=slide(p,C.night);tag(s,'BEYOND WORDS',75,43,800,C.coral,23);tag(s,'ДОМАШНЯЯ ПРАКТИКА / AAC',1280,48,600,C.soft,20);
head(s,'SÖYLE',60,95,1800,310,260,C.white);
await screen(s,'aac-quick.png',80,610,740,184,{rotation:-7,dark:true});
await screen(s,'home-hero.png',315,420,1300,522,{dark:true,r:34});
await screen(s,'exercise-choice.png',1358,772,475,133,{rotation:7,dark:true});
text(s,'Технологии, которые помогают быть услышанным',78,997,1770,57,36,C.soft);
n(s,'Söyle объединяет домашнюю практику и поддерживаемую коммуникацию. На реальных экранах: детский главный экран, быстрые AAC-сообщения и выбор изображения. Кадры не перерисованы.','frontend/components/SoyleApp.tsx; child-home-hi.png; aac-hi.png; exercise-hi.png.');
// 02 · photograph-led editorial, one idea and two product needs.
s=slide(p,C.mint);tag(s,'ПРАКТИКА МЕЖДУ ВСТРЕЧАМИ',75,45,1400,C.ink,22);
head(s,'Общение продолжается\nпосле занятия',75,117,1760,240,104);
await image(s,'family-hero.webp',75,408,1110,607,{fit:'cover',round:28});
text(s,'Дома нужен\nпонятный следующий шаг.',1270,450,575,155,47,C.ink,true);
ln(s,1270,644,575,0,'#A2C7B7',2);
text(s,'Родителю — что попробовать\nи как поддержать.\n\nРебёнку — доступный способ\nвыразить потребность.',1270,687,575,290,33,C.ink);
n(s,'Продуктовые задачи, не подтверждённые количественным пользовательским исследованием. Частоту, длительность и цели выбирают с учётом состояния ребёнка и рекомендаций специалиста. Изображение — существующий материал лендинга, не фотография участника пилота.','README.md; frontend/components/SoyleApp.tsx; frontend/public/landing/family-hero.webp; ASHA AAC https://www.asha.org/practice-portal/professional-issues/augmentative-and-alternative-communication/.');
// 03 · spatial ecosystem, current family core and professional context.
s=slide(p,C.paper);tag(s,'ОДНА СИСТЕМА ПРАКТИКИ',75,43,1400);head(s,'Ребёнок. Семья. Общая цель.',75,107,1770,150,86);
ln(s,435,462,53,0,C.blue,3,true);ln(s,1435,462,44,0,C.blue,3,true);
await screen(s,'aac-whole.png',500,344,920,522,{r:30});
head(s,'РЕБЁНОК',75,398,360,82,43,C.blue);text(s,'Слушает, выбирает,\nсообщает потребности.',75,505,360,150,32);
head(s,'РОДИТЕЛЬ',1500,398,350,82,43,C.blue);text(s,'Задаёт цель\nи отмечает помощь.',1500,505,350,150,32);
ln(s,960,883,0,42,C.coral,3,false,true);
tag(s,'СПЕЦИАЛИСТ',713,944,600,C.grey,22);text(s,'Рекомендует цели и сопровождает семью вне приложения',475,990,1280,60,29,C.grey);
n(s,'Семейный цифровой контур уже реализован. Специалист задаёт профессиональный контекст вне платформы. Схема не означает, что кабинет специалиста или онлайн-назначения уже работают.','frontend/components/SoyleApp.tsx; GoalsAndPractice.tsx; backend/app/security.py get_current_user блокирует specialist.');
// 04 · panoramic real product stage, almost full canvas.
s=slide(p,C.paper);tag(s,'SÖYLE EXPERIENCE',75,42,1300);head(s,'Всё начинается с одного шага',75,100,1770,145,83);
await screen(s,'home-hero.png',85,298,1750,703,{r:36});
// A tightly cropped primary scene fills the slide; lower canvas is intentionally cropped.
shape(s,0,1020,1920,60,C.paper);text(s,'Короткое занятие или сообщение — выбор остаётся у ребёнка.',77,1022,1800,46,29,C.grey);
n(s,'Реальная главная ребёнка в desktop-размере. Отображаются длительности 3/5/10 минут, начало занятия, прямой доступ к AAC и подборка заданий. Крупный кадр показывает основные действия без вымышленных элементов.','frontend/components/SoyleApp.tsx ChildHomeScreen; child-home-hi.png.');
// 05 · exploded real interface. Main screen 75% + three magnified action fragments.
s=slide(p,C.night);tag(s,'ДЕТСКИЕ УПРАЖНЕНИЯ',75,43,1500,C.soft);head(s,'Послушать. Показать. Попробовать.',75,108,1770,130,77,C.white);
await screen(s,'exercise-main.png',75,287,1395,675,{dark:true,r:32});
ln(s,1300,375,210,-55,C.coral,2,true);ln(s,1100,795,410,-100,C.coral,2,true);ln(s,1360,945,150,27,C.coral,2,true);
tag(s,'01 / АУДИОИНСТРУКЦИЯ',1520,264,365,C.coral,18);await screen(s,'exercise-repeat.png',1515,320,330,122,{dark:true,r:13});text(s,'Повтор и удобная\nскорость озвучивания',1520,470,345,80,27,C.white);
tag(s,'02 / ВЫБОР',1520,570,365,C.coral,18);await screen(s,'exercise-detail.png',1515,619,190,190,{dark:true,r:16});text(s,'Ответ касанием\nи подсказка',1725,640,155,150,26,C.white);
tag(s,'03 / ПЕРЕРЫВ',1520,879,365,C.coral,18);await screen(s,'exercise-break.png',1515,931,272,100,{dark:true,r:15});
n(s,'Большая сцена и выноски содержат реальные пиксели одного упражнения. Увеличенные фрагменты помогают рассмотреть механизм, не выдают концепт за рабочий экран. Отказ, перерыв и техническая ошибка регистрируются отдельно от обычной ошибки. Не утверждается клинический эффект.','frontend/components/SoyleApp.tsx SensoryGame; frontend/lib/exerciseRuntime.ts; exercise-hi.png.');
//06 · communication poster, bold type with large real AAC tools.
s=slide(p,C.blue);tag(s,'AAC / АЛЬТЕРНАТИВНАЯ И ДОПОЛНИТЕЛЬНАЯ КОММУНИКАЦИЯ',75,45,1750,C.white,19);
head(s,'Сказать. Сейчас.',65,118,1780,175,132,C.white);
text(s,'Просьба о помощи, отказ и перерыв — отдельный доступный путь.',77,319,1740,70,35,C.white);
await screen(s,'aac-quick.png',90,444,1740,432,{r:30});
await screen(s,'aac-composer.png',810,878,1000,185,{r:24});
text(s,'Карточки. Фраза.\nОзвучивание.',95,914,650,120,39,C.white,true);
n(s,'Свободный AAC-режим без оценок, быстрые сообщения одним нажатием, сборка и озвучивание фразы. Реальный кадр composer содержит демосообщение «Помоги мне». Важно различать AAC как средство коммуникации и направляемые тренировочные AAC-сценарии.','frontend/components/SoyleApp.tsx PhraseGame freeMode; frontend/lib/aacGrammar.ts; backend/app/aac_grammar.py; aac-hi.png; aac-message-hi.png.');
//07 · parent editorial collage. A goal, explanation and separate observations.
s=slide(p,C.paper);tag(s,'РОДИТЕЛЬСКИЙ КАБИНЕТ',75,43,1300);head(s,'Цель видна. Поддержка учтена.',75,109,1770,140,83);
await screen(s,'goal-hero.png',80,298,1740,330,{r:28});
await screen(s,'goal-card.png',110,647,1015,142,{r:22});
await screen(s,'plan-reason.png',450,804,1360,139,{r:22});
text(s,'Что хотим\nнаблюдать дома',1190,667,625,110,40,C.ink,true);
text(s,'Бытовое наблюдение хранится отдельно от игрового балла.',80,985,1770,60,35,C.grey);
n(s,'Текущие возможности: шесть шаблонов родительских домашних целей, исходное наблюдение и помощь, статусы и история, предпочтения/исключения упражнений, причины подготовленного плана. Профессиональное назначение не подменяется родительской целью. Снимки не показывают реального прогресса ребёнка.','frontend/components/GoalsAndPractice.tsx; backend/app/practice_goals.py; adaptive_planner.py; parent-goals-hi.png; adaptive-hi.png.');
//08 · computational infographic with editable charts and transparent illustrative inputs.
s=slide(p,C.night);tag(s,'RULE-BASED PERSONALIZATION',75,43,1250,C.coral);head(s,'Адаптация с понятной логикой',75,111,1770,135,83,C.white);
tag(s,'ПРИМЕР РАСЧЁТА / НЕ ДАННЫЕ РЕБЁНКА',75,265,1770,C.soft,19);
const acc=[.8,1,.6,.8,1,1,.8,1],ind=[.6,.6,.8,.6,.8,1,1,1],weights=acc.map((_,i)=>1+i/7),sum=weights.reduce((a,b)=>a+b,0);const wa=acc.reduce((a,v,i)=>a+v*weights[i],0)/sum,wi=ind.reduce((a,v,i)=>a+v*weights[i],0)/sum;
shape(s,70,333,565,597,C.deep,'#31445E',25);tag(s,'ОКНО: ДО 8 РЕЗУЛЬТАТОВ',97,363,500,C.soft,20);
text(s,'Завершённые попытки',98,421,500,70,35,C.white,true);
acc.forEach((v,i)=>{const x=100+(i%4)*123,y=501+Math.floor(i/4)*63;text(s,`${i+1}: ${Math.round(v*100)}%`,x,y,115,41,22,C.white,false,F.mono);ln(s,x,y+41,97,0,i===7?C.coral:'#3D5574',3);});
chart(s,'bar',{title:'Вес результата',titleTextStyle:{fontSize:25,fill:C.soft},position:{left:97,top:648,width:510,height:205},categories:weights.map((_,i)=>String(i+1)),series:[{name:'Вес',values:weights.map(v=>Number(v.toFixed(6))),fill:C.blue}],hasLegend:false,barOptions:{direction:'column',grouping:'clustered',gapWidth:65},chartFill:'none',plotAreaFill:'none',chartLine:{fill:'none',width:0},plotAreaLine:{fill:'none',width:0},xAxis:{visible:true,textStyle:{fontSize:21,fill:C.soft},line:{fill:'#41516A',width:1},majorGridlines:null},yAxis:{visible:false,min:0,max:2.1,majorGridlines:null},dataLabels:{showValue:false}});
text(s,'1.0',103,863,150,45,30,C.white,false,F.mono);text(s,'2.0',494,863,110,45,30,C.coral,false,F.mono);ln(s,235,885,235,0,C.soft,2,true);
ln(s,643,622,50,0,C.coral,3,true);
for(const [i,[title,val,col]] of [['Точность',wa,C.blue],['Самостоятельность',wi,C.teal]].entries()){
 const x=716+i*302;chart(s,'doughnut',{title,titleTextStyle:{fontSize:19,fill:C.soft},position:{left:x,top:350,width:278,height:272},categories:['Показатель','Остаток'],series:[{name:title,values:[Number((val*100).toFixed(2)),Number((100-val*100).toFixed(2))],points:[{idx:0,fill:col},{idx:1,fill:'#29374B'}]}],hasLegend:false,doughnutOptions:{holeSize:82,firstSliceAngle:270},dataLabels:{showValue:false},chartFill:'none',plotAreaFill:'none',chartLine:{fill:'none',width:0},plotAreaLine:{fill:'none',width:0}});text(s,Math.round(val*100)+'%',x+63,467,200,90,50,C.white,true,F.mono);
}
shape(s,714,678,580,252,'#16243A','#31445E',24);tag(s,'КОНСЕРВАТИВНЫЕ ПРАВИЛА',739,702,520,C.soft,18);
text(s,'1',750,755,150,90,60,C.soft,true,F.mono);text(s,'2',925,755,150,90,60,C.soft,true,F.mono);text(s,'3',1100,755,150,90,60,C.coral,true,F.mono);
text(s,'Старт',750,850,160,42,24,C.soft);text(s,'≥3 результата\n76% / 50%',905,845,175,80,21,C.soft);text(s,'≥6 результатов\n88% / 80%',1092,845,190,80,21,C.coral);
ln(s,1305,622,57,0,C.coral,3,true);shape(s,1380,333,465,597,C.blue,'none',25);
tag(s,'СЛЕДУЮЩЕЕ ЗАДАНИЕ',1410,370,400,C.white,20);head(s,'По цели\nи истории',1410,446,400,180,50,C.white);
text(s,'Разрешённая версия\n\nБез дублей в плане\n\nПричина сохранена',1410,673,395,198,30,C.white);
text(s,'Отказ и перерыв не считаются ошибкой. LLM и внешняя AI API не участвуют.',77,985,1770,63,29,C.soft);
n(s,`Иллюстративные входы: точность ${JSON.stringify(acc)}, самостоятельность ${JSON.stringify(ind)}, веса ${JSON.stringify(weights)}. Взвешенные показатели: ${(wa*100).toFixed(2)}% и ${(wi*100).toFixed(2)}%. Порог уровня 3: 6 результатов, точность >=88%, минимум 3 самостоятельных завершения, самостоятельность >=80%. Для примера предполагаются >=3 самостоятельных завершения, подходящая активная цель и разрешённая версия. Весовые столбцы округлены до 6 знаков после запятой для переносимости встроенной диаграммы. Это схема вычисления, не сохранённое решение для демопрофиля и не клинически валидированная шкала. План учитывает предпочтения и исключения, приоритет новых/реже назначенных заданий, сохраняет версии и причины. Быстрый план 3/5/10 минут использует отдельную ротацию.`,code);
//09 · two-lane workflow and versioned evidence, no chain of tiny screenshots.
s=slide(p,C.paper);tag(s,'ЭКОСИСТЕМА И РАБОЧИЙ ПРОЦЕСС',75,43,1400);head(s,'Практика сохраняет контекст',75,113,1770,135,87);
tag(s,'В СЕМЬЕ',75,322,170,C.grey,21);tag(s,'В СИСТЕМЕ',75,731,200,C.grey,21);
const xs=[300,850,1400];const fam=[['Домашняя цель','Родитель выбирает действие,\nкоторое хочет наблюдать.'],['Практика','Ребёнок выполняет задание\nдоступным способом.'],['Наблюдение','Семья отмечает помощь\nи бытовой контекст.']];const sys=[['Версии','Цель + материал + правила'],['Результат','Ответ + помощь + статус'],['Следующий план','История + предпочтения']];
for(let i=0;i<3;i++){
 head(s,fam[i][0],xs[i],320,435,85,43);text(s,fam[i][1],xs[i],428,435,125,30,C.grey);
 dot(s,xs[i]+18,584,18,C.blue);ln(s,xs[i]+27,610,0,65,C.blue,2,true);
 text(s,sys[i][0],xs[i],727,440,74,42,C.blue,true);text(s,sys[i][1],xs[i],825,440,93,29,C.grey);
 if(i<2){ln(s,xs[i]+450,371,65,0,C.blue,2,true);ln(s,xs[i]+450,769,65,0,C.blue,2,true);}
}
ln(s,1630,925,0,55,C.coral,3);ln(s,405,980,1225,0,C.coral,3);ln(s,405,980,0,-73,C.coral,3,true);
tag(s,'НОВЫЙ ПЛАН УЧИТЫВАЕТ ПРЕДЫДУЩУЮ ПРАКТИКУ',614,1002,1210,C.grey,19);
n(s,'Результат взрослого предпросмотра не записывается как детский. Бытовые наблюдения хранятся отдельно. План сохраняет версию цели, задания, правил и причины. Показанный цикл отражает текущий родительский процесс; специалистские назначения пока не реализованы как доступный рабочий сценарий.','backend/app/main.py sessions/learning-sessions/adaptive-plans; practice_goals.py; adaptive_planner.py; frontend/lib/sessionRuntime.ts.');
//10 · layered architecture with real technology icons and security rail.
s=slide(p,C.night);tag(s,'TECHNOLOGY / ARCHITECTURE',75,43,1300,C.soft);head(s,'Система с объяснимым ядром',75,112,1770,135,85,C.white);
const client=[['Ребёнок','Упражнения и AAC'],['Родитель','Цели и наблюдения'],['Администратор','Контент и проверки']];
client.forEach((a,i)=>{let x=85+i*530;shape(s,x,295,480,135,'#1C2B42','#3C506B',22);text(s,a[0],x+25,314,430,55,34,C.white,true);text(s,a[1],x+25,374,430,43,26,C.soft);});
ln(s,325,432,0,58,C.blue,3);ln(s,855,432,0,58,C.blue,3);ln(s,1385,432,0,58,C.blue,3);ln(s,325,490,1060,0,C.blue,3);ln(s,855,490,0,50,C.blue,3,true);
await image(s,'next.png',115,448,48,48);await image(s,'react.png',180,448,48,48);text(s,'Next.js 16 / React 19 / TypeScript',115,506,620,50,25,C.soft);
shape(s,785,536,780,100,C.blue,'none',22);await image(s,'fastapi.png',815,558,60,60);text(s,'FastAPI / Python / JSON API',903,563,620,60,36,C.white,true);
ln(s,855,636,0,59,C.blue,3);ln(s,250,695,1190,0,C.blue,3);
const mods=[['Упражнения','Версии и механики'],['Персонализация','Детерминированные правила'],['Домашние цели','Наблюдения и помощь'],['Коммуникация','AAC и озвучивание']];
mods.forEach((a,i)=>{let x=85+i*397;ln(s,x+175,695,0,32,C.blue,2,true);shape(s,x,731,355,145,'#1C2B42','#3C506B',20);text(s,a[0],x+22,754,315,54,29,C.white,true);text(s,a[1],x+22,817,315,54,24,C.soft);});
ln(s,855,881,0,40,C.blue,3,true);shape(s,785,923,780,100,'#1C2B42','#3C506B',22);await image(s,'postgresql.png',812,939,62,67);text(s,'SQLite локально / PostgreSQL',900,944,625,48,33,C.white,true);text(s,'SQL, миграции и статические медиа',900,991,625,31,21,C.soft);
shape(s,1710,294,145,730,'#152D36','#4B9F91',24);tag(s,'ЗАЩИТА',1725,325,130,C.teal,17);text(s,'Роли\n\nCookie\n\nCSRF\n\nСогласия\n\nИзоляция',1726,414,125,565,22,C.white);
n(s,'Подтверждены Next.js 16, React 19, TypeScript, FastAPI/Python, ручной SQL, SQLite для разработки и PostgreSQL для развёртывания, версионируемые миграции и локальная бизнес-логика. Security rail показывает реализованные контроли, не сертификацию. MediaPipe остаётся внутренним прототипом и не показан как публичная функция. Иконки с официальных react.dev/favicon.ico, nextjs.org/favicon.ico, fastapi.tiangolo.com/img/favicon.png, postgresql.org/media/img/about/press/elephant.png.','frontend/package.json; frontend/lib/api.ts; backend/requirements.txt; backend/app/{main,database,migrations,security,exercise_engine,adaptive_planner,aac_grammar,tts_library}.py.');
//11 · typographic manifesto, no screenshots or cards.
s=slide(p,C.mint);tag(s,'ОТЛИЧИЯ ПОДХОДА',75,43,1600,C.ink);head(s,'ПОНЯТНО.',61,105,1800,270,185,C.ink);text(s,'И ребёнку. И взрослому рядом.',78,373,1760,88,54,C.ink);
ln(s,80,518,1760,0,'#A0C9B7',2);
head(s,'Почему это задание',80,581,820,82,47);text(s,'Причина подбора сохранена\nи доступна родителю.',80,680,820,110,34,C.ink);
head(s,'Коммуникация без оценки',1040,581,805,84,43);text(s,'Свободный AAC-режим доступен\nотдельно от занятий.',1040,680,805,110,34,C.ink);
head(s,'Наблюдения отдельно',80,850,820,78,45);text(s,'Бытовой опыт не становится игровым баллом.',80,943,820,75,31,C.ink);
head(s,'Можно остановиться',1040,850,805,78,45);text(s,'Отказ и перерыв — отдельные исходы.',1040,943,805,75,31,C.ink);
n(s,'Это проверяемые свойства подхода Söyle, а не утверждения о превосходстве над конкретными конкурентами. Не заявляется экономия времени, улучшение речи или эффективность без измерения.','backend/app/adaptive_planner.py; backend/app/family_practice.py; frontend/components/SoyleApp.tsx PhraseGame/SensoryGame; GoalsAndPractice.tsx.');
//12 · evidence ledger. All readiness caveats grouped here.
s=slide(p,C.paper);tag(s,'ТЕКУЩЕЕ СОСТОЯНИЕ / 18.10.2026',75,43,1700);head(s,'Масштаб уже есть.\nСледующий этап — проверка.',75,111,1770,235,86);
tag(s,'ЕСТЬ В MVP',80,391,570,C.blue,21);tag(s,'ПРОВЕРИТЬ ДО ПИЛОТА',715,391,570,C.blue,21);tag(s,'ЗАПЛАНИРОВАНО',1380,391,470,C.blue,21);
for(const [i,[num,lab]] of [['13','заданий в локальном демо'],['64','базовые AAC-карточки'],['101','автотест прошёл сейчас']].entries()){text(s,num,77,458+i*163,290,140,99,C.blue,true,F.mono);text(s,lab,330,480+i*163,335,100,31,C.ink);}
await screen(s,'admin-focus.png',718,469,535,442,{r:20});
text(s,'Строгий методический каталог пуст.\nНужны также проверка данных,\nустройств и развёртывания.',716,934,600,113,27,C.grey);
text(s,'Кабинет специалиста\n\nОрганизации и биллинг\n\nКазахская локализация\nпосле отдельной проверки',1380,480,465,385,34,C.ink);
text(s,'Сейчас: внутреннее техническое демо.\nРеальный пилот с детьми пока не готов.',80,984,580,78,26,C.grey);
n(s,'Повторная инвентаризация 18.10.2026: 13 заданий =10 guided_aac+3 auditory_choice; 64 базовые карточки; 6 шаблонов целей; 3 уровня; русский — единственный включённый язык. 52 backend pytest +49 frontend unit/regression =101 пройденный тест. E2E заново не запускались. При SOYLE_ALLOW_UNREVIEWED_DEMO_CONTENT=false опубликованный доступный каталог пуст. 11 draft-версий упражнений и 6 камерных внутренних версий не включены. Рабочего specialist-входа, организационного кабинета и биллинга нет. Старые аудиты частично устарели: адаптация, миграции/readiness и исключение adult_preview присутствуют в текущем коде.','backend/app/exercise_engine.py published_exercise_rows; database.py; migrations.py; security.py; frontend/lib/i18n.ts; pytest и npm test, повторно запущенные 18.10.2026; admin-focus.png из разрешённой предыдущей демонстрации.');
//13 · distinct money and value flows, one buyer, family access.
s=slide(p,C.night);tag(s,'B2B SAAS / B2B2C / БИЗНЕС-ГИПОТЕЗА',75,43,1700,C.coral);head(s,'Центр платит.\nСемья получает доступ.',75,113,1770,235,88,C.white);
shape(s,80,413,430,345,'#1A2B43','#3A516D',27);tag(s,'ПОКУПАТЕЛЬ И ПЛАТЕЛЬЩИК',110,441,390,C.soft,17);head(s,'ЦЕНТР',110,505,370,86,57,C.white);text(s,'Руководитель выбирает\nсервис и бюджет.',110,621,370,112,32,C.soft);
shape(s,775,413,430,225,C.blue,'none',27);text(s,'Söyle',813,453,350,88,69,C.white,true);text(s,'Подписка организации',813,555,355,48,27,C.white);
ln(s,520,484,235,0,C.coral,4,true);tag(s,'ДЕНЬГИ',553,431,210,C.coral,21);
shape(s,1460,568,385,205,'#1A2B43','#3A516D',27);head(s,'СЕМЬЯ',1490,599,330,80,49,C.white);text(s,'Ребёнок и родитель',1490,700,330,48,27,C.soft);
ln(s,1215,576,225,61,C.teal,4,true);text(s,'Доступ к практике\nи коммуникации',1227,443,230,105,26,C.teal);
shape(s,775,816,430,145,'#1A2B43','#3A516D',24);text(s,'Специалист',805,841,370,58,38,C.white,true);text(s,'Будущий кабинет',805,905,370,37,25,C.soft);
ln(s,992,649,0,143,C.blue,3,true,true);ln(s,1215,882,225,-151,C.blue,3,true,true);
tag(s,'ПРОДУКТОВЫЙ ПОТОК',1290,852,540,C.teal,19);
text(s,'За что платят: организация домашней практики,\nобновление материалов и поддержка.',80,846,625,128,31,C.soft);
text(s,'Семейный продукт работает сейчас. Организационный контур и назначения требуют разработки.',80,1014,1770,45,25,C.soft);
n(s,'Предложение B2B SaaS с каналом B2B2C. Покупатель/плательщик — руководитель центра, пользователи — специалист и семья. Денежный поток: центр оплачивает Söyle; ценностный поток: платформа предоставляет инструменты и доступ семье. Ценность регулярного платежа — организация практики, поддержка и проверяемый контент. Экономия времени специалиста — гипотеза: меньше ручной передачи заданий/сбора обратной связи, её нужно измерять до и после. Для запуска нужны tenant-модель, кабинет специалиста, назначения, согласия обмена, биллинг и поддержка. Внешний ориентир структуры лицензирования: AssistiveWare продаёт образовательным организациям лицензии, назначаемые ученику, и предлагает отдельные professional-лицензии. Это подтверждает существование подобных единиц лицензирования, а не спрос на Söyle.','Бизнес-анализ автора; https://www.assistiveware.com/products/proloquo-school-licenses (централизованное управление и назначение ученику); https://www.assistiveware.com/aac-professional-license-evaluation-request.');
//14 · editable pricing curve, one coherent formula and three customer sizes.
s=slide(p,C.paper);tag(s,'REVENUE MODEL / ГИПОТЕЗА ДЛЯ ТЕСТИРОВАНИЯ',75,43,1700);head(s,'База за центр. Масштаб — за профили.',75,113,1770,140,73);
text(s,'20 000 KZT + 1 000 KZT × max(0, A − 10)',78,268,1770,86,54,C.blue,true,F.mono);
chart(s,'scatter',{title:'Месячный платёж, KZT',titleTextStyle:{fontSize:28,fill:C.ink},position:{left:80,top:386,width:1070,height:430},series:[{name:'Платёж',xValues:[0,10,20,30,50,80],values:[20000,20000,30000,40000,60000,90000],line:{fill:C.blue,width:4},marker:{symbol:'circle',size:9,fill:C.blue}}],hasLegend:false,scatterOptions:{style:'lineWithMarkers'},chartFill:'none',plotAreaFill:'none',chartLine:{fill:'none',width:0},plotAreaLine:{fill:'none',width:0},xAxis:{...axis,title:{text:'Активные профили (A)',textStyle:{fontSize:24,fill:C.grey}},min:0,max:80,majorUnit:20,majorGridlines:null},yAxis:{...axis,min:0,max:100000,majorUnit:25000,numberFormatCode:'#,##0'},dataLabels:{showValue:false}});
const seg=[['Кабинет','8 профилей','20 000'],['Центр','30 профилей','40 000'],['Организация','80 профилей','90 000']];seg.forEach((a,i)=>{const y=394+i*145;tag(s,a[0].toUpperCase()+' / '+a[1],1240,y,610,C.grey,19);text(s,a[2]+' KZT',1240,y+46,600,80,48,C.ink,true,F.mono);});
ln(s,80,867,1760,0,C.line,2);
text(s,'Центр',80,903,470,55,36,C.ink,true);text(s,'Просто, но один платёж\nне отражает масштаб.',80,965,470,85,26,C.grey);
text(s,'Специалист',610,903,470,55,36,C.ink,true);text(s,'Плата за место может\nмешать совместной работе.',610,965,470,85,26,C.grey);
text(s,'Смешанная модель — для старта',1140,903,700,55,32,C.blue,true);text(s,'База покрывает сопровождение.\nПрофили связывают цену с масштабом.',1140,965,700,85,26,C.grey);
n(s,'Все цены — гипотезы, не действующие тарифы. Формула P(A)=20 000+1 000×max(0,A−10) KZT/месяц. База включает до 10 профилей; места специалистов не тарифицируются отдельно. Кабинет с 8 профилями=20 000, центр с30=40 000, организация с80=90 000 KZT. Активный профиль для теста тарифа — профиль, включённый организацией в согласованный платный список месяца; демо и архив исключаются. Это будущая коммерческая политика, не реализованный счётчик использования. До подписания нужны условия перехода/отключения семьи, согласия и предсказуемый лимит платежа. Сравнение: только центр просто, но слабее масштабируется; специалист удобно прогнозируется, но может мешать работе команды; только ребёнок чувствителен к сезонности; смешанная модель сочетает минимум сопровождения и масштаб. Выбор требует интервью о готовности платить. Не используется цена иностранного AAC-сервиса как якобы рыночный тариф Казахстана.','Сценарный бизнес-анализ автора; рынок единиц лицензирования: https://www.assistiveware.com/products/proloquo-school-licenses.');
//15 · financial analytics. Fixed customer mix across all three adoption scenarios.
s=slide(p,C.paper);tag(s,'ECONOMICS / СЦЕНАРИИ, НЕ ПРОДАЖИ',75,43,1700);head(s,'Одна модель. Три масштаба.',75,111,1770,140,86);tag(s,'MRR ≠ ПРИБЫЛЬ',1480,43,400,C.grey,19);
tag(s,'MRR ПРИ 30 ОРГАНИЗАЦИЯХ',80,319,800,C.grey,22);text(s,'1 380 000',75,386,900,170,115,C.blue,true,F.mono);text(s,'KZT / месяц',82,558,820,70,43,C.ink);
text(s,'30 × 46 000 KZT',83,676,800,66,44,C.ink,true,F.mono);text(s,'Одинаковый состав клиентов:\n20% кабинеты / 60% центры / 20% организации',83,757,820,100,29,C.grey);
chart(s,'bar',{title:'Сценарная месячная выручка, KZT',titleTextStyle:{fontSize:27,fill:C.ink},position:{left:966,top:295,width:880,height:520},categories:['10 организаций','30 организаций','60 организаций'],series:[{name:'Кабинеты',values:[40000,120000,240000],fill:'#AAC8FD'},{name:'Центры',values:[240000,720000,1440000],fill:C.blue},{name:'Организации',values:[180000,540000,1080000],fill:C.ink}],hasLegend:true,legend:{position:'bottom',textStyle:{fontSize:23,fill:C.grey}},barOptions:{direction:'column',grouping:'stacked',gapWidth:115},chartFill:'none',plotAreaFill:'none',chartLine:{fill:'none',width:0},plotAreaLine:{fill:'none',width:0},xAxis:{...axis,textStyle:{fontSize:23,fill:C.grey},majorGridlines:null},yAxis:{...axis,min:0,max:3000000,majorUnit:1000000,numberFormatCode:'#,##0'},dataLabels:{showValue:false}});
ln(s,80,894,1760,0,C.line,2);
text(s,'Постоянные затраты',80,929,650,55,34,C.ink,true);text(s,'Разработка, методическая работа, базовая инфраструктура',80,990,800,64,25,C.grey);
text(s,'Зависят от масштаба',1000,929,760,55,34,C.ink,true);text(s,'Хранение, поддержка, подключение и привлечение центров',1000,990,800,64,25,C.grey);
n(s,'Гипотетическая клиентская смесь фиксирована во всех трёх сценариях: 20% малых кабинетов по20 000, 60% центров по40 000, 20% организаций по90 000. Средний месячный платёж=0.2×20000+0.6×40000+0.2×90000=46000 KZT. При10 клиентов:2/6/2, сегментная выручка40 000/240 000/180 000, всего460 000. При30:6/18/6, 120 000/720 000/540 000, всего1 380 000. При60:12/36/12, 240 000/1 440 000/1 080 000, всего2 760 000. Цены сегментов получены одной формулой с8/30/80 профилями со слайда14. Меняется только число организаций, а не одновременно число и ARPA. MRR — не прибыль. Себестоимость поддержки и методической работы пока не измерена, поэтому EBITDA, точка безубыточности, CAC/LTV и retention не выдуманы. Часть поддержки и методической работы может быть ступенчато постоянной. Налоги и скидки не моделировались.','Прозрачная сценарная модель автора, не фактическая финансовая отчётность Söyle.');
//16 · staged rollout, staircase with gates and concrete first-center onboarding.
s=slide(p,C.night);tag(s,'GO-TO-MARKET / ПЛАН ВНЕДРЕНИЯ',75,43,1700,C.soft);head(s,'Один центр.\nПроверяемый запуск.',75,112,1770,235,89,C.white);
const roll=[{x:80,y:604,n:'01',t:'Готовность',b:'Методика, данные,\nустройства и доступность.'},{x:535,y:509,n:'02',t:'Пилот',b:'Выполнимость сценариев\nи время специалиста.'},{x:990,y:414,n:'03',t:'Платный запуск',b:'Готовность платить\nи повторное использование.'},{x:1445,y:319,n:'04',t:'Расширение',b:'Поддержка, организации\nи проверенные языки.'}];
roll.forEach((a,i)=>{tag(s,a.n,a.x,a.y,370,C.coral,48);text(s,a.t,a.x,a.y+94,400,80,40,C.white,true);text(s,a.b,a.x,a.y+195,400,112,29,C.soft);if(i<3){ln(s,a.x+380,a.y+164,60,0,C.blue,3);ln(s,a.x+440,a.y+164,0,-95,C.blue,3);ln(s,a.x+440,a.y+69,15,0,C.blue,3,true);}});
ln(s,80,931,1760,0,'#31445E',2);tag(s,'ПОДКЛЮЧЕНИЕ ОДНОГО ЦЕНТРА',80,968,1760,C.coral,19);text(s,'Ответственный специалист → согласованный список семей → обучение → совместный разбор практики',80,1013,1770,50,27,C.soft);
n(s,'План, не состоявшийся пилот и не обещанные партнёрства. После допуска — один или несколько центров с согласованным набором целей/материалов. Подключение одного центра: руководитель и ответственный специалист, границы данных/согласия, список семей, короткое обучение, запуск, разбор ошибок и времени, затем решение о платном продлении. Каналы: личные интервью руководителей, профессиональные сообщества, демонстрации и рекомендации после успешного использования. Критерии масштабирования: проверенные материалы, управляемые доступы, стабильное развёртывание, измеренные затраты поддержки, повторное использование и готовность платить. Снижение трудозатрат и конверсия в платную подписку требуют измерения, значения не придуманы.','План внедрения автора, ограничения подтверждены текущим кодом и README.md.');
//17 · closing communication poster. Distinct from the launch scene.
s=slide(p,C.blue);tag(s,'SÖYLE / EVERY VOICE MATTERS',75,44,1600,C.white,22);head(s,'Быть\nуслышанным.',65,128,1780,390,150,C.white);
text(s,'Коммуникация и домашняя практика рядом с семьёй.',80,552,1760,72,41,C.white);
text(s,'Вспомогательная система. Не заменяет логопеда или медицинскую помощь.',82,631,1760,45,25,C.white);
await screen(s,'aac-quick.png',180,680,1560,387,{r:33});
n(s,'Миссия проекта, без клинических обещаний и инвестиционного призыва. Последний продуктовый кадр намеренно продолжается за нижнюю границу сцены как крупный фрагмент, все основные быстрые сообщения остаются в видимой области? Для итоговой сборки положение корректируется до полного вмещения.','README.md; AAC quick messages; aac-hi.png.');
// Place closing panel fully inside slide while preserving a readable display.
// Final note is presenter-safe and contains no production instructions.
p.slides.items[16].speakerNotes.text='Söyle поддерживает коммуникацию и домашнюю практику. Не ставит диагноз, не лечит алалию и не заменяет специалиста. Реальный AAC-интерфейс из локального демо. Источники: README.md; frontend/components/SoyleApp.tsx PhraseGame; aac-hi.png.';
await(await PresentationFile.exportPptx(p)).save(build+'/redesign-draft.pptx');
await render(p,build+'/previews');
await fs.writeFile(build+'/slide-notes.json',JSON.stringify(p.slides.items.map((s,i)=>({slide:i+1,notes:s.speakerNotes.text})),null,2));
console.log('REDESIGN_DONE');
