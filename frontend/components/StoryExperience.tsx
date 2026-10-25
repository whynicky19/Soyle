"use client";

import Image from "next/image";
import { ArrowLeft, BookOpen, Check, ChevronRight, Play, RotateCcw, Volume2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, type Story } from "@/lib/api";
import { StorybookExperience } from "./storybook/StorybookExperience";
import { CinematicStorybookExperience } from "./storybook/cinematic/CinematicStorybookExperience";
import { speak, stopCurrentSpeech } from "@/lib/speech";
import { InteractiveBook } from "./storybook/book/InteractiveBook";

export function StoryExperience({ childId, calmMode = false }: { childId?: number; calmMode?: boolean }) {
  const [stories, setStories] = useState<Story[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [filter, setFilter] = useState("Все");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const active = stories.find((story) => story.key === activeKey);
  const categories = useMemo(() => ["Все", ...new Set(stories.map((story) => story.category))], [stories]);

  useEffect(() => {
    if (!childId || activeKey) return;
    let current = true;
    api<Story[]>(`/api/stories/${childId}`)
      .then((items) => { if (current) setStories(items); })
      .catch((cause) => { if (current) setError(cause instanceof Error ? cause.message : "Не удалось открыть истории"); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; window.speechSynthesis?.cancel(); };
  }, [childId, activeKey]);

  const narrate = (text: string) => {
    if (!("speechSynthesis" in window)) { setFeedback("Озвучивание недоступно в этом браузере"); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ru-RU";
    utterance.rate = .85;
    window.speechSynthesis.speak(utterance);
  };

  const selectAnswer = async (answerKey: string) => {
    if (!active || !childId || saving || active.scene_index >= active.scene_count) return;
    setSaving(true);
    setError("");
    setFeedback("");
    try {
      const result = await api<{ correct: boolean; hint: string; scene_index: number; completed: boolean }>(
        `/api/stories/${childId}/${active.key}/answer`,
        { method: "POST", body: JSON.stringify({ scene_index: active.scene_index, answer_key: answerKey }) },
      );
      if (!result.correct) { setFeedback(result.hint); return; }
      window.speechSynthesis?.cancel();
      setStories((items) => items.map((story) => story.key === active.key
        ? { ...story, scene_index: result.scene_index, completed_at: result.completed ? story.completed_at || new Date().toISOString() : story.completed_at }
        : story));
      setFeedback(result.completed ? "История завершена и сохранена!" : "Верно! Следующая сцена открыта.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ответ не сохранился. Попробуй ещё раз");
    } finally { setSaving(false); }
  };

  const restart = async () => {
    if (!active || !childId || saving) return;
    setSaving(true);
    setError("");
    try {
      await api(`/api/stories/${childId}/${active.key}/restart`, { method: "POST" });
      setStories((items) => items.map((story) => story.key === active.key ? { ...story, scene_index: 0 } : story));
      setFeedback("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось начать заново"); }
    finally { setSaving(false); }
  };

  if (!childId) return <div className="v2-screen v2-story-status" role="status">Сначала открой профиль ребёнка.</div>;
  if (loading) return <div className="v2-screen v2-story-status" role="status">Открываем истории…</div>;

  if (active?.engine === "storybook") return <StorybookExperience embedded key={childId} childId={childId} calmMode={calmMode} onExit={() => setActiveKey(null)} onSpeak={text => speak(text,.85,true)} onStopSpeech={stopCurrentSpeech}/>;
  if (active?.engine === "cinematic_story") return <CinematicStorybookExperience embedded key={childId} childId={childId} calmMode={calmMode} onExit={() => setActiveKey(null)}/>;
  if (active?.engine === "interactive_book") return <InteractiveBook embedded childId={childId} storyKey={active.key} calmMode={calmMode} onExit={() => setActiveKey(null)}/>;
  if (!stories.length && !error) return <div className="v2-screen v2-story-status" role="status"><BookOpen/><h1>Истории готовятся</h1><p>Здесь пока нет доступных историй. Можно выбрать игру в разделе «Занятия».</p></div>;

  if (active) {
    const scene = active.scenes[active.scene_index];
    return <div className="v2-screen v2-story-player page-enter">
      <header className="v2-story-player-header"><button onClick={() => { window.speechSynthesis?.cancel(); setActiveKey(null); setFeedback(""); }}><ArrowLeft/> Все истории</button><div><span>ИСТОРИЯ</span><h1>{active.title}</h1></div><strong>{Math.min(active.scene_index + 1, active.scene_count)} / {active.scene_count}</strong></header>
      {error && <p className="v2-inline-alert" role="alert">{error}</p>}
      {scene ? <>
        <div className="v2-story-scene" key={`${active.key}-${active.scene_index}`}><Image src={scene.image} alt={scene.alt} fill priority sizes="(max-width: 760px) 100vw, 75vw"/></div>
        <div className="v2-story-reader"><div><p>{scene.text}</p><button type="button" onClick={() => narrate(scene.text)} aria-label="Послушать сцену"><Volume2/> Послушать</button></div><h2>{scene.prompt}</h2><div className="v2-story-choices">{scene.choices.map((choice) => <button key={choice.key} disabled={saving} onClick={() => void selectAnswer(choice.key)}><Image src={choice.image} alt="" width={86} height={86}/><strong>{choice.label}</strong><ChevronRight/></button>)}</div>{feedback && <p className="v2-story-feedback" role="status">{feedback}</p>}</div>
      </> : <div className="v2-story-end"><Check size={54}/><h2>История закончилась!</h2><p>Ты помог героям. Твой прогресс сохранён — можно вернуться к другим историям или пройти эту ещё раз.</p><div><button onClick={() => setActiveKey(null)}>Выбрать историю <ChevronRight/></button><button onClick={() => void restart()} disabled={saving}><RotateCcw/> Пройти ещё раз</button></div></div>}
    </div>;
  }

  const featured = stories.find((story) => story.in_progress || story.scene_index > 0 && story.scene_index < story.scene_count) || stories[0];
  const featuredComplete = featured && featured.scene_index >= featured.scene_count;
  return <div className="v2-screen v2-stories page-enter">
    <header className="v2-page-heading"><h1>Истории</h1><p>Слушай сказку, выбирай карточку и помогай героям. Можно остановиться и продолжить позже.</p></header>
    {error && <p className="v2-inline-alert" role="alert">{error}</p>}
    {featured && <section className="v2-story-hero"><Image src={featured.cover} alt="" fill priority sizes="(max-width: 760px) 100vw, 80vw"/><div className="v2-story-hero-copy"><span className="v2-kicker"><BookOpen/> {featuredComplete ? "История прочитана" : (featured.in_progress || featured.scene_index) ? "Продолжить историю" : "Первая история"}</span><h2>{featured.title}</h2><p>{featured.summary}</p><div className="v2-story-progress"><i style={{ width: `${featured.progress_percent ?? Math.round(featured.scene_index / featured.scene_count * 100)}%` }}/><span>{featured.progress_label || `${featured.scene_index} из ${featured.scene_count} сцен`}</span></div><button onClick={() => { setActiveKey(featured.key); setFeedback(""); }}><Play fill="currentColor"/> {featuredComplete ? "Перечитать" : (featured.in_progress || featured.scene_index) ? "Продолжить" : "Начать"} <ChevronRight/></button></div></section>}
    <div className="v2-filter-tabs" role="group" aria-label="Темы историй">{categories.map((category) => <button key={category} aria-pressed={filter === category} className={filter === category ? "active" : ""} onClick={() => setFilter(category)}>{category}</button>)}</div>
    <section aria-labelledby="v2-all-stories"><h2 id="v2-all-stories" className="v2-section-title">{filter === "Все" ? "Другие истории" : `Тема: ${filter}`}</h2><div className="v2-story-grid">{stories.filter((story) => (filter === "Все" || story.category === filter) && story.key !== featured?.key).map((story) => <button key={story.key} className="v2-story-card" onClick={() => { setActiveKey(story.key); setFeedback(""); }}><span className="v2-story-cover"><Image src={story.cover} alt="" fill sizes="(max-width: 760px) 100vw, 25vw"/></span><span className="v2-story-body"><strong>{story.title}</strong><small>{story.summary}</small><small>{story.scene_index >= story.scene_count ? "Пройдено · можно повторить" : story.progress_label || `${story.scene_index} из ${story.scene_count} сцен`}</small><i><ChevronRight/></i></span></button>)}</div></section>
  </div>;
}
