"use client";
import { AccountLanguagePicker } from "./AccountLanguagePicker";
import { TranslationEditor } from "./TranslationEditor";
import { t, useLocale, formatDate } from "@/lib/i18n";

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
const outcomeLabels = (): Record<string, string> => ({ completed: t("specialist.copy000"), participated: t("specialist.copy001"), independent: t("specialist.copy002"), with_help: t("specialist.copy003"), not_observed: t("specialist.copy004"), refused: t("specialist.copy005"), break: t("specialist.copy006"), technical_error: t("specialist.copy007") });

const sectionLabels = () => [{id: "children", label: t("specialist.copy008")}, {id: "observations", label: t("specialist.copy009")}, {id: "recommendations", label: t("specialist.copy010")}, {id: "history", label: t("specialist.copy011")}] as const;

export function SpecialistWorkspace({ user, onLogout }: { user: User; onLogout: () => void }) {
  useLocale();
  const specialistSections = sectionLabels();
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
        setError(cause instanceof Error ? cause.message : t("specialist.copy012"));
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
      setContext(""); setNote(""); setNotice(t("specialist.copy013")); await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("specialist.copy014")); setWorkspace(null); }
    finally { setSaving(false); }
  };
  const recommend = async (event: React.FormEvent) => {
    event.preventDefault(); if (!selected || saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await api("/api/specialist/recommendations", { method: "POST", body: JSON.stringify({ child_id: Number(selected), suggested_skill: workspace?.available_exercises.find(item => item.id === Number(exercise))?.skill || "communication", goal_id: recommendationGoal ? Number(recommendationGoal) : null, exercise_id: exercise ? Number(exercise) : null, comment: recommendation }) });
      setRecommendation(""); setNotice(t("specialist.copy015")); await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("specialist.copy016")); setWorkspace(null); }
    finally { setSaving(false); }
  };
  const withdrawRecommendation = async (id: number) => {
    if (saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await api(`/api/specialist/recommendations/${id}`, { method: "PATCH", body: JSON.stringify({ status: "rejected" }) });
      setNotice(t("specialist.copy017")); await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("specialist.copy018")); }
    finally { setSaving(false); }
  };
  const chooseChild = (id: string) => {
    if (id !== selected) { setWorkspace(null); setGoal(""); setContext(""); setNote(""); setExercise(""); setRecommendationGoal(""); setRecommendation(""); setError(""); setNotice(""); }
    setSelected(id);
    const url = new URL(window.location.href); url.searchParams.set("child", id); window.history.replaceState(null, "", url);
  };
  return <div className="professional-shell">
    <aside className="professional-sidebar"><AccountLanguagePicker/><a className="cabinet-brand" href="/app"><BrandLogo variant="compact" width={165}/><small>{t("nav.specialist")}</small></a><CabinetNavigation cabinet="specialist" sections={specialistSections} active={section} onNavigate={navigate}/><div className="professional-account"><strong>{user.full_name}</strong><small>@{user.username}</small><button className="secondary-button" onClick={onLogout}><LogOut size={18}/> {t("common.logoutAccount")}</button></div></aside>
    <main className="specialist-workspace cabinet-content"><header className="cabinet-heading"><div><p className="kicker">{t("specialist.copy019")}</p><h1>{specialistSections.find(item => item.id === section)?.label}</h1><p>{t("specialist.copy020")}</p></div><span className="cabinet-badge"><Users size={18}/>{children.length} {children.length % 10 === 1 && children.length % 100 !== 11 ? t("specialist.copy021") : children.length % 10 >= 2 && children.length % 10 <= 4 && (children.length % 100 < 12 || children.length % 100 > 14) ? t("specialist.copy022") : t("specialist.copy023")}</span></header><details className="cabinet-panel"><summary>{t("content.translations")}</summary><TranslationEditor specialist/><TranslationEditor resource="aac" specialist/></details>
    {error && <div className="cabinet-notice error" role="alert">{error}<button className="secondary-button" onClick={() => void reload()}>{t("specialist.copy024")}</button></div>}{notice && <p className="cabinet-notice" role="status">{notice}</p>}
    {loading ? <p role="status">{t("specialist.copy025")}</p> : !children.length ? <section className="cabinet-empty"><Users size={40}/><h2>{t("specialist.copy026")}</h2><p>{t("specialist.copy027")}</p><p>{t("specialist.copy028")}<strong>{user.username}</strong></p><button className="secondary-button" onClick={() => window.location.reload()}><RefreshCw size={18}/> {t("specialist.copy029")}</button></section> : <>
    {section === "children" ? <><div className="cabinet-intro"><h2>{t("specialist.copy030")}</h2><p>{t("specialist.copy031")}</p></div><div className="specialist-children-grid">{children.map(child => <button className="specialist-child" key={child.id} onClick={() => { chooseChild(String(child.id)); navigate("observations"); }}><span className="cabinet-avatar" style={{background:child.avatar_color}}>{child.name[0]}</span><span><strong>{child.name}</strong><small>{t("specialist.copy032")}</small></span><ArrowRight size={22}/></button>)}</div><p className="cabinet-footnote">{t("specialist.copy033")}</p></> : <>
    <button className="secondary-button" disabled={saving} onClick={() => void reload()}><RefreshCw size={17}/> {t("specialist.copy034")}</button>
    <label className="cabinet-child-picker">{t("specialist.copy035")}<select value={selected} disabled={saving} onChange={e => { chooseChild(e.target.value); }}>{children.map(child => <option key={child.id} value={child.id}>{child.name}</option>)}</select></label>
    {selected && !workspace && !error && <p role="status">{t("specialist.copy036")}</p>}
    {workspace && <>
      {section === "observations" && <div className="specialist-columns"><section className="cabinet-panel"><div className="cabinet-section-title"><ClipboardList size={22}/><div><h2>{t("specialist.copy037")}</h2><p>{t("specialist.copy038")}</p></div></div><form onSubmit={saveObservation}>
        <label>{t("specialist.copy039")}<select value={goal} onChange={e => setGoal(e.target.value)}><option value="">{t("specialist.copy040")}</option>{workspace.practice_goals.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <label>{t("specialist.copy041")}<select value={result} onChange={e => { setResult(e.target.value); if (e.target.value === "independent") setPrompt("independent"); if (e.target.value === "with_help" && prompt === "independent") setPrompt("minimal"); }}>{Object.entries(outcomeLabels()).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>{t("specialist.copy042")}<select value={prompt} onChange={e => setPrompt(e.target.value)} disabled={result === "independent"}><option value="independent">{t("specialist.copy043")}</option><option value="minimal">{t("specialist.copy044")}</option><option value="full">{t("specialist.copy045")}</option></select></label>
        <label>{t("specialist.copy046")}<input value={context} onChange={e => setContext(e.target.value)} minLength={3} maxLength={300} required placeholder={t("specialist.copy047")}/></label>
        <label>{t("specialist.copy048")}<textarea value={note} onChange={e => setNote(e.target.value)} minLength={3} maxLength={1000} required/></label>
        <button className="primary-button" disabled={saving}>{saving ? t("common.saving") : t("specialist.copy049")}</button>
      </form></section><section className="cabinet-panel"><h2>{t("specialist.copy050")}</h2>{workspace.observations.length ? workspace.observations.map(item => <article className="cabinet-entry" key={item.id}><small>{formatDate(item.created_at, {dateStyle:"medium",timeStyle:"short"})}</small><h3>{outcomeLabels()[item.result_type]}</h3><p>{item.context}: {item.note}</p><small>{t("specialist.copy051")}{item.prompt_level === "independent" ? t("specialist.copy052") : t("specialist.copy053")}</small></article>) : <div className="cabinet-empty-inline"><ClipboardList size={28}/><p>{t("specialist.copy054")}</p></div>}</section></div>}
      {section === "recommendations" && <div className="specialist-columns"><section className="cabinet-panel"><div className="cabinet-section-title"><MessageSquare size={22}/><div><h2>{t("specialist.copy055")}</h2><p>{t("specialist.copy056")}</p></div></div><form onSubmit={recommend}>
        <label>{t("specialist.copy057")}<select value={recommendationGoal} onChange={e => { setRecommendationGoal(e.target.value); setExercise(""); }}><option value="">{t("specialist.copy058")}</option>{workspace.practice_goals.filter(item => item.status === "active").map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <label>{t("specialist.copy059")}<select value={exercise} onChange={e => setExercise(e.target.value)}><option value="">{t("specialist.copy060")}</option>{workspace.available_exercises.filter(item => !recommendationGoal || workspace.practice_goals.find(goal => goal.id === Number(recommendationGoal))?.linked_exercises.some(linked => linked.id === item.id)).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <label>{t("specialist.copy061")}<textarea value={recommendation} onChange={e => setRecommendation(e.target.value)} required minLength={3} maxLength={1000}/></label>
        <button className="primary-button" disabled={saving}>{t("specialist.copy062")}</button>
      </form></section><section className="cabinet-panel"><h2>{t("specialist.copy063")}</h2>{workspace.recommendations.length ? workspace.recommendations.map(item => <article className="cabinet-entry" key={item.id}><h3>{item.exercise_title || t("specialist.copy064")}</h3><p>{item.comment}</p><RecommendationOutcome item={item}/>{item.is_current ? <button className="secondary-button" disabled={saving} onClick={() => void withdrawRecommendation(item.id)}>{t("specialist.copy065")}</button> : <small>{t("specialist.copy066")}</small>}</article>) : <div className="cabinet-empty-inline"><MessageSquare size={28}/><p>{t("specialist.copy067")}</p></div>}</section></div>}
      {section === "history" && <><VocabularyProgress key={selected} childId={Number(selected)} canEdit refreshKey={workspace.dashboard.total_sessions}/><section className="cabinet-panel"><h2>{t("specialist.copy068")}</h2>{workspace.practice_goals.length ? workspace.practice_goals.map(item => <article className="cabinet-entry" key={item.id}><h3>{item.title}</h3><p>{t("specialist.copy069")}{item.baseline}</p><small>{item.status === "active" ? t("specialist.copy070") : item.status === "completed" ? t("specialist.copy071") : t("specialist.copy072")}</small><GoalPracticeProgress progress={item.progress}/></article>) : <p>{t("specialist.copy073")}</p>}</section><section className="cabinet-panel"><div className="cabinet-section-title"><Clock size={22}/><div><h2>{t("specialist.copy074")}</h2><p>{workspace.dashboard.total_sessions} {t("specialist.copy075")}</p></div></div>{workspace.dashboard.recent.map(item => <article className="cabinet-entry" key={item.id}><strong>{item.title || t("specialist.copy076")}</strong><p>{formatDate(item.created_at, {dateStyle:"medium",timeStyle:"short"})} · {outcomeLabels()[item.attempt_status] || t("specialist.copy077")}</p></article>)}</section></>}
    </>}
    </>}
    </>}
    </main>
  </div>;
}

export function FamilySpecialistAccess({ childId, enabled, onManagePermissions, onStartPlan }: { childId: number; enabled: boolean; onManagePermissions?: () => void; onStartPlan?: (plan: AdaptivePlan) => Promise<void> }) {
  useLocale();
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
    catch (cause) { setMessage(cause instanceof Error ? cause.message : t("specialist.copy078")); }
    finally { setBusy(false); }
  };
  const refreshFamilyAccess = useCallback(() => load().catch(cause => setMessage(cause instanceof Error ? cause.message : t("specialist.copy079"))), [load]);
  useRefreshOnReturn(refreshFamilyAccess, enabled);
  const activeInviteUrl = enabled && invitations.some(item => item.id === createdInviteId && item.status === "open") ? inviteUrl : "";
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(activeInviteUrl); setCopied(true); }
    catch { setMessage(t("specialist.copy080")); }
  };
  const invitationAction = async (id: number, approve: boolean) => {
    setBusy(true); setMessage("");
    try { await api(`/api/children/${childId}/specialist-invitations/${id}${approve ? "/approve" : ""}`, {method: approve ? "POST" : "DELETE"}); setInviteUrl(""); await load(); setMessage(approve ? t("specialist.copy081") : t("specialist.copy082")); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : t("specialist.copy083")); }
    finally { setBusy(false); }
  };
  const grant = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try { await api(`/api/children/${childId}/specialists`, { method: "POST", body: JSON.stringify({ username }) }); setUsername(""); await load(); setMessage(t("specialist.copy084")); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : t("specialist.copy085")); }
    finally { setBusy(false); }
  };
  const revoke = async (id: number) => {
    setBusy(true); setMessage("");
    try { await api(`/api/children/${childId}/specialists/${id}`, { method: "DELETE" }); await load(); setMessage(t("specialist.copy086")); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : t("specialist.copy087")); }
    finally { setBusy(false); }
  };
  return <div className="specialist-access family-specialist-page">
    <section className="invite-create-panel"><div className="cabinet-section-title"><Link2 size={25}/><div><span className="kicker">{t("specialist.copy088")}</span><h2>{t("specialist.copy089")}</h2><p>{t("specialist.copy090")}</p></div></div>
      <ol className="invite-steps"><li><span>1</span>{t("specialist.copy091")}</li><li><span>2</span>{t("specialist.copy092")}</li><li><span>3</span>{t("specialist.copy093")}</li></ol>
      {!enabled && <div className="cabinet-notice"><p>{t("specialist.copy094")}</p>{onManagePermissions && <button className="secondary-button" onClick={onManagePermissions}>{t("specialist.copy095")}</button>}</div>}
      <button className="primary-button" disabled={!enabled || busy} onClick={createLink}><Link2 size={18}/>{busy ? t("common.wait") : activeInviteUrl ? t("specialist.copy096") : t("specialist.copy097")}</button>
      {activeInviteUrl && <div className="invite-link-result"><label>{t("specialist.copy098")}<input readOnly value={activeInviteUrl} onFocus={event => event.target.select()}/></label><button className="secondary-button" onClick={copyLink}>{copied ? <Check size={18}/> : <Copy size={18}/>} {copied ? t("specialist.copy099") : t("specialist.copy100")}</button><p>{t("specialist.copy101")}</p></div>}
      {message && <p className="cabinet-notice" role="status">{message}</p>}
    </section>
    <section className="cabinet-panel"><div className="cabinet-panel-heading"><div><h2>{t("specialist.copy102")}</h2><p>{t("specialist.copy103")}</p></div><button className="secondary-button" disabled={busy} onClick={() => { void load().catch(cause => setMessage(cause.message)); }}><RefreshCw size={17}/> {t("specialist.copy104")}</button></div>
      {invitations.filter(item => ["open", "pending"].includes(item.status)).length ? invitations.filter(item => ["open", "pending"].includes(item.status)).map(item => <article className="invitation-request" key={item.id}><div><strong>{item.status === "pending" ? item.specialist_name : t("specialist.copy105")}</strong><p>{item.status === "pending" ? `@${item.specialist_username} просит доступ к этому профилю. Убедитесь, что это ваш специалист.` : t("specialist.copy107")}</p><small>{t("specialist.copy108")}{new Date(item.expires_at).toLocaleString("ru-RU")}</small></div><div className="cabinet-actions">{item.status === "pending" && <button className="primary-button" disabled={busy || !enabled} onClick={() => invitationAction(item.id, true)}>{t("specialist.copy109")}</button>}<button className="secondary-button" disabled={busy} onClick={() => invitationAction(item.id, false)}>{item.status === "pending" ? t("specialist.copy110") : t("specialist.copy111")}</button></div></article>) : <p className="cabinet-empty-copy">{t("specialist.copy112")}</p>}
      <details className="known-specialist"><summary>{t("specialist.copy113")}</summary><form onSubmit={grant}><label>{t("specialist.copy114")}<input value={username} onChange={e => setUsername(e.target.value)} required minLength={3} maxLength={40} disabled={!enabled || busy}/></label><button className="secondary-button" disabled={!enabled || busy}>{t("specialist.copy115")}</button></form></details>
    </section>
    <section className="cabinet-panel"><h2>{t("specialist.copy116")}</h2>{items.length ? items.map(item => <div className="connected-specialist" key={item.id}><span className="cabinet-avatar">{item.full_name[0]}</span><div><strong>{item.full_name}</strong><small>@{item.username}</small></div><button className="secondary-button" disabled={busy} onClick={() => revoke(item.id)}>{t("specialist.copy117")}</button></div>) : <p className="cabinet-empty-copy">{t("specialist.copy118")}</p>}</section>
    <div className="specialist-columns"><section className="cabinet-panel"><h2>{t("specialist.copy119")}</h2>{recommendations.length ? recommendations.map(item => <article className="cabinet-entry" key={item.id}><small>{item.specialist_name}</small><h3>{item.exercise_title || t("specialist.copy064")}</h3><p>{item.comment}</p><RecommendationDecision key={`${item.id}:${item.family_decision}`} childId={childId} item={item} onStartPlan={onStartPlan} onChanged={() => { void load().catch(cause => setMessage(cause.message)); }}/></article>) : <p>{t("specialist.copy120")}</p>}</section><section className="cabinet-panel"><h2>{t("specialist.copy121")}</h2>{observations.length ? observations.map(item => <article className="cabinet-entry" key={item.id}><small>{item.specialist_name} · {outcomeLabels()[item.result_type]}</small><p>{item.context}: {item.note}</p></article>) : <p>{t("specialist.copy122")}</p>}</section></div>
  </div>;
}

export function ParentAccountDeletion({ onDeleted }: { onDeleted: () => void }) {
  useLocale();
  const [open, setOpen] = useState(false), [password, setPassword] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const remove = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try { await api("/api/auth/account", { method: "DELETE", body: JSON.stringify({ password }) }); onDeleted(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("specialist.copy123")); }
    finally { setBusy(false); }
  };
  return <section className="data-control specialist-access"><h2>{t("specialist.copy124")}</h2><p>{t("specialist.copy125")}</p><button className="secondary-button" aria-expanded={open} onClick={() => setOpen(!open)}>{t("specialist.copy126")}</button>{open && <form onSubmit={remove}><label>{t("specialist.copy127")}<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required/></label>{error && <p role="alert">{error}</p>}<button className="primary-button" disabled={busy}>{busy ? t("specialist.copy128") : t("specialist.copy129")}</button></form>}</section>;
}
