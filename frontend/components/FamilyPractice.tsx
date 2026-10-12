"use client";

import { Check, ChevronDown, CircleAlert, ClipboardList, Home, LockKeyhole, Pause, Save, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

type ObservationStatus = "not_observed" | "not_yet" | "with_help" | "independent" | "needs_review";
type SkillObservation = { category: string; label: string; status: ObservationStatus; note: string; observed_at: string | null; updated_at: string | null };
type HomeActivity = { id: number; title: string; objective: string; materials: string[]; adult_instructions: string[]; accepted_responses: string[]; prompts: string[]; stop_conditions: string[] };
type PendingActivity = { id: number; title: string; review_status: string; publication_status: string };
type HomeLibrary = { activities: HomeActivity[]; pending_review: PendingActivity[]; observations: Array<{ id: number; activity_id: number; activity_title: string; outcome: string; note: string; observed_at: string }>; notice: string };
type ResultsSummary = { gameplay_choices: number; gameplay_rounds: number; correct_gameplay_rounds: number; independent_completions: number; prompted_completions: number; prompts_used: number; refusals: number; breaks: number; technical_errors: number; real_life_observations: number; disclaimer: string };

const statusOptions: Array<{ value: ObservationStatus; label: string }> = [
  { value: "not_observed", label: "Не наблюдалось" },
  { value: "not_yet", label: "Пока не получается" },
  { value: "with_help", label: "С помощью" },
  { value: "independent", label: "Самостоятельно" },
  { value: "needs_review", label: "Требует проверки" },
];

export function FunctionalSkillMap({ childId }: { childId?: number }) {
  const [items, setItems] = useState<SkillObservation[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!childId) return;
    api<SkillObservation[]>(`/api/observations/${childId}`).then((value) => { setItems(value); setNotes(Object.fromEntries(value.map((item) => [item.category, item.note]))); }).catch(() => setMessage("Не удалось загрузить карту наблюдений"));
  }, [childId]);
  const save = async (item: SkillObservation, status = item.status) => {
    if (!childId || saving) return;
    setSaving(item.category); setMessage("");
    try {
      const updated = await api<SkillObservation>(`/api/observations/${childId}/${item.category}`, { method: "PUT", body: JSON.stringify({ status, note: notes[item.category] || "" }) });
      setItems((current) => current.map((entry) => entry.category === item.category ? updated : entry));
      setMessage("Наблюдение сохранено отдельно от игровых результатов");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Не удалось сохранить наблюдение"); }
    finally { setSaving(""); }
  };
  return <section className="admin-card functional-map">
    <div className="admin-card-head"><div><span className="kicker">ФУНКЦИОНАЛЬНАЯ КАРТА</span><h3>Наблюдения в обычной жизни</h3><p>Это не тест и не расчёт речевого возраста. Отмечайте только то, что действительно наблюдали.</p></div><span className="period-pill"><ClipboardList size={15}/> 7 областей</span></div>
    <div className="skill-observation-grid">{items.map((item) => <article key={item.category}><label><strong>{item.label}</strong><span className={`observation-status ${item.status}`}>{statusOptions.find((option) => option.value === item.status)?.label}</span><span className="select-wrap"><select aria-label={`Статус: ${item.label}`} value={item.status} onChange={(event) => { const status = event.target.value as ObservationStatus; setItems((current) => current.map((entry) => entry.category === item.category ? { ...entry, status } : entry)); }}><option value="not_observed">Не наблюдалось</option><option value="not_yet">Пока не получается</option><option value="with_help">С помощью</option><option value="independent">Самостоятельно</option><option value="needs_review">Требует проверки</option></select><ChevronDown size={16}/></span></label><label className="observation-note"><span>Короткая заметка (необязательно)</span><textarea value={notes[item.category] || ""} maxLength={500} onChange={(event) => setNotes((current) => ({ ...current, [item.category]: event.target.value }))} placeholder="Например: показал чашку после повторения"/></label><button type="button" className="small-button" disabled={saving === item.category} onClick={() => void save(item)}><Save size={15}/>{saving === item.category ? "Сохраняем…" : "Сохранить"}</button></article>)}</div>
    {message && <div className="family-inline-message" role="status"><Check size={16}/>{message}</div>}
  </section>;
}

