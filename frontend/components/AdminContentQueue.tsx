"use client";
import { t, useLocale } from "@/lib/i18n";


import { useState } from "react";
import { Search, ClipboardList, FileCheck2, LockKeyhole, ArrowRight, BookOpen } from "lucide-react";
import type { Exercise } from "@/lib/api";
import type { DraftExerciseVersion } from "./P1ExerciseRunners";
import type { HomeActivityDraft } from "./ContentReviewWorkspace";

type Draft = {version: DraftExerciseVersion; valid: boolean; can_publish: boolean; blocker: string | null; errors: string[]};
const mechanicLabels = (): Record<string,string> => ({category_sort: t("adminQueue.copy000"), action_sequence: t("adminQueue.copy001"), object_match: t("adminQueue.copy002"), auditory_choice: t("adminQueue.copy003"), action_choice: t("adminQueue.copy004"), tap_instruction: t("adminQueue.copy005"), guided_aac: t("adminQueue.copy006")});
function group(item: Draft) {
  if (!item.valid || item.version.review_status === "changes_requested") return "changes";
  return item.can_publish ? "ready" : "waiting";
}

export function AdminContentQueue({ drafts, exercises, homeDrafts, loading, onReview, onHomePreview, onArchive }: {drafts: Draft[]; exercises: Exercise[]; homeDrafts: HomeActivityDraft[]; loading: boolean; onReview: (id: number) => void; onHomePreview: (item: HomeActivityDraft) => void; onArchive: (id: number) => void}) {
  const locale = useLocale();
  const mechanicNames = mechanicLabels();
  const [view, setView] = useState<"review" | "library">("review");
  const [filter, setFilter] = useState("all");
  const [kind, setKind] = useState("all");
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase(locale);
  const matches = (title: string) => title.toLocaleLowerCase(locale).includes(query);
  const visibleDrafts = drafts.filter(item => kind !== "home" && matches(item.version.title) && (filter === "all" || group(item) === filter));
  const visibleHome = homeDrafts.filter(item => kind !== "exercise" && matches(item.title) && (filter === "all" || filter === (item.review_status === "changes_requested" ? "changes" : "waiting")));
  const visibleLibrary = exercises.filter(item => matches(item.title));
  const changes = drafts.filter(item => group(item) === "changes").length + homeDrafts.filter(item => item.review_status === "changes_requested").length;
  const ready = drafts.filter(item => group(item) === "ready").length;
  const total = drafts.length + homeDrafts.length;
  return <div className="admin-content-hub" aria-busy={loading}>
    <div className="admin-queue-counters"><div><span>{t("adminQueue.copy007")}</span><strong>{loading ? "—" : total}</strong></div><div><span>{t("adminQueue.copy008")}</span><strong>{loading ? "—" : changes}</strong></div><div><span>{t("adminQueue.copy009")}</span><strong>{loading ? "—" : ready}</strong></div><div><span>{t("adminQueue.copy010")}</span><strong>{loading ? "—" : exercises.length}</strong></div></div>
    <nav className="admin-library-views" aria-label={t("adminQueue.copy011")}><button type="button" aria-pressed={view === "review"} onClick={() => setView("review")}><ClipboardList size={18}/> {t("adminQueue.copy012")}<span>{total}</span></button><button type="button" aria-pressed={view === "library"} onClick={() => setView("library")}><BookOpen size={18}/> {t("adminQueue.copy013")}<span>{exercises.length}</span></button></nav>
    <div className="admin-content-toolbar"><label className="admin-content-search"><span>{t("adminQueue.copy014")}</span><div><Search size={18}/><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={t("adminQueue.copy015")}/></div></label>{view === "review" && <label>{t("adminQueue.copy016")}<select value={kind} onChange={event => setKind(event.target.value)}><option value="all">{t("adminQueue.copy017")}</option><option value="exercise">{t("adminQueue.copy018")}</option><option value="home">{t("adminQueue.copy019")}</option></select></label>}</div>
    {view === "review" && <><div className="admin-queue-filters" aria-label={t("adminQueue.copy020")}>{[{id: "all", label: t("adminQueue.copy021")}, {id: "waiting", label: t("adminQueue.copy022")}, {id: "changes", label: t("adminQueue.copy008")}, {id: "ready", label: t("adminQueue.copy009")}].map(item => <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</button>)}</div><div className="admin-queue-note"><LockKeyhole size={18}/><p>{t("adminQueue.copy023")}</p></div></>}
    {loading ? <p role="status">{t("adminQueue.copy024")}</p> : view === "review" ? <div className="draft-list admin-review-queue">{visibleDrafts.map(item => <article className="admin-review-item" key={`exercise-${item.version.id}`}><header><div><span className="admin-content-kind">{mechanicNames[item.version.mechanic] || "Упражнение"} {t("adminQueue.copy026")}{item.version.version}</span><h3>{item.version.title}</h3></div><span className={`admin-queue-status ${group(item)}`}>{group(item) === "changes" ? t("adminQueue.copy008") : group(item) === "ready" ? t("adminQueue.copy027") : t("adminQueue.copy028")}</span></header><p className="admin-content-objective">{item.version.objective}</p><div className="admin-next-review"><span>{t("adminQueue.copy029")}</span><p>{item.blocker || (item.can_publish ? t("adminQueue.copy030") : t("adminQueue.copy031"))}</p></div>{item.errors.length > 0 && <details><summary>{t("adminQueue.copy032")}{item.errors.length}</summary><ul>{item.errors.map(error => <li key={error}>{error}</li>)}</ul></details>}<button type="button" className="primary-button" onClick={() => onReview(item.version.id)}>{t("adminQueue.copy033")}<ArrowRight size={17}/></button></article>)}{visibleHome.map(item => <article className="admin-review-item admin-home-review-item" key={`home-${item.id}`}><header><div><span className="admin-content-kind">{t("adminQueue.copy034")}</span><h3>{item.title}</h3></div><span className="admin-queue-status waiting">{item.review_status === "changes_requested" ? t("adminQueue.copy008") : t("adminQueue.copy035")}</span></header><p>{item.objective}</p><div className="admin-next-review"><span>{t("adminQueue.copy029")}</span><p>{t("adminQueue.copy036")}</p></div><button type="button" className="secondary-button" onClick={() => onHomePreview(item)}>{t("adminQueue.copy037")}<ArrowRight size={17}/></button></article>)}{!visibleDrafts.length && !visibleHome.length && <div className="cabinet-empty"><FileCheck2 size={32}/><h3>{total ? t("adminQueue.copy038") : t("adminQueue.copy039")}</h3><p>{total ? t("adminQueue.copy040") : t("adminQueue.copy041")}</p></div>}</div> : <div className="admin-published-grid">{visibleLibrary.map(item => <article key={item.id}><div><span className={`admin-queue-status ${item.engine?.review_gate.demo_only ? "waiting" : "ready"}`}>{item.engine?.review_gate.demo_only ? t("adminQueue.copy042") : t("adminQueue.copy043")}</span><h3>{item.title}</h3><p>{item.instruction}</p><small>{t("adminQueue.copy044")}{item.engine?.version || 1} {t("adminQueue.copy045")}{item.difficulty}</small></div><button type="button" className="secondary-button" onClick={() => onArchive(item.id)}>{t("adminQueue.copy046")}</button></article>)}{!visibleLibrary.length && <p className="cabinet-empty-copy">{t("adminQueue.copy047")}</p>}</div>}
  </div>;
}
