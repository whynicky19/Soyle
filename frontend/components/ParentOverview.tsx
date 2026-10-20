"use client";

import Image from "next/image";
import { ArrowRight, BookOpen, Check, ChevronRight, Heart, Lightbulb, MessageCircle, Settings, TrendingUp, UserRound } from "lucide-react";
import type { Child, Dashboard, LearningSession } from "@/lib/api";

type Destination = "parent" | "guides" | "progress" | "goals" | "world" | "aac" | "games" | "settings";

export function ParentOverview({ child, dashboard, activeSession, onStartSession, onResume, onNavigate }: { child?: Child; dashboard: Dashboard | null; activeSession: LearningSession | null; onStartSession: () => void; onResume: () => void; onNavigate: (screen: Destination) => void }) {
  return <div className="v2-screen v2-parent-overview page-enter">
    <section className="v2-parent-hero">
      <Image src="/app-illustrations/parent-observation-hero.webp" alt="Мама записывает наблюдение, пока ребёнок показывает карточку" fill priority sizes="(max-width: 760px) 100vw, 80vw"/>
      <div className="v2-parent-hero-copy"><span className="v2-kicker"><Heart/> Кабинет родителя</span><h1>Каждый маленький шаг важен</h1><p>Здесь собрана практика {child?.name || "ребёнка"}, ваши наблюдения и материалы для спокойной поддержки дома.</p><div className="v2-parent-hero-actions"><button onClick={() => onNavigate("parent")}>Открыть кабинет <ArrowRight/></button><button onClick={activeSession && activeSession.status !== "completed" ? onResume : onStartSession}>{activeSession && activeSession.status !== "completed" ? "Продолжить занятие" : "Начать занятие"} <ArrowRight/></button></div></div>
    </section>
    <div className="v2-parent-stat-row" aria-label="Сохранённая практика">
      <div><span><TrendingUp/></span><strong>{dashboard?.week_sessions ?? 0}</strong><small>занятий за неделю</small></div>
      <div><span><Check/></span><strong>{dashboard?.completed_exercise_ids.length ?? 0}</strong><small>заданий с попытками</small></div>
      <div><span><MessageCircle/></span><strong>{dashboard?.total_sessions ?? 0}</strong><small>сохранённых попыток</small></div>
    </div>
    <section className="v2-parent-actions" aria-labelledby="parent-actions-title"><div className="v2-section-heading"><div><h2 id="parent-actions-title">Чем заняться сегодня</h2><p>Главные действия для взрослого рядом с ребёнком</p></div></div><div>
      <button onClick={() => onNavigate("parent")}><span className="mint"><UserRound/></span><strong>Профиль ребёнка</strong><small>Разрешения, аккаунт ребёнка и наблюдения</small><ChevronRight/></button>
      <button onClick={() => onNavigate("progress")}><span className="blue"><TrendingUp/></span><strong>История практики</strong><small>Результаты игр и участия без оценок развития</small><ChevronRight/></button>
      <button onClick={() => onNavigate("guides")}><span className="peach"><BookOpen/></span><strong>Гайды для родителей</strong><small>Примеры и идеи для повседневных ситуаций</small><ChevronRight/></button>
      <button onClick={() => onNavigate("goals")}><span className="lilac"><Lightbulb/></span><strong>Цели и план</strong><small>Настроить короткую практику и заметки</small><ChevronRight/></button>
    </div></section>
    <div className="v2-parent-tools"><strong>Настроить материалы ребёнка</strong><div><button onClick={() => onNavigate("world")}>Фотографии «Моего мира» <ArrowRight/></button><button onClick={() => onNavigate("aac")}>Карточки AAC <ArrowRight/></button><button onClick={() => onNavigate("games")}>Занятия ребёнка <ArrowRight/></button><button onClick={() => onNavigate("settings")}><Settings/> Настройки</button></div></div>
  </div>;
}
