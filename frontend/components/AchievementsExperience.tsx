"use client";

import { BookOpen, Check, Ear, MessageCircle, Star, Trophy } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { api, type Dashboard, type Story } from "@/lib/api";

export function AchievementsExperience({ childId, dashboard, onStories, onGames }: { childId?: number; dashboard: Dashboard | null; onStories: () => void; onGames: () => void }) {
  const [completedStories, setCompletedStories] = useState<number | null>(null);
  useEffect(() => {
    if (!childId) return;
    let active = true;
    api<Story[]>(`/api/stories/${childId}`).then((stories) => {
      if (active) setCompletedStories(stories.filter((story) => story.completed_at).length);
    }).catch(() => { if (active) setCompletedStories(null); });
    return () => { active = false; };
  }, [childId]);

  const badges = [
    { title: "Первый шаг", detail: "Первое сохранённое занятие", earned: (dashboard?.total_sessions || 0) > 0, icon: Star, image: "/app-illustrations/badge-first-step.webp" },
    { title: "Пять попыток", detail: "Пять сохранённых игровых попыток", earned: Boolean(dashboard?.achievements.first_five), icon: Trophy, image: "/app-illustrations/badge-five-attempts.webp" },
    { title: "Чуткое ушко", detail: "Пять заданий на понимание речи", earned: Boolean(dashboard?.achievements.good_listener), icon: Ear, image: "/app-illustrations/badge-listener.webp" },
    { title: "Мастер фраз", detail: "Пять занятий с карточками", earned: Boolean(dashboard?.achievements.phrase_master), icon: MessageCircle, image: "/app-illustrations/badge-phrase.webp" },
    { title: "Герой сказки", detail: "Первая завершённая история", earned: (completedStories || 0) > 0, icon: BookOpen, image: "/app-illustrations/badge-story.webp" },
  ];

  return <div className="v2-screen v2-achievements page-enter">
    <header className="v2-page-heading"><h1>Мои достижения</h1><p>Здесь появляются сохранённые шаги. Можно заниматься в своём темпе.</p></header>
    <section className="v2-achievement-hero">
      <Image src="/app-illustrations/achievements-hero.webp" alt="" fill priority unoptimized sizes="(max-width: 760px) 100vw, 75vw" />
      <div className="v2-achievement-hero-copy">
        <span className="v2-kicker"><Trophy/> МОИ НАГРАДЫ</span>
        <h2>Каждый шаг — победа</h2>
        <div className="v2-achievement-stats"><div><strong>{dashboard?.stars || 0}</strong><p>звёзд за игры</p></div><div><strong>{completedStories ?? "—"}</strong><p>завершённых историй</p></div></div>
      </div>
    </section>
    <div className="v2-achievement-grid">{badges.map((badge) => { const Icon = badge.icon; return <article key={badge.title} className={badge.earned ? "earned" : ""}><span className="v2-badge-art"><Image src={badge.image} alt="" fill unoptimized sizes="(max-width: 430px) 110px, (max-width: 760px) 45vw, 23vw"/><span className="v2-badge-icon"><Icon/></span></span><div><h2>{badge.title}</h2><p>{badge.detail}</p><small>{badge.earned ? <><Check/> Получено</> : "Можно получить позже"}</small></div></article>; })}</div>
    <div className="v2-achievement-links"><button onClick={onStories}><BookOpen/> Открыть истории</button><button onClick={onGames}><Star/> Выбрать занятие</button></div>
  </div>;
}
