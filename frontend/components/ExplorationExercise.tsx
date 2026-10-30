"use client";
import { useExercisePet } from "./pet/ExercisePet";
import Image from 'next/image';
import {useCallback,useEffect,useImperativeHandle,useLayoutEffect,useRef,useState,type Ref} from 'react';
import {Volume2,Lightbulb,ZoomIn,ZoomOut,Scan,Pause,CircleX,ArrowLeft,Check} from 'lucide-react';
import {api,ApiError} from '@/lib/api';
import {stopCurrentSpeech} from '@/lib/speech';
import {polygonPath,scenePoint,type ExplorationContent,type SearchSnapshot,type SearchEvent,type SearchMeasurement} from '@/lib/explorationRuntime';

type Props={content:ExplorationContent;childId?:number;exerciseId?:number;previewVersionId?:number;learningSessionId?:number;plannedLevel?:1|2|3;defaultRounds?:number;soundEnabled:boolean;showStopControls?:boolean;onSpeak:(text:string,rate?:number)=>Promise<boolean>;onBack:()=>void;onComplete:(measurement:SearchMeasurement,details:Record<string,unknown>)=>Promise<unknown>|void;stopRef?:Ref<(status:'break'|'refused')=>Promise<void>>};
export function ExplorationExercise({content,childId,exerciseId,previewVersionId,learningSessionId,plannedLevel,defaultRounds,soundEnabled,showStopControls=true,onSpeak,onBack,onComplete,stopRef}:Props){
  const pet = useExercisePet();
  const [saved,setSaved]=useState<SearchSnapshot|null>(null),[level,setLevel]=useState<1|2|3>(plannedLevel||1),[rounds,setRounds]=useState(defaultRounds||4);
  const [accessible,setAccessible]=useState(false),[busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[started,setStarted]=useState(false),[loading,setLoading]=useState(!previewVersionId),[error,setError]=useState(''),[finished,setFinished]=useState(false),[hasPending,setHasPending]=useState(false);
  const [view,setView]=useState<{zoom:number;center:{x:number;y:number}|null}>({zoom:1,center:null}),[viewportWidth,setViewportWidth]=useState(960),[hintVisible,setHintVisible]=useState(false);
  const viewport=useRef<HTMLDivElement>(null),svg=useRef<SVGSVGElement>(null),pointer=useRef<{x:number;y:number;rect:DOMRect}|null>(null);
  const snapshotRef=useRef<SearchSnapshot|null>(null),mounted=useRef(true),queue=useRef<Promise<unknown>>(Promise.resolve()),audioEpoch=useRef(0),savingRef=useRef(false),autoRef=useRef(''),pending=useRef<{event:SearchEvent;body:string}|null>(null);
  const callbacks=useRef({onSpeak,onComplete,onBack});
  useEffect(()=>{callbacks.current={onSpeak,onComplete,onBack};},[onSpeak,onComplete,onBack]);
  const invalidateAudio=useCallback(()=>{audioEpoch.current++;stopCurrentSpeech();},[]);
  const accept=useCallback((next:SearchSnapshot)=>{snapshotRef.current=next;if(mounted.current)setSaved(next);return next;},[]);
  const scene=saved?.scene||content.exploration;
  const zoom=view.zoom;
  const imageRatio=scene?scene.image.height/scene.image.width:9/16;
  const target=saved&&scene?.objects.find(o=>o.id===saved.state.order[saved.state.index]);
  const instruction=target?.instructions[String(saved?.state.level)]||'Рассмотри локацию';
  const isPreview=Boolean(previewVersionId);
  const operation=useCallback((event:SearchEvent):Promise<SearchSnapshot|null>=>{
    const work=async()=>{
      let current=snapshotRef.current;if(!current)return null;
      if(mounted.current){setBusy(true);setError('');}
      if(pending.current&&pending.current.event.action!==event.action){
        try{const previous=await api<SearchSnapshot>(`/api/exploration/runs/${current.id}/events`,{method:'POST',body:pending.current.body});accept(previous);current=previous;pending.current=null;if(mounted.current)setHasPending(false);if(['completed','refused','technical_error'].includes(previous.state.status)){if(mounted.current)setBusy(false);return previous;}}catch(cause){if(mounted.current){setError(cause instanceof Error?cause.message:'Не удалось восстановить действие.');setBusy(false);}return null;}
      }
      const body=pending.current?.body||JSON.stringify({...event,event_id:crypto.randomUUID(),expected_revision:current.revision});
      pending.current={event,body};
      try{const next=await api<SearchSnapshot>(`/api/exploration/runs/${current.id}/events`,{method:'POST',body});pending.current=null;if(mounted.current)setHasPending(false);return accept(next);}
      catch(cause){
        if(cause instanceof ApiError&&cause.status===409){pending.current=null;if(mounted.current)setHasPending(false);const latest=await api<SearchSnapshot>(`/api/exploration/runs/${current.id}`).catch(()=>null);if(latest)accept(latest);}
        if(mounted.current){setHasPending(Boolean(pending.current));setError(cause instanceof Error?cause.message:'Не удалось сохранить действие. Повтори попытку.');}return null;
      }finally{if(mounted.current)setBusy(false);}
    };
    const task=queue.current.then(work);queue.current=task.catch(()=>null);return task;
  },[accept]);
  const narrate=useCallback(async(current:SearchSnapshot,repeat=false)=>{
    const item=current.scene.objects.find(o=>o.id===current.state.order[current.state.index]);if(!item)return null;
    const epoch=++audioEpoch.current;if(mounted.current)setBusy(true);
    const played=soundEnabled&&await callbacks.current.onSpeak(item.instructions[String(current.state.level)],.78).catch(()=>false);
    if(epoch!==audioEpoch.current)return null;
    return operation({action:repeat?'repeat':'audio',audio_success:played});
  },[operation,soundEnabled]);
  const finish=useCallback(async(current:SearchSnapshot)=>{
    if(savingRef.current)return;savingRef.current=true;if(mounted.current){setSaving(true);setError('');}
    try{
      const result=await callbacks.current.onComplete(current.measurement,current.details);
      if(result){if(mounted.current)setFinished(true);if(['paused','refused','technical_error'].includes(current.state.status))callbacks.current.onBack();}
      else if(mounted.current)setError('Результат не сохранён. Нажми «Повторить сохранение».');
    }catch(cause){if(mounted.current)setError(cause instanceof Error?cause.message:'Результат не сохранён. Повтори сохранение.');}
    finally{savingRef.current=false;if(mounted.current)setSaving(false);}
  },[]);
  const stop=useCallback(async(status:'break'|'refused')=>{
    audioEpoch.current++;stopCurrentSpeech();setStarted(false);setHintVisible(false);
    const current=snapshotRef.current;if(!current){callbacks.current.onBack();return;}
    const next=['completed','refused','technical_error'].includes(current.state.status)?current:await operation({action:status==='break'?'pause':'refuse'});
    if(next)await finish(next);
  },[finish,operation]);
  useImperativeHandle(stopRef,()=>stop,[stop]);
  useEffect(()=>{
    let active=true;mounted.current=true;
    if(!previewVersionId&&childId&&exerciseId){
      const query=new URLSearchParams({exercise_id:String(exerciseId),...(learningSessionId?{learning_session_id:String(learningSessionId)}:{})});
      api<SearchSnapshot|null>(`/api/exploration/${childId}/active?${query}`).then(next=>{if(active&&next)accept(next);}).catch(cause=>{if(active)setError(cause.message);}).finally(()=>{if(active)setLoading(false);});
    }
    return()=>{
      active=false;mounted.current=false;invalidateAudio();
      void queue.current.then(async()=>{
        const current=snapshotRef.current;if(!current)return;
        if(current.preview){await api(`/api/exploration/previews/${current.id}`,{method:'DELETE',keepalive:true}).catch(()=>null);return;}
        if(current.state.status==='active')await api(`/api/exploration/runs/${current.id}/events`,{method:'POST',keepalive:true,body:JSON.stringify({action:'pause',event_id:crypto.randomUUID(),expected_revision:current.revision})}).catch(()=>null);
      });
    };
  },[accept,childId,exerciseId,invalidateAudio,learningSessionId,previewVersionId]);
  useEffect(()=>{
    const node=viewport.current;if(!node)return;
    const observer=new ResizeObserver(entries=>setViewportWidth(entries[0].contentRect.width));observer.observe(node);return()=>observer.disconnect();
  },[started]);
  useLayoutEffect(()=>{
    const node=viewport.current;if(!node||!view.center)return;
    const width=Math.max(viewportWidth,960)*view.zoom;
    node.scrollTo({left:view.center.x*width-node.clientWidth/2,top:view.center.y*width*imageRatio-node.clientHeight/2});
  },[imageRatio,view,viewportWidth]);
  function changeZoom(value:number,center?:{x:number;y:number}){
    const node=viewport.current,width=svg.current?.getBoundingClientRect().width||Math.max(viewportWidth,960)*zoom;
    const anchor=center||{x:((node?.scrollLeft||0)+(node?.clientWidth||viewportWidth)/2)/width,y:((node?.scrollTop||0)+(node?.clientHeight||400)/2)/(width*imageRatio)};
    setView({zoom:Math.max(viewportWidth/Math.max(viewportWidth,960),Math.min(3,value)),center:anchor});
  }
  async function hint(){
    pet("hint");
    const next=await operation({action:'hint'});if(!next)return;setHintVisible(true);
    const obj=next.scene.objects.find(o=>o.id===next.state.order[next.state.index]);if(!obj)return;
    const region=obj.hint_regions[next.state.round.hint_level-1],base=Math.max(viewportWidth,960);
    const fit=Math.min(viewportWidth/(base*region[2]*1.1),(viewport.current?.clientHeight||400)/(base*imageRatio*region[3]*1.1));
    changeZoom(Math.min(next.state.round.hint_level===1?zoom:Math.max(zoom,1.5),fit),{x:region[0]+region[2]/2,y:region[1]+region[3]/2});
    requestAnimationFrame(()=>viewport.current?.scrollIntoView({block:'center',inline:'nearest'}));
  }
  useEffect(()=>{
    if(!started||!saved||saved.state.status!=='active'||!saved.state.round.resolved||pending.current)return;
    const key=`${saved.id}:${saved.state.index}`;if(autoRef.current===key)return;
    autoRef.current=key;const epoch=audioEpoch.current;
    const timer=window.setTimeout(()=>void(async()=>{
      setBusy(true);await callbacks.current.onSpeak(saved.state.feedback,.8).catch(()=>false);
      if(!mounted.current||epoch!==audioEpoch.current||snapshotRef.current?.state.status!=='active')return;
      const next=await operation({action:'next'});if(!next||!mounted.current||epoch!==audioEpoch.current)return;
      setHintVisible(false);
      if(next.state.status==='completed')await finish(next);else await narrate(next);
    })(),650);
    return()=>{window.clearTimeout(timer);autoRef.current='';};
  },[finish,narrate,operation,saved,started]);
  async function begin(){
    if(busy||saving)return;setBusy(true);setError('');
    try{
      if(scene){const image=new window.Image();image.src=scene.image.media_ref;await image.decode();}
      let current=snapshotRef.current;
      if(!current){
        current=await api<SearchSnapshot>(previewVersionId?`/api/exploration/previews/${previewVersionId}`:`/api/exploration/${childId}/runs`,{method:'POST',body:JSON.stringify({level,rounds:level===1?4:rounds,accessible_labels:accessible,...(!previewVersionId?{exercise_id:exerciseId,learning_session_id:learningSessionId||null}:{})})});accept(current);
      }
      if(current.state.status==='completed'){await finish(current);return;}
      if(current.state.status==='paused'){current=await operation({action:'resume'});if(!current)return;}
      if(['technical_error','refused'].includes(current.state.status)){await finish(current);return;}
      setView({zoom:window.innerWidth<760?1.5:1,center:null});setStarted(true);setHintVisible(false);
      if(!current.state.round.resolved)await narrate(current);
    }catch(cause){setError(cause instanceof Error?cause.message:'Не удалось открыть локацию.');}
    finally{setBusy(false);}
  }
  async function choose(point?:[number,number],object_id?:string){
    if(busy||saving||pending.current||!started||!saved?.state.round.audio_ready||saved.state.round.resolved)return;
    const next=await operation({action:'select',...(point?{point}:{object_id,keyboard:true})});
    if(next) pet(next.state.round.resolved ? 'correct' : 'incorrect');
    if(next&&!next.state.round.resolved&&(next.state.feedback==='Давай попробуем ещё раз.'||next.state.round.related_responses?.length)){
      setBusy(true);await callbacks.current.onSpeak(next.state.feedback,.8).catch(()=>false);if(mounted.current)setBusy(false);
    }
  }
  if(!scene)return <p role="alert">Локация пока недоступна.</p>;
  const canvasWidth=Math.max(viewportWidth,960)*zoom;
  const active=saved?.state.status==='active';
  return <section className="explore-game" aria-label={`Исследуй мир: ${scene.title}`}>
    {!started&&!finished?<div className="explore-welcome">
      <div className="explore-preview"><Image src={scene.image.media_ref} alt={`Локация «${scene.title}», 12 предметов для поиска`} width={scene.image.width} height={scene.image.height} priority sizes="(max-width:760px) 100vw, 1100px"/></div>
      <div className="explore-welcome-copy"><span className="kicker">ИССЛЕДУЙ МИР</span><h2>{scene.title}</h2><p>Послушай и найди предмет на картинке. Говорить вслух не обязательно. Можно двигать и увеличивать сцену.</p>
      {isPreview&&<p className="explore-note">Предпросмотр взрослого. В прогресс ребёнка не записывается.</p>}
      {!saved&&<><fieldset className="explore-settings"><legend>Инструкция</legend>{([1,2,3] as const).map(value=><button key={value} disabled={Boolean(plannedLevel)} aria-pressed={level===value} onClick={()=>{setLevel(value);if(value===1)setRounds(4);}}>{value===1?'Короткое название':value===2?'Найди предмет':'Признаки и расположение'}</button>)}<p>В сцене всегда 12 предметов. На первом уровне ищем четыре крупные цели.</p></fieldset>
      {level!==1&&<fieldset className="explore-settings"><legend>Длина серии</legend>{[4,8,12].map(value=><button key={value} aria-pressed={rounds===value} disabled={Boolean(plannedLevel)} onClick={()=>setRounds(value)}>{value} {value===4?'предмета':'предметов'}</button>)}</fieldset>}
      <label className="explore-access"><input type="checkbox" checked={accessible} onChange={e=>setAccessible(e.target.checked)}/> Называть предметы при выборе с клавиатуры</label>{accessible&&<p>Это доступный режим: участие сохраняется без оценки точности и без адаптации слов.</p>}</>}
      {saved&&<p>Место сохранено. Найдено {saved.state.outcomes.length} из {saved.state.order.length}.</p>}
      <button className="primary-button" disabled={busy||loading||saving} onClick={()=>void begin()}>{loading?'Загружаем…':busy?'Открываем…':saved?.state.status==='completed'?'Сохранить завершённую серию':saved?'Продолжить исследование':'Послушать и начать'}</button><button className="small-button" disabled={busy||saving} onClick={onBack}><ArrowLeft size={18}/> Назад</button></div>
    </div>:<>
      <header className="explore-heading"><div><span className="kicker">{scene.title} · {Math.min((saved?.state.index||0)+1,saved?.state.order.length||4)} из {saved?.state.order.length||4}</span><h2>{finished?'Локация исследована!':saved?.state.status==='completed'?'Мы исследовали локацию!':instruction}</h2></div>
      {active&&<div className="explore-main-controls"><button className="secondary-button" disabled={busy||saving||hasPending} onClick={()=>saved&&void narrate(saved,true)}><Volume2 size={22}/> Повторить</button><button className="secondary-button" disabled={busy||saving||hasPending||!saved?.state.round.audio_ready||saved.state.round.resolved} onClick={()=>void hint()}><Lightbulb size={22}/> Подсказка</button></div>}</header>
      {saved?.state.status==='completed'||finished?<div className="explore-end"><Check size={44}/><h3>{scene.title}: найдено {saved?.state.outcomes.length} предметов</h3><p>{saving?'Сохраняем результат…':finished?'Серия завершена. Можно отдохнуть или выбрать другое занятие.':'Если результат ещё не сохранился, можно повторить сохранение.'}</p>{!finished&&<button className="primary-button" disabled={saving} onClick={()=>saved&&void finish(saved)}>Повторить сохранение</button>}<button className="secondary-button" disabled={saving} onClick={onBack}>К занятиям</button></div>:<>
      <div className="explore-zoom" role="group" aria-label="Масштаб сцены"><button aria-label="Уменьшить сцену" onClick={()=>changeZoom(zoom-.25)}><ZoomOut size={21}/></button><button onClick={()=>changeZoom(viewportWidth/Math.max(viewportWidth,960),{x:.5,y:.5})}><Scan size={20}/> Вся сцена</button><button aria-label="Увеличить сцену" onClick={()=>changeZoom(zoom+.25)}><ZoomIn size={21}/></button><span>Двигай картинку пальцем или стрелками</span></div>
      <div className="explore-viewport" style={{maxHeight:canvasWidth*imageRatio}} ref={viewport} tabIndex={0} role="group" aria-label="Игровая сцена. Её можно перемещать стрелками" onKeyDown={e=>{const dx=e.key==='ArrowLeft'?-120:e.key==='ArrowRight'?120:0,dy=e.key==='ArrowUp'?-100:e.key==='ArrowDown'?100:0;if((dx||dy)&&e.target===e.currentTarget){e.preventDefault();e.currentTarget.scrollBy({left:dx,top:dy});}}}>
      <svg ref={svg} className="explore-canvas" viewBox="0 0 1000 1000" preserveAspectRatio="none" style={{width:canvasWidth,height:canvasWidth*scene.image.height/scene.image.width}} role="group" aria-label="Предметы локации" onMouseDown={e=>e.preventDefault()} onPointerDown={e=>{if(svg.current)pointer.current={x:e.clientX,y:e.clientY,rect:svg.current.getBoundingClientRect()};}} onPointerUp={e=>{const start=pointer.current;pointer.current=null;if(!start||Math.hypot(start.x-e.clientX,start.y-e.clientY)>9||!svg.current)return;const rect=svg.current.getBoundingClientRect();if(Math.abs(rect.left-start.rect.left)>2||Math.abs(rect.top-start.rect.top)>2||Math.abs(rect.width-start.rect.width)>1||Math.abs(rect.height-start.rect.height)>1)return;void choose(scenePoint(e.clientX,e.clientY,rect));}} onPointerCancel={()=>{pointer.current=null;}}>
        <image href={scene.image.media_ref} width="1000" height="1000" preserveAspectRatio="none" onError={()=>void operation({action:'technical_error',reason:'Не загрузилась иллюстрация. Ответ не оценивается.'})}/>
        {hintVisible&&target&&saved?.state.round.hint_level?<rect className="explore-hint" pointerEvents="none" x={target.hint_regions[saved.state.round.hint_level-1][0]*1000} y={target.hint_regions[saved.state.round.hint_level-1][1]*1000} width={target.hint_regions[saved.state.round.hint_level-1][2]*1000} height={target.hint_regions[saved.state.round.hint_level-1][3]*1000} rx="60"/>:null}
        {scene.objects.map((object,index)=><path key={object.id} d={polygonPath(object.hit_polygons)} className={`explore-object ${saved?.state.round.resolved&&object.id===target?.id?'found':''}`} role="button" tabIndex={active&&!busy&&!saving&&!hasPending&&saved?.state.round.audio_ready&&!saved.state.round.resolved?0:-1} aria-disabled={!active||busy||saving||hasPending||!saved?.state.round.audio_ready||saved.state.round.resolved} aria-label={saved?.state.accessible_labels?object.label:`Предмет ${index+1}`} data-object-id={object.id} onFocus={e=>{e.currentTarget.scrollIntoView({block:'nearest',inline:'nearest'});if(saved?.state.accessible_labels)void callbacks.current.onSpeak(object.label,.78);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();void choose(undefined,object.id);}}}/>)}
      </svg></div>
      <p className="explore-feedback" role="status">{busy?'Слушаем и сохраняем…':saved?.state.feedback||'Найди предмет без спешки.'}</p>
      {saved?.state.status==='technical_error'&&<div className="explore-note" role="alert"><p>{saved.state.feedback||'Не удалось продолжить. Ответ не оценивается.'}</p><button className="secondary-button" disabled={saving} onClick={()=>void finish(saved)}>Вернуться без оценки</button></div>}
      {saved?.state.status==='paused'&&<button className="primary-button" onClick={()=>void begin()}>Продолжить</button>}
      </>}
    </>}
    {error&&<div className="explore-error" role="alert"><p>{error}</p>{hasPending?<button className="secondary-button" disabled={busy||saving} onClick={()=>{const event=pending.current?.event;if(event)void operation(event);}}>Повторить действие</button>:saved&&['paused','refused','technical_error','completed'].includes(saved.state.status)&&<button className="secondary-button" disabled={saving} onClick={()=>void finish(saved)}>Повторить сохранение</button>}</div>}
    {showStopControls&&started&&!finished&&active&&<div className="runner-stop-actions"><button className="small-button" disabled={saving} onClick={()=>void stop('break')}><Pause size={18}/> Перерыв</button><button className="small-button" disabled={saving} onClick={()=>void stop('refused')}><CircleX size={18}/> Не хочу</button></div>}
  </section>;
}
