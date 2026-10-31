"use client";
import { t, useLocale } from "@/lib/i18n";


import Image from "next/image";
import { ParentSpecialistAdvice } from "./ParentSpecialistAdvice";
import { ArrowRight, BookOpen, Check, ChevronRight, Heart, Lightbulb, MessageCircle, Settings, TrendingUp, UserRound } from "lucide-react";
import type { Child, Dashboard, LearningSession, Exercise, AdaptivePlan } from "@/lib/api";

type Destination = "parent" | "guides" | "progress" | "goals" | "world" | "aac" | "games" | "settings";

export function ParentOverview({ child, dashboard, activeSession, onStartSession, onResume, onNavigate, exercises, onExercise, onOpenSpecialist, onStartPlan }:  { child?: Child; dashboard: Dashboard | null; activeSession: LearningSession | null; onStartSession: () => void; onResume: () => void; onNavigate: (screen: Destination) => void; exercises: Exercise[]; onExercise: (exercise: Exercise) => void; onOpenSpecialist: () => void; onStartPlan: (plan: AdaptivePlan) => Promise<void> }) {
  useLocale();
  return <div className="v2-screen v2-parent-overview page-enter">
    <section className="v2-parent-hero">
      <Image src="/app-illustrations/parent-observation-hero.webp" alt="Мама записывает наблюдение, пока ребёнок показывает карточку" fill priority sizes="(max-width: 760px) 100vw, 80vw"/>
      <div className="v2-parent-hero-copy"><span className="v2-kicker"><Heart/> {t("nav.parent")}</span><h1>Каждый маленький шаг важен</h1><p>Здесь собрана практика {child?.name || "ребёнка"}, ваши наблюдения и материалы для спокойной поддержки дома.</p><div className="v2-parent-hero-actions"><button onClick={() => onNavigate("parent")}>{t("landing.copy098")}<ArrowRight/></button><button onClick={activeSession && activeSession.status !== "completed" ? onResume : onStartSession}>{activeSession && activeSession.status !== "completed" ? "Продолжить занятие" : "Начать занятие"} <ArrowRight/></button></div></div>
    </section>
    {child && <ParentSpecialistAdvice key={child.id} childId={child.id} exercises={exercises} onExercise={onExercise} onOpenSpecialist={onOpenSpecialist} onStartPlan={onStartPlan}/>}
    <div className="v2-parent-stat-row" aria-label="Сохранённая практика">
      <div><span><TrendingUp/></span><strong>{dashboard?.week_sessions ?? 0}</strong><small>{t("landing.copy092")}</small></div>
      <div><span><Check/></span><strong>{dashboard?.completed_exercise_ids.length ?? 0}</strong><small>{t("landing.copy093")}</small></div>
      <div><span><MessageCircle/></span><strong>{dashboard?.total_sessions ?? 0}</strong><small>сохранённых попыток</small></div>
    </div>
    <section className="v2-parent-actions" aria-labelledby="parent-actions-title"><div className="v2-section-heading"><div><h2 id="parent-actions-title">Чем заняться сегодня</h2><p>Главные действия для взрослого рядом с ребёнком</p></div></div><div>
      <button onClick={() => onNavigate("parent")}><span className="mint"><UserRound/></span><strong>{t("specialist.copy035")}</strong><small>Разрешения, аккаунт ребёнка и наблюдения</small><ChevronRight/></button>
      <button onClick={() => onNavigate("progress")}><span className="blue"><TrendingUp/></span><strong>{t("auth.history")}</strong><small>Результаты игр и участия без оценок развития</small><ChevronRight/></button>
      <button onClick={() => onNavigate("guides")}><span className="peach"><BookOpen/></span><strong>Гайды для родителей</strong><small>Примеры и идеи для повседневных ситуаций</small><ChevronRight/></button>
      <button onClick={() => onNavigate("goals")}><span className="lilac"><Lightbulb/></span><strong>{t("landing.copy096")}</strong><small>Настроить короткую практику и заметки</small><ChevronRight/></button>
    </div></section>
    <div className="v2-parent-tools"><strong>Настроить материалы ребёнка</strong><div><button onClick={() => onNavigate("world")}>Фотографии «Моего мира» <ArrowRight/></button><button onClick={() => onNavigate("aac")}>Карточки AAC <ArrowRight/></button><button onClick={() => onNavigate("games")}>Занятия ребёнка <ArrowRight/></button><button onClick={() => onNavigate("settings")}><Settings/> {t("nav.settings")}</button></div></div>
  </div>;
}
