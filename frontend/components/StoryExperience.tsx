"use client";
import { t, useLocale, getLocale, languageOf } from "@/lib/i18n";

import Image from "next/image";
import { ArrowLeft, BookOpen, Check, ChevronRight, Play, RotateCcw, Volume2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, type Story } from "@/lib/api";
import { StorybookExperience } from "./storybook/StorybookExperience";
import { CinematicStorybookExperience } from "./storybook/cinematic/CinematicStorybookExperience";
import { speak, stopCurrentSpeech } from "@/lib/speech";
import { InteractiveBook } from "./storybook/book/InteractiveBook";

export function StoryExperience({ childId, calmMode = false }: { childId?: number; calmMode?: boolean }) {
  const locale = useLocale();
  const [stories, setStories] = useState<Story[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [filter, setFilter] = useState("__all__");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const active = stories.find((story) => story.key === activeKey);
  const categories = useMemo(() => ["__all__", ...new Set(stories.map((story) => story.category))], [stories]);

  useEffect(() => {
    if (!childId || activeKey) return;
    let current = true;
    api<Story[]>(`/api/stories/${childId}`)
      .then((items) => { if (current) setStories(items); })
      .catch((cause) => { if (current) setError(cause instanceof Error ? cause.message : t("storyList.copy001")); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; stopCurrentSpeech(); };
  }, [childId, activeKey, locale]);

  const narrate = async (text: string) => {
    if (!await speak(text, .70, true, languageOf(getLocale()))) setFeedback(t("storyList.copy002"));
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
      stopCurrentSpeech();
      setStories((items) => items.map((story) => story.key === active.key
        ? { ...story, scene_index: result.scene_index, completed_at: result.completed ? story.completed_at || new Date().toISOString() : story.completed_at }
        : story));
      setFeedback(result.completed ? t("storyList.copy003") : t("storyList.copy004"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("storyList.copy005"));
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
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("storyList.copy006")); }
    finally { setSaving(false); }
  };

  if (!childId) return <div className="v2-screen v2-story-status" role="status">{t("storyList.copy007")}</div>;
  if (loading) return <div className="v2-screen v2-story-status" role="status">{t("storyList.copy008")}</div>;

  if (active?.engine === "storybook") return <StorybookExperience embedded key={childId} childId={childId} calmMode={calmMode} onExit={() => setActiveKey(null)} onSpeak={text => speak(text,.70,true,languageOf(getLocale()))} onStopSpeech={stopCurrentSpeech}/>;
  if (active?.engine === "cinematic_story") return <CinematicStorybookExperience embedded key={childId} childId={childId} calmMode={calmMode} onExit={() => setActiveKey(null)}/>;
  if (active?.engine === "interactive_book") return <InteractiveBook embedded childId={childId} storyKey={active.key} calmMode={calmMode} onExit={() => setActiveKey(null)}/>;
  if (!stories.length && !error) return <div className="v2-screen v2-story-status" role="status"><BookOpen/><h1>{t("storyList.copy009")}</h1><p>{t("storyList.copy010")}</p></div>;

  if (active) {
    const scene = active.scenes[active.scene_index];
    return <div className="v2-screen v2-story-player page-enter">
      <header className="v2-story-player-header"><button onClick={() => { stopCurrentSpeech(); setActiveKey(null); setFeedback(""); }}><ArrowLeft/> {t("storyList.copy011")}</button><div><span>{t("storyList.copy012")}</span><h1>{active.title}</h1></div><strong>{Math.min(active.scene_index + 1, active.scene_count)} / {active.scene_count}</strong></header>
      {error && <p className="v2-inline-alert" role="alert">{error}</p>}
      {scene ? <>
        <div className="v2-story-scene" key={`${active.key}-${active.scene_index}`}><Image src={scene.image} alt={scene.alt} fill priority sizes="(max-width: 760px) 100vw, 75vw"/></div>
        <div className="v2-story-reader"><div><p>{scene.text}</p><button type="button" onClick={() => narrate(scene.text)} aria-label={t("storyList.copy013")}><Volume2/> {t("storyList.copy014")}</button></div><h2>{scene.prompt}</h2><div className="v2-story-choices">{scene.choices.map((choice) => <button key={choice.key} disabled={saving} onClick={() => void selectAnswer(choice.key)}><Image src={choice.image} alt="" width={86} height={86}/><strong>{choice.label}</strong><ChevronRight/></button>)}</div>{feedback && <p className="v2-story-feedback" role="status">{feedback}</p>}</div>
      </> : <div className="v2-story-end"><Check size={54}/><h2>{t("storyList.copy015")}</h2><p>{t("storyList.copy016")}</p><div><button onClick={() => setActiveKey(null)}>{t("storyList.copy017")}<ChevronRight/></button><button onClick={() => void restart()} disabled={saving}><RotateCcw/> {t("storyList.copy018")}</button></div></div>}
    </div>;
  }

  const featured = stories.find((story) => story.in_progress || story.scene_index > 0 && story.scene_index < story.scene_count) || stories[0];
  const featuredComplete = featured && featured.scene_index >= featured.scene_count;
  return <div className="v2-screen v2-stories page-enter">
    <header className="v2-page-heading"><h1>{t("storyList.copy019")}</h1><p>{t("storyList.copy020")}</p></header>
    {error && <p className="v2-inline-alert" role="alert">{error}</p>}
    {featured && <section className="v2-story-hero"><Image src={featured.cover} alt="" fill priority sizes="(max-width: 760px) 100vw, 80vw"/><div className="v2-story-hero-copy"><span className="v2-kicker"><BookOpen/> {featuredComplete ? t("storyList.copy021") : (featured.in_progress || featured.scene_index) ? t("storyList.copy022") : t("storyList.copy023")}</span><h2>{featured.title}</h2><p>{featured.summary}</p><div className="v2-story-progress"><i style={{ width: `${featured.progress_percent ?? Math.round(featured.scene_index / featured.scene_count * 100)}%` }}/><span>{featured.progress_label || t("storyList.progress", {done:featured.scene_index,total:featured.scene_count})}</span></div><button onClick={() => { setActiveKey(featured.key); setFeedback(""); }}><Play fill="currentColor"/> {featuredComplete ? t("storyList.copy026") : (featured.in_progress || featured.scene_index) ? t("storyList.copy027") : t("storyList.copy028")} <ChevronRight/></button></div></section>}
    <div className="v2-filter-tabs" role="group" aria-label={t("storyList.copy029")}>{categories.map((category) => <button key={category} aria-pressed={filter === category} className={filter === category ? "active" : ""} onClick={() => setFilter(category)}>{category === "__all__" ? t("storyList.copy000") : category}</button>)}</div>
    <section aria-labelledby="v2-all-stories"><h2 id="v2-all-stories" className="v2-section-title">{filter === "__all__" ? t("storyList.copy030") : t("storyList.topic", {topic:filter})}</h2><div className="v2-story-grid">{stories.filter((story) => (filter === "__all__" || story.category === filter) && story.key !== featured?.key).map((story) => <button key={story.key} className="v2-story-card" onClick={() => { setActiveKey(story.key); setFeedback(""); }}><span className="v2-story-cover"><Image src={story.cover} alt="" fill sizes="(max-width: 760px) 100vw, 25vw"/></span><span className="v2-story-body"><strong>{story.title}</strong><small>{story.summary}</small><small>{story.scene_index >= story.scene_count ? t("storyList.copy032") : story.progress_label || t("storyList.progress", {done:story.scene_index,total:story.scene_count})}</small><i><ChevronRight/></i></span></button>)}</div></section>
  </div>;
}
