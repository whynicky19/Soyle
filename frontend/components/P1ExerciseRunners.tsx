"use client";

import { Check, ChevronRight, CircleX, Pause, RotateCcw, ShieldCheck, Volume2 } from "lucide-react";
import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import {
  createChoiceRound,
  instructionMatches,
  resolveDifficulty,
  shuffleWithRandom,
  type ChoiceRound,
  type ChoiceStimulus,
  type DifficultyLevel,
  type InstructionScenario,
} from "@/lib/exerciseRuntime";

export type DraftExerciseVersion = {
  id: number;
  exercise_id: number;
  version: number;
  title: string;
  instruction: string;
  objective: string;
  mechanic: "auditory_choice" | "action_choice" | "tap_instruction" | "guided_aac";
  review_status: string;
  publication_status: string;
  technical_status?: string;
  methodology_status?: string;
  accessibility_status?: string;
  release_status?: string;
  method_card?: ExerciseMethodCard;
  content: {
    stimuli?: ChoiceStimulus[];
    difficulty_levels?: DifficultyLevel[];
    scenarios?: InstructionScenario[];
    asset_registry?: Array<{ media_ref: string; origin: string; license: string; license_status: string }>;
  };
};

export type ExerciseMethodCard = {
  target_skill: string;
  skill_group: string[];
  intended_for: string[];
  diagnosis_boundary: string;
  prerequisites: string[];
  stimuli_and_responses: string;
  child_instruction: string;
  adult_guidance: string[];
  accepted_responses: string[];
  difficulty_levels: string[];
  prompts: string[];
  ambiguities: string[];
  stop_conditions: string[];
  result_registration: string[];
  real_life_transfer: string[];
  sources: Array<string | Record<string, string>>;
  evidence_note: string;
  methodology_review_status: string;
};

type Speak = (text: string, rate?: number) => Promise<boolean>;

export type InstructionRunnerMeasurement = {
  attempts_count?: number;
  correct_answers?: number;
  prompts_used?: number;
  gameplay_choices?: number;
  independent_completions?: number;
  prompted_completions?: number;
  attempt_status: "completed" | "refused" | "break" | "technical_error";
  independence?: number;
  prompt_level?: "independent" | "minimal" | "full";
};

export function DraftExercisePreview({ version, onClose, onSpeak }: { version: DraftExerciseVersion; onClose: () => void; onSpeak: Speak }) {
  return <section className="draft-runner-shell" aria-label={`Предпросмотр: ${version.title}`}>
    <header><div><span className="kicker">DRAFT · ТОЛЬКО ПРЕДПРОСМОТР</span><h2>{version.title}</h2><p>{version.objective}</p></div><button type="button" className="small-button" onClick={onClose}><CircleX size={17}/> Закрыть</button></header>
    <div className="draft-safety-note"><ShieldCheck size={19}/><span>Результат не сохраняется. Черновик не виден ребёнку и не может быть опубликован без методического статуса approved.</span></div>
    {version.mechanic === "tap_instruction"
      ? <TapInstructionPreview version={version} onSpeak={onSpeak}/>
      : version.mechanic === "auditory_choice" || version.mechanic === "action_choice"
        ? <ChoicePreview version={version} onSpeak={onSpeak}/>
        : <div className="empty-state">Для этой механики используется существующий AAC-runner.</div>}
  </section>;
}

