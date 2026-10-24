"use client";

import { useEffect, useState } from "react";
import { ArrowRight, MessageCircle, RefreshCw } from "lucide-react";
import { api, type AdaptivePlan, type Exercise, type SpecialistAdvice } from "@/lib/api";
import { RecommendationDecision } from "./RecommendationDecision";

type Advice = SpecialistAdvice;

export function ParentSpecialistAdvice({ childId, exercises, onExercise, onOpenSpecialist, onStartPlan }: { childId: number; exercises: Exercise[]; onExercise: (exercise: Exercise) => void; onOpenSpecialist: () => void; onStartPlan: (plan: AdaptivePlan) => Promise<void> }) {
  const [state, setState] = useState<{loading: boolean; items: Advice[]; error: string}>({loading: true, items: [], error: ""});
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api<Advice[]>(`/api/children/${childId}/specialist-recommendations`, {signal: controller.signal})
      .then(items => { if (!controller.signal.aborted) setState({loading: false, items: items.filter(item => item.is_current), error: ""}); })
      .catch(cause => { if (!controller.signal.aborted) setState({loading: false, items: [], error: cause instanceof Error ? cause.message : "Не удалось загрузить рекомендации"}); });
    return () => controller.abort();
  }, [childId, revision]);
  const latest = state.items.find(item => item.ready_for_plan) || state.items.find(item => item.family_decision === "pending") || state.items[0];
  const exercise = latest?.exercise_available ? exercises.find(item => item.id === latest.exercise_id) : undefined;
  return <section className="parent-specialist-advice" aria-labelledby="specialist-advice-title" aria-busy={state.loading}>
    <div className="advice-heading"><span className="advice-mark"><MessageCircle size={24}/></span><div><span className="kicker">ПОДДЕРЖКА СПЕЦИАЛИСТА</span><h2 id="specialist-advice-title">{latest ? "С чего начать" : "Рекомендации специалиста"}</h2></div></div>
    {state.loading ? <p role="status">Загружаем рекомендации…</p> : state.error ? <div><p role="alert">{state.error}</p><button className="secondary-button" onClick={() => {setState({loading: true, items: [], error: ""}); setRevision(value => value + 1);}}><RefreshCw size={17}/> Повторить загрузку</button></div> : latest ? <>
      <div className="advice-meta"><strong>{latest.specialist_name}</strong><span>Последняя рекомендация · {new Date(latest.created_at).toLocaleDateString("ru-RU", {day: "numeric", month: "long"})}</span></div>
      <p className="advice-text">{latest.comment}</p>
      {latest.exercise_id && <p className="advice-exercise">Задание: <strong>{latest.exercise_title || "Материал из библиотеки"}</strong>{!exercise && <span>Сейчас недоступно для этого профиля. Уточните рекомендацию у специалиста.</span>}</p>}
      <RecommendationDecision key={`${latest.id}:${latest.family_decision}`} childId={childId} item={latest} onChanged={() => setRevision(value => value + 1)} onStartPlan={onStartPlan}/>
      <div className="cabinet-actions">{exercise && <button className="primary-button" onClick={() => onExercise(exercise)}>Открыть задание <ArrowRight size={18}/></button>}<button className={exercise ? "secondary-button" : "primary-button"} onClick={onOpenSpecialist}>Все рекомендации <ArrowRight size={18}/></button></div>
      <p className="advice-caption">Выбирайте удобный момент. Помощь, перерыв и отказ ребёнка всегда допустимы.</p>
    </> : <div className="advice-empty"><p>Когда специалист оставит рекомендацию, здесь появится понятный первый шаг для ребёнка.</p><button className="secondary-button" onClick={onOpenSpecialist}>Подключить специалиста <ArrowRight size={18}/></button></div>}
  </section>;
}
