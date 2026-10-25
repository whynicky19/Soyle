'use client';
import { ArrowLeft, Pause, Play, Volume2, VolumeX, RotateCcw, CircleHelp, Heart, ArrowRight } from 'lucide-react';
import NextImage from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { RigRenderer, type RigManifest } from '@/lib/storybook/cinematic/rig';
import { createTimelineController, type Phase, type TimelineController } from '@/lib/storybook/cinematic/timeline';
import { playNarration } from '@/lib/storybook/cinematic/audio';
import { CinematicStage } from './CinematicStage';
import './cinematic.css';
const phases: Phase[] = ['INTRO','NOTICE','REACH','AWAIT_REQUEST','REQUEST','MOTHER_ENTER','PICK_UP','TRANSFER','HUG','COMPLETE'];
type Snapshot = { preview: boolean; revision: number; definition: { title: string; review_note: string; communication_options: {action:string;label:string;speech:string}[]; audio:{clips:Record<string,string>} }; state:{phase:Phase;paused:boolean;completed:boolean} };
const captions: Record<Phase,string> = {INTRO:'Миша играет в своей комнате',NOTICE:'На полке — любимый мишка',REACH:'Мишка слишком высоко',AWAIT_REQUEST:'Мише нужна помощь. Поможем попросить?',REQUEST:'Мама, помоги!',MOTHER_ENTER:'Мама услышала просьбу',MOTHER_WALK:'Мама подходит к полке',PICK_UP:'Мама берёт мишку',CARRY:'Мама несёт игрушку Мише',TRANSFER:'Мишка — для Миши',HUG:'Мишка у тебя! Обними его',COMPLETE:'Как хорошо играть вместе!'};
export function CinematicStorybookExperience({childId,onExit,calmMode=false,embedded=false}:{childId?:number;onExit:()=>void;calmMode?:boolean;embedded?:boolean}) {
  const Container=embedded?'section':'main';
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null), [manifest,setManifest]=useState<RigManifest|null>(null);
  const [started,setStarted]=useState(false), [ready,setReady]=useState(false), [phase,setPhase]=useState<Phase>('INTRO');
  const [paused,setPaused]=useState(false), [sound,setSound]=useState(true), [motion,setMotion]=useState(!calmMode), [hint,setHint]=useState(false), [busy,setBusy]=useState(false), [error,setError]=useState(''),[voiceNote,setVoiceNote]=useState('');
  const pauseDialog=useRef<HTMLDialogElement>(null);
  const svg=useRef<SVGSVGElement>(null), rig=useRef<RigRenderer|null>(null), controller=useRef<TimelineController|null>(null), current=useRef<Snapshot|null>(null), queue=useRef<Promise<void>>(Promise.resolve()), failed=useRef(false), alive=useRef(true), soundRef=useRef(sound), extraAudio=useRef<AbortController|null>(null), startedRef=useRef(false), actionLock=useRef(false), activeAudio=useRef<AbortController|null>(null);
  useEffect(()=>{soundRef.current=sound;if(!sound)activeAudio.current?.abort();},[sound]);
  const accept=(next:Snapshot)=>{ current.current=next; if(alive.current) setSnapshot(next); };
  const post=async(action:string)=>{
    const saved=current.current; if(!saved||!childId) throw new Error('Профиль ребёнка недоступен');
    const next=await api<Snapshot>(`/api/cinematic-storybooks/${childId}/toy/events`,{method:'POST',body:JSON.stringify({version:2,expected_revision:saved.revision,phase:saved.state.phase,action,event_id:crypto.randomUUID()})}); accept(next); return next;
  };
  const enqueue=(work:()=>Promise<void>)=>{
    queue.current=queue.current.then(async()=>{if(!failed.current) await work();}).catch(cause=>{
      failed.current=true; controller.current?.pause(); rig.current?.setPaused(true); if(alive.current){setPaused(true);setError(cause instanceof Error?cause.message:'Не удалось сохранить действие');}
    }); return queue.current;
  };
  const checkpoint=(next:Phase)=>{
    setPhase(next); setHint(false);
    const normalized=next==='MOTHER_WALK'?'MOTHER_ENTER':next==='CARRY'?'PICK_UP':next;
    void enqueue(async()=>{
      let saved=current.current;
      // Motor checkpoints persist in order. Communication and hug are explicit gates.
      while(saved && phases.indexOf(saved.state.phase)<phases.indexOf(normalized)){
        if(saved.state.phase==='AWAIT_REQUEST') return;
        saved=await post('advance');
      }
    });
  };
  useEffect(()=>{
    alive.current=true; let cancelled=false;
    void Promise.all([api<Snapshot>(`/api/cinematic-storybooks/${childId}/toy`),fetch('/storybooks/cinematic-toy/manifest.json').then(async response=>{if(!response.ok)throw new Error('Не удалось загрузить сцену');return response.json() as Promise<RigManifest>;})]).then(async([saved,assets])=>{
      await Promise.all([...new Set([assets.environment.room,assets.actors.child.url,assets.actors.mother.url,assets.teddy.url])].map(url=>new Promise<void>((resolve,reject)=>{const image=new Image();image.onload=()=>void image.decode().then(resolve,reject);image.onerror=()=>reject(new Error('Не удалось загрузить иллюстрации'));image.src=url;})));
      if(cancelled)return; accept(saved);setManifest(assets);setPhase(saved.state.phase);setPaused(saved.state.paused);
    }).catch(cause=>{if(!cancelled)setError(cause.message);});
    return()=>{cancelled=true;alive.current=false;extraAudio.current?.abort();activeAudio.current?.abort();controller.current?.dispose();rig.current?.dispose();};
  // The profile is fixed for this mounted player.
    },[childId]);
  useEffect(()=>{
    if(!manifest||!svg.current)return; let cancelled=false;
    const reduced=!motion||matchMedia('(prefers-reduced-motion: reduce)').matches;
    const renderer=new RigRenderer(svg.current,reduced);rig.current=renderer;if(current.current?.state.paused)renderer.setPaused(true);
    void createTimelineController({setPose:(actor,pose)=>renderer.setPose(actor,pose),attachTeddy:holder=>renderer.attachTeddy(holder),onPhase:checkpoint,narrate:async(text,signal)=>{
      if(!soundRef.current)return;
      if(!('speechSynthesis' in window)&&!current.current?.definition.audio.clips[text])setVoiceNote('Озвучка недоступна. Подписи и все действия работают.');
      extraAudio.current?.abort();const audio=new AbortController();activeAudio.current?.abort();activeAudio.current=audio;
      const abort=()=>audio.abort();signal.addEventListener('abort',abort,{once:true});
      try{await playNarration(text,audio.signal,current.current?.definition.audio.clips);}finally{signal.removeEventListener('abort',abort);if(activeAudio.current===audio)activeAudio.current=null;}
    }},{reducedMotion:reduced,onError:()=>setVoiceNote('Звук недоступен. Можно продолжить по картинкам.')}).then(value=>{
      if(cancelled){value.dispose();return;}controller.current=value;setReady(true);
      if(startedRef.current) {if(current.current?.state.paused)value.pause();void value.restore(current.current?.state.phase||'INTRO');}
    });
    const visibility=()=>renderer.setPaused(document.hidden||!!current.current?.state.paused);document.addEventListener('visibilitychange',visibility);
    return()=>{cancelled=true;setReady(false);controller.current?.dispose();controller.current=null;renderer.dispose();document.removeEventListener('visibilitychange',visibility);};
  // Rebuild the controller only when assets or the motion preference change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[manifest,motion]);
  useEffect(()=>{const dialog=pauseDialog.current;if(started&&paused&&!error)dialog?.showModal();else dialog?.close();},[started,paused,error]);
  const begin=()=>{if(!ready||!controller.current)return;if(current.current?.state.completed){void act('restart',()=>{setStarted(true);startedRef.current=true;setPaused(false);rig.current?.setPaused(false);controller.current?.resume();void controller.current?.replay();});return;}setStarted(true);startedRef.current=true;if(current.current?.state.paused){controller.current.pause();rig.current?.setPaused(true);}void controller.current.restore(current.current?.state.phase||'INTRO');};
  const act=async(action:string,run?:()=>void)=>{
    if(actionLock.current||failed.current)return;actionLock.current=true;setBusy(true);
    await enqueue(async()=>{await post(action);run?.();});
    actionLock.current=false;if(alive.current)setBusy(false);
  };
  const pause=(action='pause')=>{controller.current?.pause();rig.current?.setPaused(true);extraAudio.current?.abort();setPaused(true);void act(action);};
  const resume=()=>void act('resume',()=>{setPaused(false);rig.current?.setPaused(false);controller.current?.resume();});
  const request=(action:string,text:string)=>void act(action,()=>void controller.current?.request(text));
  const teddy=()=>{if(phase==='HUG')void controller.current?.hug();else{setHint(true);controller.current?.observeTeddy();}};
  const repeat=()=>{activeAudio.current?.abort();extraAudio.current?.abort();const abort=new AbortController();extraAudio.current=abort;if(sound)void playNarration(captions[phase],abort.signal,snapshot?.definition.audio.clips).catch(()=>{if(!abort.signal.aborted)setVoiceNote('Не удалось включить звук. Можно продолжить по картинкам.');});};
  const exit=async()=>{
    const knownFailure=failed.current;
    setBusy(true);controller.current?.pause();extraAudio.current?.abort();activeAudio.current?.abort();
    await queue.current;
    if(!knownFailure&&failed.current){setBusy(false);return;}
    controller.current?.dispose();rig.current?.dispose();onExit();
  };
  const restart=()=>void act('restart',()=>{setPaused(false);rig.current?.setPaused(false);controller.current?.resume();void controller.current?.replay();});
  const backLabel=snapshot?.preview?'В кабинет':'К историям';
  return <Container aria-label="Живая история" className="cinema-player">
    <header className="cinema-top"><button aria-label={backLabel} onClick={()=>void exit()}><ArrowLeft/><span>{backLabel}</span></button><div><span className="cinema-eyebrow">SÖYLE STORIES · СЦЕНА 1 / 1</span><h1>Миша просит помощь</h1></div><div className="cinema-top-actions"><button aria-label={sound?'Выключить звук':'Включить звук'} aria-pressed={sound} onClick={()=>{setSound(!sound);extraAudio.current?.abort();if('speechSynthesis' in window)speechSynthesis.cancel();}}>{sound?<Volume2/>:<VolumeX/>}</button>{started&&<button aria-label="Пауза" onClick={()=>pause()} disabled={paused||busy}><Pause/></button>}</div></header>
    {error&&<aside className="cinema-error" role="alert">{error}<button onClick={()=>void exit()}>{backLabel}</button><p>Открой историю снова, чтобы восстановить сохранённый этап.</p></aside>}
    {!manifest?<section className="cinema-loading"><h2>Готовим уютную комнату…</h2></section>:<>
    <section className={`cinema-stage-wrap ${hint?'cinema-hinted':''}`}><CinematicStage ref={svg} manifest={manifest} phase={phase} hint={hint} paused={paused||!started} onTeddy={teddy}/>
      {!started&&<div className="cinema-cover"><span>ОДНА ЖИВАЯ СЦЕНА</span><h2>Иногда нужна<br/>помощь мамы</h2><p>Посмотрим, как Миша попросит любимого мишку.</p><button className="cinema-primary" disabled={!ready||!!error} onClick={begin}><Play/>{snapshot?.state.completed?'Пересмотреть сцену':snapshot?.revision?'Продолжить сцену':'Начать сцену'}</button></div>}
      <dialog ref={pauseDialog} className="cinema-pause" aria-label="История на паузе" onCancel={e=>{e.preventDefault();resume();}}><div><span>МОЖНО НЕ СПЕШИТЬ</span><h2>Побудем здесь</h2><p>Продолжим, когда захочется.</p><button className="cinema-primary" onClick={resume} disabled={busy}><Play/>Продолжить</button><button onClick={()=>void exit()}>{backLabel}</button></div></dialog>
    </section>
    {started&&<section className="cinema-context"><p className="cinema-caption" aria-live="polite">{captions[phase]}</p>
      {phase==='AWAIT_REQUEST'&&!paused&&<div className="cinema-choices" aria-label="Выбери способ просьбы">{snapshot?.definition.communication_options.map((option,index)=><button key={option.action} aria-label={option.label} disabled={busy||snapshot.state.phase!=='AWAIT_REQUEST'||!!error} onClick={()=>request(option.action,option.speech)}><span className="cinema-choice-art"><NextImage src={index===0?"/app-illustrations/aac-help.webp":index===1?"/app-illustrations/aac-teddy.webp":"/app-illustrations/aac-teddy.webp"} width={76} height={76} alt=""/>{index===2&&<ArrowRight className="cinema-point-arrow"/>}</span><strong>{option.label}</strong><small>{option.speech}</small></button>)}<button className="cinema-refuse" disabled={busy} onClick={()=>pause('refuse')}>Не хочу</button></div>}
      {phase==='HUG'&&!paused&&<button className="cinema-primary cinema-hug" disabled={busy||!!error} onClick={teddy}><Heart/>Обнять мишку</button>}
      {phase==='COMPLETE'&&!snapshot?.state.completed&&<p role="status">Сохраняем историю…</p>}{phase==='COMPLETE'&&snapshot?.state.completed&&<div className="cinema-end"><p>Миша попросил помощь — и мама помогла.</p><button className="cinema-primary" onClick={()=>void exit()}>{backLabel}<ArrowRight/></button></div>}
    </section>}
    <footer className="cinema-bottom">{started&&<><button onClick={repeat} disabled={paused||!sound}><Volume2/>Повторить озвучку</button><button disabled={paused||busy} onClick={()=>{setHint(true);void act('hint');}}><CircleHelp/>Подсказка</button><button onClick={()=>pause('break')} disabled={paused||busy}><Pause/>Перерыв</button><button onClick={restart} disabled={busy||!!error}><RotateCcw/>Сначала</button>{!['AWAIT_REQUEST','HUG','COMPLETE'].includes(phase)&&<button disabled={paused||busy} onClick={()=>controller.current?.skip()}>Пропустить движение</button>}{phase==='AWAIT_REQUEST'&&<button disabled={paused||busy} onClick={()=>request('assist','Мама поможет достать мишку.')}>Помочь вместе</button>}</>}<label className="cinema-motion"><input type="checkbox" checked={motion} disabled={started&&!paused&&phase!=='COMPLETE'} onChange={e=>setMotion(e.target.checked)}/>Плавные движения</label></footer>
    <aside className="cinema-review"><strong>{snapshot?.preview ? 'Предпросмотр взрослого' : 'Одна живая сцена'}</strong><span>{snapshot?.preview ? 'Предпросмотр хранится отдельно от результата ребёнка.' : 'Можно выбрать просьбу, сделать перерыв и продолжить позже.'}</span>{voiceNote&&<p role="status">{voiceNote}</p>}</aside>
    </>}
  </Container>;
}
