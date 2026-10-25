"use client";
import { VocabularyProgress } from "./VocabularyProgress";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRefreshOnReturn } from "@/lib/hooks/useRefreshOnReturn";
import { GoalPracticeProgress } from "./GoalPracticeProgress";
import type { PracticeGoal } from "@/lib/api";
import { BrandLogo } from "@/components/BrandLogo";
import { Users, ArrowRight, LogOut, ClipboardList, MessageSquare, Clock, RefreshCw, Link2, Copy, Check } from "lucide-react";
import { CabinetNavigation, useCabinetSection } from "./CabinetNavigation";
import { api, type Child, type Exercise, type User, type SpecialistAdvice, type AdaptivePlan } from "@/lib/api";

import { RecommendationDecision, RecommendationOutcome } from "./RecommendationDecision";

type Observation = { id: number; result_type: string; prompt_level: string; context: string; note: string; created_at: string; specialist_name?: string };
type Workspace = {
  practice_goals: PracticeGoal[];
  available_exercises: Exercise[];
  observations: Observation[];
  recommendations: SpecialistAdvice[];
  dashboard: { recent: Array<{ id: number; attempt_status: string; title?: string; created_at: string }>; total_sessions: number };
};
const outcomes: Record<string, string> = { completed: "Задание выполнено", participated: "Участие в практике", independent: "Самостоятельно", with_help: "С помощью", not_observed: "Не наблюдалось", refused: "Отказ", break: "Перерыв", technical_error: "Техническая ошибка" };

const specialistSections = [{id: "children", label: "Дети"}, {id: "observations", label: "Наблюдения"}, {id: "recommendations", label: "Рекомендации"}, {id: "history", label: "Цели и история"}] as const;

