import fs from 'node:fs/promises';
import sharp from 'sharp';
import {Presentation,PresentationFile} from '@oai/artifact-tool';
export {Presentation,PresentationFile,fs,sharp};
export const root='/Users/whynicky/Desktop/Projects/Soyle',build=root+'/.redesign-build',out=root+'/output/redesigned',assets=out+'/presentation_assets';
export const C={ink:'#101726',night:'#0B1220',blue:'#276CEC',blue2:'#1453BE',ice:'#EAF1FF',paper:'#F7F9FC',white:'#FFFFFF',mint:'#DAF3E8',teal:'#66CFB2',coral:'#F29D86',grey:'#677586',line:'#CED8E5',soft:'#ACBDD3',deep:'#16243A'};
export const F={display:'Arial Black',body:'Helvetica Neue',mono:'Menlo'};
export function deck(){return Presentation.create({slideSize:{width:1920,height:1080}})}
export function text(s,t,x,y,w,h,size=32,color=C.ink,bold=false,font=F.body,align='left'){
 const z=s.shapes.add({geometry:'textbox',name:t.replace(/\n/g,' ').slice(0,45),position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});z.text=t;z.text.style={typeface:font,fontSize:size,bold,color,alignment:align,verticalAlignment:'top'};z.text.insets=0;return z;
}
export function head(s,t,x,y,w,h,size=76,color=C.ink){return text(s,t,x,y,w,h,size,color,false,F.display)}
export function tag(s,t,x,y,w=900,color=C.blue,size=20){return text(s,t,x,y,w,42,size,color,false,F.mono)}
export function shape(s,x,y,w,h,fill,stroke='none',r=0,shadow='',rotation=0){let a=s.shapes.add({geometry:r?'roundRect':'rect',position:{left:x,top:y,width:w,height:h,rotation},fill,line:{fill:stroke,width:stroke==='none'?0:1.5},...(r?{borderRadius:r}:{}),...(shadow?{shadow}:{})});return a;}
export function dot(s,x,y,d,fill,stroke='none'){return s.shapes.add({geometry:'ellipse',position:{left:x,top:y,width:d,height:d},fill,line:{fill:stroke,width:2}})}
export function ln(s,x,y,w,h=0,color=C.line,width=2,arrow=false,dash=false){return s.shapes.add({geometry:'connector',kind:'straight',position:{left:Math.min(x,x+w),top:Math.min(y,y+h),width:Math.abs(w),height:Math.abs(h),horizontalFlip:w<0,verticalFlip:h<0},line:{fill:color,width,...(dash?{style:'dash'}:{style:'solid'})},...(arrow?{tail:{type:'arrow',width:'med',length:'med'}}:{})});}
export function slide(p,bg=C.paper){let s=p.slides.add();s.background.fill=bg;return s;}
const cache=new Map();
export async function image(s,name,x,y,w,h,{fit='contain',rotation=0,round=0}={}){const f=assets+'/'+name;if(!cache.has(f))cache.set(f,await fs.readFile(f));let b=cache.get(f);let el=s.images.add({blob:b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),contentType:name.endsWith('.webp')?'image/webp':'image/png',alt:'Söyle · '+name,fit,position:{left:x,top:y,width:w,height:h},...(round?{geometry:'roundRect',borderRadius:round}:{})});if(rotation)el.rotation=rotation;return el;}
export async function screen(s,name,x,y,w,h,{rotation=0,dark=false,r=24}={}){shape(s,x-9,y-9,w+18,h+18,dark?'#253247':C.white,dark?'#3B4A61':'#DCE3ED',r,'0px 24px 65px #000000/22',rotation);return image(s,name,x,y,w,h,{rotation,round:r-6});}
export function notes(s,t){s.speakerNotes.text=t+'\n\nСрез проекта 18.10.2026. Реальные скриншоты локального демо на отдельной SQLite-базе soyle-redesign-20261018.db. Демопрофили и примеры не являются результатами реальных детей.';}
export async function render(p,dir){await fs.mkdir(dir,{recursive:true});for(let i=0;i<p.slides.items.length;i++){let b=await p.export({slide:p.slides.items[i],format:'png',scale:1});await fs.writeFile(dir+`/slide-${String(i+1).padStart(2,'0')}.png`,new Uint8Array(await b.arrayBuffer()));console.log('RENDER',i+1);}}
export async function prepare(){
 const crops={
 'home-hero.png':['child-home-hi.png',{left:594,top:188,width:2240,height:900}],
 'home-wide.png':['child-home-hi.png',{left:594,top:188,width:2240,height:1330}],
 'exercise-main.png':['exercise-hi.png',{left:386,top:200,width:2170,height:1050}],
 'exercise-audio.png':['exercise-hi.png',{left:450,top:265,width:2040,height:370}],
 'exercise-choice.png':['exercise-hi.png',{left:450,top:780,width:1360,height:380}],
 'exercise-break.png':['exercise-hi.png',{left:2360,top:35,width:272,height:100}],
 'exercise-repeat.png':['exercise-hi.png',{left:2170,top:405,width:277,height:102}],
 'exercise-detail.png':['exercise-hi.png',{left:650,top:855,width:245,height:245}],
 'aac-quick.png':['aac-hi.png',{left:594,top:378,width:2240,height:556}],
 'aac-composer.png':['aac-message-hi.png',{left:594,top:1038,width:2240,height:423}],
 'aac-whole.png':['aac-hi.png',{left:594,top:187,width:2240,height:1270}],
 'goal-hero.png':['parent-goals-hi.png',{left:594,top:188,width:2240,height:425}],
 'goal-card.png':['parent-goals-hi.png',{left:600,top:930,width:1425,height:200}],
 'goals-wide.png':['parent-goals-hi.png',{left:594,top:188,width:2240,height:960}],
 'plan-wide.png':['adaptive-hi.png',{left:594,top:219,width:2240,height:1320}],
 'plan-reason.png':['adaptive-hi.png',{left:775,top:972,width:1700,height:173}],
 'parent-wide.png':['parent-home-hi.png',{left:594,top:188,width:2240,height:1320}],
 };
 for(const [name,[src,rect]] of Object.entries(crops))await sharp(assets+'/'+src).extract(rect).png().toFile(assets+'/'+name);
 for(const name of ['soyle-icon.png','family-hero.webp','admin-focus.png'])await fs.copyFile(root+'/presentation_assets/'+name,assets+'/'+name);
}
