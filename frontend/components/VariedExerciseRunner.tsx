"use client";
import { t, useLocale } from "@/lib/i18n";
import { useExercisePet } from "./pet/ExercisePet";

import Image from "next/image";
import { useId, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { Check, CircleX, Pause, RotateCcw, Volume2 } from "lucide-react";
import { PracticeLength } from "./PracticeLength";
import { shuffleWithRandom } from "@/lib/exerciseRuntime";
import { createVariedRounds, orderMatches, pairMatches, type LearningPair, type LearningPicture, type VariedContent, type VariedMechanic } from "@/lib/variedRuntime";
import type { InstructionRunnerMeasurement } from "./P1ExerciseRunners";

type Outcome = {round_key: string; outcome: "independent" | "prompted" | "modelled"; first_response: unknown; responses: unknown[]; supports: string[]; corrections: number};
type Props = {mechanic: VariedMechanic; content: VariedContent; soundEnabled: boolean; defaultRounds?: number;
  onSpeak: (text: string, rate?: number) => Promise<boolean>;
  onComplete: (measurement: InstructionRunnerMeasurement, details: Record<string, unknown>) => Promise<unknown> | void;
  onBack: () => void; stopRef?: Ref<(status: "break" | "refused") => Promise<void>>};
const instructionLabels = (): Record<VariedMechanic, string> => ({
  category_sort: t("varied.copy000"),
  action_sequence: t("varied.copy001"),
  object_match: t("varied.copy002"),
});

export function VariedExerciseRunner({mechanic, content, soundEnabled, defaultRounds, onSpeak, onComplete, onBack, stopRef}: Props) {
  useLocale();
  const pet = useExercisePet();
  const id = useId();
  const rounds = useMemo(() => createVariedRounds(mechanic, content), [mechanic, content]);
  const [limit, setLimit] = useState(Math.min(defaultRounds || content.default_rounds || rounds.length, rounds.length));
  const [index, setIndex] = useState(0);
  const round = rounds[index];
  const instructionText = mechanic === "category_sort" ? t("varied.sortInstruction") : round?.instruction || "";
  const cards = useMemo(() => shuffleWithRandom(round?.cards || []), [round]);
  const targets = useMemo(() => shuffleWithRandom(round?.targets || []), [round]);
  const categories = useMemo(() => shuffleWithRandom(content.categories || []), [content]);
  const [phase, setPhase] = useState<"intro" | "playing" | "resolved" | "technical" | "done">(soundEnabled ? "intro" : "technical");
  const [audioPending, setAudioPending] = useState(false);
  const [errorReason, setErrorReason] = useState(soundEnabled ? "" : t("varied.copy003"));
  const [feedback, setFeedback] = useState("");
  const [order, setOrder] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [pairs, setPairs] = useState<LearningPair[]>([]);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const evidence = useRef({responses: [] as unknown[], supports: [] as string[], corrections: 0});
  const outcomesRef = useRef<Outcome[]>([]);
  const choices = useRef(0);
  const prompts = useRef(0);
  const audioLock = useRef(false);
  const saveLock = useRef(false);
  const resolved = useRef(false);
  const inactive = phase !== "playing" || audioPending || saving;

  function mediaError() { setErrorReason(t("varied.copy004")); setPhase("technical"); }
  async function play(text: string, repeat = false) {
    if (audioLock.current || saving) return;
    audioLock.current = true; setAudioPending(true);
    if (repeat) { pet("hint"); evidence.current.supports.push("repeat_audio"); prompts.current++; }
    try {
      if (!soundEnabled || !await onSpeak(text, .78)) { setErrorReason(t("varied.copy005")); setPhase("technical"); }
    } catch { setErrorReason(t("varied.copy005")); setPhase("technical"); }
    finally { audioLock.current = false; setAudioPending(false); }
  }
  function finishRound(modelled = false) {
    if (resolved.current) return;
    pet(modelled ? "hint" : "correct");
    resolved.current = true;
    const current = evidence.current;
    const outcome: Outcome = {round_key: round.key, outcome: modelled ? "modelled" : current.corrections || current.supports.length ? "prompted" : "independent",
      first_response: current.responses[0] ?? null, responses: [...current.responses], supports: [...current.supports], corrections: current.corrections};
    outcomesRef.current = [...outcomesRef.current, outcome]; setOutcomes(outcomesRef.current);
    setPhase("resolved"); setSelected(null);
    setFeedback(modelled ? t("varied.copy006") : outcome.outcome === "independent" ? t("varied.copy007") : t("varied.copy008"));
  }
  function showModel() {
    if (inactive || resolved.current) return;
    evidence.current.supports.push("model_answer"); prompts.current++;
    if (mechanic === "action_sequence") setOrder(round.correct_order || []);
    if (mechanic === "object_match") setPairs(round.pairs || []);
    finishRound(true);
  }
  function wrong() {
    pet("incorrect");
    evidence.current.corrections++;
    if (evidence.current.corrections >= 3) showModel();
    else setFeedback(mechanic === "action_sequence" ? t("varied.copy009") : t("varied.copy010"));
  }
  function sort(group: string) {
    if (inactive || resolved.current) return;
    choices.current++; evidence.current.responses.push(group);
    if (group === round.category_key) finishRound(); else wrong();
  }
  function chooseCard(key: string) {
    if (inactive) return;
    choices.current++;
    if (mechanic === "action_sequence") { if (!order.includes(key) && order.length < (round.correct_order?.length || 0)) setOrder([...order, key]); }
    else setSelected(selected === key ? null : key);
  }
  function chooseTarget(target: string) {
    if (inactive || !selected) { if (!inactive) setFeedback(t("varied.copy011")); return; }
    const pair = {object_key: selected, target_key: target};
    choices.current++; evidence.current.responses.push(pair);
    if (pairMatches(pair, round.pairs || [])) {
      const next = [...pairs, pair]; setPairs(next); setSelected(null); setFeedback(t("varied.copy012"));
      if (next.length === round.pairs?.length) finishRound();
    } else { setSelected(null); wrong(); }
  }
  function checkOrder() {
    if (inactive || order.length !== round.correct_order?.length) return;
    evidence.current.responses.push([...order]);
    if (orderMatches(order, round.correct_order || [])) finishRound(); else wrong();
  }
  async function save(status: "completed" | "break" | "refused" | "technical_error") {
    if (saveLock.current) return;
    saveLock.current = true; setSaving(true); setSaveError("");
    const done = outcomesRef.current;
    const correct = done.filter(item => item.outcome !== "modelled").length;
    const independent = done.filter(item => item.outcome === "independent").length;
    const measurement: InstructionRunnerMeasurement = {attempt_status: status, prompts_used: prompts.current, gameplay_choices: choices.current};
    if (status === "completed") Object.assign(measurement, {attempts_count: done.length, correct_answers: correct,
      independent_completions: independent, prompted_completions: correct - independent,
      independence: Math.round(independent / Math.max(1, done.length) * 100), prompt_level: done.some(item => item.outcome === "modelled") ? "full" : independent === done.length ? "independent" : "minimal"});
    try {
      const result = await onComplete(measurement, {mechanic, bank_key: content.bank_key, round_count: done.length, planned_round_count: limit,
        bank_size: rounds.length, round_outcomes: done, round_order: rounds.slice(0, limit).map(item => item.key),
        unfinished_round: status === "completed" ? null : {key: round.key, responses: evidence.current.responses, supports: evidence.current.supports, order, pairs, selected},
        ...(status === "technical_error" ? {reason: errorReason} : {})});
      if (result) { setPhase("done"); if (status !== "completed") onBack(); }
      else { saveLock.current = false; setSaveError(t("varied.copy013")); }
    } catch { saveLock.current = false; setSaveError(t("varied.copy013")); }
    finally { setSaving(false); }
  }
  useImperativeHandle(stopRef, () => async status => { await save(status); });
  async function advance(extend = false) {
    if (saving || audioLock.current) return;
    if (!extend && index === limit - 1) { await save("completed"); return; }
    if (extend) setLimit(Math.min(rounds.length, limit + 6));
    const next = rounds[index + 1];
    evidence.current = {responses: [], supports: [], corrections: 0}; resolved.current = false;
    setIndex(index + 1); setOrder([]); setPairs([]); setSelected(null); setFeedback(""); setPhase("playing");
    await play(next.instruction);
  }
  function picture(item: LearningPicture, scene = false) {
    return <Image src={item.media_ref} alt="" width={scene ? 960 : 640} height={640} sizes="(max-width: 600px) 85vw, 360px" onError={mediaError}/>;
  }
  if (!round) return <div className="empty-state" role="alert">{t("varied.copy014")}<button className="secondary-button" onClick={onBack}>{t("varied.copy015")}</button></div>;
  if (phase === "done") return <div className="empty-state" role="status"><h3>{t("varied.copy016")}</h3><p>{t("varied.copy017")}{outcomes.length}.</p><button className="secondary-button" onClick={onBack}>{t("varied.copy015")}</button></div>;
  return <section className={`varied-runner varied-${mechanic}`} aria-label={mechanic === "category_sort" ? t("varied.copy018") : mechanic === "action_sequence" ? t("varied.copy019") : t("varied.copy020")}>
    <header className="varied-heading"><div><span className="kicker">{t("varied.progress", {current:index+1,total:limit})}</span><h3>{mechanic === "category_sort" ? t("varied.copy022") : mechanic === "action_sequence" ? t("varied.copy023") : t("varied.copy024")}</h3></div><button type="button" className="small-button" disabled={phase !== "playing" || audioPending || saving} onClick={() => void play(instructionText, true)}><Volume2 size={17}/> {t("varied.copy025")}</button></header>
    {phase === "technical" ? <div className="runner-intro" role="alert"><h3>{t("varied.copy026")}</h3><p>{errorReason}</p><button className="primary-button" disabled={saving} onClick={() => void save("technical_error")}>{t("varied.copy027")}</button></div> : phase === "intro" ? <div className="runner-intro"><p>{instructionLabels()[mechanic]}</p><PracticeLength value={limit} choices={content.round_choices || [limit]} bankSize={rounds.length} unit={mechanic === "category_sort" ? t("varied.copy028") : t("varied.copy029")} onChange={setLimit}/><button type="button" className="primary-button" onClick={() => {setPhase("playing"); void play(instructionText);}}>{t("varied.copy030")}</button></div> : <>
      <p className="varied-guidance">{mechanic === "category_sort" ? t("varied.copy031") : mechanic === "action_sequence" ? t("varied.chooseCount", {count:round.correct_order?.length || 0}) : selected ? t("varied.copy034") : t("varied.copy035")}</p>
      {audioPending && <p role="status">{t("varied.copy036")}</p>}
      {mechanic === "category_sort" ? <div className="sort-layout"><figure className="varied-object">{picture(cards[0])}<figcaption>{cards[0].label}</figcaption></figure><div className="sort-groups" role="group" aria-label={t("varied.copy037")}>{categories.map(group => {
        const sorted = outcomes.filter(outcome => rounds.find(item => item.key === outcome.round_key)?.category_key === group.key);
        return <button key={group.key} type="button" className={`sort-group ${phase === "resolved" && group.key === round.category_key ? "matched" : ""}`} disabled={inactive} onClick={() => sort(group.key)}><span className="sort-group-title">{picture(group)}<strong>{group.label}</strong></span><span className="sort-count">{t("varied.copy038")}{sorted.length}</span><span className="sort-collected">{sorted.slice(-6).map(outcome => {const item = rounds.find(item => item.key === outcome.round_key)!.cards[0]; return <span key={item.key}>{picture(item)}<span className="sr-only">{item.label}</span></span>;})}</span></button>;
      })}</div></div> : mechanic === "action_sequence" ? <>
        <ol className="sequence-slots" aria-label={t("varied.copy039")}>{(round.correct_order || []).map((_, position) => {const item = round.cards.find(item => item.key === order[position]); return <li key={position}><span className="sequence-number">{position + 1}</span>{item ? <button type="button" disabled={inactive} aria-label={t("varied.removeFromStep", {step:position+1,label:item.label})} onClick={() => setOrder(order.slice(0, position))}>{picture(item, true)}<strong>{item.label}</strong></button> : <span className="sequence-empty">{position === 0 ? t("varied.copy041") : position === 1 ? t("varied.copy042") : t("varied.copy043")}</span>}</li>;})}</ol>
        <div className="varied-card-bank" data-card-count={cards.length} role="group" aria-label={t("varied.copy044")}>{cards.map(item => <button key={item.key} type="button" className={`varied-picture scene ${order.includes(item.key) ? "chosen" : ""}`} disabled={inactive || order.includes(item.key) || order.length === round.correct_order?.length} aria-label={item.label} onClick={() => chooseCard(item.key)}>{picture(item, true)}<strong>{item.label}</strong>{order.includes(item.key) && <span className="picture-mark"><Check size={18}/><span className="sr-only">{t("varied.copy045")}</span></span>}</button>)}</div>
        {phase === "playing" && <div className="sequence-actions"><button type="button" className="secondary-button" disabled={!order.length || audioPending || saving} onClick={() => setOrder(order.slice(0, -1))}><RotateCcw size={17}/> {t("varied.copy046")}</button><button type="button" className="primary-button" disabled={order.length !== round.correct_order?.length || audioPending || saving} onClick={checkOrder}>{t("varied.copy047")}</button></div>}
      </> : <div className="match-columns"><section aria-labelledby={`${id}-objects`}><h4 id={`${id}-objects`}>{t("varied.copy048")}</h4>{cards.map(item => <button type="button" key={item.key} className={`varied-picture ${selected === item.key ? "selected" : ""} ${pairs.some(pair => pair.object_key === item.key) ? "matched" : ""}`} disabled={inactive || pairs.some(pair => pair.object_key === item.key)} aria-pressed={selected === item.key} aria-label={t("varied.object", {label:item.label})} onClick={() => chooseCard(item.key)}>{picture(item)}<strong>{item.label}</strong>{pairs.some(pair => pair.object_key === item.key) && <span className="picture-mark"><Check size={18}/><span className="sr-only">{t("varied.copy050")}</span></span>}</button>)}</section><section aria-labelledby={`${id}-actions`}><h4 id={`${id}-actions`}>{t("varied.copy051")}</h4>{targets.map(item => <button type="button" key={item.key} className={`varied-picture scene ${pairs.some(pair => pair.target_key === item.key) ? "matched" : ""}`} disabled={inactive || pairs.some(pair => pair.target_key === item.key)} aria-label={t("varied.action", {label:item.label})} onClick={() => chooseTarget(item.key)}>{picture(item, true)}<strong>{item.label}</strong>{pairs.some(pair => pair.target_key === item.key) && <span className="picture-mark"><Check size={18}/><span className="sr-only">{t("varied.copy050")}</span></span>}</button>)}</section></div>}
      {mechanic === "object_match" && pairs.length > 0 && <ul className="matched-pairs" aria-label={t("varied.copy053")}>{pairs.map(pair => <li key={pair.object_key}><Check size={16}/>{round.cards.find(item => item.key === pair.object_key)?.label} → {round.targets?.find(item => item.key === pair.target_key)?.label}</li>)}</ul>}
      {feedback && <p className="runner-feedback" role="status">{feedback}</p>}
      {phase === "playing" && <button type="button" className="small-button" disabled={audioPending || saving} onClick={showModel}>{t("varied.copy054")}</button>}
      {phase === "resolved" && <div className="varied-next">{index === limit - 1 && limit < rounds.length && <button type="button" className="secondary-button" disabled={saving} onClick={() => void advance(true)}>{t("varied.copy055")}</button>}<button type="button" className="primary-button" disabled={saving} onClick={() => void advance()}>{saving ? t("varied.copy056") : index === limit - 1 ? t("varied.copy057") : t("varied.copy058")}</button></div>}
    </>}
    {saveError && <p role="alert">{saveError}</p>}
    {phase !== "technical" && <div className="runner-stop-actions"><button type="button" className="small-button" disabled={saving || audioPending} onClick={() => void save("break")}><Pause size={16}/> {t("varied.copy059")}</button><button type="button" className="small-button" disabled={saving || audioPending} onClick={() => void save("refused")}><CircleX size={16}/> {t("varied.copy060")}</button></div>}
  </section>;
}
