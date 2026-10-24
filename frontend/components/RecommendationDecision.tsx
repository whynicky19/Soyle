"use client";

import { useState } from "react";
import { api, type AdaptivePlan, type SpecialistAdvice } from "@/lib/api";

export const familyDecisionLabels = {
  pending: "Ожидает решения семьи",
  accepted: "Семья включила в практику",
  declined: "Семье не подходит",
  needs_help: "Семья просит помощь",
};

const attemptLabels: Record<string, string> = {
  completed: "Задание выполнено", participated: "Участие в практике", break: "Перерыв",
  refused: "Отказ принят", technical_error: "Техническая ошибка",
};

export function RecommendationOutcome({ item }: { item: SpecialistAdvice }) {
  const attempt = item.latest_attempt;
  return <div className="recommendation-outcome">
    <p><strong>{familyDecisionLabels[item.family_decision]}</strong>{item.goal_title && <> · Цель: {item.goal_title}</>}</p>
    {item.family_note && <p>Сообщение семьи: {item.family_note}</p>}
    {item.completed_at && <p>Практика по рекомендации состоялась. Это не подтверждение освоения навыка.</p>}
    {attempt && <p>Последняя попытка: {attemptLabels[attempt.attempt_status] || "Участие"} · {new Date(attempt.created_at).toLocaleString("ru-RU")}
      {attempt.attempt_status === "completed" && attempt.attempts_count ? ` · ${attempt.correct_answers ?? 0} из ${attempt.attempts_count}` : ""}
      {attempt.prompt_level && ` · ${attempt.prompt_level === "independent" ? "без подсказки" : "с помощью"}`}
    </p>}
  </div>;
}

export function RecommendationDecision({ childId, item, onChanged, onStartPlan }: {
  childId: number;
  item: SpecialistAdvice;
  onChanged: () => void;
  onStartPlan?: (plan: AdaptivePlan) => Promise<void>;
}) {
  const [goal, setGoal] = useState(String(item.suitable_goals.find(goal => goal.id === item.goal_id)?.id || item.suitable_goals[0]?.id || ""));
  const [note, setNote] = useState(item.family_note);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const decide = async (decision: "accepted" | "declined" | "needs_help") => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await api(`/api/children/${childId}/specialist-recommendations/${item.id}/decision`, {
        method: "PATCH", body: JSON.stringify({ decision, goal_id: goal ? Number(goal) : null, note }),
      });
      onChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить решение"); }
    finally { setBusy(false); }
  };
  const start = async () => {
    if (!onStartPlan || busy) return;
    setBusy(true); setError("");
    try {
      const plan = await api<AdaptivePlan>(`/api/children/${childId}/specialist-recommendations/${item.id}/plan`, { method: "POST" });
      await onStartPlan(plan);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось начать практику"); }
    finally { setBusy(false); }
  };
  return <div className="recommendation-decision">
    <RecommendationOutcome item={item}/>
    {!item.is_current ? <p>Рекомендация сохранена в истории и больше не включается в план.</p> : <>
      {item.exercise_id && !item.exercise_available && <p>Задание недоступно. Попросите специалиста обновить рекомендацию.</p>}
      {item.exercise_id && item.exercise_available && !item.suitable_goals.length && <p>Подходящей активной цели пока нет. Добавьте её в разделе «Цели и план» или попросите специалиста уточнить рекомендацию.</p>}
      {(item.family_decision !== "accepted" || !item.goal_available) && item.exercise_available && item.suitable_goals.length > 0 && <label>Цель для рекомендации<select value={goal} disabled={busy} onChange={event => setGoal(event.target.value)}><option value="">Выберите цель</option>{item.suitable_goals.map(value => <option key={value.id} value={value.id}>{value.title}</option>)}</select></label>}
      <details><summary>Сообщение специалисту</summary><label>Что подошло или какая помощь нужна<textarea value={note} disabled={busy} maxLength={1000} onChange={event => setNote(event.target.value)}/></label></details>
      <div className="cabinet-actions">
        {(item.family_decision !== "accepted" || (item.exercise_id && !item.goal_available)) && (!item.exercise_id || (item.exercise_available && item.suitable_goals.length > 0)) && <button className="primary-button" disabled={busy} onClick={() => void decide("accepted")}>{item.exercise_id ? "Включить в план" : "Принять рекомендацию"}</button>}
        {item.ready_for_plan && onStartPlan && <button className="primary-button" disabled={busy} onClick={() => void start()}>Начать по рекомендации</button>}
        <button className="secondary-button" disabled={busy} onClick={() => void decide("needs_help")}>Нужна помощь</button>
        <button className="secondary-button" disabled={busy} onClick={() => void decide("declined")}>Не подходит</button>
      </div>
      {item.ready_for_plan && <p>Задание включено в следующий план. Перерыв и отказ допустимы.</p>}
    </>}
    {busy && <p role="status">Сохраняем…</p>}{error && <p role="alert">{error}</p>}
  </div>;
}