function ChoicePreview({ version, onSpeak }: { version: DraftExerciseVersion; onSpeak: Speak }) {
  const stimuli = useMemo(() => version.content.stimuli || [], [version.content.stimuli]);
  const byKey = useMemo(() => new Map(stimuli.map((item) => [item.key, item])), [stimuli]);
  const [level, setLevel] = useState<1 | 2 | 3>(2);
  const config = resolveDifficulty(version.content.difficulty_levels, level);
  const [phase, setPhase] = useState<"intro" | "playing" | "resolved" | "done" | "stopped">("intro");
  const [roundNumber, setRoundNumber] = useState(1);
  const [roundData, setRoundData] = useState<ChoiceRound | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<string[]>([]);
  const [attempts, setAttempts] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [audioReady, setAudioReady] = useState(false);
  const usedTargetKeysRef = useRef<string[]>([]);

  const speakTarget = async (round = roundData) => {
    if (!round) return;
    setAudioReady(false);
    const played = await onSpeak(byKey.get(round.targetKey)?.speech || "", 0.78);
    setAudioReady(played);
    if (!played) setFeedback("Озвучка недоступна. В предпросмотре результат не оценивается.");
  };
  const begin = async (previousCorrectIndex?: number) => {
    if (usedTargetKeysRef.current.length >= stimuli.length) usedTargetKeysRef.current = [];
    const next = createChoiceRound(stimuli, config.option_count, usedTargetKeysRef.current, Math.random, previousCorrectIndex);
    usedTargetKeysRef.current.push(next.targetKey);
    setRoundData(next); setVisibleKeys(next.optionKeys); setAttempts(0); setFeedback(""); setPhase("playing");
    await speakTarget(next);
  };
  const choose = (key: string) => {
    if (!roundData || phase !== "playing" || !audioReady) return;
    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);
    if (key === roundData.targetKey) {
      setFeedback(nextAttempts === 1 ? "Получилось самостоятельно." : "Получилось с подсказкой.");
      setPhase("resolved");
      return;
    }
    if (nextAttempts === 1) {
      setFeedback(byKey.get(roundData.targetKey)?.hint || "Послушай ещё раз и посмотри внимательно.");
      void speakTarget();
    } else if (nextAttempts < config.max_attempts) {
      const other = shuffleWithRandom(roundData.optionKeys.filter((item) => item !== roundData.targetKey && item !== key))[0];
      setVisibleKeys(shuffleWithRandom([roundData.targetKey, other].filter(Boolean)));
      setFeedback("Теперь можно выбрать из двух картинок.");
      void speakTarget();
    } else {
      setFeedback(`Посмотрим вместе: ${byKey.get(roundData.targetKey)?.label || "нужная картинка"}.`);
      setPhase("resolved");
    }
  };
  const next = () => {
    if (!roundData) return;
    if (roundNumber >= config.rounds) { setPhase("done"); return; }
    setRoundNumber((value) => value + 1);
    void begin(roundData.optionKeys.indexOf(roundData.targetKey));
  };
  const resetForLevel = (nextLevel: 1 | 2 | 3) => {
    usedTargetKeysRef.current = [];
    setLevel(nextLevel); setPhase("intro"); setRoundNumber(1); setRoundData(null); setFeedback(""); setAudioReady(false);
  };

  if (stimuli.length < 4) return <div className="empty-state">Для runner нужны минимум четыре структурированных стимула.</div>;
  if (phase === "done" || phase === "stopped") return <div className="runner-finish" role="status"><Check size={36}/><h3>{phase === "done" ? "Спокойное завершение" : "Предпросмотр остановлен"}</h3><p>{phase === "done" ? "Все раунды завершены. В режиме DRAFT ничего не сохранено." : "Перерыв и отказ приняты без ошибки и без оценки."}</p><button type="button" className="primary-button" onClick={() => resetForLevel(level)}>Начать заново</button></div>;

  return <div className="p1-choice-runner">
    <div className="runner-levels" aria-label="Сложность"><span>Вариантов ответа:</span>{([1, 2, 3] as const).map((value) => { const item = resolveDifficulty(version.content.difficulty_levels, value); return <button type="button" key={value} className={level === value ? "active" : ""} aria-pressed={level === value} onClick={() => resetForLevel(value)}>{item.option_count}</button>; })}</div>
    {phase === "intro" ? <div className="runner-intro"><Volume2 size={42}/><h3>{version.instruction}</h3><p>Сначала прозвучит задание. Положение правильной картинки меняется в каждом раунде.</p><button type="button" className="primary-button" onClick={() => void begin()}>Начать предпросмотр</button></div> : <>
      <div className="runner-audio"><button type="button" className="sound-button" onClick={() => void speakTarget()} aria-label="Повторить задание"><Volume2 size={28}/></button><div><span className="kicker">РАУНД {roundNumber} ИЗ {config.rounds}</span><strong>{audioReady ? "Покажи подходящую картинку" : "Нажми, чтобы послушать"}</strong></div><button type="button" className="small-button" onClick={() => void speakTarget()}><RotateCcw size={16}/> Повторить</button></div>
      <div className={`p1-choice-grid options-${visibleKeys.length}`}>{visibleKeys.map((key, index) => { const item = byKey.get(key); if (!item) return null; const revealed = phase === "resolved"; return <button type="button" key={key} disabled={revealed || !audioReady} className={revealed && key === roundData?.targetKey ? "answer" : ""} aria-label={revealed ? item.label : `Вариант ${index + 1}`} onClick={() => choose(key)}><Image src={item.media_ref || "/soyle-icon.png"} alt="" width={210} height={150}/>{revealed && <strong>{item.label}</strong>}{revealed && key === roundData?.targetKey && <i><Check size={17}/></i>}</button>; })}</div>
      {feedback && <div className="runner-feedback" role="status" aria-live="polite"><span>{feedback}</span>{phase === "resolved" && <button type="button" className="primary-button" onClick={next}>{roundNumber >= config.rounds ? "Завершить" : "Дальше"}<ChevronRight size={17}/></button>}</div>}
    </>}
    <div className="runner-stop-actions"><button type="button" className="small-button" onClick={() => setPhase("stopped")}><Pause size={16}/> Перерыв</button><button type="button" className="small-button" onClick={() => setPhase("stopped")}><CircleX size={16}/> Не хочу</button></div>
  </div>;
}

