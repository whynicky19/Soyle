'use client';
import { t, useLocale } from '@/lib/i18n';

import { ArrowLeft, ArrowRight, BookOpen, Check, CircleHelp, Pause, Play, RotateCcw, Volume2, VolumeX, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { api } from '@/lib/api';
import Image from 'next/image';
import { playNarration } from '@/lib/storybook/cinematic/audio';
import { activeOptions, canTurnPage, promptFor } from '@/lib/storybook/book/mini-games';
import type { BookAssetManifest, BookSnapshot } from '@/lib/storybook/book/types';
import { BookArt } from './BookArt';
import { BookScene } from './BookScene';
import './book.css';

type Props={childId?:number;storyKey?:string;onExit:()=>void;calmMode?:boolean;embedded?:boolean};
type PendingEvent={version:number;expected_revision:number;scene_id:string;event_id:string;action:string};
export function InteractiveBook({childId,storyKey='toy',onExit,calmMode=false,embedded=false}:Props){
  const locale = useLocale();
  const Container=embedded?'section':'main';
  const [snapshot,setSnapshot]=useState<BookSnapshot|null>(null),[assets,setAssets]=useState<BookAssetManifest|null>(null);
  const [started,setStarted]=useState(false),[loaded,setLoaded]=useState(false),[loadingCount,setLoadingCount]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [sound,setSound]=useState(true),[motion,setMotion]=useState(!calmMode),[systemReduced,setSystemReduced]=useState(false),[narrating,setNarrating]=useState(false),[audioNote,setAudioNote]=useState(''),[pausing,setPausing]=useState(false),[hidden,setHidden]=useState(false);
  const live=useRef(true),sending=useRef(false),pending=useRef<PendingEvent|null>(null),voice=useRef<AbortController|null>(null),loadAbort=useRef<AbortController|null>(null);
  const pauseDialog=useRef<HTMLDialogElement>(null),title=useRef<HTMLHeadingElement>(null),pauseButton=useRef<HTMLButtonElement>(null);
  const rawScene=snapshot?.definition.scenes[snapshot.state.scene_index];
  const variant=rawScene?.image_by_choice;
  const scene=rawScene?{...rawScene,image:variant?.images[snapshot?.state.choices?.[variant.scene] || ''] || rawScene.image,narration:variant?.narrations?.[snapshot?.state.choices?.[variant.scene] || ''] || rawScene.narration}:undefined;
  const paused=!!snapshot?.state.paused||pausing;
  const stopVoice=useCallback(()=>{voice.current?.abort();voice.current=null;setNarrating(false);},[]);
  const load=useCallback(async()=>{
    if(!childId)return;
    loadAbort.current?.abort();const abort=new AbortController();loadAbort.current=abort;
    setError('');setLoaded(false);setLoadingCount(0);
    try{
      const next=await api<BookSnapshot>(`/api/interactive-storybooks/${childId}/${storyKey}`,{signal:abort.signal});
      const response=await fetch(next.definition.assets_manifest || '/storybooks/favorite-toy-book/manifest.json',{signal:abort.signal});
      if(!response.ok)throw new Error(t("book.copy000"));
      const manifest=await response.json() as BookAssetManifest;
      const sources=[...new Set(next.definition.scenes.flatMap(page=>[page.image,...(page.result_image?[page.result_image]:[]),...Object.values(page.image_by_choice?.images || {}),...Object.values(page.step_images || {}),...page.options.flatMap(option=>[...(option.result_image?[option.result_image]:[]),...(option.image?[option.image]:[])])]))];
      await Promise.all(sources.map(src=>new Promise<void>((resolve,reject)=>{const image=new window.Image();image.onload=()=>{void image.decode().then(()=>{if(live.current&&!abort.signal.aborted)setLoadingCount(count=>count+1);resolve();},reject);};image.onerror=()=>reject(new Error(t("book.copy001")));image.src=src;})));
      if(!live.current||abort.signal.aborted)return;setSnapshot(next);setAssets(manifest);setLoaded(true);pending.current=null;
    }catch(cause){if(live.current&&!abort.signal.aborted)setError(cause instanceof Error?cause.message:t("book.copy002"));}
  },[childId,storyKey]);
  useEffect(()=>{live.current=true;const timer=window.setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);live.current=false;loadAbort.current?.abort();voice.current?.abort();};},[load,locale]);
  useEffect(()=>{
    const query=matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setSystemReduced(query.matches);update();query.addEventListener('change',update);
    const visibility=()=>{setHidden(document.hidden);if(document.hidden)stopVoice();};document.addEventListener('visibilitychange',visibility);
    return()=>{query.removeEventListener('change',update);document.removeEventListener('visibilitychange',visibility);};
  },[stopVoice]);
  const clipData=JSON.stringify(snapshot?.definition.audio.clips||{});
  const clips=useMemo(()=>JSON.parse(clipData) as Record<string,string>,[clipData]);
  const narrationLanguage = snapshot?.definition.language || "ru";
  const narrate=useCallback(async(text:string)=>{
    stopVoice();if(!sound)return;
    const abort=new AbortController();voice.current=abort;setNarrating(true);

    try{await playNarration(text,abort.signal,clips,narrationLanguage);}catch{if(!abort.signal.aborted)setAudioNote(t("book.copy003"));}
    finally{if(live.current&&voice.current===abort){setNarrating(false);voice.current=null;}}
  },[sound,clips,stopVoice,narrationLanguage]);
  const chosen=snapshot?.definition.scenes.filter(page=>page.kind==='choice' && page.id!=='04').flatMap(page=>page.options.filter(option=>option.key===snapshot.state.choices?.[page.id]).map(option=>option.label)) || [];
  const narration=scene?.narration+(scene?.kind==='ending' && chosen.length?` ${t("book.copy004")} ${chosen.join(', ')}.`:'');
  useEffect(()=>{const timer=window.setTimeout(()=>{if(started&&narration&&!paused&&!hidden&&sound)void narrate(narration);},80);return()=>{clearTimeout(timer);stopVoice();};},[started,narration,paused,hidden,sound,narrate,stopVoice]);
  useEffect(()=>{if(started&&paused)pauseDialog.current?.showModal();else pauseDialog.current?.close();},[started,paused]);
  useEffect(()=>{if(started)title.current?.focus({preventScroll:true});},[scene?.id,started]);
  const dispatch=async(action:string)=>{
    if(!snapshot||!scene||!childId||sending.current)return;
    sending.current=true;setBusy(true);setError('');
    const event=pending.current?.action===action&&pending.current.expected_revision===snapshot.revision?pending.current:{version:snapshot.definition.version,expected_revision:snapshot.revision,scene_id:scene.id,event_id:crypto.randomUUID(),action};pending.current=event;
    try{
      const next=await api<BookSnapshot>(`/api/interactive-storybooks/${childId}/${storyKey}/events`,{method:'POST',body:JSON.stringify(event)});
      if(!live.current)return;stopVoice();setSnapshot(next);pending.current=null;return next;
    }catch(cause){if(live.current)setError(cause instanceof Error?cause.message:t("book.copy005"));}
    finally{sending.current=false;if(live.current)setBusy(false);}
  };
  const action=async(key:string)=>{const option=scene?.options.find(option=>option.key===key);const next=await dispatch(key);if(next&&sound)void narrate(option?.speech||next.state.feedback);};
  const pause=async(kind='pause')=>{stopVoice();setPausing(true);await dispatch(kind);if(live.current)setPausing(false);};
  const resume=async()=>{const next=await dispatch('resume');if(next)requestAnimationFrame(()=>pauseButton.current?.focus());};
  const exit=()=>{stopVoice();onExit();};
  const begin=async()=>{if(snapshot?.state.completed){if(!await dispatch('restart'))return;}setStarted(true);};
  const restart=async()=>{if(await dispatch('restart')){setStarted(true);window.scrollTo({top:0,behavior:'instant'});}};
  if(!childId)return <Container className="book-loading"><h1>{t("book.copy006")}</h1><button onClick={exit}>{t("book.copy007")}</button></Container>;
  if(!loaded||!snapshot||!scene||!assets)return <Container className="book-loading"><span className="book-eyebrow">{t("book.copy008")}</span><h1>{t("book.copy009")}</h1><p>{error||`${t("book.copy010")}${loadingCount?` · ${loadingCount}`:'…'}`}</p>{error&&<button onClick={()=>void load()}>{t("book.copy011")}</button>}<button onClick={exit}>{t("book.copy007")}</button></Container>;
  const {state,definition}=snapshot;
  const backLabel=snapshot.preview?t("book.copy007"):t("book.copy012");
  const choices=activeOptions(scene,state);
  const hint=state.hints.includes(scene.id);
  const isCards=['match','aac','choice','instruction'].includes(scene.kind);
  const ratio=assets.images[scene.image]?.width/assets.images[scene.image]?.height||1.5;
  const turns=canTurnPage(scene,state);
  return <Container aria-label={t("book.copy013")} className={`book-player ${motion&&!systemReduced?'book-has-motion':'book-reduced'}`} style={{'--book-ratio':ratio} as CSSProperties}>
    <header className="book-topbar"><button className="book-back" aria-label={backLabel} onClick={exit} disabled={busy}><ArrowLeft/><span>{backLabel}</span></button><div className="book-title"><span className="book-eyebrow">{t("book.copy008")}</span><strong>{definition.title}</strong></div><div className="book-top-tools"><span className="book-counter" aria-label={t("book.page", {page:state.scene_index+1,total:definition.scenes.length})}>{state.scene_index+1}<small>/ {definition.scenes.length}</small></span><button aria-label={sound?t("book.copy016"):t("book.copy017")} aria-pressed={sound} onClick={()=>{stopVoice();setSound(!sound);}}>{sound?<Volume2/>:<VolumeX/>}</button><button ref={pauseButton} aria-label={t("book.copy018")} disabled={!started||paused||busy} onClick={()=>void pause()}><Pause/></button></div></header>
    {error&&<aside className="book-error" role="alert"><strong>{error}</strong><button onClick={()=>void load()}>{t("book.copy019")}</button></aside>}
    <section className={`book-spread ${!started?'book-spread-cover':''} ${state.completed?'book-is-complete':''}`} aria-label={`${t("book.copy020")} ${scene.title}`}>
      <div className="book-picture-column"><div className="book-image-frame" key={scene.id}>
        <BookScene scene={scene} state={{...state,paused:paused||!started}} hint={hint} busy={busy||!!error} motion={motion&&!systemReduced&&!hidden&&!paused&&started} onAction={key=>void action(key)} ratio={ratio}/>
        {!started&&<div className="book-cover"><span className="book-cover-label">{t("book.copy021")}</span><h1>{definition.title}</h1><p>{definition.subtitle}</p><button className="book-primary" onClick={()=>void begin()} disabled={busy}><BookOpen/>{state.completed?t("book.copy022"):snapshot.revision?t("book.copy023"):t("book.copy024")}</button></div>}
      </div><nav className="book-page-dots" aria-label={t("book.copy025")}>{definition.scenes.map((page,index)=><span role="img" key={page.id} className={index===state.scene_index?'book-dot-current':index<state.scene_index?'book-dot-read':''} aria-label={`${page.title}${index===state.scene_index?t("book.copy026"):''}`} aria-current={index===state.scene_index?'step':undefined}/>)}</nav></div>
      <aside className="book-context">
        <span className="book-chapter">{state.completed?t("book.copy027"):`${t("book.copy028")} ${String(state.scene_index+1).padStart(2,'0')}`}</span>
        <h1 ref={title} tabIndex={-1}>{!started?t("book.copy029"):state.completed?t("book.copy030"):scene.title}</h1>
        {!started?<><p className="book-intro">{definition.scenes.length} {t("book.copy031")}</p><div className="book-preview-note"><strong>{snapshot.preview ? definition.status === 'DRAFT' ? t("book.copy032") : t("book.copy033") : t("book.copy034")}</strong><p>{snapshot.preview ? t("book.copy035") : t("book.copy036")}</p></div></>:<>
          <p className={`book-instruction ${state.ready?'book-feedback-ready':''}`} aria-live="polite">{state.completed?t("book.copy037"):promptFor(scene,state)}</p>
          {!state.ready&&state.feedback&&<p className="book-gentle-feedback" role="status">{state.feedback}</p>}
          {!state.completed&&isCards&&!state.ready&&<div className={`book-options book-options-${scene.kind}`} aria-label={scene.instruction}>{choices.map(option=><button key={option.key} className={state.selected===option.key?'book-option-explored':''} aria-label={option.label} disabled={busy||paused||!!error} onClick={()=>void action(option.key)}><span className="book-art">{option.image?<Image src={option.image} alt="" width={120} height={120} unoptimized/>:<BookArt art={option.art}/>}</span><strong>{option.label}</strong>{option.speech&&<small>{option.speech}</small>}</button>)}</div>}
          {!state.completed&&!isCards&&!state.ready&&scene.kind!=='watch'&&scene.kind!=='ending'&&<div className="book-on-picture"><span aria-hidden="true">✦</span><p>{scene.kind==='find'?t("book.copy038"):scene.kind==='help'?t("book.copy039"):scene.kind==='sequence'?t("book.copy040"):t("book.copy041")}</p></div>}
          {!state.completed&&['help','sequence'].includes(scene.kind)&&!state.ready&&choices.map(option=><button key={option.key} className="book-scene-alternative" disabled={busy||paused||!!error} onClick={()=>void action(option.key)}>{option.label}<ArrowRight/></button>)}
          {state.ready&&!state.completed&&<div className="book-complete-mark" aria-hidden="true"><Check/><span>{t("book.copy042")}</span></div>}
          {!state.completed&&turns&&<button className="book-primary book-next" disabled={busy||paused||!!error} onClick={()=>void dispatch('continue')} aria-label={scene.kind==='ending'?t("book.copy043"):t("book.copy044")}>{scene.kind==='ending'?t("book.copy043"):t("book.copy044")}<ArrowRight/></button>}
          {state.completed&&chosen.length>0&&<p className="book-choice-memory">{t("book.copy004")}{chosen.join(" · ")}</p>}{state.completed&&<div className="book-ending-actions"><button className="book-primary" onClick={exit}>{backLabel}<ArrowRight/></button><button onClick={()=>void restart()} disabled={busy}><RotateCcw/>{t("book.copy045")}</button></div>}
        </>}
      </aside>
    </section>
    <footer className="book-bottom">{started&&!state.completed&&state.scene_index>0&&<button disabled={paused||busy} onClick={()=>void dispatch('back')}><ArrowLeft/>{t("book.copy046")}</button>}{started&&!state.completed&&<><button className={narrating?'book-speaking':''} disabled={paused||!sound} onClick={()=>void (async()=>{if(await dispatch('repeat'))await narrate(narration || scene.narration);})()}><Volume2/>{t("book.copy047")}</button><button disabled={paused||busy} onClick={()=>void dispatch('hint')}><CircleHelp/>{t("book.copy048")}</button><button disabled={paused||busy} onClick={()=>void pause('break')}><Pause/>{t("book.copy049")}</button><button disabled={paused||busy} onClick={()=>void pause('refuse')}><X/>{t("book.copy050")}</button><details className="book-adult-help"><summary>{t("book.copy051")}</summary><button disabled={paused||busy} onClick={()=>void dispatch('assist')}>{t("book.copy052")}</button></details></>}<label className="book-motion-toggle"><input type="checkbox" checked={motion&&!systemReduced} disabled={systemReduced} onChange={event=>setMotion(event.target.checked)}/>{t("book.copy053")}</label>{busy&&<span role="status" className="book-saving">{t("book.copy054")}</span>}</footer>
    {audioNote&&<p role="status" className="book-audio-note">{audioNote}</p>}
    {started&&<p className="book-draft-footer">{snapshot.preview ? t("book.copy055") : t("book.copy056")}</p>}
    <dialog ref={pauseDialog} className="book-pause" aria-label={t("book.copy057")} onCancel={event=>{event.preventDefault();void resume();}}><span className="book-eyebrow">{t("book.copy058")}</span><h2>{t("book.copy059")}</h2><p>{t("book.copy060")}</p><button className="book-primary" disabled={busy} onClick={()=>void resume()}><Play/>{t("book.copy061")}</button><button disabled={busy} onClick={exit}>{backLabel}</button></dialog>
  </Container>;
}
