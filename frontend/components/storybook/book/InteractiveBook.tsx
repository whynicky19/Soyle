'use client';

import { ArrowLeft, ArrowRight, BookOpen, Check, CircleHelp, Pause, Play, RotateCcw, Volume2, VolumeX, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { api } from '@/lib/api';
import { playNarration } from '@/lib/storybook/cinematic/audio';
import { activeOptions, canTurnPage, promptFor } from '@/lib/storybook/book/mini-games';
import type { BookAssetManifest, BookSnapshot } from '@/lib/storybook/book/types';
import { BookArt } from './BookArt';
import { BookScene } from './BookScene';
import './book.css';

type Props={childId?:number;onExit:()=>void;calmMode?:boolean};
type PendingEvent={version:number;expected_revision:number;scene_id:string;event_id:string;action:string};
export function InteractiveBook({childId,onExit,calmMode=false}:Props){
  const [snapshot,setSnapshot]=useState<BookSnapshot|null>(null),[assets,setAssets]=useState<BookAssetManifest|null>(null);
  const [started,setStarted]=useState(false),[loaded,setLoaded]=useState(false),[loadingCount,setLoadingCount]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [sound,setSound]=useState(true),[motion,setMotion]=useState(!calmMode),[systemReduced,setSystemReduced]=useState(false),[narrating,setNarrating]=useState(false),[audioNote,setAudioNote]=useState(''),[pausing,setPausing]=useState(false),[hidden,setHidden]=useState(false);
  const live=useRef(true),sending=useRef(false),pending=useRef<PendingEvent|null>(null),voice=useRef<AbortController|null>(null),loadAbort=useRef<AbortController|null>(null);
  const pauseDialog=useRef<HTMLDialogElement>(null),title=useRef<HTMLHeadingElement>(null),pauseButton=useRef<HTMLButtonElement>(null);
  const scene=snapshot?.definition.scenes[snapshot.state.scene_index];
  const paused=!!snapshot?.state.paused||pausing;
  const stopVoice=useCallback(()=>{voice.current?.abort();voice.current=null;setNarrating(false);},[]);
  const load=useCallback(async()=>{
    if(!childId)return;
    loadAbort.current?.abort();const abort=new AbortController();loadAbort.current=abort;
    setError('');setLoaded(false);setLoadingCount(0);
    try{
      const [next,manifest]=await Promise.all([api<BookSnapshot>(`/api/interactive-storybooks/${childId}/toy`,{signal:abort.signal}),fetch('/storybooks/favorite-toy-book/manifest.json',{signal:abort.signal}).then(async res=>{if(!res.ok)throw new Error('Иллюстрации пока не загрузились');return res.json() as Promise<BookAssetManifest>;})]);
      const sources=[...new Set([...next.definition.scenes.flatMap(page=>[page.image,...(page.result_image?[page.result_image]:[])]),'/storybooks/favorite-toy-book/objects.webp','/app-illustrations/aac-help.webp'])];
      await Promise.all(sources.map(src=>new Promise<void>((resolve,reject)=>{const image=new window.Image();image.onload=()=>{void image.decode().then(()=>{if(live.current&&!abort.signal.aborted)setLoadingCount(count=>count+1);resolve();},reject);};image.onerror=()=>reject(new Error('Не удалось загрузить одну из иллюстраций. Попробуй ещё раз.'));image.src=src;})));
      if(!live.current||abort.signal.aborted)return;setSnapshot(next);setAssets(manifest);setLoaded(true);pending.current=null;
    }catch(cause){if(live.current&&!abort.signal.aborted)setError(cause instanceof Error?cause.message:'Не удалось открыть книгу');}
  },[childId]);
  useEffect(()=>{live.current=true;const timer=window.setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);live.current=false;loadAbort.current?.abort();voice.current?.abort();};},[load]);
  useEffect(()=>{
    const query=matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setSystemReduced(query.matches);update();query.addEventListener('change',update);
    const visibility=()=>{setHidden(document.hidden);if(document.hidden)stopVoice();};document.addEventListener('visibilitychange',visibility);
    return()=>{query.removeEventListener('change',update);document.removeEventListener('visibilitychange',visibility);};
  },[stopVoice]);
  const clipData=JSON.stringify(snapshot?.definition.audio.clips||{});
  const clips=useMemo(()=>JSON.parse(clipData) as Record<string,string>,[clipData]);
  const narrate=useCallback(async(text:string)=>{
    stopVoice();if(!sound)return;
    const abort=new AbortController();voice.current=abort;setNarrating(true);
    if(!('speechSynthesis' in window)&&!clips[text])setAudioNote('Звук недоступен. Все действия доступны по картинкам и подписям.');
    try{await playNarration(text,abort.signal,clips);}catch{if(!abort.signal.aborted)setAudioNote('Не удалось включить звук. Можно продолжать по картинкам.');}
    finally{if(live.current&&voice.current===abort){setNarrating(false);voice.current=null;}}
  },[sound,clips,stopVoice]);
  const narration=scene?.narration;
  useEffect(()=>{const timer=window.setTimeout(()=>{if(started&&narration&&!paused&&!hidden&&sound)void narrate(narration);},80);return()=>{clearTimeout(timer);stopVoice();};},[started,narration,paused,hidden,sound,narrate,stopVoice]);
  useEffect(()=>{if(started&&paused)pauseDialog.current?.showModal();else pauseDialog.current?.close();},[started,paused]);
  useEffect(()=>{if(started)title.current?.focus({preventScroll:true});},[scene?.id,started]);
  const dispatch=async(action:string)=>{
    if(!snapshot||!scene||!childId||sending.current)return;
    sending.current=true;setBusy(true);setError('');
    const event=pending.current?.action===action&&pending.current.expected_revision===snapshot.revision?pending.current:{version:3,expected_revision:snapshot.revision,scene_id:scene.id,event_id:crypto.randomUUID(),action};pending.current=event;
    try{
      const next=await api<BookSnapshot>(`/api/interactive-storybooks/${childId}/toy/events`,{method:'POST',body:JSON.stringify(event)});
      if(!live.current)return;stopVoice();setSnapshot(next);pending.current=null;return next;
    }catch(cause){if(live.current)setError(cause instanceof Error?cause.message:'Действие не сохранилось. Можно повторить нажатие.');}
    finally{sending.current=false;if(live.current)setBusy(false);}
  };
  const action=async(key:string)=>{const option=scene?.options.find(option=>option.key===key);const next=await dispatch(key);if(next&&sound)void narrate(option?.speech||next.state.feedback);};
  const pause=async(kind='pause')=>{stopVoice();setPausing(true);await dispatch(kind);if(live.current)setPausing(false);};
  const resume=async()=>{const next=await dispatch('resume');if(next)requestAnimationFrame(()=>pauseButton.current?.focus());};
  const exit=()=>{stopVoice();onExit();};
  const begin=async()=>{if(snapshot?.state.completed){if(!await dispatch('restart'))return;}setStarted(true);};
  const restart=async()=>{if(await dispatch('restart')){setStarted(true);window.scrollTo({top:0,behavior:'instant'});}};
  if(!childId)return <main className="book-loading"><h1>Сначала добавьте профиль ребёнка</h1><button onClick={exit}>В кабинет</button></main>;
  if(!loaded||!snapshot||!scene||!assets)return <main className="book-loading"><span className="book-eyebrow">SÖYLE · ИНТЕРАКТИВНАЯ КНИГА</span><h1>Открываем «Любимую игрушку»</h1><p>{error||`Готовим иллюстрации${loadingCount?` · ${loadingCount}`:'…'}`}</p>{error&&<button onClick={()=>void load()}>Попробовать снова</button>}<button onClick={exit}>В кабинет</button></main>;
  const {state,definition}=snapshot;
  const choices=activeOptions(scene,state);
  const hint=state.hints.includes(scene.id);
  const isCards=scene.kind==='match'||scene.kind==='aac';
  const ratio=assets.images[scene.image]?.width/assets.images[scene.image]?.height||1.5;
  const turns=canTurnPage(scene,state);
  return <main className={`book-player ${motion&&!systemReduced?'book-has-motion':'book-reduced'}`} style={{'--book-ratio':ratio} as CSSProperties}>
    <header className="book-topbar"><button className="book-back" aria-label="В кабинет" onClick={exit} disabled={busy}><ArrowLeft/><span>В кабинет</span></button><div className="book-title"><span className="book-eyebrow">SÖYLE · ИНТЕРАКТИВНАЯ КНИГА</span><strong>{definition.title}</strong></div><div className="book-top-tools"><span className="book-counter" aria-label={`Страница ${state.scene_index+1} из 6`}>{state.scene_index+1}<small>/ 6</small></span><button aria-label={sound?'Выключить звук':'Включить звук'} aria-pressed={sound} onClick={()=>{stopVoice();setSound(!sound);}}>{sound?<Volume2/>:<VolumeX/>}</button><button ref={pauseButton} aria-label="Пауза" disabled={!started||paused||busy} onClick={()=>void pause()}><Pause/></button></div></header>
    {error&&<aside className="book-error" role="alert"><strong>{error}</strong><button onClick={()=>void load()}>Восстановить сохранённую страницу</button></aside>}
    <section className={`book-spread ${!started?'book-spread-cover':''} ${state.completed?'book-is-complete':''}`} aria-label={`Страница: ${scene.title}`}>
      <div className="book-picture-column"><div className="book-image-frame" key={scene.id}>
        <BookScene scene={scene} state={{...state,paused:paused||!started}} hint={hint} busy={busy||!!error} motion={motion&&!systemReduced&&!hidden&&!paused&&started} onAction={key=>void action(key)} ratio={ratio}/>
        {!started&&<div className="book-cover"><span className="book-cover-label">КНИГА С МАЛЕНЬКИМИ ИГРАМИ</span><h1>Любимая<br/>игрушка</h1><p>Найдём мишку.<br/>Позовём маму.<br/>Поиграем вместе.</p><button className="book-primary" onClick={()=>void begin()} disabled={busy}><BookOpen/>{state.completed?'Перечитать':snapshot.revision?'Продолжить чтение':'Открыть книгу'}</button></div>}
      </div><nav className="book-page-dots" aria-label="Прогресс по страницам">{definition.scenes.map((page,index)=><span role="img" key={page.id} className={index===state.scene_index?'book-dot-current':index<state.scene_index?'book-dot-read':''} aria-label={`${page.title}${index===state.scene_index?', текущая страница':''}`} aria-current={index===state.scene_index?'step':undefined}/>)}</nav></div>
      <aside className="book-context">
        <span className="book-chapter">{state.completed?'КОНЕЦ ИСТОРИИ':`СТРАНИЦА ${String(state.scene_index+1).padStart(2,'0')}`}</span>
        <h1 ref={title} tabIndex={-1}>{!started?'Одна уютная история':state.completed?'Побудем вместе':scene.title}</h1>
        {!started?<><p className="book-intro">Шесть страниц, на которых можно искать, выбирать и помогать.</p><div className="book-preview-note"><strong>DRAFT · предпросмотр взрослого</strong><p>Новые иллюстрации и сценарий ожидают проверки.</p></div></>:<>
          <p className={`book-instruction ${state.ready?'book-feedback-ready':''}`} aria-live="polite">{state.completed?'Мишка рядом. Играть с другом приятно.':promptFor(scene,state)}</p>
          {!state.ready&&state.feedback&&<p className="book-gentle-feedback" role="status">{state.feedback}</p>}
          {!state.completed&&isCards&&!state.ready&&<div className={`book-options book-options-${scene.kind}`} aria-label={scene.instruction}>{choices.map(option=><button key={option.key} className={state.selected===option.key?'book-option-explored':''} aria-label={option.label} disabled={busy||paused||!!error} onClick={()=>void action(option.key)}><BookArt art={option.art}/><strong>{option.label}</strong>{option.speech&&<small>{option.speech}</small>}</button>)}</div>}
          {!state.completed&&!isCards&&!state.ready&&<div className="book-on-picture"><span aria-hidden="true">✦</span><p>{scene.kind==='find'?'Игрушки прячутся прямо в иллюстрации.':scene.kind==='help'?'Нажми на мишку между мамой и Мишей.':scene.kind==='sequence'?'Два простых нажатия — поезд, затем рельсы.':'Можно послушать и немного побыть здесь.'}</p></div>}
          {!state.completed&&['help','sequence'].includes(scene.kind)&&!state.ready&&choices.map(option=><button key={option.key} className="book-scene-alternative" disabled={busy||paused||!!error} onClick={()=>void action(option.key)}>{option.label}<ArrowRight/></button>)}
          {state.ready&&!state.completed&&<div className="book-complete-mark" aria-hidden="true"><Check/><span>Можно перевернуть страницу</span></div>}
          {!state.completed&&turns&&<button className="book-primary book-next" disabled={busy||paused||!!error} onClick={()=>void dispatch('continue')} aria-label={scene.kind==='ending'?'Закончить книгу':'Дальше'}>{scene.kind==='ending'?'Закончить книгу':'Дальше'}<ArrowRight/></button>}
          {state.completed&&<div className="book-ending-actions"><button className="book-primary" onClick={exit}>В кабинет<ArrowRight/></button><button onClick={()=>void restart()} disabled={busy}><RotateCcw/>Прочитать ещё раз</button></div>}
        </>}
      </aside>
    </section>
    <footer className="book-bottom">{started&&!state.completed&&<><button className={narrating?'book-speaking':''} disabled={paused||!sound} onClick={()=>void narrate(scene.narration)}><Volume2/>Послушать ещё раз</button><button disabled={paused||busy} onClick={()=>void dispatch('hint')}><CircleHelp/>Подсказка</button><button disabled={paused||busy} onClick={()=>void pause('break')}><Pause/>Перерыв</button><button disabled={paused||busy} onClick={()=>void pause('refuse')}><X/>Не хочу</button><details className="book-adult-help"><summary>Вместе со взрослым</summary><button disabled={paused||busy} onClick={()=>void dispatch('assist')}>Помочь вместе</button></details></>}<label className="book-motion-toggle"><input type="checkbox" checked={motion&&!systemReduced} disabled={systemReduced} onChange={event=>setMotion(event.target.checked)}/>Мягкие движения</label>{busy&&<span role="status" className="book-saving">Сохраняем…</span>}</footer>
    {audioNote&&<p role="status" className="book-audio-note">{audioNote}</p>}
    {started&&<p className="book-draft-footer">DRAFT · предпросмотр родителя · без оценок и соревнования</p>}
    <dialog ref={pauseDialog} className="book-pause" aria-label="Книга на паузе" onCancel={event=>{event.preventDefault();void resume();}}><span className="book-eyebrow">МОЖНО НЕ СПЕШИТЬ</span><h2>Книга подождёт</h2><p>Мы сохранили эту страницу.</p><button className="book-primary" disabled={busy} onClick={()=>void resume()}><Play/>Продолжить</button><button disabled={busy} onClick={exit}>Выйти в кабинет</button></dialog>
  </main>;
}
