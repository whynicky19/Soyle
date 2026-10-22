"use client";

import Image from "next/image";
import {
  ArrowRight,
  BarChart3,
  BellRing,
  BookOpen,
  Camera,
  Check,
  ChevronRight,
  CircleEllipsis,
  Clock3,
  Heart,
  Home,
  ImageIcon,
  Lightbulb,
  MapPin,
  MessageCircle,
  MoreVertical,
  Pause,
  Play,
  Plus,
  Settings,
  Sparkles,
  Star,
  Target,
  Trash2,
  TrendingUp,
  Trophy,
  UserRound,
  Users,
  Utensils,
  Volume2,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { Child, Dashboard, Exercise, LearningSession, SkillProgress } from "@/lib/api";
import { SESSION_EXERCISE_COUNTS, exerciseCountLabel } from "@/lib/homePractice";

export type ProductDestination = "games" | "aac" | "progress" | "goals" | "parent" | "settings" | "profile" | "ai" | "achievements";

type SharedProps = {
  child?: Child;
  dashboard: Dashboard | null;
  exercises: Exercise[];
  onNavigate: (screen: ProductDestination) => void;
  onExercise: (exercise: Exercise) => void;
};

function percent(value: number | null | undefined) {
  return Math.max(0, Math.min(100, Math.round(value || 0)));
}

function runExercise(exercise: Exercise | undefined, onExercise: (item: Exercise) => void, onNavigate: (screen: ProductDestination) => void) {
  if (exercise) onExercise(exercise);
  else onNavigate("games");
}

export function ParentDashboardExperience({
  child,
  dashboard,
  exercises,
  currentSession,
  activeSessionLoading,
  dailyMinutes,
  onMinutesChange,
  sessionLoading,
  sessionError,
  canSaveResults,
  onStartSession,
  onResume,
  onNavigate,
  onExercise,
  onProductScreen,
  childMode = false,
}: SharedProps & {
  currentSession: LearningSession | null;
  activeSessionLoading: boolean;
  dailyMinutes: 3 | 5 | 10;
  onMinutesChange: (minutes: 3 | 5 | 10) => void;
  sessionLoading: boolean;
  sessionError: string;
  canSaveResults: boolean;
  onStartSession: () => void;
  onResume: () => void;
  onProductScreen: (screen: "stories" | "world" | "skills" | "guides") => void;
  childMode?: boolean;
}) {
  const recommended = (dashboard?.recommended_exercises || []).filter(item => exercises.some(exercise => exercise.id === item.id));
  const planCount = currentSession?.exercises.length || SESSION_EXERCISE_COUNTS[dailyMinutes];
  const completed = currentSession?.current_index || 0;
  const progress = currentSession ? percent((completed / Math.max(1, planCount)) * 100) : percent(dashboard?.overall);
  const primaryAction = currentSession ? onResume : onStartSession;

  return (
    <div className="v2-screen v2-dashboard page-enter">
      <div className="v2-dashboard-hero-grid">
        <section className="v2-goal-hero" aria-labelledby="v2-goal-title">
          <Image src="/app-illustrations/home-help-goal.webp" alt="Мальчик просит помочь открыть бутылку во время домашней практики" fill priority sizes="(max-width: 900px) 100vw, 58vw" />
          <div className="v2-hero-scrim" />
          <div className="v2-goal-copy">
            <span className="v2-kicker"><Target size={20}/> {childMode ? `Привет, ${child?.name || "друг"}!` : "Сегодняшняя практика"}</span>
            <h1 id="v2-goal-title">Учимся общаться<br/>каждый день</h1>
            <div className="v2-goal-progress" role="progressbar" aria-label="Прогресс текущей цели" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><i style={{ width: `${progress}%` }}/></div>
            <p>{currentSession ? `${completed} из ${planCount} шагов` : `${dashboard?.completed_exercise_ids.length || 0} заданий с сохранёнными попытками`}</p>
          </div>
        </section>

        <section className="v2-start-card" aria-labelledby="v2-start-title">
          <Image className="v2-start-art" src="/app-illustrations/practice-continue.webp" alt="" fill priority sizes="(max-width: 900px) 100vw, 36vw" />
          <span className="v2-start-scrim" aria-hidden="true" />
          <button className="v2-play-button" onClick={primaryAction} disabled={sessionLoading || activeSessionLoading || (Boolean(currentSession) && !canSaveResults)} aria-label={currentSession ? "Продолжить занятие" : "Начать занятие"}><Play fill="currentColor"/></button>
          <div>
            <span className="v2-kicker">КОРОТКАЯ ПРАКТИКА</span>
            <h2 id="v2-start-title">{currentSession ? "Продолжить занятие" : "Начать занятие"}</h2>
            <p>{currentSession ? "Вернёмся к следующему спокойному шагу" : `${dailyMinutes} минут · ${exerciseCountLabel(planCount)}`}</p>
          </div>
          {!currentSession && <div className="v2-minute-picker" aria-label="Продолжительность занятия">{([3, 5, 10] as const).map((value) => <button key={value} aria-pressed={dailyMinutes === value} className={dailyMinutes === value ? "active" : ""} onClick={() => onMinutesChange(value)}>{value}</button>)}</div>}
          <button className="v2-round-next" onClick={primaryAction} disabled={sessionLoading || activeSessionLoading} aria-label="Перейти к занятию"><ArrowRight/></button>
        </section>
      </div>

      {sessionError && <div className="v2-inline-alert" role="alert">{sessionError}</div>}

      <nav className="v2-feature-grid" aria-label="Разделы Söyle">
        <button className="v2-feature-card stories" onClick={() => onProductScreen("stories")}>
          <span className="v2-feature-icon"><BookOpen/></span><strong>Истории</strong><small>Короткие интерактивные сюжеты</small><span className="v2-feature-art"><Image src="/app-illustrations/dashboard-stories.webp" alt="" fill sizes="(max-width: 760px) 100vw, 25vw"/></span><ChevronRight/>
        </button>
        <button className="v2-feature-card world" onClick={() => onProductScreen("world")}>
          <span className="v2-feature-icon"><ImageIcon/></span><strong>Мой мир</strong><small>Люди, места и любимые вещи</small><span className="v2-feature-art"><Image src="/app-illustrations/dashboard-world.webp" alt="" fill sizes="(max-width: 760px) 100vw, 25vw"/></span><ChevronRight/>
        </button>
        <button className="v2-feature-card skills" onClick={() => onProductScreen("skills")}>
          <span className="v2-feature-icon"><BarChart3/></span><strong>Карта навыков</strong><small>Путь развития общения</small><span className="v2-feature-art"><Image src="/app-illustrations/dashboard-skills.webp" alt="" fill sizes="(max-width: 760px) 100vw, 25vw"/></span><ChevronRight/>
        </button>
        <button className="v2-feature-card words" onClick={() => onNavigate("aac")}>
          <span className="v2-feature-icon"><MessageCircle/></span><strong>Мои слова</strong><small>Быстрый доступ к AAC</small><span className="v2-feature-art"><Image src="/app-illustrations/dashboard-words.webp" alt="" fill sizes="(max-width: 760px) 100vw, 25vw"/></span><ChevronRight/>
        </button>
        {childMode ? <button className="v2-feature-card guides" onClick={() => onNavigate("achievements")}>
          <span className="v2-feature-icon"><Trophy/></span><strong>Мои<br/>достижения</strong><small>Сохранённые шаги и истории</small><span className="v2-feature-art"><Image src="/app-illustrations/dashboard-achievements.webp" alt="" fill sizes="(max-width: 760px) 100vw, 25vw"/></span><ChevronRight/>
        </button> : <button className="v2-feature-card guides" onClick={() => onProductScreen("guides")}>
          <span className="v2-feature-icon"><Users/></span><strong>Гайды<br/>для родителей</strong><small>Поддержка и идеи</small><span className="v2-plant" aria-hidden="true"><i/><i/><i/></span><ChevronRight/>
        </button>}
      </nav>

      <div className="v2-dashboard-bottom">
        <section className="v2-practice-strip" aria-labelledby="v2-practice-title">
          <header><span className="v2-section-icon"><Lightbulb/></span><div><h2 id="v2-practice-title">Что потренировать сегодня</h2><p>Короткие задания для текущей цели</p></div><button onClick={() => onNavigate("games")} aria-label="Все занятия"><ChevronRight/></button></header>
          <div className="v2-practice-items">
            {recommended.map((exercise, index) => {
              const fallbackImages = ["/aac-pictograms/water.png", "/aac-pictograms/apple.png", "/aac-pictograms/toy-car.png"];
              return <button key={exercise.id} onClick={() => onExercise(exercise)}><Image src={exercise.icon?.startsWith("/") ? exercise.icon : fallbackImages[index]} alt="" width={72} height={72}/><span><strong>{exercise.title}</strong><small><Clock3/> 3–5 мин</small></span><ChevronRight/></button>;
            })}
            {!recommended.length && <button onClick={() => onNavigate("games")}><span className="v2-empty-glyph"><Sparkles/></span><span><strong>Выбрать занятие</strong><small>Открыть библиотеку</small></span><ChevronRight/></button>}
          </div>
        </section>

        <section className="v2-observation-card" aria-labelledby="v2-observation-title">
          <header><span className="v2-section-icon">{childMode ? <Trophy/> : <Users/>}</span><div><h2 id="v2-observation-title">{childMode ? "Мои достижения" : "Наблюдения родителей"}</h2><p>{childMode ? "Каждый сохранённый шаг важен" : "Заметки помогают видеть прогресс"}</p></div></header>
          <button onClick={() => onNavigate(childMode ? "achievements" : dashboard?.total_sessions ? "progress" : "goals")}>
            <span className="v2-avatar-child">{childMode ? <Star/> : child?.name?.[0] || "С"}</span>
            <span><strong>{childMode ? `${dashboard?.stars || 0} звёзд за игры` : dashboard?.total_sessions ? `За неделю: ${dashboard.week_sessions} занятий` : "Добавьте первое наблюдение"}</strong><small>{childMode ? "Посмотри, какие истории и задания уже удалось пройти." : dashboard?.weakest_skill ? `Сейчас чаще нужна поддержка: ${dashboard.weakest_skill.label.toLowerCase()}.` : "Отмечайте участие без оценок и диагнозов."}</small></span>
            <ChevronRight/>
          </button>
        </section>
      </div>
    </div>
  );
}

const skillNodes = [
  { key: "speech_comprehension", title: "Понимание", text: "Понимает речь и инструкции", icon: BookOpen, tone: "green" },
  { key: "communication", title: "Просьбы", text: "Просит о помощи и предметах", icon: MessageCircle, tone: "peach" },
  { key: "vocabulary", title: "Выбор", text: "Выбирает из нескольких вариантов", icon: Target, tone: "blue" },
  { key: "phrase_building", title: "AAC", text: "Использует карточки и жесты", icon: ImageIcon, tone: "sky" },
  { key: "word_repetition", title: "Повторение слов", text: "Сохранённые игровые результаты", icon: Settings, tone: "lilac" },
  { key: "articulation", title: "Практика перед зеркалом", text: "Сохранённое участие", icon: Home, tone: "sand" },
] as const;

function skillValue(items: SkillProgress[] | undefined, key: string) {
  const item = items?.find((skill) => skill.skill === key);
  if (item?.value != null) return percent(item.value);
  return null;
}

export function SkillsExperience({ dashboard, onNavigate }: SharedProps) {
  return <div className="v2-screen v2-skills page-enter">
    <section className="v2-skills-hero"><Image src="/app-illustrations/skills-milestone-path.webp" alt="Мальчик идёт по дорожке навыков к знаку помощи" fill priority sizes="(max-width: 900px) 100vw, 80vw"/><div className="v2-skills-copy"><h1>Карта навыков</h1><p>Сохранённые игровые попытки</p><span className="v2-kicker"><Target/> Доступные задания</span><h2>{dashboard?.completed_exercise_ids.length || 0} с попытками</h2><small>Здесь отмечаются только выполненные действия, без сравнения с другими детьми.</small><div className="v2-goal-progress"><i style={{ width: `${percent(dashboard?.overall)}%` }}/></div></div></section>
    <section className="v2-skill-map" aria-label="Визуальная карта развития">
      <svg className="v2-map-path" viewBox="0 0 1200 380" preserveAspectRatio="none" aria-hidden="true"><path d="M70 210 C210 60 330 330 490 180 S790 60 930 210 S1090 330 1160 120"/></svg>
      {skillNodes.map((node, index) => { const Icon = node.icon; const value = skillValue(dashboard?.skill_progress, node.key); return <button key={node.key} className={`v2-skill-node ${node.tone} node-${index + 1}`} onClick={() => onNavigate("progress")}><span><Icon/></span><div><h3>{node.title}</h3><p>{node.text}</p><small className={value === null ? "support" : value > 70 ? "ready" : "learning"}>{value === null ? <CircleEllipsis/> : value > 70 ? <Check/> : <CircleEllipsis/>}{value === null ? "Пока нет данных" : `${value}% в игре`}</small></div><ChevronRight/></button>; })}
      <span className="v2-map-sun" aria-hidden="true"/><span className="v2-map-flag" aria-hidden="true">⚑</span>
    </section>
    <div className="v2-skill-bottom"><button onClick={() => onNavigate("progress")}><Users/><span><strong>Наблюдения родителей</strong><small>{dashboard?.week_sessions ? `${dashboard.week_sessions} занятий за эту неделю` : "Добавьте заметку о самостоятельном действии"}</small></span><ChevronRight/></button><button onClick={() => onNavigate("games")}><Lightbulb/><span><strong>Что потренировать сегодня</strong><small>Подборка коротких заданий по текущей цели</small></span><ChevronRight/></button></div>
  </div>;
}

const guideCards = [
  { key: "help", title: "Как помочь ребёнку попросить помощь", text: "Спокойный способ показать жест и карточку помощи.", image: "/app-illustrations/guides-help-gesture.webp", categories: ["start", "communication", "aac"], steps: ["Выберите знакомую ситуацию, в которой ребёнку действительно может понадобиться помощь.", "Покажите карточку «Помоги» или жест, произнесите короткую фразу: «Помоги мне».", "Подождите ответа без требования повторить слово. Взгляд, жест и касание карточки тоже считаются просьбой.", "Сразу помогите и отметьте попытку в наблюдениях. Не создавайте искусственных трудностей ради тренировки."] },
  { key: "choice", title: "Как предлагать выбор", text: "Простые способы давать выбор в повседневных ситуациях.", image: "/app-illustrations/guide-offer-choice.webp", categories: ["start", "communication", "home"], steps: ["Предложите только два понятных варианта, например яблоко или банан.", "Покажите реальные предметы или две одинаково оформленные карточки.", "Дайте время посмотреть, указать, взять предмет или назвать его — любой понятный ответ подходит.", "Подтвердите выбор словами и выполните его, если это безопасно."] },
  { key: "refusal", title: "Если ребёнок отказывается", text: "Что можно попробовать, почему это происходит и как реагировать спокойно.", image: "/app-illustrations/guide-calm-refusal.webp", categories: ["start", "behavior", "communication"], steps: ["Примите «нет» или карточку «Не хочу» как настоящее сообщение.", "Проверьте, не устал ли ребёнок и не слишком ли сложна текущая задача.", "Предложите паузу или другой способ участия без давления.", "Вернитесь к занятию позже; запишите наблюдение о том, что помогло."] },
  { key: "aac", title: "Как использовать карточки дома", text: "Пошаговое руководство с примерами и шаблонами.", image: "/app-illustrations/guide-aac-home.webp", categories: ["start", "aac", "home"], steps: ["Начните с нужных ребёнку сообщений: вода, помощь, перерыв, любимая вещь.", "Разместите карточки там, где возникают такие ситуации, и всегда оставьте доступ к словам «Стоп» и «Перерыв».", "Показывайте пример сами: коснитесь карточки и произнесите слово, не требуя немедленного ответа.", "Добавьте знакомые фотографии через «Мой мир» и проверьте, понятно ли ребёнку изображение."] },
  { key: "steps", title: "Маленькие шаги каждый день", text: "Как замечать прогресс и делать занятия частью обычной жизни.", image: "/app-illustrations/guide-small-steps.webp", categories: ["start", "home", "behavior"], steps: ["Выберите одну короткую цель, связанную с повседневной жизнью.", "Повторяйте её в удобный момент по несколько минут, сохраняя возможность сделать паузу.", "Замечайте не только результат, но и инициативу, интерес и самостоятельную попытку.", "Запишите наблюдение в кабинете родителя и обсудите изменения со знакомым ребёнку специалистом."] },
] as const;

export function GuidesExperience({ onNavigate }: SharedProps) {
  const [category, setCategory] = useState("start");
  const [openGuide, setOpenGuide] = useState<string | null>(null);
  const categories = useMemo(() => [
    ["start", "Начало", Home], ["communication", "Коммуникация", MessageCircle], ["aac", "AAC", ImageIcon], ["behavior", "Поведение", Settings], ["home", "Домашняя практика", BookOpen],
  ] as const, []);
  const selectedGuide = guideCards.find((guide) => guide.key === openGuide);
  return <div className="v2-screen v2-guides page-enter">
    <header className="v2-page-heading"><h1>Гайды для родителей</h1><p>Поддержка, советы и полезные материалы</p></header>
    <div className="v2-guide-tabs" role="tablist">{categories.map(([id, label, Icon]) => <button key={id} role="tab" aria-selected={category === id} className={category === id ? "active" : ""} onClick={() => setCategory(id)}><Icon/>{label}</button>)}</div>
    <section className="v2-guide-hero"><Image src={guideCards[0].image} alt="Мама и мальчик вместе показывают жест просьбы о помощи" fill priority sizes="(max-width: 900px) 100vw, 80vw"/><div className="v2-guide-hero-copy"><span><Star fill="currentColor"/> Для спокойной домашней практики</span><h2>Как помочь ребёнку<br/>попросить помощь</h2><p>Пошаговые идеи для повседневных ситуаций — без давления и спешки.</p><button onClick={() => setOpenGuide("help")}>Читать гайд <ArrowRight/></button></div></section>
    <section className="v2-guide-grid" aria-label="Материалы для родителей">{guideCards.filter((guide) => guide.categories.some((item) => item === category) && guide.key !== "help").map((guide) => <button key={guide.key} onClick={() => setOpenGuide(guide.key)}><span><Image src={guide.image} alt="" fill sizes="(max-width: 760px) 100vw, 25vw"/></span><div><strong>{guide.title}</strong><small>{guide.text}</small></div><ChevronRight/></button>)}</section>
    {selectedGuide && <div className="v2-guide-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpenGuide(null); }}><article className="v2-guide-modal" role="dialog" aria-modal="true" aria-labelledby="v2-guide-modal-title"><button className="v2-guide-close" onClick={() => setOpenGuide(null)} aria-label="Закрыть гайд">×</button><div className="v2-guide-modal-copy"><span className="v2-kicker">ГАЙД ДЛЯ РОДИТЕЛЕЙ</span><h2 id="v2-guide-modal-title">{selectedGuide.title}</h2><p>{selectedGuide.text}</p><ol>{selectedGuide.steps.map((step) => <li key={step}>{step}</li>)}</ol><button onClick={() => { setOpenGuide(null); onNavigate(selectedGuide.key === "steps" ? "progress" : selectedGuide.key === "aac" ? "aac" : "goals"); }}>Перейти к практике <ArrowRight/></button></div></article></div>}
    <aside className="v2-guide-note"><BellRing/><div><strong>Спокойная поддержка важнее темпа</strong><p>Останавливайтесь при усталости, принимайте отказ и обсуждайте цели со специалистом, который знает ребёнка.</p></div></aside>
  </div>;
}