export function SpecialistWorkspace({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [section, navigate] = useCabinetSection("specialist", specialistSections);
  const [children, setChildren] = useState<Child[]>([]);
  const [selected, setSelected] = useState("");
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState("not_observed");
  const [prompt, setPrompt] = useState("independent");
  const [context, setContext] = useState("");
  const [note, setNote] = useState("");
  const [goal, setGoal] = useState("");
  const [exercise, setExercise] = useState("");
  const [recommendationGoal, setRecommendationGoal] = useState("");
  const [recommendation, setRecommendation] = useState("");
  useEffect(() => {
    let active = true;
    api<Child[]>("/api/children").then(items => { if (active) { setChildren(items); const requested = Number(new URLSearchParams(window.location.search).get("child")); setSelected(String(items.find(item => item.id === requested)?.id || items[0]?.id || "")); } })
      .catch(cause => { if (active) setError(cause.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const workspaceRequest = useRef<AbortController | null>(null);
  const reload = useCallback(async (background = false) => {
    workspaceRequest.current?.abort();
    if (!selected) return;
    const controller = new AbortController();
    workspaceRequest.current = controller;
    if (!background) setWorkspace(null);
    setError("");
    try {
      const next = await api<Workspace>(`/api/specialist/children/${selected}`, {signal: controller.signal});
      if (!controller.signal.aborted) setWorkspace(next);
    } catch (cause) {
      if (!controller.signal.aborted) {
        setWorkspace(null);
        setError(cause instanceof Error ? cause.message : "Доступ к профилю больше не предоставлен");
      }
    }
  }, [selected]);
  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0);
    return () => { window.clearTimeout(timer); workspaceRequest.current?.abort(); };
  }, [reload]);
  const refreshOnReturn = useCallback(() => reload(true), [reload]);
  useRefreshOnReturn(refreshOnReturn, Boolean(selected));
  const saveObservation = async (event: React.FormEvent) => {
    event.preventDefault(); if (!selected || saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await api(`/api/specialist/children/${selected}/observations`, { method: "POST", body: JSON.stringify({ result_type: result, prompt_level: prompt, context, note, goal_id: goal ? Number(goal) : null }) });
      setContext(""); setNote(""); setNotice("Наблюдение сохранено отдельно от игровых результатов."); await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить наблюдение"); setWorkspace(null); }
    finally { setSaving(false); }
  };
  const recommend = async (event: React.FormEvent) => {
    event.preventDefault(); if (!selected || saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await api("/api/specialist/recommendations", { method: "POST", body: JSON.stringify({ child_id: Number(selected), suggested_skill: workspace?.available_exercises.find(item => item.id === Number(exercise))?.skill || "communication", goal_id: recommendationGoal ? Number(recommendationGoal) : null, exercise_id: exercise ? Number(exercise) : null, comment: recommendation }) });
      setRecommendation(""); setNotice("Рекомендация сохранена. Семья сама выбирает, когда заниматься."); await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить рекомендацию"); setWorkspace(null); }
    finally { setSaving(false); }
  };
  const withdrawRecommendation = async (id: number) => {
    if (saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await api(`/api/specialist/recommendations/${id}`, { method: "PATCH", body: JSON.stringify({ status: "rejected" }) });
      setNotice("Рекомендация отозвана. История попыток сохранена."); await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось отозвать рекомендацию"); }
    finally { setSaving(false); }
  };
  const chooseChild = (id: string) => {
    if (id !== selected) { setWorkspace(null); setGoal(""); setContext(""); setNote(""); setExercise(""); setRecommendationGoal(""); setRecommendation(""); setError(""); setNotice(""); }
    setSelected(id);
    const url = new URL(window.location.href); url.searchParams.set("child", id); window.history.replaceState(null, "", url);
  };
  return <div className="professional-shell">
    <aside className="professional-sidebar"><a className="cabinet-brand" href="/app"><BrandLogo variant="compact" width={165}/><small>Кабинет специалиста</small></a><CabinetNavigation cabinet="specialist" sections={specialistSections} active={section} onNavigate={navigate}/><div className="professional-account"><strong>{user.full_name}</strong><small>@{user.username}</small><button className="secondary-button" onClick={onLogout}><LogOut size={18}/> Выйти из аккаунта</button></div></aside>
    <main className="specialist-workspace cabinet-content"><header className="cabinet-heading"><div><p className="kicker">РАБОТА С СЕМЬЁЙ</p><h1>{specialistSections.find(item => item.id === section)?.label}</h1><p>Наблюдения и поддержка, в удобном темпе для каждой семьи.</p></div><span className="cabinet-badge"><Users size={18}/>{children.length} {children.length % 10 === 1 && children.length % 100 !== 11 ? "профиль" : children.length % 10 >= 2 && children.length % 10 <= 4 && (children.length % 100 < 12 || children.length % 100 > 14) ? "профиля" : "профилей"}</span></header>
    {error && <div className="cabinet-notice error" role="alert">{error}<button className="secondary-button" onClick={() => void reload()}>Проверить доступ снова</button></div>}{notice && <p className="cabinet-notice" role="status">{notice}</p>}
    {loading ? <p role="status">Загружаем доступные профили…</p> : !children.length ? <section className="cabinet-empty"><Users size={40}/><h2>Нет доступных профилей</h2><p>Откройте ссылку-приглашение от родителя и отправьте запрос. После подтверждения семьёй профиль появится здесь. Если запрос уже отправлен, дождитесь подтверждения и обновите список.</p><p>Ваш логин: <strong>{user.username}</strong></p><button className="secondary-button" onClick={() => window.location.reload()}><RefreshCw size={18}/> Обновить список детей</button></section> : <>
    {section === "children" ? <><div className="cabinet-intro"><h2>Семьи, с которыми вы работаете</h2><p>Каждый профиль открыт родителем. Выберите ребёнка, чтобы перейти к наблюдениям.</p></div><div className="specialist-children-grid">{children.map(child => <button className="specialist-child" key={child.id} onClick={() => { chooseChild(String(child.id)); navigate("observations"); }}><span className="cabinet-avatar" style={{background:child.avatar_color}}>{child.name[0]}</span><span><strong>{child.name}</strong><small>Открыть наблюдения</small></span><ArrowRight size={22}/></button>)}</div><p className="cabinet-footnote">Игровые результаты и наблюдения вне игры сохраняются отдельно. Они не являются автоматической диагностикой.</p></> : <>
    <button className="secondary-button" disabled={saving} onClick={() => void reload()}><RefreshCw size={17}/> Обновить профиль</button>
    <label className="cabinet-child-picker">Профиль ребёнка<select value={selected} disabled={saving} onChange={e => { chooseChild(e.target.value); }}>{children.map(child => <option key={child.id} value={child.id}>{child.name}</option>)}</select></label>
    {selected && !workspace && !error && <p role="status">Загружаем профиль…</p>}
    {workspace && <>
      {section === "observations" && <div className="specialist-columns"><section className="cabinet-panel"><div className="cabinet-section-title"><ClipboardList size={22}/><div><h2>Наблюдение вне игры</h2><p>Запишите конкретное действие и помощь взрослого.</p></div></div><form onSubmit={saveObservation}>
        <label>Связь с целью<select value={goal} onChange={e => setGoal(e.target.value)}><option value="">Без привязки</option>{workspace.practice_goals.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <label>Что наблюдалось<select value={result} onChange={e => { setResult(e.target.value); if (e.target.value === "independent") setPrompt("independent"); if (e.target.value === "with_help" && prompt === "independent") setPrompt("minimal"); }}>{Object.entries(outcomes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Уровень помощи<select value={prompt} onChange={e => setPrompt(e.target.value)} disabled={result === "independent"}><option value="independent">Без подсказки</option><option value="minimal">Небольшая подсказка</option><option value="full">Показ и полная помощь</option></select></label>
        <label>Ситуация<input value={context} onChange={e => setContext(e.target.value)} minLength={3} maxLength={300} required placeholder="Например, игра с другой игрушкой"/></label>
        <label>Наблюдаемые действия<textarea value={note} onChange={e => setNote(e.target.value)} minLength={3} maxLength={1000} required/></label>
        <button className="primary-button" disabled={saving}>{saving ? "Сохраняем…" : "Сохранить наблюдение"}</button>
      </form></section><section className="cabinet-panel"><h2>Ваши наблюдения</h2>{workspace.observations.length ? workspace.observations.map(item => <article className="cabinet-entry" key={item.id}><small>{new Date(item.created_at).toLocaleString("ru-RU")}</small><h3>{outcomes[item.result_type]}</h3><p>{item.context}: {item.note}</p><small>Наблюдение специалиста · {item.prompt_level === "independent" ? "без подсказки" : "с помощью"}</small></article>) : <div className="cabinet-empty-inline"><ClipboardList size={28}/><p>Наблюдений пока нет. Первая запись появится после сохранения формы.</p></div>}</section></div>}
      {section === "recommendations" && <div className="specialist-columns"><section className="cabinet-panel"><div className="cabinet-section-title"><MessageSquare size={22}/><div><h2>Рекомендация семье</h2><p>Одно понятное действие, которое можно попробовать дома.</p></div></div><form onSubmit={recommend}>
        <label>Цель рекомендации<select value={recommendationGoal} onChange={e => { setRecommendationGoal(e.target.value); setExercise(""); }}><option value="">Семья выберет цель при принятии</option>{workspace.practice_goals.filter(item => item.status === "active").map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <label>Упражнение<select value={exercise} onChange={e => setExercise(e.target.value)}><option value="">Без назначения упражнения</option>{workspace.available_exercises.filter(item => !recommendationGoal || workspace.practice_goals.find(goal => goal.id === Number(recommendationGoal))?.linked_exercises.some(linked => linked.id === item.id)).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <label>Как поддержать ребёнка<textarea value={recommendation} onChange={e => setRecommendation(e.target.value)} required minLength={3} maxLength={1000}/></label>
        <button className="primary-button" disabled={saving}>Сохранить рекомендацию</button>
      </form></section><section className="cabinet-panel"><h2>Ваши рекомендации</h2>{workspace.recommendations.length ? workspace.recommendations.map(item => <article className="cabinet-entry" key={item.id}><h3>{item.exercise_title || "Поддержка дома"}</h3><p>{item.comment}</p><RecommendationOutcome item={item}/>{item.is_current ? <button className="secondary-button" disabled={saving} onClick={() => void withdrawRecommendation(item.id)}>Отозвать рекомендацию</button> : <small>Рекомендация больше не действует</small>}</article>) : <div className="cabinet-empty-inline"><MessageSquare size={28}/><p>Рекомендаций пока нет. Семья увидит сохранённые рекомендации в своём кабинете.</p></div>}</section></div>}
      {section === "history" && <><VocabularyProgress key={selected} childId={Number(selected)} canEdit refreshKey={workspace.dashboard.total_sessions}/><section className="cabinet-panel"><h2>Цели семьи</h2>{workspace.practice_goals.length ? workspace.practice_goals.map(item => <article className="cabinet-entry" key={item.id}><h3>{item.title}</h3><p>Исходное наблюдение: {item.baseline}</p><small>{item.status === "active" ? "Активная цель" : item.status === "completed" ? "Цель завершена" : "Цель приостановлена"}</small><GoalPracticeProgress progress={item.progress}/></article>) : <p>Семья пока не добавила практические цели.</p>}</section><section className="cabinet-panel"><div className="cabinet-section-title"><Clock size={22}/><div><h2>История игровых попыток</h2><p>{workspace.dashboard.total_sessions} сохранённых попыток. Это история взаимодействий, а не оценка развития речи.</p></div></div>{workspace.dashboard.recent.map(item => <article className="cabinet-entry" key={item.id}><strong>{item.title || "Игровая попытка"}</strong><p>{new Date(item.created_at).toLocaleString("ru-RU")} · {outcomes[item.attempt_status] || "Попытка в игре"}</p></article>)}</section></>}
    </>}
    </>}
    </>}
    </main>
  </div>;
}

export function FamilySpecialistAccess({ childId, enabled, onManagePermissions, onStartPlan }: { childId: number; enabled: boolean; onManagePermissions?: () => void; onStartPlan?: (plan: AdaptivePlan) => Promise<void> }) {
  const [items, setItems] = useState<Array<{ id: number; full_name: string; username: string }>>([]);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [recommendations, setRecommendations] = useState<SpecialistAdvice[]>([]);
  type Invitation = { id: number; status: string; expires_at: string; specialist_name?: string; specialist_username?: string };
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [inviteUrl, setInviteUrl] = useState("");
  const [createdInviteId, setCreatedInviteId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const [people, notes, advice, invites] = await Promise.all([api<typeof items>(`/api/children/${childId}/specialists`), api<Observation[]>(`/api/children/${childId}/specialist-observations`), api<typeof recommendations>(`/api/children/${childId}/specialist-recommendations`), api<Invitation[]>(`/api/children/${childId}/specialist-invitations`)]);
    setItems(people); setObservations(notes); setRecommendations(advice); setInvitations(invites);
  }, [childId]);
  useEffect(() => { let active = true; Promise.all([api<typeof items>(`/api/children/${childId}/specialists`), api<Observation[]>(`/api/children/${childId}/specialist-observations`), api<typeof recommendations>(`/api/children/${childId}/specialist-recommendations`), api<Invitation[]>(`/api/children/${childId}/specialist-invitations`)]).then(([people, notes, advice, invites]) => { if (active) { setItems(people); setObservations(notes); setRecommendations(advice); setInvitations(invites); } }).catch(cause => { if (active) setMessage(cause.message); }); return () => { active = false; }; }, [childId, enabled]);
  const createLink = async () => {
    setBusy(true); setMessage(""); setCopied(false); setInviteUrl("");
    try { const result = await api<{id: number; token: string}>(`/api/children/${childId}/specialist-invitations`, {method: "POST"}); setCreatedInviteId(result.id); setInviteUrl(`${window.location.origin}/app#invite=${result.token}`); await load(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Не удалось создать приглашение"); }
    finally { setBusy(false); }
  };
  const refreshFamilyAccess = useCallback(() => load().catch(cause => setMessage(cause instanceof Error ? cause.message : "Не удалось обновить рекомендации")), [load]);
  useRefreshOnReturn(refreshFamilyAccess, enabled);
  const activeInviteUrl = enabled && invitations.some(item => item.id === createdInviteId && item.status === "open") ? inviteUrl : "";
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(activeInviteUrl); setCopied(true); }
    catch { setMessage("Не удалось скопировать автоматически. Выделите ссылку и скопируйте её вручную."); }
  };
  const invitationAction = async (id: number, approve: boolean) => {
    setBusy(true); setMessage("");
    try { await api(`/api/children/${childId}/specialist-invitations/${id}${approve ? "/approve" : ""}`, {method: approve ? "POST" : "DELETE"}); setInviteUrl(""); await load(); setMessage(approve ? "Доступ подтверждён. Специалист видит только этот профиль." : "Приглашение отменено."); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Не удалось обновить приглашение"); }
    finally { setBusy(false); }
  };
  const grant = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try { await api(`/api/children/${childId}/specialists`, { method: "POST", body: JSON.stringify({ username }) }); setUsername(""); await load(); setMessage("Специалисту открыт доступ только к этому профилю."); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Не удалось открыть доступ"); }
    finally { setBusy(false); }
  };
  const revoke = async (id: number) => {
    setBusy(true); setMessage("");
    try { await api(`/api/children/${childId}/specialists/${id}`, { method: "DELETE" }); await load(); setMessage("Доступ специалиста отозван."); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Не удалось отозвать доступ"); }
    finally { setBusy(false); }
  };
  return <div className="specialist-access family-specialist-page">
    <section className="invite-create-panel"><div className="cabinet-section-title"><Link2 size={25}/><div><span className="kicker">ВМЕСТЕ СО СПЕЦИАЛИСТОМ</span><h2>Пригласите специалиста</h2><p>Отправьте личную ссылку. Когда специалист откликнется, проверьте его имя и подтвердите доступ.</p></div></div>
      <ol className="invite-steps"><li><span>1</span>Создайте ссылку</li><li><span>2</span>Передайте специалисту</li><li><span>3</span>Подтвердите его запрос</li></ol>
      {!enabled && <div className="cabinet-notice"><p>Сначала включите и сохраните разрешение «Доступ выбранного специалиста» в разделе «Доступ и данные».</p>{onManagePermissions && <button className="secondary-button" onClick={onManagePermissions}>Настроить разрешения</button>}</div>}
      <button className="primary-button" disabled={!enabled || busy} onClick={createLink}><Link2 size={18}/>{busy ? "Подождите…" : activeInviteUrl ? "Создать новую ссылку" : "Создать ссылку-приглашение"}</button>
      {activeInviteUrl && <div className="invite-link-result"><label>Ссылка для специалиста<input readOnly value={activeInviteUrl} onFocus={event => event.target.select()}/></label><button className="secondary-button" onClick={copyLink}>{copied ? <Check size={18}/> : <Copy size={18}/>} {copied ? "Скопировано" : "Копировать ссылку"}</button><p>Ссылка действует 24 часа и подходит для одного аккаунта специалиста. Новая ссылка отменит предыдущую неиспользованную.</p></div>}
      {message && <p className="cabinet-notice" role="status">{message}</p>}
    </section>
    <section className="cabinet-panel"><div className="cabinet-panel-heading"><div><h2>Приглашения и запросы</h2><p>Доступ откроется только после вашего подтверждения.</p></div><button className="secondary-button" disabled={busy} onClick={() => { void load().catch(cause => setMessage(cause.message)); }}><RefreshCw size={17}/> Обновить запросы</button></div>
      {invitations.filter(item => ["open", "pending"].includes(item.status)).length ? invitations.filter(item => ["open", "pending"].includes(item.status)).map(item => <article className="invitation-request" key={item.id}><div><strong>{item.status === "pending" ? item.specialist_name : "Ожидаем перехода специалиста"}</strong><p>{item.status === "pending" ? `@${item.specialist_username} просит доступ к этому профилю. Убедитесь, что это ваш специалист.` : "Передайте созданную ссылку лично специалисту."}</p><small>Действует до {new Date(item.expires_at).toLocaleString("ru-RU")}</small></div><div className="cabinet-actions">{item.status === "pending" && <button className="primary-button" disabled={busy || !enabled} onClick={() => invitationAction(item.id, true)}>Подтвердить доступ</button>}<button className="secondary-button" disabled={busy} onClick={() => invitationAction(item.id, false)}>{item.status === "pending" ? "Отклонить запрос" : "Отменить приглашение"}</button></div></article>) : <p className="cabinet-empty-copy">Активных приглашений пока нет. Создайте ссылку выше.</p>}
      <details className="known-specialist"><summary>Добавить по известному логину</summary><form onSubmit={grant}><label>Логин специалиста<input value={username} onChange={e => setUsername(e.target.value)} required minLength={3} maxLength={40} disabled={!enabled || busy}/></label><button className="secondary-button" disabled={!enabled || busy}>Открыть доступ</button></form></details>
    </section>
    <section className="cabinet-panel"><h2>Подключённые специалисты</h2>{items.length ? items.map(item => <div className="connected-specialist" key={item.id}><span className="cabinet-avatar">{item.full_name[0]}</span><div><strong>{item.full_name}</strong><small>@{item.username}</small></div><button className="secondary-button" disabled={busy} onClick={() => revoke(item.id)}>Отозвать доступ</button></div>) : <p className="cabinet-empty-copy">Доступ пока никому не предоставлен.</p>}</section>
    <div className="specialist-columns"><section className="cabinet-panel"><h2>Рекомендации специалиста</h2>{recommendations.length ? recommendations.map(item => <article className="cabinet-entry" key={item.id}><small>{item.specialist_name}</small><h3>{item.exercise_title || "Поддержка дома"}</h3><p>{item.comment}</p><RecommendationDecision key={`${item.id}:${item.family_decision}`} childId={childId} item={item} onStartPlan={onStartPlan} onChanged={() => { void load().catch(cause => setMessage(cause.message)); }}/></article>) : <p>Здесь появятся рекомендации для домашней практики.</p>}</section><section className="cabinet-panel"><h2>Наблюдения специалиста</h2>{observations.length ? observations.map(item => <article className="cabinet-entry" key={item.id}><small>{item.specialist_name} · {outcomes[item.result_type]}</small><p>{item.context}: {item.note}</p></article>) : <p>Наблюдения вне игры появятся после записи специалистом.</p>}</section></div>
  </div>;
}

export function ParentAccountDeletion({ onDeleted }: { onDeleted: () => void }) {
  const [open, setOpen] = useState(false), [password, setPassword] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const remove = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try { await api("/api/auth/account", { method: "DELETE", body: JSON.stringify({ password }) }); onDeleted(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось удалить аккаунт"); }
    finally { setBusy(false); }
  };
  return <section className="data-control specialist-access"><h2>Удаление аккаунта</h2><p>Удаляются родительский аккаунт, профили детей и связанные данные из действующей базы. Отменить удаление нельзя. Срок удаления резервных копий должен быть установлен оператором.</p><button className="secondary-button" aria-expanded={open} onClick={() => setOpen(!open)}>Удалить мой аккаунт</button>{open && <form onSubmit={remove}><label>Подтвердите пароль<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required/></label>{error && <p role="alert">{error}</p>}<button className="primary-button" disabled={busy}>{busy ? "Удаляем…" : "Удалить аккаунт и данные детей навсегда"}</button></form>}</section>;
}