function TapInstructionPreview({ version, onSpeak }: { version: DraftExerciseVersion; onSpeak: Speak }) {
  const scenarios = version.content.scenarios || [];
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"intro" | "playing" | "resolved" | "done" | "stopped">("intro");
  const [selectedObject, setSelectedObject] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [feedback, setFeedback] = useState("");
  const scenario = scenarios[index];
  const movable = scenario?.objects.filter((item) => item.role === "movable") || [];
  const targets = scenario?.objects.filter((item) => item.role === "target") || [];
  const begin = async () => { if (!scenario) return; setPhase("playing"); setFeedback("Сначала выбери предмет, потом место или персонажа."); await onSpeak(scenario.speech, 0.78); };
  const chooseObject = (key: string) => { if (phase !== "playing") return; setSelectedObject(key); setFeedback("Теперь выбери, куда переместить предмет."); };
  const chooseTarget = (key: string) => {
    if (phase !== "playing") return;
    if (!selectedObject) { setFeedback("Сначала выбери предмет."); return; }
    const nextAttempts = attempts + 1; setAttempts(nextAttempts);
    if (instructionMatches(scenario, selectedObject, key)) { setPhase("resolved"); setFeedback(nextAttempts === 1 ? "Инструкция выполнена самостоятельно." : "Инструкция выполнена с подсказкой."); return; }
    setSelectedObject(null);
    setFeedback(nextAttempts === 1 ? "Попробуй ещё: сначала нужный предмет, потом нужная цель." : "Посмотри на мягкую подсветку нужных элементов.");
    void onSpeak(scenario.speech, 0.78);
  };
  const next = () => {
    if (index >= scenarios.length - 1) { setPhase("done"); return; }
    setIndex((value) => value + 1); setSelectedObject(null); setAttempts(0); setFeedback(""); setPhase("intro");
  };
  const restart = () => { setIndex(0); setSelectedObject(null); setAttempts(0); setFeedback(""); setPhase("intro"); };
  if (!scenario) return <div className="empty-state">В черновике нет сценариев инструкций.</div>;
  if (phase === "done" || phase === "stopped") return <div className="runner-finish" role="status"><Check size={36}/><h3>{phase === "done" ? "Спокойное завершение" : "Предпросмотр остановлен"}</h3><p>{phase === "done" ? "Одношаговые инструкции выполнены. Результат DRAFT не сохранён." : "Перерыв или отказ принят без ошибки."}</p><button type="button" className="primary-button" onClick={restart}>Начать заново</button></div>;
  return <div className="tap-instruction-runner">
    <div className="instruction-heading"><span className="kicker">ИНСТРУКЦИЯ {index + 1} ИЗ {scenarios.length}</span><h3>{scenario.instruction}</h3><button type="button" className="small-button" onClick={() => void onSpeak(scenario.speech, .78)}><Volume2 size={17}/> Повторить</button></div>
    {phase === "intro" ? <div className="runner-intro"><p>Здесь недостаточно выбрать одну картинку: нужно последовательно выбрать предмет и цель действия.</p><button type="button" className="primary-button" onClick={() => void begin()}>Послушать и выполнить</button></div> : <div className="instruction-stage">
      <section aria-labelledby="movable-heading"><h4 id="movable-heading">1. Выбери предмет</h4><div>{movable.map((item) => <button type="button" key={item.key} className={`${selectedObject === item.key ? "selected" : ""} ${attempts >= 2 && item.key === scenario.success.object_key ? "hinted" : ""}`} aria-pressed={selectedObject === item.key} onClick={() => chooseObject(item.key)}><Image src={item.media_ref} alt="" width={120} height={120}/><strong>{item.label}</strong></button>)}</div></section>
      <ChevronRight className="instruction-arrow" aria-hidden="true"/>
      <section aria-labelledby="target-heading"><h4 id="target-heading">2. Выбери цель</h4><div>{targets.map((item) => <button type="button" key={item.key} className={`${phase === "resolved" && item.key === scenario.success.target_key ? "completed" : ""} ${attempts >= 2 && item.key === scenario.success.target_key ? "hinted" : ""}`} onClick={() => chooseTarget(item.key)}><Image src={item.media_ref} alt="" width={120} height={120}/><strong>{item.label}</strong>{phase === "resolved" && item.key === scenario.success.target_key && <i><Check size={17}/></i>}</button>)}</div></section>
    </div>}
    {feedback && <div className="runner-feedback" role="status" aria-live="polite"><span>{feedback}</span>{phase === "resolved" && <button type="button" className="primary-button" onClick={next}>{index === scenarios.length - 1 ? "Завершить" : "Следующая инструкция"}<ChevronRight size={17}/></button>}</div>}
    <div className="runner-stop-actions"><button type="button" className="small-button" onClick={() => setPhase("stopped")}><Pause size={16}/> Перерыв</button><button type="button" className="small-button" onClick={() => setPhase("stopped")}><CircleX size={16}/> Не хочу</button></div>
  </div>;
}

