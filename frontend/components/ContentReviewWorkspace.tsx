"use client";

import { Check, ChevronLeft, CircleAlert, CircleX, Clock3, FileCheck2, History, LockKeyhole, MessageSquareText, Play, RotateCcw, ShieldCheck, Volume2 } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { DraftExercisePreview, type DraftExerciseVersion, type ExerciseMethodCard } from "@/components/P1ExerciseRunners";

type ReviewStage = "revision" | "admin" | "technical" | "methodology" | "accessibility" | "publication";
type ReviewDecision = "passed" | "approved" | "changes_requested";

export type ContentReviewWorkspaceData = {
  valid: boolean;
  can_publish: boolean;
  blocker: string | null;
  errors: string[];
  version: DraftExerciseVersion;
  stimuli_index: Array<{
    id: number;
    stimulus_key: string;
    kind: string;
    label: string;
    speech: string;
    media_ref: string | null;
    position: number;
    metadata: { hint?: string; alt?: string; origin?: string; license?: string };
  }>;
  reviews: Array<{ id: number; stage: ReviewStage; decision: string; comment: string; reviewer_name: string; created_at: string }>;
  version_history: Array<{ id: number; version: number; title: string; review_status: string; publication_status: string; technical_status: string; methodology_status: string; accessibility_status: string; release_status: string; created_at: string; published_at: string | null }>;
  capabilities: { admin_review: boolean };
};

export type HomeActivityDraft = {
  id: number;
  title: string;
  objective: string;
  review_status: string;
  publication_status: string;
  materials: string[];
  adult_instructions: string[];
  accepted_responses: string[];
  prompts: string[];
  stop_conditions: string[];
  method_card?: { prerequisites?: string[]; ambiguities?: string[]; transfer?: string[]; sources?: string[]; methodology_review_status?: string };
};

const stageCopy = {
  revision: {title: "Обновление набора", description: "", permission: ""},
  admin: {title: "Решение администратора", description: "", permission: ""},
  technical: { title: "Техническая проверка", description: "Структура, изображения, звук, runner и сохранение результата.", permission: "Доступно администратору после ручного просмотра." },
  methodology: { title: "Методическая экспертиза", description: "Цель, формулировки, стимулы, подсказки и допустимые ответы.", permission: "Нужно отдельное подтверждённое полномочие методического эксперта." },
  accessibility: { title: "Проверка доступности", description: "Клавиатура, screen reader, масштаб текста, reduced motion и альтернативная механика.", permission: "Нужно отдельное полномочие accessibility-рецензента." },
  publication: { title: "Разрешение публикации", description: "Финальная проверка версии после трёх предыдущих этапов.", permission: "Нужно отдельное полномочие выпуска; оно не следует из роли администратора." },
} as const;

const statusCopy: Record<string, string> = {
  updated: "Обновлено",
  pending: "Ожидается",
  automated_passed: "Автопроверка пройдена",
  passed: "Проверено вручную",
  approved: "Утверждено",
  changes_requested: "Нужна доработка",
  legacy_publication: "Наследованный статус",
};

function ReviewStatus({ value }: { value?: string }) {
  const status = value || "pending";
  return <span className={`review-stage-status ${status}`}>{statusCopy[status] || status}</span>;
}

function ReviewList({ title, values, warning = false }: { title: string; values?: string[]; warning?: boolean }) {
  if (!values?.length) return null;
  return <section className={warning ? "method-field warning" : "method-field"}><h4>{warning && <CircleAlert size={16}/>} {title}</h4><ul>{values.map((value) => <li key={value}>{value}</li>)}</ul></section>;
}

