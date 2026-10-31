"use client";

import { useEffect, useRef, useState } from "react";
import { api, API_URL } from "@/lib/api";
import { playSpeechClip, stopCurrentSpeech, unlockSpeechPlayback } from "@/lib/speech";

type Item = {key:string; text:string; language:"ru"|"kk"; phrase_type:"question"|"statement"|"exclamation"|"instruction"; mode:"normal"|"slow"; recording:null|{digest:string; source:string; approved_by:number|null; approved_at:string|null}};
type Manifest = {scope_id:number;items:Item[];ready:boolean};
const kinds = {question:"Вопрос",statement:"Утверждение / слово",exclamation:"Восклицание",instruction:"Инструкция"};

function RecordingList({url,onReady}:{url:string;onReady?:(ready:boolean)=>void}) {
  const [data,setData]=useState<Manifest|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [heard,setHeard]=useState<Record<string,string>>({});
  const [filter,setFilter]=useState("");
  const [limit,setLimit]=useState(12);
  const alive=useRef(true);
  const request=useRef<AbortController|null>(null);
  const readyCallback=useRef(onReady);
  useEffect(()=>{readyCallback.current=onReady;},[onReady]);
  useEffect(()=>{
    alive.current=true; const abort=new AbortController(); request.current=abort;
    readyCallback.current?.(false);
    api<Manifest>(url,{signal:abort.signal}).then(value=>{if(!abort.signal.aborted){setData(value);readyCallback.current?.(value.ready);}}).catch(cause=>{if(!abort.signal.aborted)setError(String(cause.message));});
    return()=>{alive.current=false;abort.abort();request.current?.abort();stopCurrentSpeech();};
  },[url]);
  const reload=async()=>{const value=await api<Manifest>(url);if(alive.current){setData(value);readyCallback.current?.(value.ready);}};
  const base=(item:Item)=>`/api/admin/audio/${data!.scope_id}/${item.key}/${item.mode}`;
  const action=async(run:()=>Promise<void>)=>{
    if(busy)return;setBusy(true);setError("");readyCallback.current?.(false);
    try{await run();}catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:"Не удалось обработать запись");}
    finally{if(alive.current){try{await reload();}catch{setError("Не удалось обновить записи");}setBusy(false);}}
  };
  const prepare=(item:Item,source:string,file?:File)=>void action(async()=>{
    let encoded:string|undefined;
    if(file){
      if(file.size>2_000_000)throw new Error("Файл должен быть не больше 2 МБ");
      encoded=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(",")[1]);reader.onerror=()=>reject(new Error("Не удалось прочитать WAV"));reader.readAsDataURL(file);});
    }
    await api(`${base(item)}/prepare`,{method:"POST",body:JSON.stringify({source,audio_base64:encoded,expected_digest:item.recording?.digest||null})});
    setHeard(values=>({...values,[`${item.key}:${item.mode}`]:""}));
  });
  const listen=(item:Item)=>{
    unlockSpeechPlayback();
    void action(async()=>{
      const controller=new AbortController();request.current=controller;
      const timer=setTimeout(()=>controller.abort(),12000);
      let response:Response;
      try{response=await fetch(`${API_URL}${base(item)}/clip`,{credentials:"include",signal:controller.signal});}finally{clearTimeout(timer);}
      if(!response.ok)throw new Error("Запись недоступна");
      const digest=response.headers.get("X-Soyle-Audio-Digest");
      if(digest!==item.recording?.digest)throw new Error("Запись изменилась. Обновите список и повторите прослушивание");
      const blob=await response.blob();if(controller.signal.aborted||!alive.current)return;
      const objectUrl=URL.createObjectURL(blob);
      try{
        if(!await playSpeechClip(objectUrl))throw new Error("Прослушивание прервано. Для утверждения нужно дослушать запись");
        if(!alive.current)return;
        await api(`${base(item)}/review`,{method:"POST",body:JSON.stringify({digest,action:"listened"})});
        setHeard(values=>({...values,[`${item.key}:${item.mode}`]:digest!}));
      }finally{URL.revokeObjectURL(objectUrl);}
    });
  };
  const filtered=data?.items.filter(item=>item.text.toLocaleLowerCase().includes(filter.toLocaleLowerCase()))||[];
  return <div>
    <p>Прослушайте обе скорости и проверьте точность текста, ударения и интонацию. Утверждение сохраняет конкретную запись. Для короткого вопроса можно записать голос человека и загрузить WAV.</p>
    {error&&<p role="alert">{error}</p>}
    {!data?<p role="status">Загружаем реплики…</p>:<>
      <p role="status">Утверждено {data.items.filter(item=>item.recording?.approved_by).length} из {data.items.length}</p>
      <label>Найти реплику<input value={filter} onChange={event=>{setFilter(event.target.value);setLimit(12);}}/></label>
      <div className="scenario-review-list">{filtered.slice(0,limit).map(item=><article key={`${item.key}:${item.mode}`}>
        <header><div><strong>{item.text}</strong><p>{item.language.toUpperCase()} · {kinds[item.phrase_type]} · {item.mode==="slow"?"Медленно":"Обычно"}</p></div></header>
        <div className="review-actions">
          <button className="small-button" disabled={busy} onClick={()=>prepare(item,"azure")}>Подготовить Azure</button>
          {item.mode==="normal"&&<button className="small-button" disabled={busy} onClick={()=>prepare(item,"bundled")}>Готовая запись</button>}
          <label className="small-button">Заменить WAV<input type="file" accept=".wav,audio/wav" disabled={busy} aria-label={`Заменить запись: ${item.text}, ${item.mode}`} onChange={event=>{const file=event.target.files?.[0];event.target.value="";if(file)prepare(item,"manual",file);}}/></label>
          <button className="small-button" disabled={busy||!item.recording} onClick={()=>listen(item)}>Прослушать запись</button>
          <button className="small-button" disabled={!busy} onClick={()=>{request.current?.abort();stopCurrentSpeech();}}>Стоп</button>
          <button className="primary-button" disabled={busy||!item.recording||heard[`${item.key}:${item.mode}`]!==item.recording.digest||!!item.recording.approved_by} onClick={()=>void action(async()=>{await api(`${base(item)}/review`,{method:"POST",body:JSON.stringify({digest:item.recording!.digest,action:"approved"})});})}>{item.recording?.approved_by?"Утверждено":"Утвердить текст и произношение"}</button>
        </div>
        {item.recording&&<small>Источник: {item.recording.source}{item.recording.approved_at?` · Утверждено ${new Date(item.recording.approved_at).toLocaleString("ru-RU")}`:" · Ожидает проверки"}</small>}
      </article>)}</div>
      {filtered.length>limit&&<button className="small-button" onClick={()=>setLimit(limit+12)}>Показать ещё</button>}
      <small>Ручная запись: WAV PCM, моно, 16 бит, 16–48 кГц, до 30 секунд и 2 МБ. Без музыки и персональных данных. Для медленного режима нужна отдельная запись.</small>
    </>}
  </div>;
}

