import fs from 'node:fs/promises';
import {Presentation,PresentationFile} from '@oai/artifact-tool';
import {resolvePresentationFont,finalizePresentation} from '/Users/whynicky/.codex/plugins/cache/openai-primary-runtime/presentations/26.1015.12040/skills/presentations/container_tools/artifact_tool_utils.mjs';
const root='/Users/whynicky/Desktop/Projects/Soyle';
const skill='/Users/whynicky/.codex/plugins/cache/openai-primary-runtime/presentations/26.1015.12040/skills/presentations';
const font=resolvePresentationFont();
const p=Presentation.create({slideSize:{width:1600,height:900}});
const C={paper:'#F7F8F4',ink:'#173347',muted:'#607581',blue:'#1B6A91',mint:'#8CD2B6',green:'#247C63',dark:'#112D40',white:'#FFFFFF',light:'#BED0DA',line:'#C5D6D8'};
function text(s,str,x,y,w,h,size=26,bold=false,color=C.ink,align='left'){let a=s.shapes.add({geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});a.text=str;a.text.style={typeface:font,fontSize:size,bold,color,verticalAlignment:'top',alignment:align};a.text.insets=0;return a;}
function rect(s,x,y,w,h,fill,r=0,line='none'){return s.shapes.add({geometry:r?'roundRect':'rect',position:{left:x,top:y,width:w,height:h},fill,line:{fill:line,width:line==='none'?0:1},...(r?{borderRadius:r}:{})});}
function line(s,x,y,w,h=0,color=C.line,width=2,arrow=false,back=false){return s.shapes.add({geometry:'connector',kind:'straight',position:{left:x,top:y,width:w,height:h},line:{fill:color,width},...(arrow?{[back?'head':'tail']:{type:'arrow',width:'med',length:'med'}}:{})});}
async function img(s,path,x,y,w,h,fit='contain',radius=0){let b=await fs.readFile(root+'/'+path);return s.images.add({blob:b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),contentType:path.endsWith('.webp')?'image/webp':'image/png',alt:path.split('/').at(-1),position:{left:x,top:y,width:w,height:h},fit,...(radius?{geometry:'roundRect',borderRadius:radius}:{})});}
function circle(s,num,x,y,d,fill,color){let a=s.shapes.add({geometry:'ellipse',position:{left:x,top:y,width:d,height:d},fill,line:{fill:'none',width:0}});a.text=String(num);a.text.style={typeface:font,fontSize:25,bold:true,color,alignment:'center',verticalAlignment:'middle'};a.text.insets=0;return a;}
function brand(s,num,dark=false){text(s,'Söyle',64,35,230,48,32,true,dark?C.mint:C.blue);text(s,'ОБЩЕНИЕ И ПРАКТИКА',196,48,350,25,14,true,dark?C.light:C.muted);text(s,`0${num} / 02`,1438,43,100,30,19,false,dark?C.light:C.muted,'right');}
let s=p.slides.add();s.background.fill=C.paper;brand(s,1);
text(s,'Путь семьи\nв Söyle',64,116,720,185,76,true);
text(s,'Короткая домашняя практика,\nпонятный результат для родителя',68,321,690,82,28,false,C.muted);
await img(s,'output/assets/Soyle_family_AAC.png',828,104,708,298,'cover',22);
const steps=[
 ['Вход и\nпрофиль','Входит и создаёт\nпрофиль ребёнка.\nНастраивает согласия\nи доступ.','Профиль готов'],
 ['План\nзанятия','Выбирает 3, 5 или 10 мин.\nИли задаёт цель для\nадаптивного плана.','Задания подобраны'],
 ['Практика\nребёнка','Слушает и выбирает\nкартинку или собирает\nAAC-сообщение.','Ответ или сообщение'],
 ['Результат\nзанятия','Платформа сохраняет\nответы, помощь и статус\nпопытки.','Результат в истории'],
 ['Следующий\nшаг','Смотрит историю,\nдобавляет наблюдения\nи обновляет план.','Основа новой практики']
];
const xx=[64,366,668,970,1272];
for(let i=0;i<5;i++){let x=xx[i];circle(s,i+1,x,457,56,i===2?C.blue:i===4?C.green:'#DDEAE8',i===2||i===4?C.white:C.blue);if(i<4)line(s,x+77,485,200,0,C.line,2,true);text(s,steps[i][0],x,537,264,78,29,true);text(s,steps[i][1],x,634,267,96,22,false,C.muted);text(s,steps[i][2],x,754,267,34,21,true,C.green);}
line(s,64,818,1472,0,'#CDDAD8',1);
text(s,'AAC доступна в любой момент. Можно повторить инструкцию, сделать паузу или отказаться без штрафа.',64,842,1472,30,21,false,C.muted);
const oldScript=await fs.readFile(root+'/.slide-build/build.mjs','utf8');
const oldNotes=[...oldScript.matchAll(/s\.speakerNotes\.text=`([\s\S]*?)`;/g)].map(m=>m[1]);
s.speakerNotes.text=oldNotes[0]+'\nИллюстрация: сгенерированный визуальный материал output/assets/Soyle_family_AAC.png. Редизайн по самостоятельному стилю Söyle, без копирования пользовательского примера. Схема сокращена до пяти последовательных этапов, быстрый и адаптивный сценарии сохранены. Регистрация родителя и вход по логину/PIN ребёнка раскрываются при устном представлении. Изображение сгенерировано встроенным image_gen: вымышленная мама и ребёнок занимаются с AAC-карточками дома. Это не скриншот интерфейса и не документальная фотография пользователей.';
s=p.slides.add();s.background.fill=C.dark;brand(s,2,true);
text(s,'Логика ИИ-компонента',64,121,1310,85,65,true,C.white);
text(s,'Локальные правила без подключения к внешней нейросети',68,221,1380,48,29,false,C.light);
// Three semantic areas form one editable adaptive flow.
text(s,'ВХОДНЫЕ ДАННЫЕ',64,324,360,34,18,true,C.mint);
text(s,'Цель и история\nребёнка',64,378,375,87,35,true,C.white);
text(s,'Активные цели и нужная помощь\nПредпочтения родителя\nДо 8 завершённых результатов\nСвежие ответы важнее',64,493,376,142,23,false,C.light);
line(s,437,459,61,0,C.mint,2.5,true);
rect(s,520,315,562,321,'#E5F1EC',22);
text(s,'АДАПТИВНЫЙ АЛГОРИТМ',550,341,500,29,18,true,C.green);
const rows=[['01','Отбор','Разрешённые задания по цели'],['02','Анализ ответов','Точность и самостоятельность'],['03','Подбор','Уровень 1–3 и ротация заданий']];
for(let i=0;i<3;i++){let y=398+i*73;text(s,rows[i][0],550,y,50,35,25,true,C.green);text(s,rows[i][1],610,y-2,435,34,27,true,C.ink);text(s,rows[i][2],610,y+34,435,30,21,false,C.muted);if(i<2)line(s,550,y+65,500,0,'#BED6CD',1);}
line(s,1104,459,61,0,C.mint,2.5,true);
text(s,'РЕЗУЛЬТАТ',1190,324,346,34,18,true,C.mint);
text(s,'План, который\nможно объяснить',1190,378,346,90,34,true,C.white);
text(s,'Подходящие задания\nПараметры сложности\nПричины выбора для родителя',1190,493,346,115,23,false,C.light);
// Feedback route returns new observations to the next plan.
line(s,1363,643,0,45,C.mint,2);
line(s,248,688,1115,0,C.mint,2,true,true);
line(s,248,643,0,45,C.mint,2,true,true);
text(s,'Новые ответы учитываются при подготовке следующего плана',400,704,940,34,23,true,C.mint,'center');
text(s,'Помощник родителя',64,785,360,38,26,true,C.white);
text(s,'Вопрос',455,785,140,36,24,true,C.white);line(s,576,801,40,0,C.light,2,true);
text(s,'Проверка темы',645,785,240,36,24,false,C.light);line(s,862,801,40,0,C.light,2,true);
text(s,'Готовая рекомендация',930,785,340,36,24,false,C.light);text(s,'При признаках риска: обращение к специалисту',455,831,1000,30,20,false,C.light);
s.speakerNotes.text=oldNotes[1]+'\nОсновной рисунок показывает адаптивный подбор. Нижняя ветка кратко показывает независимый локальный помощник родителя. Внешняя нейросеть не используется. Фактически нейросетевой MediaPipe является отдельным исключённым из публичного каталога прототипом, поэтому не изображён как работающая часть публичного сценария. Внутренние правила подбора показаны редактируемыми объектами. При недостатке данных сохраняется начальный уровень. Отказы, перерывы и технические ошибки не входят в расчёт точности. Система не ставит диагноз.';
await fs.mkdir(root+'/.slide-build/new-photo',{recursive:true});
for(let i=0;i<2;i++){let b=await p.export({slide:p.slides.items[i],format:'png',scale:1});await fs.writeFile(root+`/.slide-build/new-photo/slide-${i+1}.png`,new Uint8Array(await b.arrayBuffer()));}
await (await PresentationFile.exportPptx(p)).save(root+'/.slide-build/new-photo/draft.pptx');
let result=await finalizePresentation({workspaceDir:root,candidatePath:root+'/.slide-build/new-photo/draft.pptx',finalPath:root+'/output/Soyle_2_slides_new_photo.pptx',pythonExecutable:'/Users/whynicky/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3',integrityValidatorPath:skill+'/container_tools/inspect_presentation_package_integrity.py',layoutValidatorPath:skill+'/container_tools/inspect_presentation_layout_geometry.py',layoutArgs:['--expected-slide-size-emu','15240000,8572500','--validate-bullet-geometry','--validate-heading-fit'],explicitTotalSlideCount:2,requiredNativeTableOwnerSlides:[],fontPolicy:{basis:'design',families:[font]},verifyArtifactToolImport:true,receiptPath:root+'/.slide-build/new-photo/validation-final.json'});
console.log(JSON.stringify({font,passed:result.passed}));