function MethodCardView({ card }: { card?: ExerciseMethodCard }) {
  if (!card) return <div className="review-warning" role="alert"><CircleAlert/><div><strong>Методическая карточка отсутствует</strong><p>Заполните описание перед публикацией.</p></div></div>;
  return <div className="method-card-view">
    <section className="method-summary"><div><span>Целевой навык</span><strong>{card.target_skill}</strong></div><div><span>Группа навыков</span><strong>{card.skill_group.join(" · ")}</strong></div><p>{card.diagnosis_boundary}</p></section>
    <div className="method-grid">
      <ReviewList title="Для какой группы навыков" values={card.intended_for}/>
      <ReviewList title="Предварительные умения" values={card.prerequisites}/>
      <section className="method-field"><h4>Стимулы и ответ</h4><p>{card.stimuli_and_responses}</p></section>
      <section className="method-field"><h4>Инструкция ребёнку</h4><p>«{card.child_instruction}»</p></section>
      <ReviewList title="Рекомендации взрослому" values={card.adult_guidance}/>
      <ReviewList title="Допустимые способы ответа" values={card.accepted_responses}/>
      <ReviewList title="Уровни сложности" values={card.difficulty_levels}/>
      <ReviewList title="Подсказки" values={card.prompts}/>
      <ReviewList title="Возможные неоднозначности" values={card.ambiguities} warning/>
      <ReviewList title="Когда остановиться" values={card.stop_conditions} warning/>
      <ReviewList title="Регистрация результата" values={card.result_registration}/>
      <ReviewList title="Перенос в жизнь" values={card.real_life_transfer}/>
      <section className="method-field"><h4>Источники и основание</h4>{card.sources.length ? <ul>{card.sources.map((source, index) => <li key={index}>{typeof source === "string" ? source : <><strong>{source.title || "Источник"}</strong>{source.url?.startsWith("https://") && <p><a href={source.url} target="_blank" rel="noreferrer">Открыть источник</a></p>}{source.population && <p>{source.population}</p>}{source.scope && <p>{source.scope}</p>}{source.limitation && <p>Ограничение: {source.limitation}</p>}</>}</li>)}</ul> : <p>Внешние источники не заявлены.</p>}<p className="method-evidence-note">{card.evidence_note}</p></section>
    </div>
  </div>;
}

function StimulusReview({ data, onSpeak }: { data: ContentReviewWorkspaceData; onSpeak: (text: string, rate?: number) => Promise<boolean> }) {
  const { version } = data;
  if (version.mechanic === "tap_instruction") {
    return <div className="scenario-review-list">{(version.content.scenarios || []).map((scenario) => {
      const object = scenario.objects.find((item) => item.key === scenario.success.object_key);
      const target = scenario.objects.find((item) => item.key === scenario.success.target_key);
      return <article key={scenario.key}><header><div><span className="kicker">{scenario.key}</span><strong>{scenario.instruction}</strong><small>Правильная последовательность: {object?.label} → {target?.label}</small></div><button type="button" className="small-button" onClick={() => void onSpeak(scenario.speech, .78)}><Volume2 size={16}/> Прослушать</button></header><div>{scenario.objects.map((item) => <figure key={item.key}><Image src={item.media_ref} alt={item.label} width={480} height={480} sizes="(max-width:600px) 40vw, 240px"/><figcaption><strong>{item.label}</strong><small>{item.role === "movable" ? "Предмет" : "Цель"}</small>{scenario.success.object_key === item.key || scenario.success.target_key === item.key ? <span><Check size={13}/> правильный элемент</span> : null}</figcaption></figure>)}</div></article>;
    })}</div>;
  }
  return <div className="stimulus-review-grid">{(version.content.stimuli || []).map((stimulus) => {
    const indexed = data.stimuli_index.find((item) => item.stimulus_key === stimulus.key);
    return <article key={stimulus.key}><div className="stimulus-exemplars">{[stimulus.media_ref || "/soyle-icon.png", ...(stimulus.exemplars || [])].map((path, index) => <figure key={path}><Image src={path} alt={`${indexed?.metadata.alt || stimulus.label}, пример ${index + 1}`} width={640} height={640} sizes="(max-width:600px) 80vw, 300px"/><figcaption>Пример {index + 1}</figcaption></figure>)}</div><div><span className="kicker">{stimulus.key}</span><strong>{stimulus.label}</strong><p>{stimulus.hint || "Подсказка не задана"}</p><small>При инструкции «{stimulus.speech}» правильный ключ: {stimulus.key}</small></div><button type="button" className="small-button" onClick={() => void onSpeak(stimulus.speech, .78)}><Volume2 size={16}/> Прослушать</button></article>;
  })}</div>;
}