export function AudioReviewPanel({versionId,onReady}:{versionId:number;onReady:(ready:boolean)=>void}) {
  const [text,setText]=useState("Поиграем?");
  const [language,setLanguage]=useState("ru");
  const [library,setLibrary]=useState("");
  const [profile,setProfile]=useState("pet");
  return <section className="review-section">
    <header><div><span className="kicker">ПРОВЕРКА ОЗВУЧКИ</span><h3>Текст, произношение и интонация</h3></div></header>
    <RecordingList key={versionId} url={`/api/admin/exercise-drafts/${versionId}/audio`} onReady={onReady}/>
    <details><summary>Отдельная реплика питомца или общего каталога</summary>
      <p>Утверждённая запись заменит озвучку этой фразы только для выбранного голоса. Записи, уже закреплённые за упражнениями, сохранятся.</p>
      <label>Голос<select value={profile} onChange={event=>setProfile(event.target.value)}><option value="pet">Пингвин</option><option value="exercise">Задания — женский голос</option></select></label>
      <label>Текст<input value={text} maxLength={300} onChange={event=>setText(event.target.value)}/></label>
      <label>Язык<select value={language} onChange={event=>setLanguage(event.target.value)}><option value="ru">Русский</option><option value="kk">Қазақша</option></select></label>
      <button className="small-button" onClick={()=>setLibrary(`/api/admin/audio/library?text=${encodeURIComponent(text)}&language=${language}&profile=${profile}`)}>Открыть реплику</button>
      {library&&<RecordingList key={library} url={library}/>}
    </details>
  </section>;
}
