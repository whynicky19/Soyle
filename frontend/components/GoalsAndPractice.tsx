"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, CircleAlert, ClipboardPlus, History, Pause, Play, Save, ShieldCheck, Sparkles, Target } from "lucide-react";
import { api, type AdaptivePlan, type Child, type Exercise, type PracticeGoal, type PracticeGoalTemplate } from "@/lib/api";

type HelpLevel = "independent" | "minimal" | "full";
type Preference = "neutral" | "preferred" | "avoid";

const helpLabels: Record<HelpLevel, string> = {
  independent: "Без подсказки",
  minimal: "Небольшая подсказка",
  full: "Показ и полная помощь",
};

const resultLabels = {
  not_observed: "Не наблюдалось",
  independent: "Самостоятельно",
  with_help: "С помощью",
  refused: "Отказ",
  break: "Перерыв",
  technical_error: "Техническая ошибка",
} as const;

export function GoalsAndPractice({ child, targetMinutes, onStartPlan }: {
  child?: Child;
  targetMinutes: 3 | 5 | 10;
  onStartPlan: (plan: AdaptivePlan) => Promise<void>;
}) {
  const [templates, setTemplates] = useState<PracticeGoalTemplate[]>([]);
  const [goals, setGoals] = useState<PracticeGoal[]>([]);
  const [history, setHistory] = useState<AdaptivePlan[]>([]);
  const [preferences, setPreferences] = useState<Record<number, Preference>>({});
  const [preferenceNote, setPreferenceNote] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [baseline, setBaseline] = useState("");
  const [helpLevel, setHelpLevel] = useState<HelpLevel>("full");
  const [plan, setPlan] = useState<AdaptivePlan | null>(null);
  const [openGoal, setOpenGoal] = useState<number | null>(null);
  const [observation, setObservation] = useState({ result_type: "independent", prompt_level: "independent", note: "" });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const childId = child?.id;

  const load = useCallback(() => {
    if (!childId) return Promise.resolve();
    return Promise.all([
        api<PracticeGoalTemplate[]>("/api/practice-goal-templates"),
        api<PracticeGoal[]>(`/api/practice-goals/${childId}`),
        api<AdaptivePlan[]>(`/api/adaptive-plans/${childId}/history`),
        api<{ preferred_exercise_ids: number[]; avoided_exercise_ids: number[]; note: string }>(`/api/practice-preferences/${childId}`),
      ]).then(([nextTemplates, nextGoals, nextHistory, storedPreferences]) => {
      setTemplates(nextTemplates);
      setGoals(nextGoals);
      setHistory(nextHistory);
      setPreferenceNote(storedPreferences.note || "");
      setPreferences(Object.fromEntries([
        ...storedPreferences.preferred_exercise_ids.map((id) => [id, "preferred" as const]),
        ...storedPreferences.avoided_exercise_ids.map((id) => [id, "avoid" as const]),
      ]));
      setSelectedTemplate((current) => {
        if (current) return current;
        setHelpLevel(nextTemplates[0]?.default_help_level || "full");
        return nextTemplates[0]?.template_key || "";
      });
    }).catch((cause: unknown) => {
      setMessage(cause instanceof Error ? cause.message : "Не удалось загрузить цели");
    });
  }, [childId]);

  useEffect(() => { void load(); }, [load]);
  const currentTemplate = templates.find((item) => item.template_key === selectedTemplate);

  const linkedExercises = useMemo(() => {
    const byId = new Map<number, PracticeGoal["linked_exercises"][number]>();
    goals.forEach((goal) => goal.linked_exercises.forEach((exercise) => byId.set(exercise.id, exercise)));
    return [...byId.values()];
  }, [goals]);

  const addGoal = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!child || !selectedTemplate || loading) return;
    setLoading(true); setMessage("");
    try {
      await api("/api/practice-goals", {
        method: "POST",
        body: JSON.stringify({ child_id: child.id, template_key: selectedTemplate, baseline, help_level: helpLevel }),
      });
      setBaseline("");
      setMessage("Домашняя практическая цель добавлена. Это не профессиональное назначение.");
      await load();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Не удалось добавить цель"); }
    finally { setLoading(false); }
  };

  const changeGoalStatus = async (goal: PracticeGoal, status: PracticeGoal["status"]) => {
    if (!child || loading) return;
    setLoading(true); setMessage("");
    try {
      await api(`/api/practice-goals/${goal.id}`, {
        method: "PATCH",
        body: JSON.stringify({ child_id: child.id, expected_version: goal.version, status }),
      });
      setMessage("Статус цели сохранён в истории версий.");
      await load();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Не удалось обновить цель"); }
    finally { setLoading(false); }
  };

  const addObservation = async (event: React.FormEvent, goal: PracticeGoal) => {
    event.preventDefault();
    if (!child || loading) return;
    setLoading(true); setMessage("");
    try {
      await api(`/api/practice-goals/${goal.id}/observations`, {
        method: "POST",
        body: JSON.stringify({ child_id: child.id, ...observation }),
      });
      setObservation({ result_type: "independent", prompt_level: "independent", note: "" });
      setMessage("Наблюдение из реальной жизни сохранено отдельно от игровых результатов.");
      await load();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Не удалось сохранить наблюдение"); }
    finally { setLoading(false); }
  };

  const savePreferenceList = async () => {
    if (!child || loading) return;
    setLoading(true); setMessage("");
    try {
      await api(`/api/practice-preferences/${child.id}`, {
        method: "PUT",
        body: JSON.stringify({
          preferred_exercise_ids: Object.entries(preferences).filter(([, value]) => value === "preferred").map(([id]) => Number(id)),
          avoided_exercise_ids: Object.entries(preferences).filter(([, value]) => value === "avoid").map(([id]) => Number(id)),
          note: preferenceNote,
        }),
      });
      setMessage("Предпочтения сохранены и будут учтены при следующем плане.");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Не удалось сохранить предпочтения"); }
    finally { setLoading(false); }
  };

  const preparePlan = async () => {
    if (!child || loading) return;
    setLoading(true); setMessage("");
    try {
      const next = await api<AdaptivePlan>(`/api/adaptive-plans/${child.id}`, {
        method: "POST", body: JSON.stringify({ target_minutes: targetMinutes }),
      });
      setPlan(next);
      setHistory((current) => [next, ...current.filter((item) => item.id !== next.id)]);
      if (!next.items.length) setMessage(next.notices[0]?.message || "Подходящих опубликованных заданий пока нет.");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Не удалось подготовить план"); }
    finally { setLoading(false); }
  };

  const startPlan = async () => {
    if (!plan || !plan.items.length || loading) return;
    setLoading(true); setMessage("");
    try { await onStartPlan(plan); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Не удалось начать занятие"); setLoading(false); }
  };

  return <div className="page-enter goals-practice-page">
    <section className="goals-hero">
      <div><span className="kicker">ЦЕЛИ И ЗАНЯТИЯ</span><h1>Практика под понятную цель</h1><p>Родитель выбирает только из подготовленного каталога. Здесь нет диагноза, «речевого возраста» или профессионального назначения.</p></div>
      <div className="goals-hero-note"><ShieldCheck size={24}/><strong>Правила, не AI</strong><span>Каждый выбор задания можно объяснить и проверить.</span></div>
    </section>

    {message && <div className="family-inline-message goals-message" role="status"><CircleAlert size={17}/>{message}</div>}

    <div className="goals-main-grid">
      <section className="goals-column" aria-labelledby="current-goals-title">
        <div className="section-heading compact"><div><span className="kicker">ТЕКУЩИЕ ЦЕЛИ</span><h2 id="current-goals-title">Домашние практические цели</h2></div><span className="period-pill"><Target size={15}/>{goals.filter((goal) => goal.status === "active").length} активных</span></div>
        {goals.length ? <div className="practice-goal-list">{goals.map((goal) => <article key={goal.id} className={`practice-goal-card ${goal.status}`}>
          <button type="button" className="practice-goal-toggle" aria-expanded={openGoal === goal.id} onClick={() => setOpenGoal(openGoal === goal.id ? null : goal.id)}>
            <span><small>{goal.status === "active" ? "АКТИВНА" : goal.status === "paused" ? "НА ПАУЗЕ" : "ЗАВЕРШЕНА"} · версия {goal.version}</small><strong>{goal.title}</strong><p>{goal.observable_behavior}</p></span><ChevronDown size={20}/>
          </button>
          {openGoal === goal.id && <div className="practice-goal-details">
            <dl><div><dt>Исходное наблюдение</dt><dd>{goal.baseline}</dd></div><div><dt>Ожидаемое действие</dt><dd>{goal.target_outcome}</dd></div><div><dt>Нужная помощь</dt><dd>{helpLabels[goal.help_level]}</dd></div></dl>
            <div className="linked-exercises"><strong>Связанные опубликованные задания</strong>{goal.linked_exercises.length ? goal.linked_exercises.map((exercise) => <span key={exercise.id}><Check size={14}/>{exercise.title}<small>v{exercise.exercise_version}</small></span>) : <p><CircleAlert size={16}/> Для этой цели пока нет разрешённого задания. Черновики не используются.</p>}</div>
            <div className="goal-status-actions"><button type="button" className="small-button" disabled={loading || goal.status === "active"} onClick={() => void changeGoalStatus(goal, "active")}>Активировать</button><button type="button" className="small-button" disabled={loading || goal.status === "paused"} onClick={() => void changeGoalStatus(goal, "paused")}><Pause size={14}/> Пауза</button><button type="button" className="small-button" disabled={loading || goal.status === "completed"} onClick={() => void changeGoalStatus(goal, "completed")}><Check size={14}/> Завершить</button></div>
            <form className="goal-observation-form" onSubmit={(event) => void addObservation(event, goal)}><h3>Наблюдение в реальной жизни</h3><label>Что произошло<select value={observation.result_type} onChange={(event) => setObservation({...observation, result_type: event.target.value})}>{Object.entries(resultLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Помощь<select value={observation.prompt_level} onChange={(event) => setObservation({...observation, prompt_level: event.target.value})}><option value="independent">Без подсказки</option><option value="minimal">Небольшая подсказка</option><option value="full">Полная помощь</option></select></label><label className="wide">Короткая заметка<textarea value={observation.note} maxLength={600} onChange={(event) => setObservation({...observation, note: event.target.value})} placeholder="Например: попросил помощь карточкой во время игры"/></label><button className="primary-button" disabled={loading}><Save size={16}/> Сохранить наблюдение</button></form>
            {goal.observations.length ? <div className="goal-observation-history"><strong>Последние наблюдения</strong>{goal.observations.slice(0, 3).map((item) => <span key={item.id}><b>{resultLabels[item.result_type]}</b><small>{new Date(item.observed_at).toLocaleDateString("ru-RU")} · версия цели {item.goal_version}{item.note ? ` · ${item.note}` : ""}</small></span>)}</div> : null}
          </div>}
        </article>)}</div> : <div className="empty-state large"><Target size={30}/><strong>Целей пока нет</strong><span>Добавьте одну цель из подготовленного каталога — планировщик не будет выбирать случайные задания.</span></div>}
      </section>

      <aside className="goal-builder" aria-labelledby="goal-builder-title">
        <span className="goal-builder-icon"><ClipboardPlus size={24}/></span><span className="kicker">ДОБАВИТЬ ЦЕЛЬ</span><h2 id="goal-builder-title">Что хочется наблюдать дома</h2><p>Это временный родительский процесс, не программа лечения.</p>
        <form onSubmit={addGoal}><label>Подготовленная цель<select value={selectedTemplate} onChange={(event) => { const key = event.target.value; setSelectedTemplate(key); setHelpLevel(templates.find((item) => item.template_key === key)?.default_help_level || "full"); }} required>{templates.map((item) => <option key={item.template_key} value={item.template_key}>{item.title}</option>)}</select></label>{currentTemplate && <div className="template-preview"><strong>{currentTemplate.observable_behavior}</strong><span>{currentTemplate.target_outcome}</span><small>Допустимо: {currentTemplate.accepted_responses.join(", ")}</small></div>}<label>Что получается сейчас<textarea required minLength={2} maxLength={600} value={baseline} onChange={(event) => setBaseline(event.target.value)} placeholder={currentTemplate?.baseline_prompt || "Коротко опишите наблюдение"}/></label><label>Какая помощь обычно нужна<select value={helpLevel} onChange={(event) => setHelpLevel(event.target.value as HelpLevel)}>{Object.entries(helpLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button className="primary-button" disabled={loading || !selectedTemplate}>{loading ? "Сохраняем…" : "Добавить домашнюю цель"}</button></form>
      </aside>
    </div>

    {linkedExercises.length ? <section className="practice-preferences-card"><div className="admin-card-head"><div><span className="kicker">ПРЕДПОЧТЕНИЯ</span><h2>Что подходит ребёнку</h2><p>Отметки влияют только на порядок связанных опубликованных заданий. «Избегать» полностью исключает задание из нового плана.</p></div></div><div className="preference-list">{linkedExercises.map((exercise) => <label key={exercise.id}><span><strong>{exercise.title}</strong><small>Опубликованная версия {exercise.exercise_version}</small></span><select aria-label={`Предпочтение: ${exercise.title}`} value={preferences[exercise.id] || "neutral"} onChange={(event) => setPreferences({...preferences, [exercise.id]: event.target.value as Preference})}><option value="neutral">Без отметки</option><option value="preferred">Предпочитает</option><option value="avoid">Пока не предлагать</option></select></label>)}</div><label className="preference-note">Что ещё важно учесть<textarea value={preferenceNote} maxLength={600} onChange={(event) => setPreferenceNote(event.target.value)} placeholder="Например: лучше знакомые картинки и короткие занятия"/></label><button type="button" className="secondary-button" disabled={loading} onClick={() => void savePreferenceList()}><Save size={16}/> Сохранить предпочтения</button></section> : null}

    <section className="adaptive-plan-card" aria-labelledby="adaptive-plan-title">
      <div className="adaptive-plan-head"><div><span className="kicker">ПЛАН НА {targetMinutes} МИНУТ</span><h2 id="adaptive-plan-title">Объяснимый подбор занятий</h2><p>Только активные цели и разрешённые версии. Сложность меняется через число вариантов, подсказки и знакомость материалов.</p></div><button type="button" className="primary-button" disabled={loading} onClick={() => void preparePlan()}><Sparkles size={17}/>{loading ? "Проверяем…" : "Подготовить план"}</button></div>
      {plan && <div className="prepared-plan"><p className="plan-summary">{plan.summary}</p>{plan.items.map((item, index) => <article key={item.id}><span className="plan-number">{index + 1}</span><div><small>{item.module === "sensory" ? "Понимание речи" : "AAC-коммуникация"} · версия задания {item.exercise_version}</small><h3>{item.exercise_title}</h3><p>{item.instruction}</p><div className="difficulty-chips"><span>{item.difficulty_params.option_count ? `${item.difficulty_params.option_count} варианта` : "AAC-карточки"}</span><span>{item.difficulty_params.prompt_mode === "model_and_visual" ? "показ и подсказка" : item.difficulty_params.prompt_mode === "visual" ? "визуальная подсказка" : "подсказка по запросу"}</span><span>{item.difficulty_params.familiar_repetition ? "знакомое повторение" : "разнообразие материалов"}</span></div><details><summary>Почему предложено</summary><ul>{item.assignment_reason.messages.map((reason) => <li key={reason}>{reason}</li>)}</ul></details></div></article>)}{plan.notices.map((notice, index) => <div className="plan-notice" key={`${notice.goal_id}-${index}`}><CircleAlert size={17}/><span>{notice.goal_title && <strong>{notice.goal_title}: </strong>}{notice.message}</span></div>)}{plan.items.length ? <button type="button" className="primary-button plan-start" disabled={loading} onClick={() => void startPlan()}><Play size={18} fill="currentColor"/> Начать этот план</button> : null}</div>}
    </section>

    <section className="plan-history-card"><div><History size={22}/><span><strong>Предыдущие планы</strong><small>Сохраняются версии целей, заданий, параметры сложности и причины выбора.</small></span></div>{history.length ? <div>{history.slice(0, 5).map((item) => <span key={item.id}><b>{new Date(item.created_at).toLocaleDateString("ru-RU")} · {item.items.length} заданий</b><small>{item.status === "started" ? "занятие начато" : "подготовлен"} · правила {item.rules_version}</small></span>)}</div> : <p>История появится после первого подготовленного плана.</p>}</section>
  </div>;
}

export function exerciseFromPlanItem(item: AdaptivePlan["items"][number], catalogue: Exercise[]): Exercise | undefined {
  return catalogue.find((exercise) => exercise.id === item.exercise_id);
}