export function PublishedInstructionRunner({
  scenarios,
  soundEnabled,
  onSpeak,
  onComplete,
  onBack,
}: {
  scenarios: InstructionScenario[];
  soundEnabled: boolean;
  onSpeak: Speak;
  onComplete: (measurement: InstructionRunnerMeasurement, details: Record<string, unknown>) => Promise<unknown> | void;
  onBack: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"intro" | "playing" | "resolved" | "technical">(soundEnabled ? "intro" : "technical");
  const [selectedObject, setSelectedObject] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [feedback, setFeedback] = useState("");
  const completedRef = useRef(0);
  const independentRef = useRef(0);
  const promptsRef = useRef(0);
  const choicesRef = useRef(0);
  const promptLevelRef = useRef<0 | 1 | 2>(0);
  const outcomesRef = useRef<Array<Record<string, unknown>>>([]);
  const scenario = scenarios[index];
  const movable = scenario?.objects.filter((item) => item.role === "movable") || [];
  const targets = scenario?.objects.filter((item) => item.role === "target") || [];

  const playInstruction = async () => {
    if (!scenario || !soundEnabled) { setPhase("technical"); return false; }
    const played = await onSpeak(scenario.speech, 0.78);
    if (!played) setPhase("technical");
    return played;
  };
  const begin = async () => {
    if (!scenario) return;
    setPhase("playing");
    setFeedback("Сначала выбери предмет, потом место или персонажа.");
    await playInstruction();
  };
  const chooseObject = (key: string) => {
    if (phase !== "playing") return;
    choicesRef.current += 1;
    setSelectedObject(key);
    setFeedback("Теперь выбери, куда переместить предмет.");
  };
  const chooseTarget = (key: string) => {
    if (phase !== "playing") return;
    choicesRef.current += 1;
    if (!selectedObject) { setFeedback("Сначала выбери предмет."); return; }
    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);
    if (instructionMatches(scenario, selectedObject, key)) {
      completedRef.current += 1;
      if (nextAttempts === 1) independentRef.current += 1;
      outcomesRef.current.push({ scenario_key: scenario.key, object_key: selectedObject, target_key: key, attempts: nextAttempts, outcome: nextAttempts === 1 ? "independent" : "prompted" });
      setPhase("resolved");
      setFeedback(nextAttempts === 1 ? "Инструкция выполнена самостоятельно." : "Инструкция выполнена с подсказкой.");
      return;
    }
    promptsRef.current += 1;
    promptLevelRef.current = nextAttempts === 1 ? Math.max(promptLevelRef.current, 1) as 0 | 1 | 2 : 2;
    if (nextAttempts >= 3) {
      outcomesRef.current.push({ scenario_key: scenario.key, object_key: selectedObject, target_key: key, attempts: nextAttempts, outcome: "modelled" });
      setPhase("resolved");
      setFeedback("Посмотрим правильное действие вместе. Это не ошибка и не наказание.");
      void playInstruction();
      return;
    }
    setSelectedObject(null);
    setFeedback(nextAttempts === 1 ? "Попробуй ещё: сначала нужный предмет, потом нужная цель." : "Мягкая подсветка покажет предмет и цель.");
    void playInstruction();
  };
  const next = async () => {
    if (index < scenarios.length - 1) {
      setIndex((value) => value + 1);
      setSelectedObject(null);
      setAttempts(0);
      setFeedback("");
      setPhase("intro");
      return;
    }
    const correct = completedRef.current;
    await onComplete({
      attempts_count: scenarios.length,
      correct_answers: correct,
      prompts_used: promptsRef.current,
      gameplay_choices: choicesRef.current,
      independent_completions: independentRef.current,
      prompted_completions: Math.max(0, correct - independentRef.current),
      attempt_status: "completed",
      independence: scenarios.length ? Math.round(independentRef.current / scenarios.length * 100) : 0,
      prompt_level: promptLevelRef.current === 0 ? "independent" : promptLevelRef.current === 1 ? "minimal" : "full",
    }, { mechanic: "tap_instruction", one_step_only: true, scenario_outcomes: outcomesRef.current });
  };
  const stop = async (status: "break" | "refused") => {
    const result = await onComplete({
      prompts_used: promptsRef.current,
      gameplay_choices: choicesRef.current,
      attempt_status: status,
    }, { mechanic: "tap_instruction", reason: "child_choice", scenario_index: index });
    if (result && status === "break") onBack();
  };
  const recordTechnicalIssue = async () => {
    const result = await onComplete({ attempt_status: "technical_error" }, { mechanic: "tap_instruction", reason: soundEnabled ? "audio_unavailable" : "sound_disabled" });
    if (result) onBack();
  };

  if (!scenario) return <div className="empty-state large" role="alert"><strong>Задание пока недоступно</strong><span>Опубликованная версия не содержит проверенных одношаговых сценариев.</span><button type="button" className="secondary-button" onClick={onBack}>Вернуться к занятиям</button></div>;
  if (phase === "technical") return <div className="listen-card published-instruction-card"><div className="sensory-demo technical"><Volume2 size={42}/><span className="kicker">БЕЗ ОЦЕНКИ</span><h2>Звук сейчас недоступен</h2><p>Инструкция должна прозвучать вслух, поэтому без звука выполнение не оценивается.</p><button type="button" className="primary-button" onClick={() => void recordTechnicalIssue()}>Вернуться без оценки</button></div></div>;
  return <div className="listen-card published-instruction-card"><div className="tap-instruction-runner">
    <div className="instruction-heading"><span className="kicker">ИНСТРУКЦИЯ {index + 1} ИЗ {scenarios.length}</span><h3>{scenario.instruction}</h3><button type="button" className="small-button" onClick={() => void playInstruction()}><Volume2 size={17}/> Повторить</button></div>
    {phase === "intro" ? <div className="runner-intro"><p>Сначала прозвучит один шаг. Выполни его двумя простыми нажатиями: предмет, затем цель.</p><button type="button" className="primary-button" onClick={() => void begin()}>Послушать и выполнить</button></div> : <div className="instruction-stage">
      <section aria-labelledby="published-movable-heading"><h4 id="published-movable-heading">1. Выбери предмет</h4><div>{movable.map((item) => <button type="button" key={item.key} className={`${selectedObject === item.key ? "selected" : ""} ${attempts >= 2 && item.key === scenario.success.object_key ? "hinted" : ""}`} aria-pressed={selectedObject === item.key} disabled={phase === "resolved"} onClick={() => chooseObject(item.key)}><Image src={item.media_ref} alt="" width={120} height={120}/><strong>{item.label}</strong></button>)}</div></section>
      <ChevronRight className="instruction-arrow" aria-hidden="true"/>
      <section aria-labelledby="published-target-heading"><h4 id="published-target-heading">2. Выбери цель</h4><div>{targets.map((item) => <button type="button" key={item.key} className={`${phase === "resolved" && item.key === scenario.success.target_key ? "completed" : ""} ${attempts >= 2 && item.key === scenario.success.target_key ? "hinted" : ""}`} disabled={phase === "resolved"} onClick={() => chooseTarget(item.key)}><Image src={item.media_ref} alt="" width={120} height={120}/><strong>{item.label}</strong>{phase === "resolved" && item.key === scenario.success.target_key && <i><Check size={17}/></i>}</button>)}</div></section>
    </div>}
    {feedback && <div className="runner-feedback" role="status" aria-live="polite"><span>{feedback}</span>{phase === "resolved" && <button type="button" className="primary-button" onClick={() => void next()}>{index === scenarios.length - 1 ? "Завершить" : "Следующая инструкция"}<ChevronRight size={17}/></button>}</div>}
    <div className="runner-stop-actions"><button type="button" className="small-button" onClick={() => void stop("break")}><Pause size={16}/> Перерыв</button><button type="button" className="small-button" onClick={() => void stop("refused")}><CircleX size={16}/> Не хочу</button></div>
  </div></div>;
}
