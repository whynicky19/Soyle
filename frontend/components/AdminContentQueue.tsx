"use client";

import { useState } from "react";
import { Search, ClipboardList, FileCheck2, LockKeyhole, ArrowRight, BookOpen } from "lucide-react";
import type { Exercise } from "@/lib/api";
import type { DraftExerciseVersion } from "./P1ExerciseRunners";
import type { HomeActivityDraft } from "./ContentReviewWorkspace";

type Draft = {version: DraftExerciseVersion; valid: boolean; can_publish: boolean; blocker: string | null; errors: string[]};
const mechanicNames: Record<string,string> = {category_sort: "Сортировка по группам", action_sequence: "Порядок действий", object_match: "Предмет и действие", auditory_choice: "Понимание слов", action_choice: "Понимание действий", tap_instruction: "Выполнение инструкции", guided_aac: "Общение с карточками"};
function group(item: Draft) {
  if (!item.valid || item.version.review_status === "changes_requested") return "changes";
  return item.can_publish ? "ready" : "waiting";
}

export function AdminContentQueue({ drafts, exercises, homeDrafts, loading, onReview, onHomePreview, onArchive }: {drafts: Draft[]; exercises: Exercise[]; homeDrafts: HomeActivityDraft[]; loading: boolean; onReview: (id: number) => void; onHomePreview: (item: HomeActivityDraft) => void; onArchive: (id: number) => void}) {
  const [view, setView] = useState<"review" | "library">("review");
  const [filter, setFilter] = useState("all");
  const [kind, setKind] = useState("all");
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase("ru-RU");
  const matches = (title: string) => title.toLocaleLowerCase("ru-RU").includes(query);
  const visibleDrafts = drafts.filter(item => kind !== "home" && matches(item.version.title) && (filter === "all" || group(item) === filter));
  const visibleHome = homeDrafts.filter(item => kind !== "exercise" && matches(item.title) && (filter === "all" || filter === (item.review_status === "changes_requested" ? "changes" : "waiting")));
  const visibleLibrary = exercises.filter(item => matches(item.title));
  const changes = drafts.filter(item => group(item) === "changes").length + homeDrafts.filter(item => item.review_status === "changes_requested").length;
  const ready = drafts.filter(item => group(item) === "ready").length;
  const total = drafts.length + homeDrafts.length;
  return <div className="admin-content-hub" aria-busy={loading}>
    <div className="admin-queue-counters"><div><span>В очереди</span><strong>{loading ? "—" : total}</strong></div><div><span>Нужна доработка</span><strong>{loading ? "—" : changes}</strong></div><div><span>Готовы к публикации</span><strong>{loading ? "—" : ready}</strong></div><div><span>В библиотеке</span><strong>{loading ? "—" : exercises.length}</strong></div></div>
    <nav className="admin-library-views" aria-label="Библиотека и проверка"><button type="button" aria-pressed={view === "review"} onClick={() => setView("review")}><ClipboardList size={18}/> На проверке <span>{total}</span></button><button type="button" aria-pressed={view === "library"} onClick={() => setView("library")}><BookOpen size={18}/> Доступная библиотека <span>{exercises.length}</span></button></nav>
    <div className="admin-content-toolbar"><label className="admin-content-search"><span>Поиск по названию</span><div><Search size={18}/><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Например, игрушки"/></div></label>{view === "review" && <label>Тип материала<select value={kind} onChange={event => setKind(event.target.value)}><option value="all">Все материалы</option><option value="exercise">Игровые упражнения</option><option value="home">Бытовые игры</option></select></label>}</div>
    {view === "review" && <><div className="admin-queue-filters" aria-label="Статус проверки">{[{id: "all", label: "Все"}, {id: "waiting", label: "Ожидают проверки"}, {id: "changes", label: "Нужна доработка"}, {id: "ready", label: "Готовы к публикации"}].map(item => <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</button>)}</div><div className="admin-queue-note"><LockKeyhole size={18}/><p>Откройте задание, проверьте картинки, звук и ответы. Подходящий материал можно сразу опубликовать.</p></div></>}
    {loading ? <p role="status">Загружаем материалы и статусы проверки…</p> : view === "review" ? <div className="draft-list admin-review-queue">{visibleDrafts.map(item => <article className="admin-review-item" key={`exercise-${item.version.id}`}><header><div><span className="admin-content-kind">{mechanicNames[item.version.mechanic] || "Упражнение"} · версия {item.version.version}</span><h3>{item.version.title}</h3></div><span className={`admin-queue-status ${group(item)}`}>{group(item) === "changes" ? "Нужна доработка" : group(item) === "ready" ? "Готово к проверке" : "Ожидает проверки"}</span></header><p className="admin-content-objective">{item.version.objective}</p><div className="admin-next-review"><span>Следующий шаг</span><p>{item.blocker || (item.can_publish ? "Просмотрите задание и нажмите «Проверено — опубликовать»." : "Откройте и проверьте материал.")}</p></div>{item.errors.length > 0 && <details><summary>Замечания автопроверки: {item.errors.length}</summary><ul>{item.errors.map(error => <li key={error}>{error}</li>)}</ul></details>}<button type="button" className="primary-button" onClick={() => onReview(item.version.id)}>Открыть проверку <ArrowRight size={17}/></button></article>)}{visibleHome.map(item => <article className="admin-review-item admin-home-review-item" key={`home-${item.id}`}><header><div><span className="admin-content-kind">Бытовая игра · инструкция для семьи</span><h3>{item.title}</h3></div><span className="admin-queue-status waiting">{item.review_status === "changes_requested" ? "Нужна доработка" : "Ожидает методической проверки"}</span></header><p>{item.objective}</p><div className="admin-next-review"><span>Следующий шаг</span><p>Проверить инструкцию взрослому, допустимые ответы, помощь и условия остановки. Семье пока доступны только названия.</p></div><button type="button" className="secondary-button" onClick={() => onHomePreview(item)}>Открыть инструкцию <ArrowRight size={17}/></button></article>)}{!visibleDrafts.length && !visibleHome.length && <div className="cabinet-empty"><FileCheck2 size={32}/><h3>{total ? "По этим условиям ничего не найдено" : "Очередь пока пуста"}</h3><p>{total ? "Измените название, тип материала или статус." : "Новые черновики появятся здесь после создания."}</p></div>}</div> : <div className="admin-published-grid">{visibleLibrary.map(item => <article key={item.id}><div><span className={`admin-queue-status ${item.engine?.review_gate.demo_only ? "waiting" : "ready"}`}>{item.engine?.review_gate.demo_only ? "Демо · не утверждено" : "Опубликовано"}</span><h3>{item.title}</h3><p>{item.instruction}</p><small>Версия {item.engine?.version || 1} · уровень {item.difficulty}</small></div><button type="button" className="secondary-button" onClick={() => onArchive(item.id)}>В архив</button></article>)}{!visibleLibrary.length && <p className="cabinet-empty-copy">Доступных заданий с таким названием нет.</p>}</div>}
  </div>;
}
