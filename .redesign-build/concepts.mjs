import {deck,slide,head,text,tag,image,screen,notes,render,shape,C,F,PresentationFile,prepare,build,assets,fs} from './common.mjs';
await prepare(); const p=deck();
// A · Apple-like Minimal Product: white, central, precise.
let s=slide(p,'#FCFCFC');tag(s,'01 / APPLE-LIKE MINIMAL PRODUCT',70,45,1500,'#66717D');
head(s,'SÖYLE',60,100,1800,280,242,C.ink);text(s,'Каждый голос важен',75,365,1780,68,46,C.grey);
await screen(s,'home-hero.png',255,482,1410,567,{r:32});notes(s,'Концепция A. Центральный продукт, светлая сцена, минимум текста. Реальный child-home-hi.png. Сильная читаемость, но при распространении на всю презентацию может остаться слишком спокойной.');
s=slide(p,'#FCFCFC');tag(s,'01 / PRODUCT DEMO',70,45);head(s,'Один понятный шаг',70,112,1780,130,98);await screen(s,'exercise-main.png',100,306,1535,743,{r:30});tag(s,'ПОСЛУШАТЬ\n\nВЫБРАТЬ\n\nОСТАНОВИТЬСЯ',1660,430,230,C.blue,20);notes(s,'A, продуктовый слайд. Главная сцена — настоящее упражнение без повторяющегося текстового split.');
// B · Premium Tech Editorial: midnight, overscale typography, stacked frames.
s=slide(p,C.night);tag(s,'02 / PREMIUM TECH EDITORIAL',70,48,1600,C.soft);head(s,'SÖYLE',54,92,1810,290,260,C.white);tag(s,'BEYOND WORDS',1395,363,480,C.coral,28);
await screen(s,'aac-quick.png',90,592,740,185,{rotation:-7,dark:true});await screen(s,'home-hero.png',320,425,1290,518,{dark:true,r:34});await screen(s,'exercise-choice.png',1350,764,470,131,{rotation:7,dark:true});text(s,'Коммуникация. Домашняя практика. Поддержка семьи.',76,987,1800,55,29,C.soft);notes(s,'Концепция B. Тёмная продуктовая сцена и широкая display-типографика. Крупный реальный интерфейс в центре и вторичные выноски по глубине. Выбрана как основа технологических разделов.');
s=slide(p,C.night);tag(s,'02 / PRODUCT DEMO',70,48,1500,C.soft);head(s,'В фокусе — ребёнок',70,107,1750,120,87,C.white);await screen(s,'exercise-main.png',70,298,1420,687,{dark:true});await screen(s,'exercise-audio.png',1128,230,690,125,{dark:true,rotation:3});head(s,'01',1580,500,250,130,106,C.coral);text(s,'Слушает\nи выбирает',1545,652,310,160,42,C.white);notes(s,'B, продуктовый слайд. Иерархия основной сцены и увеличенного фрагмента.');
// C · Human-Centered Futuristic: mint, human photograph, bold primary message.
s=slide(p,C.mint);tag(s,'03 / HUMAN-CENTERED FUTURISTIC',70,48,1700,C.ink);await image(s,'family-hero.webp',1010,128,840,760,{fit:'cover',round:40});head(s,'Beyond\nwords.',70,150,1200,440,172,C.green||C.ink);await screen(s,'aac-quick.png',250,685,1390,345,{r:35});notes(s,'Концепция C. Человеческий образ и мятный фон. Фотография из существующего лендинга, не участник пилота. Более тёплая сцена, но как единая система уступает B по технологической выразительности.');
s=slide(p,C.mint);head(s,'Сказать.\nСейчас.',70,74,1780,270,118);await screen(s,'aac-quick.png',70,415,1780,441,{r:32});text(s,'Помощь, перерыв и отказ доступны отдельно от упражнений.',75,945,1760,65,37,C.ink);notes(s,'C, продуктовый слайд. Коммуникация показана как самостоятельная ценность.');
await render(p,build+'/concepts');await(await PresentationFile.exportPptx(p)).save(build+'/concepts-draft.pptx');
console.log('CONCEPTS_DONE');