export function HomePracticeLibrary({ childId }: { childId?: number }) {
  const [library, setLibrary] = useState<HomeLibrary | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [form, setForm] = useState({ activity_id: 0, outcome: "independent", prompt_level: "independent", note: "" });
  const [message, setMessage] = useState("");
  const load = useCallback(() => { if (childId) api<HomeLibrary>(`/api/home-activities/${childId}`).then(setLibrary).catch(() => setMessage("Не удалось загрузить библиотеку")); }, [childId]);
  useEffect(load, [load]);
  const saveObservation = async (event: React.FormEvent) => {
    event.preventDefault();
    const activityId = form.activity_id || openId;
    if (!childId || !activityId) return;
    setMessage("");
    try { await api(`/api/home-activities/${childId}/observations`, { method: "POST", body: JSON.stringify({ ...form, activity_id: activityId }) }); setForm({ activity_id: 0, outcome: "independent", prompt_level: "independent", note: "" }); setOpenId(null); setMessage("Бытовое наблюдение сохранено отдельно от игровых ответов"); load(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Не удалось сохранить наблюдение"); }
  };
  return <section className="admin-card home-practice-library">
    <div className="admin-card-head"><div><span className="kicker">СОВМЕСТНАЯ ПРАКТИКА</span><h3>Бытовые игры дома</h3><p>Короткие ситуации для совместного действия. Отказ и перерыв всегда принимаются.</p></div><span className="period-pill"><Home size={15}/> Без оценки речи</span></div>
    {library?.activities.length ? <div className="home-activity-list">{library.activities.map((activity) => <article key={activity.id} className={openId === activity.id ? "open" : ""}><button type="button" className="home-activity-toggle" aria-expanded={openId === activity.id} onClick={() => { const nextId = openId === activity.id ? null : activity.id; setOpenId(nextId); if (nextId) setForm({ activity_id: nextId, outcome: "independent", prompt_level: "independent", note: "" }); }}><span><strong>{activity.title}</strong><small>{activity.objective}</small></span><ChevronDown size={18}/></button>{openId === activity.id && <div className="home-activity-details"><DetailList title="Материалы" values={activity.materials}/><DetailList title="Что делает взрослый" values={activity.adult_instructions}/><DetailList title="Допустимые ответы" values={activity.accepted_responses}/><DetailList title="Подсказки" values={activity.prompts}/><DetailList title="Когда остановиться" values={activity.stop_conditions} stop/><form onSubmit={saveObservation}><h4>Зафиксировать наблюдение</h4><label>Как получилось<select value={form.activity_id === activity.id ? form.outcome : "independent"} onChange={(event) => setForm({ ...form, activity_id: activity.id, outcome: event.target.value })}><option value="independent">Самостоятельно</option><option value="with_help">С помощью</option><option value="refused">Отказ</option><option value="stopped">Остановились</option><option value="not_observed">Не наблюдалось</option></select></label><label>Уровень подсказки<select value={form.prompt_level} onChange={(event) => setForm({ ...form, activity_id: activity.id, prompt_level: event.target.value })}><option value="independent">Без подсказки</option><option value="minimal">Минимальная</option><option value="full">Полная</option></select></label><label>Заметка<textarea maxLength={500} value={form.activity_id === activity.id ? form.note : ""} onChange={(event) => setForm({ ...form, activity_id: activity.id, note: event.target.value })}/></label><button className="primary-button"><Save size={16}/> Сохранить наблюдение</button></form></div>}</article>)}</div> : <div className="review-gated-library"><LockKeyhole size={28}/><div><strong>Игры подготовлены, но ещё не активированы</strong><p>Двенадцать синтетических карточек находятся на методической проверке. Родителю пока видны только названия — инструкции не публикуются до утверждения.</p></div><div>{library?.pending_review.map((item) => <span key={item.id}><ShieldCheck size={14}/>{item.title}<small>DRAFT</small></span>)}</div></div>}
    {library?.observations.length ? <div className="real-life-history"><strong>Последние бытовые наблюдения</strong>{library.observations.slice(0, 5).map((item) => <span key={item.id}><b>{item.activity_title}</b><small>{item.outcome} · {new Date(item.observed_at).toLocaleDateString("ru-RU")}</small></span>)}</div> : null}
    {message && <div className="family-inline-message" role="status"><Check size={16}/>{message}</div>}
  </section>;
}

function DetailList({ title, values, stop = false }: { title: string; values: string[]; stop?: boolean }) {
  return <div className={stop ? "stop-conditions" : ""}><h4>{stop && <Pause size={15}/>} {title}</h4><ul>{values.map((value) => <li key={value}>{value}</li>)}</ul></div>;
}

export function P1ResultsSummary({ childId }: { childId?: number }) {
  const [summary, setSummary] = useState<ResultsSummary | null>(null);
  useEffect(() => { if (childId) api<ResultsSummary>(`/api/results/${childId}/summary`).then(setSummary).catch(() => setSummary(null)); }, [childId]);
  if (!summary) return null;
  const rows = [
    ["Игровые нажатия", summary.gameplay_choices],
    ["Выполнено самостоятельно", summary.independent_completions],
    ["Выполнено с подсказкой", summary.prompted_completions],
    ["Отказы", summary.refusals],
    ["Перерывы", summary.breaks],
    ["Технические ошибки", summary.technical_errors],
    ["Наблюдения в жизни", summary.real_life_observations],
  ] as const;
  return <section className="admin-card separated-results"><div className="admin-card-head"><div><span className="kicker">РАЗДЕЛЬНЫЕ ПОКАЗАТЕЛИ</span><h3>Что именно зафиксировано</h3><p>{summary.disclaimer}</p></div><CircleAlert size={24}/></div><div>{rows.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div></section>;
}
