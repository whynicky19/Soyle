"use client";
import { t, useLocale } from "@/lib/i18n";


import { ArrowLeft, ArrowRight, CircleHelp, Pause, Play, RotateCcw, Volume2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { availableActions, canContinue, spriteCells } from "@/lib/storybook/interaction";
import type { StoryAction, StorySnapshot } from "@/lib/storybook/types";
import { StoryScene, StorySprite } from "./StoryScene";
import "./storybook.css";

type Props = { childId?: number; onExit: () => void; onSpeak: (text: string) => Promise<boolean>; onStopSpeech: () => void; calmMode?: boolean; embedded?: boolean };

export function StorybookExperience({ childId, onExit, onSpeak, onStopSpeech, calmMode = false, embedded = false }: Props) {
  const locale=useLocale();
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
    catch (cause) { setError(cause instanceof Error ? cause.message : t("livingBook.copy000")); }
  }, [childId]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load,locale]);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    const timer = window.setTimeout(update, 0); query.addEventListener("change", update);
    return () => { window.clearTimeout(timer); query.removeEventListener("change", update); onStopSpeech(); };
  }, [onStopSpeech]);

  const narrate = useCallback(async (text: string) => {
    const version = ++narrationVersion.current;
    setNarrating(true);
    try { if (!await onSpeak(text) && narrationVersion.current === version) setError(t("livingBook.copy001")); }
    catch { if (narrationVersion.current === version) setError(t("livingBook.copy002")); }
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
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("livingBook.copy003")); }
    finally { sending.current = false; setBusy(false); }
  };

  const act = async (action: StoryAction) => {
    const next = await dispatch(action.key);
    if (next && automaticVoice) void narrate(action.speech || next.state.feedback);
  };
  const exit = () => { stopVoice(); onExit(); };

  if (!childId || !snapshot || !scene) return <Container className="sb-loading"><h1>{t("livingBook.copy004")}</h1>{error && <p role="alert">{error}</p>}<button onClick={() => void load()}>{t("book.copy011")}</button><button onClick={exit}>{t("livingBook.copy005")}</button></Container>;
  const { definition, state } = snapshot;
  const backLabel = snapshot.preview ? t("cinema.copy019") : t("cinema.copy020");
  const actions = availableActions(scene, state);
  const motionEnabled = motion && !reducedMotion && !state.paused;
  const continueEnabled = canContinue(scene, state);
  const voiceControls = <button type="button" className={narrating ? "sb-listening" : ""} onClick={() => { if (automaticVoice) void narrate(scene.narration); else setAutomaticVoice(true); }}><Volume2/>{automaticVoice ? t("game.repeat") : t("storyList.copy014")}</button>;

  if (!started) return <Container className="sb-welcome">
    <button className="sb-back" onClick={exit}><ArrowLeft/> {backLabel}</button>
    <div className="sb-welcome-copy"><span className="sb-eyebrow">{t("livingBook.copy006")}</span><h1>{definition.title}</h1><p>{definition.subtitle}</p></div>
    <div className="sb-cover"><StoryScene definition={definition} state={{ ...state, scene_index: 0, ready: false, paused: true }} revision={0} motion={false} hints={false} busy onAction={() => {}}/></div>
    <div className="sb-welcome-bottom"><div className="sb-draft-note"><strong>{snapshot.preview ? t("cinema.copy054") : t("cinema.copy021")}</strong><p>{snapshot.preview ? t("book.copy035") : t("livingBook.copy007")}</p><details><summary>{t("livingBook.copy008")}</summary><p>{definition.age_note}</p><p>{t("livingBook.copy009")}</p></details></div><button className="sb-primary" disabled={busy} onClick={() => void (async () => { if (state.completed && !await dispatch("restart")) return; setStarted(true); setAutomaticVoice(true); })()}><Play/> {state.completed ? t("book.copy045") : snapshot.revision ? t("storyList.copy022") : t("book.copy024")}</button></div>
  </Container>;

  return <Container className={`sb-player ${motionEnabled ? "" : "sb-no-motion"}`}>
    <header className="sb-header"><button className="sb-back" aria-label={t("livingBook.copy010")} onClick={exit}><ArrowLeft/><span>{t("common.close")}</span></button><div><span className="sb-eyebrow">{snapshot.preview ? t("livingBook.copy011") : t("livingBook.copy012")}</span><h1>{definition.title}</h1></div><span className="sb-page-number" aria-label={t("livingBook.scene", {scene:state.scene_index+1,total:definition.scenes.length})}>{state.scene_index + 1}<span> / {definition.scenes.length}</span></span></header>
    <div className="sb-reading-progress" role="group" aria-label={t("livingBook.copy015")}>{definition.scenes.map((item, index) => <span key={item.id} aria-current={index === state.scene_index ? "step" : undefined} className={index <= state.scene_index ? "filled" : ""}/>)}</div>
    <section className="sb-page" aria-labelledby="sb-scene-title">
      <div className="sb-scene-heading"><span className="sb-eyebrow">{t("book.copy028")}{state.scene_index + 1}</span><h2 id="sb-scene-title">{scene.title}</h2><p>{state.completed ? t("livingBook.copy016") : scene.instruction}</p></div>
      <StoryScene definition={definition} state={state} revision={snapshot.revision} motion={motionEnabled} hints={hints} busy={busy} onAction={(action) => void act(action)}/>
      <div className="sb-live-reaction" role="status" aria-live="polite">{state.feedback || (scene.kind === "watch" ? t("livingBook.copy017") : t("livingBook.copy018"))}</div>
      {!state.completed && actions.length > 0 && <details className={`sb-alternative ${scene.kind === "aac_request" ? "sb-aac-inline" : ""}`} open={scene.kind === "aac_request"}><summary>{scene.kind === "aac_request" ? t("livingBook.copy019") : t("livingBook.copy020")}</summary><div className={`sb-action-tray ${scene.kind === "aac_request" ? "sb-aac-tray" : ""}`} role="group" aria-label={scene.kind === "aac_request" ? t("livingBook.copy021") : t("livingBook.copy022")}>
        {actions.map((action) => {
          const object = action.object === "chosen" ? (state.chosen_toy === "teddy" ? "ball" : state.chosen_toy) : action.object;
          return <button key={action.key} disabled={busy || state.paused} onClick={() => void act(action)}>
            <span className="sb-choice-picture"><StorySprite sheet={object === "mother" || object === "misha" ? definition.assets[object] : definition.assets.objects} cell={object === "mother" || object === "misha" ? 0 : spriteCells[object]} frames={definition.frames?.[object]}/></span><strong>{action.label}</strong>
          </button>;
        })}
      </div></details>}
      {state.completed ? <div className="sb-completed"><h2>{t("livingBook.copy023")}</h2><p>{t("livingBook.copy024")}</p><button className="sb-primary" onClick={exit}>{t("livingBook.copy025")}<ArrowRight/></button><button className="sb-text-button" disabled={busy} onClick={() => void dispatch("restart")}><RotateCcw/> {t("livingBook.copy026")}</button></div> : <>
        <div className="sb-controls">{voiceControls}<button onClick={() => { setHints(true); void dispatch("hint"); }} disabled={busy}><CircleHelp/> {t("cinema.copy047")}</button><button ref={pauseTrigger} onClick={() => { stopVoice(); void dispatch("pause"); }} disabled={busy}><Pause/> {t("cinema.copy048")}</button><button className="sb-primary" onClick={() => void dispatch("continue")} disabled={!continueEnabled || busy}>{scene.kind === "watch" ? t("livingBook.copy027") : t("book.copy044")}<ArrowRight/></button></div>
        {!continueEnabled && <p className="sb-next-hint">{t("livingBook.copy028")}</p>}
        <div className="sb-adult-tools"><button className="sb-text-button" aria-expanded={assistance} aria-controls="sb-assistance" onClick={() => setAssistance(!assistance)}>{t("cinema.copy052")}</button><label><input type="checkbox" checked={motion && !reducedMotion} disabled={reducedMotion} onChange={(event) => setMotion(event.target.checked)}/> {t("book.copy053")}{reducedMotion ? t("livingBook.copy029") : ""}</label><label><input type="checkbox" checked={automaticVoice} onChange={(event) => { setAutomaticVoice(event.target.checked); if (!event.target.checked) stopVoice(); }}/> {t("livingBook.copy030")}</label></div>
        {assistance && <div className="sb-assistance" id="sb-assistance"><p>{t("livingBook.copy031")}</p><button disabled={busy} onClick={() => void dispatch("assist")}>{t("livingBook.copy032")}</button><button disabled={busy} onClick={() => void dispatch("skip")}>{t("livingBook.copy033")}</button></div>}
      </>}
      {error && <div className="sb-error" role="alert"><p>{error}</p><button onClick={() => void load()} disabled={busy}>{t("livingBook.copy034")}</button></div>}
      <p className="sb-save-state" role="status">{busy ? t("livingBook.copy035") : snapshot.preview ? t("livingBook.copy036") : t("livingBook.copy037")}</p>
    </section>
    <dialog ref={dialog} className="sb-pause-dialog" aria-labelledby="sb-pause-title" onCancel={(event) => { event.preventDefault(); void dispatch("resume"); }}><button className="sb-dialog-close" aria-label={t("storyList.copy022")} disabled={busy} onClick={() => void dispatch("resume")}><X/></button><span className="sb-pause-art"><StorySprite sheet={definition.assets.objects} cell={0}/></span><h2 id="sb-pause-title">{t("livingBook.copy038")}</h2><p>{t("livingBook.copy039")}</p><button className="sb-primary" disabled={busy} onClick={() => void dispatch("resume")}><Play/> {t("storyList.copy027")}</button><button className="sb-text-button" onClick={exit}>{t("livingBook.copy025")}</button></dialog>
  </Container>;
}
