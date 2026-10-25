"use client";

import { ArrowLeft, ArrowRight, CircleHelp, Pause, Play, RotateCcw, Volume2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { availableActions, canContinue, spriteCells } from "@/lib/storybook/interaction";
import type { StoryAction, StorySnapshot } from "@/lib/storybook/types";
import { StoryScene, StorySprite } from "./StoryScene";
import "./storybook.css";

type Props = { childId?: number; onExit: () => void; onSpeak: (text: string) => Promise<boolean>; onStopSpeech: () => void; calmMode?: boolean; embedded?: boolean };

export function StorybookExperience({ childId, onExit, onSpeak, onStopSpeech, calmMode = false, embedded = false }: Props) {
  const Container = embedded ? "section" : "main";
  const [snapshot, setSnapshot] = useState<StorySnapshot | null>(null);
  const [started, setStarted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [motion, setMotion] = useState(!calmMode);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [hints, setHints] = useState(false);
  const [assistance, setAssistance] = useState(false);
  const [narrating, setNarrating] = useState(false);
  const [automaticVoice, setAutomaticVoice] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const pauseTrigger = useRef<HTMLButtonElement>(null);
  const sending = useRef(false);
  const narrationVersion = useRef(0);
  const pendingEvent = useRef<{ action: string; event_id: string; expected_revision: number; scene_id: string } | null>(null);
  const scene = snapshot?.definition.scenes[snapshot.state.scene_index];

  const load = useCallback(async () => {
    if (!childId) return;
    setError("");
    try { setSnapshot(await api<StorySnapshot>(`/api/storybooks/${childId}/toy`)); pendingEvent.current = null; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось открыть историю"); }
  }, [childId]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    const timer = window.setTimeout(update, 0); query.addEventListener("change", update);
    return () => { window.clearTimeout(timer); query.removeEventListener("change", update); onStopSpeech(); };
  }, [onStopSpeech]);

  const narrate = useCallback(async (text: string) => {
    const version = ++narrationVersion.current;
    setNarrating(true);
    try { if (!await onSpeak(text) && narrationVersion.current === version) setError("Звук недоступен. Можно продолжить с картинками и короткими подписями."); }
    catch { if (narrationVersion.current === version) setError("Не удалось включить звук. Все действия доступны без озвучки."); }
    finally { if (narrationVersion.current === version) setNarrating(false); }
  }, [onSpeak]);

  const sceneNarration = scene?.narration;
  useEffect(() => {
    if (!started || !automaticVoice || !sceneNarration || snapshot?.state.paused || snapshot?.state.completed) return;
    const timer = window.setTimeout(() => void narrate(sceneNarration), 180);
    return () => window.clearTimeout(timer);
  }, [sceneNarration, started, automaticVoice, narrate, snapshot?.state.paused, snapshot?.state.completed]);
  useEffect(() => {
    if (!snapshot?.state.paused || !started) { dialog.current?.close(); return; }
    dialog.current?.showModal();
  }, [snapshot?.state.paused, started]);

  const stopVoice = () => { narrationVersion.current += 1; onStopSpeech(); setNarrating(false); };
  const dispatch = async (action: string) => {
    if (!snapshot || !scene || !childId || sending.current) return;
    sending.current = true; setBusy(true); setError("");
    const event = pendingEvent.current?.action === action && pendingEvent.current.expected_revision === snapshot.revision
      ? pendingEvent.current : { action, event_id: crypto.randomUUID(), expected_revision: snapshot.revision, scene_id: scene.id };
    pendingEvent.current = event;
    try {
      const next = await api<StorySnapshot>(`/api/storybooks/${childId}/toy/events`, { method: "POST", body: JSON.stringify({ ...event, version: snapshot.definition.version }) });
      stopVoice(); setSnapshot(next); pendingEvent.current = null;
      if (action === "continue" || action === "restart") { setHints(false); setAssistance(false); window.scrollTo({ top: 0, behavior: "instant" }); }
      if (action === "resume") window.requestAnimationFrame(() => pauseTrigger.current?.focus());
      return next;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Действие пока не сохранено. Повтори нажатие — история не пропадёт."); }
    finally { sending.current = false; setBusy(false); }
  };

  const act = async (action: StoryAction) => {
    const next = await dispatch(action.key);
    if (next && automaticVoice) void narrate(action.speech || next.state.feedback);
  };
  const exit = () => { stopVoice(); onExit(); };

  if (!childId || !snapshot || !scene) return <Container className="sb-loading"><h1>Открываем живую историю</h1>{error && <p role="alert">{error}</p>}<button onClick={() => void load()}>Попробовать снова</button><button onClick={exit}>Назад в кабинет</button></Container>;
  const { definition, state } = snapshot;
  const backLabel = snapshot.preview ? "В кабинет" : "К историям";
  const actions = availableActions(scene, state);
  const motionEnabled = motion && !reducedMotion && !state.paused;
  const continueEnabled = canContinue(scene, state);
  const voiceControls = <button type="button" className={narrating ? "sb-listening" : ""} onClick={() => { if (automaticVoice) void narrate(scene.narration); else setAutomaticVoice(true); }}><Volume2/>{automaticVoice ? "Повторить" : "Послушать"}</button>;

  if (!started) return <Container className="sb-welcome">
    <button className="sb-back" onClick={exit}><ArrowLeft/> {backLabel}</button>
    <div className="sb-welcome-copy"><span className="sb-eyebrow">SÖYLE · ЖИВАЯ ИСТОРИЯ</span><h1>{definition.title}</h1><p>{definition.subtitle}</p></div>
    <div className="sb-cover"><StoryScene definition={definition} state={{ ...state, scene_index: 0, ready: false, paused: true }} revision={0} motion={false} hints={false} busy onAction={() => {}}/></div>
    <div className="sb-welcome-bottom"><div className="sb-draft-note"><strong>{snapshot.preview ? "Предпросмотр взрослого" : "Живая история"}</strong><p>{snapshot.preview ? "Чтение здесь не меняет результат ребёнка." : "Нажимай на предметы, выбирай карточки и помогай Мише. Место сохраняется."}</p><details><summary>О сценарии</summary><p>{definition.age_note}</p><p>Шесть сцен, примерно 3–5 минут. Можно нажимать на предметы, использовать карточки и помогать вместе со взрослым. Устный ответ не нужен.</p></details></div><button className="sb-primary" disabled={busy} onClick={() => void (async () => { if (state.completed && !await dispatch("restart")) return; setStarted(true); setAutomaticVoice(true); })()}><Play/> {state.completed ? "Прочитать ещё раз" : snapshot.revision ? "Продолжить историю" : "Открыть книгу"}</button></div>
  </Container>;

  return <Container className={`sb-player ${motionEnabled ? "" : "sb-no-motion"}`}>
    <header className="sb-header"><button className="sb-back" aria-label="Закрыть историю" onClick={exit}><ArrowLeft/><span>Закрыть</span></button><div><span className="sb-eyebrow">{snapshot.preview ? "ПРЕДПРОСМОТР ВЗРОСЛОГО" : "SÖYLE · ИСТОРИЯ"}</span><h1>{definition.title}</h1></div><span className="sb-page-number" aria-label={`Сцена ${state.scene_index + 1} из ${definition.scenes.length}`}>{state.scene_index + 1}<span> / {definition.scenes.length}</span></span></header>
    <div className="sb-reading-progress" role="group" aria-label="Страницы истории">{definition.scenes.map((item, index) => <span key={item.id} aria-current={index === state.scene_index ? "step" : undefined} className={index <= state.scene_index ? "filled" : ""}/>)}</div>
    <section className="sb-page" aria-labelledby="sb-scene-title">
      <div className="sb-scene-heading"><span className="sb-eyebrow">СТРАНИЦА {state.scene_index + 1}</span><h2 id="sb-scene-title">{scene.title}</h2><p>{state.completed ? "Можно вернуться к этой истории в другой раз." : scene.instruction}</p></div>
      <StoryScene definition={definition} state={state} revision={snapshot.revision} motion={motionEnabled} hints={hints} busy={busy} onAction={(action) => void act(action)}/>
      <div className="sb-live-reaction" role="status" aria-live="polite">{state.feedback || (scene.kind === "watch" ? "Мишка рядом. Можно отдохнуть." : "Можно нажать прямо на предмет в комнате.")}</div>
      {!state.completed && actions.length > 0 && <details className={`sb-alternative ${scene.kind === "aac_request" ? "sb-aac-inline" : ""}`} open={scene.kind === "aac_request"}><summary>{scene.kind === "aac_request" ? "Можно сказать так" : "Выбрать карточкой"}</summary><div className={`sb-action-tray ${scene.kind === "aac_request" ? "sb-aac-tray" : ""}`} role="group" aria-label={scene.kind === "aac_request" ? "Как попросить помощь" : "Можно выбрать здесь"}>
        {actions.map((action) => {
          const object = action.object === "chosen" ? (state.chosen_toy === "teddy" ? "ball" : state.chosen_toy) : action.object;
          return <button key={action.key} disabled={busy || state.paused} onClick={() => void act(action)}>
            <span className="sb-choice-picture"><StorySprite sheet={object === "mother" || object === "misha" ? definition.assets[object] : definition.assets.objects} cell={object === "mother" || object === "misha" ? 0 : spriteCells[object]} frames={definition.frames?.[object]}/></span><strong>{action.label}</strong>
          </button>;
        })}
      </div></details>}
      {state.completed ? <div className="sb-completed"><h2>Мишка дома. История закончилась.</h2><p>Можно отдохнуть. Место в книге сохранено.</p><button className="sb-primary" onClick={exit}>Закрыть книгу <ArrowRight/></button><button className="sb-text-button" disabled={busy} onClick={() => void dispatch("restart")}><RotateCcw/> Открыть сначала</button></div> : <>
        <div className="sb-controls">{voiceControls}<button onClick={() => { setHints(true); void dispatch("hint"); }} disabled={busy}><CircleHelp/> Подсказка</button><button ref={pauseTrigger} onClick={() => { stopVoice(); void dispatch("pause"); }} disabled={busy}><Pause/> Перерыв</button><button className="sb-primary" onClick={() => void dispatch("continue")} disabled={!continueEnabled || busy}>{scene.kind === "watch" ? "Закончить" : "Дальше"}<ArrowRight/></button></div>
        {!continueEnabled && <p className="sb-next-hint">Сначала помоги Мише. Или открой «Помочь вместе» ниже.</p>}
        <div className="sb-adult-tools"><button className="sb-text-button" aria-expanded={assistance} aria-controls="sb-assistance" onClick={() => setAssistance(!assistance)}>Помочь вместе</button><label><input type="checkbox" checked={motion && !reducedMotion} disabled={reducedMotion} onChange={(event) => setMotion(event.target.checked)}/> Мягкие движения{reducedMotion ? " · отключены в системе" : ""}</label><label><input type="checkbox" checked={automaticVoice} onChange={(event) => { setAutomaticVoice(event.target.checked); if (!event.target.checked) stopVoice(); }}/> Озвучивать сцены</label></div>
        {assistance && <div className="sb-assistance" id="sb-assistance"><p>Помощь и пропуск не считаются ошибкой. Выберите удобный способ.</p><button disabled={busy} onClick={() => void dispatch("assist")}>Сделать вместе со взрослым</button><button disabled={busy} onClick={() => void dispatch("skip")}>Посмотреть без задания</button></div>}
      </>}
      {error && <div className="sb-error" role="alert"><p>{error}</p><button onClick={() => void load()} disabled={busy}>Открыть сохранённое состояние</button></div>}
      <p className="sb-save-state" role="status">{busy ? "Сохраняем место в книге…" : snapshot.preview ? "Место сохранено в предпросмотре. Детские результаты не изменяются." : "Место в книге сохранено."}</p>
    </section>
    <dialog ref={dialog} className="sb-pause-dialog" aria-labelledby="sb-pause-title" onCancel={(event) => { event.preventDefault(); void dispatch("resume"); }}><button className="sb-dialog-close" aria-label="Продолжить историю" disabled={busy} onClick={() => void dispatch("resume")}><X/></button><span className="sb-pause-art"><StorySprite sheet={definition.assets.objects} cell={0}/></span><h2 id="sb-pause-title">Можно отдохнуть</h2><p>История подождёт. Мы сохранили место.</p><button className="sb-primary" disabled={busy} onClick={() => void dispatch("resume")}><Play/> Продолжить</button><button className="sb-text-button" onClick={exit}>Закрыть книгу</button></dialog>
  </Container>;
}