export function ContentReviewWorkspace({ data, onClose, onSpeak, onReview, onPublish }: { data: ContentReviewWorkspaceData; onClose: () => void; onSpeak: (text: string, rate?: number) => Promise<boolean>; onReview: (stage: "admin", decision: "changes_requested", comment: string) => Promise<void>; onPublish: (comment: string) => Promise<void> }) {
  const [tab, setTab] = useState<"content" | "runner" | "history">("content");
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (publish: boolean) => {
    if (!publish && comment.trim().length < 5) { setMessage("Укажите, что нужно доработать — минимум 5 символов."); return; }
    setSaving(true); setMessage("");
    try {
      if (publish) await onPublish(comment.trim());
      else { await onReview("admin", "changes_requested", comment.trim()); setComment(""); setMessage("Замечания сохранены."); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось сохранить решение"); }
    finally { setSaving(false); }
  };

  if (tab === "runner") return <div className="content-review-workspace"><button type="button" className="review-back" onClick={() => setTab("content")}><ChevronLeft size={17}/> Вернуться к карточке</button><DraftExercisePreview version={data.version} onClose={() => setTab("content")} onSpeak={onSpeak}/></div>;

  return <section className="content-review-workspace" data-mechanic={data.version.mechanic} aria-labelledby="content-review-title">
    <header className="review-workspace-head"><div><span className="kicker">ЧЕРНОВИК · ПРОВЕРКА АДМИНИСТРАТОРА</span><h2 id="content-review-title">{data.version.title}</h2><p>{data.version.objective}</p></div><button type="button" className="small-button" onClick={onClose}><CircleX size={17}/> Закрыть</button></header>
    <div className="review-gate-banner"><LockKeyhole/><div><strong>Материал недоступен детям</strong><p>Проверьте изображения, звук, инструкцию и работу задания. Если всё подходит, опубликуйте его одной кнопкой.</p></div></div>
    <nav className="review-workspace-tabs" aria-label="Разделы проверки"><button type="button" className={tab === "content" ? "active" : ""} aria-pressed={tab === "content"} onClick={() => setTab("content")}><FileCheck2 size={17}/> Контент и методика</button><button type="button" onClick={() => setTab("runner")}><Play size={17}/> Preview механики</button><button type="button" className={tab === "history" ? "active" : ""} aria-pressed={tab === "history"} onClick={() => setTab("history")}><History size={17}/> История</button></nav>
    {tab === "content" ? <>
      <div className="admin-queue-note"><ShieldCheck size={20}/><p>Решение принимает администратор. После публикации задание появится в библиотеке; автор и дата решения сохранятся в истории.</p></div>
      {!data.valid && <div className="review-warning" role="alert"><CircleAlert/><div><strong>Есть структурные ошибки</strong><ul>{data.errors.map((error) => <li key={error}>{error}</li>)}</ul></div></div>}
      <section className="review-section"><header><div><span className="kicker">ВСЕ СТИМУЛЫ</span><h3>Изображения, звук и правильные ответы</h3></div><span className="period-pill">{data.version.mechanic === "tap_instruction" ? data.version.content.scenarios?.length || 0 : data.version.content.stimuli?.length || 0} элементов</span></header><StimulusReview data={data} onSpeak={onSpeak}/></section>
      <section className="review-section"><header><div><span className="kicker">РЕЕСТР МАТЕРИАЛОВ</span><h3>Происхождение и лицензии</h3></div><span className="period-pill">{data.version.content.asset_registry?.length || 0} файлов</span></header><div className="asset-review-registry">{data.version.content.asset_registry?.length ? data.version.content.asset_registry.map((asset) => <article key={asset.media_ref}><code>{asset.media_ref}</code><small>{asset.origin}<br/>{asset.license}</small><span>{asset.license_status === "documented" ? "описано" : asset.license_status}</span></article>) : <div className="review-warning" role="alert"><CircleAlert/><div><strong>Реестр материалов отсутствует</strong><p>Перед методической проверкой нужно указать источник и лицензионный статус каждого файла.</p></div></div>}</div></section>
      <section className="review-section"><header><div><span className="kicker">ОПИСАНИЕ ЗАДАНИЯ</span><h3>Цель, подсказки и допустимые ответы</h3></div></header><MethodCardView card={data.version.method_card}/></section>
      <section className="review-section review-decision"><header><div><span className="kicker">РЕШЕНИЕ АДМИНИСТРАТОРА</span><h3>Проверить и опубликовать</h3></div><MessageSquareText/></header><label>Комментарий<textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={2000} placeholder="Что нужно доработать или что было проверено" aria-describedby="review-comment-help"/></label><small id="review-comment-help">Для публикации комментарий необязателен. Для доработки укажите замечания.</small><div className="review-actions"><button type="button" className="secondary-button" disabled={saving} onClick={() => void submit(false)}><RotateCcw size={16}/> Вернуть на доработку</button><button type="button" className="primary-button" disabled={saving || !data.can_publish} onClick={() => void submit(true)}><Check size={16}/>{saving ? "Сохраняем…" : "Проверено — опубликовать"}</button></div>{message && <p className="review-form-message" role="status">{message}</p>}</section>
    </> : <section className="review-section review-history"><header><div><span className="kicker">ИСТОРИЯ ВЕРСИЙ И РЕШЕНИЙ</span><h3>Кто, что и когда проверял</h3></div><Clock3/></header><div className="version-history-list">{data.version_history.map((item) => <article key={item.id}><div><strong>Версия {item.version}</strong><small>{new Date(item.created_at).toLocaleString("ru-RU")}</small></div><span>{item.publication_status}</span><ReviewStatus value={item.review_status}/></article>)}</div><div className="review-event-list">{data.reviews.length ? data.reviews.map((item) => <article key={item.id}><span>{stageCopy[item.stage]?.title || item.stage}</span><strong>{statusCopy[item.decision] || item.decision}</strong><p>{item.comment}</p><small>{item.reviewer_name} · {new Date(item.created_at).toLocaleString("ru-RU")}</small></article>) : <div className="empty-state">Ручных решений пока нет.</div>}</div></section>}
  </section>;
}

export function HomeActivityReviewPreview({ activity, onClose, onPublish }: { activity: HomeActivityDraft; onClose: () => void; onPublish: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const publish = async () => {
    setSaving(true); setError("");
    try { await onPublish(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось опубликовать игру"); }
    finally { setSaving(false); }
  };
  return <section className="content-review-workspace home-review-preview" aria-labelledby="home-review-title"><header className="review-workspace-head"><div><span className="kicker">ЧЕРНОВИК · БЫТОВАЯ ИГРА</span><h2 id="home-review-title">{activity.title}</h2><p>{activity.objective}</p></div><button type="button" className="small-button" onClick={onClose}><CircleX size={17}/> Закрыть</button></header><div className="review-gate-banner"><LockKeyhole/><div><strong>Игра пока недоступна семье</strong><p>Проверьте инструкцию и опубликуйте игру, если она подходит.</p></div></div><div className="home-preview-grid"><ReviewList title="Материалы" values={activity.materials}/><ReviewList title="Что делает взрослый" values={activity.adult_instructions}/><ReviewList title="Допустимые ответы ребёнка" values={activity.accepted_responses}/><ReviewList title="Варианты помощи" values={activity.prompts}/><ReviewList title="Когда остановиться" values={activity.stop_conditions} warning/><ReviewList title="Предварительные условия" values={activity.method_card?.prerequisites}/><ReviewList title="Неоднозначности для проверки" values={activity.method_card?.ambiguities} warning/><ReviewList title="Перенос в жизнь" values={activity.method_card?.transfer}/></div><div className="runner-finish"><ShieldCheck size={30}/><h3>Решение администратора</h3><button type="button" className="primary-button" disabled={saving} onClick={() => void publish()}>{saving ? "Публикуем…" : "Проверено — опубликовать"}</button>{error && <p role="alert">{error}</p>}</div></section>;
}
