"use client";

import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Apple,
  Activity,
  Angry,
  Armchair,
  Backpack,
  Banana,
  Baby,
  Bird,
  BarChart3,
  BedDouble,
  Bed,
  Building2,
  BookOpen,
  Bell,
  Blocks,
  Bot,
  Bug,
  Camera,
  Car,
  Cat,
  Check,
  ChevronRight,
  Circle,
  CircleAlert,
  CircleCheck,
  CircleX,
  CircleUserRound,
  CircleHelp,
  Coffee,
  Contact,
  CookingPot,
  Croissant,
  CupSoda,
  CreditCard,
  Dog,
  Drum,
  Ear,
  Eye,
  EyeOff,
  Fish,
  Flame,
  Frown,
  FerrisWheel,
  Gamepad2,
  GlassWater,
  Glasses,
  Hand,
  HandHeart,
  HandHelping,
  Heart,
  HeartPulse,
  Home,
  House,
  KeyRound,
  LampDesk,
  Languages,
  Laugh,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Menu,
  MapPin,
  Meh,
  MessageCircle,
  Milk,
  Mic2,
  Parentheses,
  Pause,
  Paintbrush,
  PackageOpen,
  PersonStanding,
  Play,
  Plus,
  RotateCcw,
  School,
  ShoppingCart,
  Search,
  Settings,
  Shirt,
  ShieldAlert,
  ShieldCheck,
  Smile,
  Snowflake,
  Soup,
  Sparkles,
  Star,
  TableProperties,
  Target,
  Timer,
  ThermometerSnowflake,
  ThermometerSun,
  Toilet,
  Puzzle,
  Rabbit,
  Snail,
  Trees,
  TrendingUp,
  Trophy,
  Turtle,
  Utensils,
  Users,
  UserRound,
  UserRoundCheck,
  Volleyball,
  Volume2,
  X,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, AACCard, AIAnswer, AIPlan, API_URL, AppSettings, Child, ChildConsent, clearLegacyAuth, Dashboard, Exercise, getCsrfToken, LearningSession, NotificationsData, Role, SkillProgress, User } from "@/lib/api";
import { composeAACMessage } from "@/lib/aacGrammar";
import { supportedInterfaceLanguages, useInterfaceLanguage } from "@/lib/i18n";

type Screen = "home" | "games" | "session" | "exercise-complete" | "motor" | "sensory" | "mixed" | "aac" | "ai" | "progress" | "parent" | "profile" | "settings" | "admin";
type ModuleName = "motor" | "sensory" | "mixed";
type GameMeasurement = { attempts_count?: number; correct_answers?: number; prompts_used?: number; attempt_status?: "completed" | "participated" | "refused" | "break" | "technical_error"; independence?: number; prompt_level?: "independent" | "minimal" | "full"; response_ms?: number; communication_initiatives?: number };
type ExerciseCompletion = { title: string; message: string; nextExercise: Exercise | null; sessionMode: boolean; sessionFinished: boolean };
const defaultSettings: AppSettings = { camera_enabled: false, sound_enabled: true, calm_mode: false, theme: "peach", language: "ru" };

const modules = [
  {
    id: "sensory" as const,
    title: "Слушай и находи",
    eyebrow: "Сенсорный модуль",
    description: "Слушай слово и выбирай правильную картинку",
    icon: "/illustrations/module-listening.png",
    accent: "blue",
    progress: 0,
    time: "4 минуты",
  },
  {
    id: "mixed" as const,
    title: "Собери свою фразу",
    eyebrow: "Модуль общения",
    description: "Складывай карточки и составляй понятные сообщения",
    icon: "/illustrations/module-phrases.png",
    accent: "mint",
    progress: 0,
    time: "6 минут",
  },
];
const moduleImages: Record<ModuleName, string> = {
  motor: "/illustrations/module-articulation-fox.png",
  sensory: "/illustrations/module-listening.png",
  mixed: "/illustrations/module-phrases.png",
};

function BrandIcon({ size = 26 }: { size?: number }) {
  return <Image src="/soyle-mark-v2.png" alt="" width={size} height={size} priority />;
}

function ModuleGlyph({ module, size = 30 }: { module: ModuleName; size?: number }) {
  const Icon = module === "motor" ? Mic2 : module === "sensory" ? Ear : MessageCircle;
  return <span className={`module-glyph ${module}`} aria-hidden="true"><Icon size={size} strokeWidth={1.8}/><i/></span>;
}

export function SoyleApp() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    clearLegacyAuth();
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 2500);
    api<User>("/api/auth/me", { signal: controller.signal })
      .then((currentUser) => { if (active) setUser(currentUser); })
      .catch(() => undefined)
      .finally(() => { window.clearTimeout(timeout); if (active) setAuthLoading(false); });
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, []);
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  if (authLoading) return <div className="auth-loading"><div className="brand-mark"><BrandIcon /></div><span>Söyle загружается…</span></div>;
  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    clearLegacyAuth();
    setUser(null);
  };
  if (!user) return <AuthScreen onAuthenticated={setUser} />;
  return <AuthenticatedApp user={user} onLogout={logout} />;
}

function AuthenticatedApp({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [screen, setScreen] = useState<Screen>(() => user.role === "admin" ? "admin" : "home");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<number | null>(user.child_id || null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [activeSession, setActiveSession] = useState<LearningSession | null>(null);
  const [sessionExerciseActive, setSessionExerciseActive] = useState(false);
  const [activeSessionLoading, setActiveSessionLoading] = useState(true);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const [exerciseCompletion, setExerciseCompletion] = useState<ExerciseCompletion | null>(null);
  const [dailyMinutes, setDailyMinutes] = useState<3 | 5 | 10>(5);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [notifications, setNotifications] = useState<NotificationsData>({ unread: 0, items: [] });
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [reward, setReward] = useState<{ stars: number; nonce: number } | null>(null);
  const gameStartedAtRef = useRef(0);
  const [childrenLoading, setChildrenLoading] = useState(true);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [consent, setConsent] = useState<ChildConsent | null>(null);
  useInterfaceLanguage(settings.language);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.dataset.calm = settings.calm_mode ? "true" : "false";
  }, [settings]);
  useEffect(() => { api<Child[]>("/api/children").then((items) => { setChildren(items); setSelectedChildId((current) => current || items[0]?.id || null); }).catch(() => setChildren([])).finally(() => setChildrenLoading(false)); }, []);
  useEffect(() => {
    api<AppSettings>("/api/settings").then((value) => setSettings({ ...value, language: supportedInterfaceLanguages.includes(value.language) ? value.language : "ru" })).catch(() => setSettings(defaultSettings));
  }, []);
  const loadNotifications = useCallback(() => {
    if (user.role === "parent") api<NotificationsData>("/api/notifications").then(setNotifications).catch(() => setNotifications({ unread: 0, items: [] }));
  }, [user.role]);
  useEffect(loadNotifications, [loadNotifications]);

  const navigation: { id: Screen; label: string; icon: typeof Home }[] = user.role === "admin"
    ? [{ id: "admin", label: "Админ-панель", icon: LayoutDashboard }, { id: "settings", label: "Настройки", icon: Settings }]
    : user.role === "student"
        ? [{ id: "home", label: "Главная", icon: Home }, { id: "games", label: "Занятия", icon: Gamepad2 }, { id: "aac", label: "Сказать", icon: Parentheses }, { id: "settings", label: "Настройки", icon: Settings }]
      : [
          { id: "home", label: "Главная", icon: Home },
          { id: "games", label: "Занятия", icon: Gamepad2 },
          { id: "aac", label: "Сказать", icon: Parentheses },
          { id: "ai", label: "Söyle AI", icon: Bot },
          { id: "progress", label: "Прогресс", icon: BarChart3 },
          ...(user.role === "parent" ? [{ id: "parent" as Screen, label: "Для родителей", icon: UserRound }] : []),
          { id: "settings", label: "Настройки", icon: Settings },
        ];

  const child = children.find((item) => item.id === selectedChildId) || children[0];

  useEffect(() => {
    const path = ["parent", "student"].includes(user.role) && selectedChildId
      ? `/api/exercises?child_id=${selectedChildId}`
      : "/api/exercises";
    api<Exercise[]>(path).then(setExercises).catch(() => setExercises([]));
  }, [selectedChildId, user.role]);

  useEffect(() => {
    if (!child?.id || !["parent", "student"].includes(user.role)) {
      queueMicrotask(() => setConsent(null));
      return;
    }
    api<ChildConsent>(`/api/children/${child.id}/consent`).then(setConsent).catch(() => setConsent(null));
  }, [child?.id, user.role]);

  useEffect(() => {
    if (!child?.id) { queueMicrotask(() => setActiveSessionLoading(false)); return; }
    api<LearningSession | null>(`/api/children/${child.id}/active-session`).then((session) => {
      setActiveSession(session);
    }).catch(() => undefined).finally(() => setActiveSessionLoading(false));
  }, [child?.id, screen]);

  const refreshDashboard = useCallback(() => {
    if (child?.id) api<Dashboard>(`/api/dashboard/${child.id}`).then(setDashboard).catch(() => setDashboard(null));
  }, [child]);
  useEffect(refreshDashboard, [refreshDashboard]);

  const saveSession = async (exerciseId: number, module: ModuleName, score: number, details: Record<string, unknown>, measurement: GameMeasurement = {}) => {
    if (!child || !exerciseId) return;
    if (!consent?.privacy_accepted) {
      setSessionError(user.role === "parent" ? "Сначала откройте кабинет родителя и разрешите сохранение результатов." : "Попроси взрослого разрешить сохранение результатов.");
      return null;
    }
    const startedAt = gameStartedAtRef.current || Date.now();
    const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    const sequenceIndex = sessionExerciseActive ? activeSession?.exercises.findIndex((item) => item.id === exerciseId) : undefined;
    const result = await api<{ awarded_stars: number; score: number; duration_seconds: number; attempt_status: GameMeasurement["attempt_status"]; created_at: string }>("/api/sessions", { method: "POST", body: JSON.stringify({ child_id: child.id, exercise_id: exerciseId, module, score, duration_seconds: durationSeconds, details, ...measurement, learning_session_id: sessionExerciseActive ? activeSession?.id || null : null, sequence_index: sequenceIndex !== undefined && sequenceIndex >= 0 ? sequenceIndex : null }) }).catch((cause) => { setSessionError(cause instanceof Error ? cause.message : "Не удалось сохранить результат"); return null; });
    if (result) {
      if (result.awarded_stars > 0) {
        setReward({ stars: result.awarded_stars, nonce: Date.now() });
        window.setTimeout(() => setReward(null), 2200);
      }
      gameStartedAtRef.current = Date.now();
      refreshDashboard();
      loadNotifications();
      if (sessionExerciseActive && activeSession && sequenceIndex !== undefined && sequenceIndex >= 0) {
        const advancesSession = ["completed", "participated", "refused"].includes(result.attempt_status || "completed");
        const nextIndex = advancesSession ? Math.max(activeSession.current_index, sequenceIndex + 1) : activeSession.current_index;
        const updatedSession = { ...activeSession, current_index: nextIndex, status: nextIndex >= activeSession.exercises.length ? "completed" as const : "in_progress" as const, results: [...(activeSession.results || []), { exercise_id: exerciseId, score: result.score, duration_seconds: result.duration_seconds, attempt_status: result.attempt_status, created_at: result.created_at }] };
        setActiveSession(updatedSession);
        if (!advancesSession) return result;
        setExerciseCompletion({
          title: result.attempt_status === "refused" ? "Сообщение принято" : "Задание завершено",
          message: result.attempt_status === "refused" ? "«Нет» и «не хочу» — полноценные сообщения. Продолжать не нужно." : "Попытка сохранена. Можно спокойно перейти дальше.",
          nextExercise: updatedSession.exercises[nextIndex] || null,
          sessionMode: true,
          sessionFinished: nextIndex >= updatedSession.exercises.length,
        });
        setScreen("exercise-complete");
      } else if (["completed", "participated", "refused"].includes(result.attempt_status || "completed")) {
        const currentIndex = exercises.findIndex((item) => item.id === exerciseId);
        const nextExercise = currentIndex >= 0 ? exercises[currentIndex + 1] || null : null;
        setExerciseCompletion({
          title: result.attempt_status === "refused" ? "Сообщение принято" : "Готово!",
          message: result.attempt_status === "refused" ? "Ребёнок отказался — это не ошибка. Задание можно закончить." : "Попытка сохранена. Выбери, продолжить или вернуться к занятиям.",
          nextExercise,
          sessionMode: false,
          sessionFinished: false,
        });
        setScreen("exercise-complete");
      }
    }
    return result;
  };

  const startDailySession = async () => {
    if (!child || sessionLoading) return;
    setSessionLoading(true); setSessionError("");
    try {
      if (!consent?.privacy_accepted) throw new Error(user.role === "parent" ? "Сначала откройте кабинет родителя и разрешите сохранение программы и результатов." : "Попроси взрослого разрешить сохранение программы и результатов.");
      const existing = await api<LearningSession | null>(`/api/children/${child.id}/active-session`);
      if (existing) {
        setActiveSession(existing);
        setScreen("session");
        return;
      }
      const plan = await api<AIPlan>(`/api/ai/plan/${child.id}`, { method: "POST", body: JSON.stringify({ target_minutes: dailyMinutes }) });
      const created = await api<LearningSession>("/api/learning-sessions", { method: "POST", body: JSON.stringify({ child_id: child.id, exercise_ids: plan.exercises.map((item) => item.id), target_minutes: dailyMinutes }) });
      setActiveSession({ ...created, results: [] });
      setScreen("session");
    } catch (cause) {
      setSessionError(cause instanceof Error ? cause.message : "Не удалось подготовить занятие");
    } finally { setSessionLoading(false); }
  };

  const continueSession = () => {
    if (!activeSession || activeSession.current_index >= activeSession.exercises.length) return;
    const exercise = activeSession.exercises[activeSession.current_index];
    setSessionExerciseActive(true);
    setSelectedExercise(exercise);
    gameStartedAtRef.current = Date.now();
    setScreen(exercise.module);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const pauseSession = async () => {
    if (!activeSession) return;
    const value = await api<{ status: "paused" }>(`/api/learning-sessions/${activeSession.id}/pause`, { method: "PATCH" }).catch(() => null);
    if (value) setActiveSession({ ...activeSession, status: value.status });
    setScreen("home");
  };

  const resumeSession = async () => {
    if (!activeSession) return;
    if (activeSession.status === "paused") await api(`/api/learning-sessions/${activeSession.id}/pause`, { method: "PATCH" }).catch(() => null);
    setActiveSession({ ...activeSession, status: "in_progress" });
    setScreen("session");
  };

  const markNotificationRead = async (id: number) => {
    await api(`/api/notifications/${id}/read`, { method: "PATCH" }).catch(() => null);
    setNotifications((current) => ({ unread: Math.max(0, current.unread - (current.items.find((item) => item.id === id && !item.is_read) ? 1 : 0)), items: current.items.map((item) => item.id === id ? { ...item, is_read: true } : item) }));
  };
  const markAllNotificationsRead = async () => {
    await api("/api/notifications/actions/read-all", { method: "PATCH" }).catch(() => null);
    setNotifications((current) => ({ unread: 0, items: current.items.map((item) => ({ ...item, is_read: true })) }));
  };

  const changeSettings = (next: AppSettings) => {
    setSettings(next);
    api<AppSettings>("/api/settings", { method: "PUT", body: JSON.stringify(next) }).then(setSettings).catch(() => undefined);
  };

  if (user.role === "parent" && childrenLoading) return <div className="auth-loading"><div className="brand-mark"><BrandIcon /></div><span>Загружаем профиль ребёнка…</span></div>;
  if (user.role === "parent" && !children.length) return <ChildOnboarding user={user} onCreated={(newChild) => { setChildren([newChild]); setSelectedChildId(newChild.id); }} onLogout={onLogout} />;

  const openScreen = (next: Screen) => {
    setSessionError("");
    setExerciseCompletion(null);
    if (["motor", "sensory", "mixed"].includes(next)) {
      setSessionExerciseActive(false);
      gameStartedAtRef.current = Date.now();
      setSelectedExercise(exercises.find((item) => item.module === next) || null);
    }
    setScreen(next);
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openExercise = (exercise: Exercise) => {
    setSessionError("");
    setExerciseCompletion(null);
    setSessionExerciseActive(false);
    setSelectedExercise(exercise);
    gameStartedAtRef.current = Date.now();
    setScreen(exercise.module);
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const continueAfterExercise = () => {
    if (!exerciseCompletion) return;
    if (exerciseCompletion.sessionMode) {
      if (exerciseCompletion.sessionFinished || !exerciseCompletion.nextExercise) {
        setExerciseCompletion(null);
        setScreen("session");
        return;
      }
      setSelectedExercise(exerciseCompletion.nextExercise);
      gameStartedAtRef.current = Date.now();
      setExerciseCompletion(null);
      setScreen(exerciseCompletion.nextExercise.module);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (exerciseCompletion.nextExercise) {
      setSelectedExercise(exerciseCompletion.nextExercise);
      setSessionExerciseActive(false);
      gameStartedAtRef.current = Date.now();
      setExerciseCompletion(null);
      setScreen(exerciseCompletion.nextExercise.module);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      openScreen("games");
    }
  };

  return (
    <div className={`app-shell ${user.role === "student" ? "student-mode" : ""}`}>
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <button type="button" className="brand" onClick={() => openScreen("home")} aria-label="Söyle — на главную">
          <div className="brand-mark"><BrandIcon /></div>
          <div><strong>Söyle</strong><span>растём вместе</span></div>
        </button>
        <button className="sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Закрыть меню"><X /></button>
        <nav aria-label="Основное меню">
          {navigation.map((item) => {
            const active = screen === item.id || (item.id === "games" && ["session", "exercise-complete", "motor", "sensory", "mixed"].includes(screen));
            const Icon = item.icon;
            return (
              <button key={item.id} className={active ? "active" : ""} onClick={() => openScreen(item.id)}>
                <Icon size={20} strokeWidth={2} /><span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-note">
          <span className="note-spark">✦</span>
          <strong>Серия: {dashboard?.streak_days || 0} дн.</strong>
          <span>{dashboard?.week_sessions || 0} занятий на этой неделе</span>
        </div>
        <div className="profile-mini">
          <button className="avatar avatar-button" onClick={() => openScreen("profile")} aria-label="Открыть профиль">{user.full_name[0]}</button>
          <button className="profile-mini-info" onClick={() => openScreen("profile")}><strong>{user.full_name}</strong><span>{roleLabel(user.role)}</span></button>
          <button className="logout-mini" onClick={onLogout} aria-label="Выйти"><LogOut size={17} /></button>
        </div>
      </aside>

      {sidebarOpen && <button className="overlay" onClick={() => setSidebarOpen(false)} aria-label="Закрыть меню" />}

      <main className="main">
        <header className="topbar">
          <button className="menu-button" onClick={() => setSidebarOpen(true)} aria-label="Открыть меню"><Menu /></button>
          <div className="mobile-logo"><BrandIcon size={22} /> Söyle</div>
          <div className="top-actions">
            <button className="language" data-i18n-native onClick={() => openScreen("settings")} aria-label={{ ru: "Язык интерфейса: русский", en: "Interface language: English", kk: "Интерфейс тілі: қазақша" }[settings.language]}><Languages size={17} /> {{ ru: "RU", en: "EN", kk: "ҚАЗ" }[settings.language]}</button>
            <div className="stars"><Star size={18} fill="currentColor" /> {dashboard?.stars || 0}</div>
            {user.role === "parent" && <div className="notification-wrap"><button className="notification-button" onClick={() => setNotificationsOpen((value) => !value)} aria-label="Уведомления"><Bell size={19}/>{notifications.unread > 0 && <i>{notifications.unread}</i>}</button>{notificationsOpen && <div className="notification-panel"><div className="notification-head"><div><span className="kicker">УВЕДОМЛЕНИЯ</span><strong>События программы</strong></div>{notifications.unread > 0 && <button onClick={markAllNotificationsRead}>Прочитать все</button>}</div><div className="notification-list">{notifications.items.length ? notifications.items.map((item) => <button key={item.id} className={item.is_read ? "read" : "unread"} onClick={() => markNotificationRead(item.id)}><span className="notification-symbol"><Trophy size={18}/></span><div><strong>{item.title}</strong><p>{item.message}</p><small>{new Date(item.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</small></div>{!item.is_read && <i/>}</button>) : <div className="notification-empty"><Bell size={24}/><strong>Пока всё спокойно</strong><span>Здесь появятся отметки о занятиях и новых шагах программы.</span></div>}</div></div>}</div>}
            <button className="avatar small avatar-button" onClick={() => openScreen("profile")} aria-label="Открыть профиль">{user.full_name[0]}</button>
          </div>
        </header>

        <div className="page">
          {screen === "home" && <HomeScreen onOpen={openScreen} onStartSession={startDailySession} onResume={resumeSession} activeSession={activeSession} activeSessionLoading={activeSessionLoading} dailyMinutes={dailyMinutes} onMinutesChange={setDailyMinutes} sessionLoading={sessionLoading} sessionError={sessionError} child={child} dashboard={dashboard} consent={consent} userRole={user.role} />}
          {screen === "games" && <GamesScreen onOpen={openScreen} onExercise={openExercise} dashboard={dashboard} exercises={exercises} childMode={user.role === "student"} />}
          {screen === "session" && activeSession && <SessionScreen session={activeSession} onContinue={continueSession} onPause={pauseSession} onFinish={() => { setActiveSession(null); refreshDashboard(); setScreen("home"); }} />}
          {screen === "exercise-complete" && exerciseCompletion && <ExerciseCompletionScreen completion={exerciseCompletion} onContinue={continueAfterExercise} onFinish={() => openScreen(exerciseCompletion.sessionMode ? "session" : "games")} />}
          {sessionError && ["motor", "sensory", "mixed"].includes(screen) && <div className="game-error" role="alert"><ShieldAlert size={18}/><span>{sessionError}</span></div>}
          {screen === "motor" && <MotorGame exercises={exercises.filter((item) => item.module === "motor")} initialExercise={selectedExercise} cameraEnabled={settings.camera_enabled && Boolean(consent?.privacy_accepted && consent?.camera_processing)} cameraConsentGranted={Boolean(consent?.privacy_accepted && consent?.camera_processing)} onBack={() => sessionExerciseActive && activeSession ? setScreen("session") : openScreen("games")} onComplete={(score, exerciseId, measurement, details) => saveSession(exerciseId, "motor", score, details || { source: "manual" }, measurement)} />}
          {screen === "sensory" && <SensoryGame key={selectedExercise?.id || "sensory"} exercise={selectedExercise?.module === "sensory" ? selectedExercise : exercises.find((item) => item.module === "sensory")} soundEnabled={settings.sound_enabled} onBack={() => sessionExerciseActive && activeSession ? setScreen("session") : openScreen("games")} onComplete={(score, exerciseId, measurement, details) => saveSession(exerciseId, "sensory", score, { rounds: 5, ...details }, measurement)} />}
          {screen === "aac" && <PhraseGame key="free-aac" childId={child?.id} canManage={user.role === "parent"} freeMode soundEnabled={settings.sound_enabled} onBack={() => openScreen("home")} />}
          {screen === "ai" && user.role === "parent" && <AIParentScreen child={child} consent={consent} onOpenConsent={() => openScreen("parent")} />}
          {screen === "mixed" && <PhraseGame key={selectedExercise?.id || "mixed"} childId={child?.id} canManage={user.role === "parent"} exercise={selectedExercise?.module === "mixed" ? selectedExercise : exercises.find((item) => item.module === "mixed")} soundEnabled={settings.sound_enabled} onBack={() => sessionExerciseActive && activeSession ? setScreen("session") : openScreen("games")} onComplete={(score, phrase, exerciseId, measurement) => saveSession(exerciseId, "mixed", score, { phrase }, measurement)} />}
          {screen === "progress" && <ProgressScreen childId={child?.id} dashboard={dashboard} />}
          {screen === "parent" && <ParentScreen child={child} childProfiles={children} onSelectChild={setSelectedChildId} onDeleted={(id) => { const remaining = children.filter((item) => item.id !== id); setChildren(remaining); setSelectedChildId(remaining[0]?.id || null); setScreen("home"); }} dashboard={dashboard} onConsentChange={setConsent} />}
          {screen === "profile" && <ProfileScreen user={user} child={child} dashboard={dashboard} settings={settings} onOpen={openScreen} onLogout={onLogout}/>}
          {screen === "admin" && <AdminScreen />}
          {screen === "settings" && <SettingsScreen settings={settings} onChange={changeSettings} onLogout={onLogout} />}
        </div>
      </main>
      {reward && <RewardCelebration key={reward.nonce} stars={reward.stars} />}
    </div>
  );
}

function RewardCelebration({ stars }: { stars: number }) {
  return <div className="reward-layer" role="status" aria-live="polite"><div className="reward-card"><div className="reward-star">★</div><strong>+{stars} {stars === 1 ? "звезда" : stars < 5 ? "звезды" : "звёзд"}</strong><span>Игровая попытка сохранена</span></div>{[0,1,2,3,4,5,6,7].map((item) => <i key={item} style={{ "--reward-index": item } as React.CSSProperties}>★</i>)}</div>;
}

function ChildOnboarding({ user, onCreated, onLogout }: { user: User; onCreated: (child: Child) => void; onLogout: () => void }) {
  const [name, setName] = useState(""); const [birthDate, setBirthDate] = useState(""); const [module, setModule] = useState<ModuleName>("mixed"); const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setError(""); try { const child = await api<Child>("/api/children", { method: "POST", body: JSON.stringify({ name, birth_date: birthDate, primary_module: module, avatar_color: "#f07d68" }) }); onCreated(child); } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось создать профиль"); } };
  return <div className="onboarding-page"><div className="onboarding-card"><div className="brand"><div className="brand-mark"><BrandIcon /></div><div><strong>Söyle</strong><span>первичная настройка</span></div></div><span className="kicker">ДОБРО ПОЖАЛОВАТЬ, {user.full_name.toUpperCase()}</span><h1>Создадим профиль ребёнка</h1><p>Это поможет сохранять историю практики и готовить короткие планы с Söyle AI.</p><form onSubmit={submit}><label>Имя ребёнка<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Алихан" required minLength={2}/></label><label>Дата рождения<input type="date" max={new Date().toISOString().slice(0,10)} value={birthDate} onChange={(e) => setBirthDate(e.target.value)} required/></label><label>Стартовое направление<select value={module} onChange={(e) => setModule(e.target.value as ModuleName)}><option value="sensory">Игровые задания на слух</option><option value="mixed">AAC-коммуникация и смешанная практика</option></select></label>{error && <div className="auth-error">{error}</div>}<button className="primary-button">Создать профиль <ChevronRight size={18}/></button></form><button className="auth-switch" onClick={onLogout}>Выйти из аккаунта</button></div></div>;
}

function roleLabel(role: Role) {
  return { admin: "Администратор", parent: "Родитель", student: "Ученик" }[role];
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "register" | "student">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(""); setLoading(true);
    try {
      const endpoint = mode === "student" ? "student-login" : mode === "login" ? "login" : "register";
      const payload = mode === "student" ? { username, pin: password } : mode === "login" ? { username, password } : { username, password, full_name: name };
      const result = await api<{ user: User }>(`/api/auth/${endpoint}`, {
        method: "POST", body: JSON.stringify(payload),
      });
      clearLegacyAuth(); onAuthenticated(result.user);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Ошибка авторизации"); }
    finally { setLoading(false); }
  };

  const heading = mode === "student" ? "Вход для ребёнка" : mode === "login" ? "Вход в аккаунт" : "Регистрация родителя";
  const switchMode = (next: "login" | "register" | "student") => { setMode(next); setUsername(""); setPassword(""); setError(""); setShowPassword(false); };
  return <div className="auth-page">
    <div className="auth-visual">
      <div className="auth-brand"><div className="brand-mark"><BrandIcon /></div><strong>Söyle</strong></div>
      <div className="auth-copy"><span className="pill"><ShieldCheck size={15}/> Спокойная ежедневная практика</span><h1>Помогаем ребёнку<br/><em>понимать и общаться</em></h1><p>Короткие игровые задания на слуховое различение и поддерживаемую коммуникацию.</p><div className="auth-benefits"><span><Check/> Пошаговая программа</span><span><Check/> История практики</span><span><Check/> Отдельный вход ребёнка</span></div></div>
      <div className="auth-orbs"><i><Bot/></i><i><ModuleGlyph module="sensory"/></i><i><ModuleGlyph module="mixed"/></i></div>
    </div>
    <div className="auth-form-wrap"><Link href="/" className="auth-back-home"><ArrowLeft size={17}/> На главную</Link><form className="auth-card" onSubmit={submit}>
      <div className="auth-role-tabs" aria-label="Тип входа"><button type="button" className={mode !== "student" ? "active" : ""} onClick={() => switchMode("login")}><UserRoundCheck size={18}/> Взрослый</button><button type="button" className={mode === "student" ? "active" : ""} onClick={() => switchMode("student")}><Backpack size={18}/> Ребёнок</button></div>
      <span className="kicker">{mode === "register" ? "НОВЫЙ АККАУНТ" : "ДОБРО ПОЖАЛОВАТЬ"}</span><h2>{heading}</h2><p>{mode === "student" ? "Введите логин и цифровой PIN, которые выдал родитель." : mode === "login" ? "Продолжите занятия или посмотрите историю практики ребёнка." : "После регистрации вы создадите профиль ребёнка и выберете направление занятий."}</p>
      {mode === "register" && <label>Ваше имя<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Айгерим" autoComplete="name" required minLength={2}/></label>}
      <label>{mode === "student" ? "Логин ребёнка" : "Логин"}<span className="auth-input"><UserRound size={17}/><input type="text" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value.replace(/[^A-Za-z0-9_.-]/g, ""))} placeholder={mode === "student" ? "Логин от родителя" : "Латинские буквы и цифры"} pattern="[A-Za-z0-9_.-]+" required minLength={3}/></span>{mode === "register" && <small>Не менее 3 символов: латинские буквы, цифры, точка, дефис или подчёркивание.</small>}</label>
      <label>{mode === "student" ? "PIN-код" : "Пароль"}<span className="auth-input"><KeyRound size={17}/><input type={showPassword ? "text" : "password"} autoComplete={mode === "register" ? "new-password" : "current-password"} inputMode={mode === "student" ? "numeric" : undefined} value={password} onChange={(e) => setPassword(mode === "student" ? e.target.value.replace(/\D/g, "") : e.target.value)} placeholder={mode === "student" ? "4–12 цифр" : "Введите пароль"} required minLength={mode === "register" ? 8 : mode === "student" ? 4 : 6} maxLength={mode === "student" ? 12 : undefined}/><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></span>{mode === "register" && <small>Не менее 8 символов.</small>}</label>
      {error && <div className="auth-error" role="alert"><CircleHelp size={17}/><span>{error}</span></div>}
      <button className="primary-button auth-submit" disabled={loading}>{loading ? "Подождите…" : mode === "register" ? "Создать аккаунт" : mode === "student" ? "Начать заниматься" : "Войти"}<ChevronRight size={18}/></button>
      {mode !== "student" && <div className="auth-secondary">{mode === "login" ? "Впервые в Söyle?" : "Уже зарегистрированы?"}<button type="button" onClick={() => switchMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "Создать аккаунт родителя" : "Войти"}</button></div>}
      {mode === "student" && <div className="student-help"><ShieldCheck size={17}/><span>Логин и PIN ребёнка создаются в кабинете родителя. Электронная почта не нужна.</span></div>}
    </form></div>
  </div>;
}

function HomeScreen({ onOpen, onStartSession, onResume, activeSession, activeSessionLoading, dailyMinutes, onMinutesChange, sessionLoading, sessionError, child, dashboard, consent, userRole }: { onOpen: (screen: Screen) => void; onStartSession: () => void; onResume: () => void; activeSession: LearningSession | null; activeSessionLoading: boolean; dailyMinutes: 3 | 5 | 10; onMinutesChange: (value: 3 | 5 | 10) => void; sessionLoading: boolean; sessionError: string; child?: Child; dashboard: Dashboard | null; consent: ChildConsent | null; userRole: Role }) {
  const today = new Date();
  const month = today.toLocaleDateString("ru-RU", { month: "short" }).replace(".", "").toUpperCase();
  return (
    <div className="stack-xl page-enter">
      {!consent?.privacy_accepted && <section className="consent-banner" role="status">
        <ShieldAlert size={24}/>
        <div><strong>{userRole === "parent" ? "Сохранение программы и результатов выключено" : "Попроси взрослого включить сохранение"}</strong><p>{userRole === "parent" ? "Разрешения включаются отдельно и только вами в кабинете родителя." : "Задания можно посмотреть, но результат пока не сохранится."}</p></div>
        {userRole === "parent" && <button className="secondary-button" onClick={() => onOpen("parent")}>Открыть согласия</button>}
      </section>}
      <div className="home-overview">
        <section className="hero">
          <div className="hero-copy">
            <div className="pill"><Sparkles size={15} /> Привет, {child?.name || "друг"}!</div>
            <h1>Готов к новому<br /><em>приключению?</em></h1>
            <p>Выбери удобное время и начни короткое занятие. Мы покажем каждый шаг по очереди.</p>
            <div className="duration-picker" aria-label="Продолжительность занятия">{([3,5,10] as const).map((value) => <button key={value} className={dailyMinutes === value ? "active" : ""} aria-pressed={dailyMinutes === value} onClick={() => onMinutesChange(value)}>{value} мин</button>)}</div>
            {activeSession && activeSession.status !== "completed" ? <button className="primary-button hero-primary" onClick={onResume} disabled={!consent?.privacy_accepted}><Play size={18} fill="currentColor" /> {consent?.privacy_accepted ? "Продолжить занятие" : "Сначала включите сохранение"}</button> : <button className="primary-button hero-primary" onClick={onStartSession} disabled={sessionLoading || activeSessionLoading}><Play size={18} fill="currentColor" /> {activeSessionLoading ? "Восстанавливаем занятие…" : sessionLoading ? "Готовим занятие…" : "Начать занятие"}</button>}
            {sessionError && <div className="inline-error" role="alert">{sessionError}</div>}
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="mascot"><Image src="/illustrations/mascot-parrot.png" alt="" width={360} height={360} priority /></div>
          </div>
        </section>

        <aside className="daily-panel" aria-label="Цель на сегодня">
          <div className="daily-panel-head"><span className="daily-icon"><Target size={21}/></span><div><small>ЦЕЛЬ НА СЕГОДНЯ</small><strong>Маленький шаг</strong></div></div>
          <div className="daily-progress-ring" style={{"--daily-progress": `${Math.min((dashboard?.today_sessions || 0) / 3 * 100, 100)}%`} as React.CSSProperties}>
            <span><b>{Math.min(dashboard?.today_sessions || 0, 3)}</b><small>из 3</small></span>
          </div>
          <p>{(dashboard?.today_sessions || 0) >= 3 ? "Цель выполнена — здорово!" : "Выполни три коротких задания в удобном темпе."}</p>
          <div className="daily-streak"><Flame size={18}/><span><b>{dashboard?.streak_days || 0} дней</b><small>серия занятий</small></span></div>
          <div className="week-dots" aria-label={`${dashboard?.week_sessions || 0} занятий на этой неделе`}>{[0,1,2,3,4,5,6].map((day) => <i key={day} className={day < Math.min(dashboard?.week_sessions || 0, 7) ? "done" : ""}>{day < Math.min(dashboard?.week_sessions || 0, 7) ? <Check size={13}/> : null}</i>)}</div>
        </aside>
      </div>

      <section>
        <div className="section-heading"><div><span className="kicker">МОЙ ПЛАН</span><h2>Выбери, что хочется</h2></div><button className="text-button" onClick={() => onOpen("games")}>Все занятия <ChevronRight size={17} /></button></div>
        <div className="module-grid">
          {modules.map((module, index) => <ModuleCard key={module.id} module={{...module, progress: dashboard?.module_completion[module.id] || 0}} completed={dashboard?.module_completed[module.id] || 0} total={dashboard?.active_exercises[module.id] || 0} onClick={() => onOpen(module.id)} index={index + 1} />)}
        </div>
      </section>

      <section className="recommended-today"><div className="recommend-icon"><Bot/></div><div><span className="kicker">{userRole === "student" ? "ПЛАН НА СЕГОДНЯ" : "SÖYLE AI"}</span><h3>{userRole === "student" ? "Задания идут по порядку" : "Короткий план под текущий темп"}</h3><p>{userRole === "student" ? "План состоит из спокойных игровых заданий и фраз для общения." : "AI выбирает только из проверенной библиотеки, не ставит диагноз и не добавляет моторные упражнения."}</p></div><button className="secondary-button" onClick={onStartSession}>{userRole === "student" ? "Посмотреть план" : "Собрать план"} <ChevronRight size={17}/></button></section>

      {userRole !== "student" && <section className="today-row">
        <div className="today-card">
          <div className="calendar-tile"><span>{month}</span><strong>{today.getDate()}</strong></div>
          <div><span className="kicker">СЕГОДНЯ</span><h3>Ты уже позанимался {dashboard?.today_minutes || 0} минут</h3><p>За неделю: {dashboard?.week_sessions || 0} занятий и {dashboard?.week_minutes || 0} минут практики.</p></div>
          <div className="goal-ring"><span>{Math.min(dashboard?.today_sessions || 0, 3)}/3</span></div>
        </div>
        <div className="privacy-card"><ShieldCheck size={26} /><div><strong>Безопасно для ребёнка</strong><span>Видео с камеры не анализируется, не отправляется и не сохраняется</span></div></div>
      </section>}
    </div>
  );
}

function SessionScreen({ session, onContinue, onPause, onFinish }: { session: LearningSession; onContinue: () => void; onPause: () => void; onFinish: () => void }) {
  const complete = session.current_index >= session.exercises.length || session.status === "completed";
  const results = session.results || [];
  const scoredResults = results.filter((item) => !item.attempt_status || item.attempt_status === "completed");
  const average = scoredResults.length ? Math.round(scoredResults.reduce((sum, item) => sum + item.score, 0) / scoredResults.length) : null;
  const totalMinutes = Math.max(1, Math.round(results.reduce((sum, item) => sum + item.duration_seconds, 0) / 60));
  if (complete) return <div className="page-enter session-complete"><div className="completion-mascot"><Image src="/illustrations/mascot-parrot-headphones.png" alt="Попугай Söyle празднует завершение занятия" width={190} height={260}/></div><span className="kicker">ЗАНЯТИЕ ЗАВЕРШЕНО</span><h1>Отличная работа!</h1><p>Результаты сохранены в профиле. Это показатели игровых заданий, а не медицинская оценка.</p><div className="session-summary"><StatCard icon={<Check/>} value={`${results.length}/${session.exercises.length}`} label="заданий выполнено"/><StatCard icon={<Target/>} value={average === null ? "без оценки" : `${average}%`} label="средний игровой результат"/><StatCard icon={<Timer/>} value={`${totalMinutes} мин`} label="время занятия"/></div><button className="primary-button" onClick={onFinish}>Вернуться на главную <ChevronRight size={18}/></button></div>;
  return <div className="page-enter stack-xl"><PageTitle eyebrow="СЕГОДНЯШНЕЕ ЗАНЯТИЕ" title="Короткая практика шаг за шагом" subtitle="Перед сменой активности посмотри, что будет дальше. Пауза сохранит занятие."/><section className="session-mode"><div className="session-progress-head"><div><strong>{session.current_index} из {session.exercises.length} выполнено</strong><span>Осталось примерно {Math.max(1, Math.round(session.target_minutes * (session.exercises.length - session.current_index) / session.exercises.length))} минут</span></div><b>{Math.round(session.current_index / session.exercises.length * 100)}%</b></div><div className="session-progress-track"><i style={{width:`${session.current_index / session.exercises.length * 100}%`}}/></div><div className="activity-warning"><Sparkles size={18}/><span>Сейчас: <b>{session.exercises[session.current_index]?.title}</b>{session.exercises[session.current_index + 1] ? ` · затем ${session.exercises[session.current_index + 1].title}` : " · это последнее задание"}</span></div><div className="session-steps">{session.exercises.map((exercise, index) => { const done = index < session.current_index; const current = index === session.current_index; return <div key={exercise.id} className={`${done ? "done" : ""} ${current ? "current" : ""}`}><span>{done ? <Check size={20}/> : index + 1}</span><div><small>{exercise.skill ? skillLabel(exercise.skill) : "Практика"}</small><strong>{exercise.title}</strong><p>{exercise.instruction}</p></div>{current ? <Play size={20}/> : done ? <Star size={18} fill="currentColor"/> : <LockKeyhole size={18}/>}</div>; })}</div><div className="session-actions"><button className="small-button" onClick={onPause}>Сделать паузу</button><button className="primary-button session-continue" onClick={onContinue}><Play size={18} fill="currentColor"/>{session.current_index ? "Продолжить занятие" : "Начать с разминки"}</button></div></section></div>;
}

function ExerciseCompletionScreen({ completion, onContinue, onFinish }: { completion: ExerciseCompletion; onContinue: () => void; onFinish: () => void }) {
  const nextLabel = completion.sessionFinished
    ? "Посмотреть итог занятия"
    : completion.nextExercise
      ? `Дальше: ${completion.nextExercise.title}`
      : "Вернуться к занятиям";
  return <div className="page-enter exercise-completion" role="status" aria-live="polite">
    <div className="completion-check"><Check size={42} strokeWidth={2.2}/></div>
    <span className="kicker">ШАГ ВЫПОЛНЕН</span>
    <h1>{completion.title}</h1>
    <p>{completion.message}</p>
    {completion.nextExercise && !completion.sessionFinished && <div className="next-activity-preview"><span>СЛЕДУЮЩЕЕ ЗАДАНИЕ</span><strong>{completion.nextExercise.title}</strong><small>{completion.nextExercise.instruction}</small></div>}
    <div className="completion-actions">
      <button className="primary-button" onClick={onContinue}>{nextLabel}<ChevronRight size={18}/></button>
      {!completion.sessionFinished && <button className="secondary-button" onClick={onFinish}>{completion.sessionMode ? "Вернуться к плану" : "Закончить практику"}</button>}
    </div>
  </div>;
}

function skillLabel(skill: Exercise["skill"] | SkillProgress["skill"]) {
  return { articulation: "Артикуляция", vocabulary: "Словарный запас", speech_comprehension: "Понимание речи", word_repetition: "Повторение слов", phrase_building: "Построение фраз", communication: "Коммуникация" }[skill || "communication"];
}

function ModuleCard({ module, onClick, index, completed, total }: { module: typeof modules[number]; onClick: () => void; index: number; completed?: number; total?: number }) {
  return (
    <button className={`module-card ${module.accent}`} onClick={onClick}>
      <div className="module-top"><span className="module-number">0{index}</span><span className="module-time">{module.time}</span></div>
      <div className="module-icon"><ModuleGlyph module={module.id}/></div>
      <span className="module-eyebrow">{module.eyebrow}</span>
      <h3>{module.title}</h3>
      <p>{module.description}</p>
      <div className="module-progress"><span style={{ width: `${module.progress}%` }} /></div>
      <div className="module-bottom"><small>Пройдено {module.progress}%{total ? ` · ${Math.min(completed || 0, total)} из ${total}` : ""}</small><span className="round-arrow"><ChevronRight size={18} /></span></div>
    </button>
  );
}

const courseUnits = [
  { id: "intro", number: "ВВОДНЫЙ КУРС", title: "Я могу сообщить о важном", description: "Помощь, отказ и выбор", color: "coral", targets: ["help", "refusal", "choice"] },
  { id: "food", number: "МОДУЛЬ 1", title: "Еда и продукты", description: "Слушаем названия и просим желаемое", color: "mint", targets: ["food", "request"] },
  { id: "home", number: "МОДУЛЬ 2", title: "Я и мой дом", description: "Животные и короткие комментарии", color: "blue", targets: ["observation", "animals"] },
  { id: "play", number: "МОДУЛЬ 3", title: "Игра", description: "Слушаем и находим знакомые игрушки", color: "lavender", targets: ["toys"] },
  { id: "actions", number: "МОДУЛЬ 4", title: "Действия и мой день", description: "Знакомые действия и события", color: "coral", targets: ["routine", "past_event"] },
  { id: "feelings", number: "МОДУЛЬ 5", title: "Диалог и состояние", description: "Состояния, ответы и вопросы", color: "mint", targets: ["feelings", "answer", "question"] },
] as const;

function GamesScreen({ onOpen, onExercise, dashboard, exercises, childMode }: { onOpen: (screen: Screen) => void; onExercise: (exercise: Exercise) => void; dashboard: Dashboard | null; exercises: Exercise[]; childMode: boolean }) {
  return (
    <div className="page-enter stack-xl">
      <PageTitle eyebrow="ИГРОВАЯ КОМНАТА" title="Выбери приключение" subtitle="Каждая игра развивает отдельный навык. Занимайся понемногу, но регулярно." />
      <LearningPath exercises={exercises} completedIds={dashboard?.completed_exercise_ids || []} onExercise={onExercise} />
      {!childMode && <><div className="section-heading"><div><span className="kicker">СВОБОДНАЯ ПРАКТИКА</span><h2>Тренировка по направлениям</h2></div></div>
      <div className="module-grid large">{modules.map((m, i) => <ModuleCard key={m.id} module={{...m, progress: dashboard?.module_completion[m.id] || 0}} completed={dashboard?.module_completed[m.id] || 0} total={dashboard?.active_exercises[m.id] || 0} index={i + 1} onClick={() => onOpen(m.id)} />)}</div>
      <ExerciseLibrary items={exercises} onExercise={onExercise} /></>}
      <div className="tip-banner"><div className="tip-icon"><Sparkles/></div><div><strong>Подсказка для взрослых</strong><p>Одного занятия по 5–10 минут достаточно. Заканчивайте игру, пока ребёнку ещё интересно.</p></div></div>
    </div>
  );
}

function LearningPath({ exercises, completedIds, onExercise }: { exercises: Exercise[]; completedIds: number[]; onExercise: (exercise: Exercise) => void }) {
  const completed = new Set(completedIds);
  return <section className="learning-path"><div className="path-heading"><div><span className="kicker">ПОШАГОВЫЙ КУРС</span><h2>Путь к самостоятельному общению</h2><p>Начните с жизненно важных фраз, затем двигайтесь по знакомым темам.</p></div><div className="path-total"><strong>{completedIds.length}</strong><span>уроков пройдено</span></div></div><div className="course-units">{courseUnits.map((unit) => {
    const lessons = unit.targets.map((target) => exercises.find((item) => item.target === target)).filter((item): item is Exercise => Boolean(item));
    const unitComplete = lessons.length > 0 && lessons.every((lesson) => completed.has(lesson.id));
    const unitUnlocked = true;
    return <article className={`course-unit ${unit.color} ${unitUnlocked ? "unlocked" : "locked"}`} key={unit.id}><div className="unit-summary"><span>{unit.number}</span><h3>{unit.title}</h3><p>{unit.description}</p><div className="unit-progress"><i style={{width:`${lessons.length ? Math.round(lessons.filter((lesson) => completed.has(lesson.id)).length / lessons.length * 100) : 0}%`}}/></div><small>{lessons.filter((lesson) => completed.has(lesson.id)).length} из {lessons.length} уроков</small></div><div className="lesson-steps">{lessons.map((lesson, index) => {
      const done = completed.has(lesson.id);
      const unlocked = unitUnlocked && (done || index === 0 || lessons.slice(0, index).every((previousLesson) => completed.has(previousLesson.id)));
      return <button key={lesson.id} disabled={!unlocked} className={`${done ? "done" : ""} ${unlocked ? "available" : ""}`} onClick={() => onExercise(lesson)}><span>{done ? <Check size={21}/> : unlocked ? index + 1 : <LockKeyhole size={18}/>}</span><div><strong>{lesson.title}</strong><small>{done ? "Урок пройден — можно повторить" : lesson.instruction}</small></div><ChevronRight size={18}/></button>;
    })}</div>{unitComplete && <div className="unit-complete"><Trophy size={18}/> Модуль завершён</div>}</article>;
  })}</div></section>;
}

function ExerciseLibrary({ items, onExercise }: { items: Exercise[]; onExercise: (exercise: Exercise) => void }) {
  const [filter, setFilter] = useState<"all" | ModuleName>("all");
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase("ru");
  const filtered = items.filter((item) => (filter === "all" || item.module === filter) && (!normalizedQuery || `${item.title} ${item.instruction}`.toLocaleLowerCase("ru").includes(normalizedQuery)));
  const labels = { motor: "Артикуляция", sensory: "Понимание", mixed: "Фразы" };
  return <section className="exercise-library"><div className="section-heading"><div><span className="kicker">БИБЛИОТЕКА</span><h2>Все задания</h2></div><div className="library-controls"><label className="exercise-search"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти задание" aria-label="Найти задание"/></label><div className="filter-tabs">{(["all","sensory","mixed"] as const).map((value) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value === "all" ? "Все" : labels[value]}</button>)}</div></div></div><div className="exercise-grid">{filtered.map((exercise) => <button key={exercise.id} className={`exercise-card ${exercise.module}`} onClick={() => onExercise(exercise)}><span className="exercise-emoji"><ModuleGlyph module={exercise.module} size={24}/></span><div><small>{labels[exercise.module]} · уровень {exercise.difficulty}</small><strong>{exercise.title}</strong><p>{exercise.instruction}</p></div><ChevronRight size={18}/></button>)}</div>{!filtered.length && <div className="empty-state large"><Search size={28}/><strong>Ничего не найдено</strong><span>Измените запрос или выберите другой раздел.</span></div>}</section>;
}

function PageTitle({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return <div className="page-title"><span className="kicker">{eyebrow}</span><h1>{title}</h1><p>{subtitle}</p></div>;
}

function GameHeader({ title, subtitle, step, onBack }: { title: string; subtitle: string; step: string; onBack: () => void }) {
  return (
    <div className="game-header">
      <button className="back-button" onClick={onBack} aria-label="Назад к занятиям"><ArrowLeft size={20} /></button>
      <div><span>{subtitle}</span><h2>{title}</h2></div>
      <div className="step-pill">{step}</div>
    </div>
  );
}

const motorExercises = [
  { id: "smile", title: "Сделай широкую улыбку", text: "Улыбнись широко и удерживай движение 3 секунды." },
  { id: "tube", title: "Сложи губы трубочкой", text: "Вытяни губы вперёд, будто хочешь задуть свечу." },
  { id: "open", title: "Открой окошко", text: "Плавно открой рот и удерживай нижнюю челюсть спокойно." },
  { id: "teeth", title: "Покажи заборчик", text: "Сомкни зубы и покажи их в спокойной улыбке." },
  { id: "cheeks", title: "Надуй воздушный шар", text: "Надуй обе щёки и удерживай воздух 3 секунды." },
  { id: "sequence", title: "Улыбка — трубочка", text: "Сначала широко улыбнись, затем сложи губы трубочкой." },
] as const;
type MotorExercise = typeof motorExercises[number]["id"];

function MouthGuide({ type }: { type: MotorExercise }) {
  if (type === "sequence") return <div className="mouth-sequence" aria-label="Сначала улыбка, затем губы трубочкой"><MouthGuide type="smile"/><ChevronRight/><MouthGuide type="tube"/></div>;
  return <div className={`mouth-guide ${type}`} aria-hidden="true"><i className="guide-eye left"/><i className="guide-eye right"/><span className="guide-mouth">{type === "teeth" && <b><i/><i/><i/><i/></b>}</span>{type === "cheeks" && <><i className="guide-cheek left"/><i className="guide-cheek right"/></>}</div>;
}

function MotorGame({ exercises, initialExercise, cameraEnabled, cameraConsentGranted, onBack, onComplete }: { exercises: Exercise[]; initialExercise: Exercise | null; cameraEnabled: boolean; cameraConsentGranted: boolean; onBack: () => void; onComplete: (score: number, exerciseId: number, measurement: GameMeasurement, details?: Record<string, unknown>) => Promise<unknown> | void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraState, setCameraState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const availableMotorExercises = motorExercises.filter((item) => exercises.some((exercise) => exercise.target === item.id) || initialExercise?.target === item.id);
  const initialIndex = Math.max(0, availableMotorExercises.findIndex((item) => item.id === initialExercise?.target));
  const [exerciseIndex, setExerciseIndex] = useState(initialIndex);
  const [saved, setSaved] = useState<"independent" | "supported" | null>(null);
  const exercise = availableMotorExercises[exerciseIndex] || availableMotorExercises[0];

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const startCamera = async () => {
    if (!cameraEnabled || !cameraConsentGranted) return;
    setCameraState("loading");
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 720, height: 540 }, audio: false });
      streamRef.current = stream;
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCameraState("ready");
    } catch {
      stopCamera();
      setCameraState("error");
    }
  };

  const changeExercise = () => {
    const nextIndex = (exerciseIndex + 1) % Math.max(availableMotorExercises.length, 1);
    setExerciseIndex(nextIndex);
    setSaved(null);
  };

  const finishWithoutScoring = async (support: "independent" | "supported") => {
    const completedExerciseId = exercises.find((item) => item.target === exercise?.id)?.id;
    if (!completedExerciseId || saved) return;
    const result = await onComplete(0, completedExerciseId, {
      attempt_status: "participated",
      independence: support === "independent" ? 100 : 50,
      prompt_level: support === "independent" ? "independent" : "minimal",
    }, { source: cameraState === "ready" ? "local-camera-mirror" : "manual" });
    if (result) setSaved(support);
  };

  const stopExercise = async (status: "break" | "refused") => {
    const completedExerciseId = exercises.find((item) => item.target === exercise?.id)?.id;
    if (!completedExerciseId) return;
    const result = await onComplete(0, completedExerciseId, { attempt_status: status, prompts_used: 0 }, { source: "manual_choice" });
    if (result && status === "break") onBack();
  };

  if (!exercise) return <div className="empty-state large"><ShieldAlert size={28}/><strong>Раздел недоступен</strong><span>Моторные упражнения не входят в текущую версию Söyle.</span><button className="secondary-button" onClick={onBack}>Вернуться к занятиям</button></div>;

  return (
    <div className="page-enter game-page">
      <GameHeader title="Повтори назначенное движение" subtitle="Визуальное зеркало" step={`${exerciseIndex + 1} из ${availableMotorExercises.length}`} onBack={onBack} />
      <div className="game-layout">
        <div className="camera-panel">
          <video ref={videoRef} playsInline muted className={cameraState === "ready" ? "visible" : ""} />
          {cameraState !== "ready" && <div className="camera-placeholder"><div className="face-guide"><UserRound strokeWidth={1.4}/></div><h3>{!cameraConsentGranted ? "Нужно разрешение родителя" : !cameraEnabled ? "Камера отключена в настройках" : cameraState === "loading" ? "Включаем зеркало…" : cameraState === "error" ? "Камеру не удалось запустить" : "Расположи лицо в рамке"}</h3><p>{!cameraConsentGranted ? "Камера не запустится, пока родитель отдельно не разрешит её локальное использование." : cameraEnabled ? "Это обычное локальное зеркало. Видео не анализируется, не отправляется и не сохраняется." : "Включите камеру в настройках, чтобы использовать визуальное зеркало."}</p><button className="primary-button" onClick={startCamera} disabled={cameraState === "loading" || !cameraEnabled || !cameraConsentGranted}><Camera size={19} /> {cameraState === "error" ? "Попробовать ещё раз" : "Включить зеркало"}</button></div>}
          {cameraState === "ready" && <><div className="face-frame" /><div className="camera-label"><span className="live-dot" /> Локальное зеркало включено</div></>}
        </div>
        <div className="instruction-panel">
          <span className="kicker">ТВОЁ ЗАДАНИЕ</span>
          <div className={`mouth-demo ${exercise.id}`}><MouthGuide type={exercise.id}/></div>
          <h2>{exercise.title}</h2>
          <p>{exercise.text}</p>
          <div className="motor-camera-note"><ShieldCheck size={18}/><span>Камера работает только как локальное зеркало. Она не определяет правильность движения и не ставит оценку.</span></div>
          {cameraState === "ready" && <div className="coach-note"><Sparkles size={18} /> Смотри на пример и попробуй в своём темпе. Камера ничего не оценивает.</div>}
          {saved ? <div className="success-box"><Check size={20}/><div><strong>Попытка отмечена</strong><span>Без оценки правильности. Звезда — за участие.</span></div></div> : <div className="motor-finish-actions"><button className="primary-button" onClick={() => finishWithoutScoring("independent")}><Check size={17}/> Я попробовал сам</button><button className="secondary-button" onClick={() => finishWithoutScoring("supported")}>Попробовал с помощью</button><button className="small-button" onClick={() => stopExercise("break")}><Pause size={15}/> Перерыв</button><button className="small-button" onClick={() => stopExercise("refused")}><CircleX size={15}/> Не хочу</button></div>}
          {availableMotorExercises.length > 1 && <button className="secondary-button wide" onClick={changeExercise}>{saved ? "Следующее назначенное движение" : "Другое назначенное движение"}<ChevronRight size={18} /></button>}
        </div>
      </div>
    </div>
  );
}

type SensoryItem = { word: string; hint: string; icon?: LucideIcon; image?: string; visualClass?: string };

const sensorySets: Record<string, SensoryItem[]> = {
  animals: [
    { word: "Кот", hint: "Домашнее животное, которое мяукает", image: "/aac-pictograms/cat.png" },
    { word: "Собака", hint: "Домашнее животное, которое лает", icon: Dog },
    { word: "Рыба", hint: "Она живёт в воде", icon: Fish },
    { word: "Птица", hint: "У неё есть крылья", icon: Bird },
    { word: "Кролик", hint: "У него длинные уши", icon: Rabbit },
    { word: "Черепаха", hint: "У неё есть панцирь", icon: Turtle },
    { word: "Улитка", hint: "Она носит домик на спине", icon: Snail },
    { word: "Жук", hint: "Маленькое насекомое", icon: Bug },
  ],
  food: [
    { word: "Яблоко", hint: "Фрукт круглой формы", image: "/aac-pictograms/apple.png" },
    { word: "Банан", hint: "Длинный жёлтый фрукт", image: "/aac-pictograms/banana.png" },
    { word: "Молоко", hint: "Белый напиток", icon: Milk },
    { word: "Сок", hint: "Фруктовый напиток", image: "/aac-pictograms/juice.png" },
    { word: "Вода", hint: "Прозрачный напиток", image: "/aac-pictograms/water.png" },
    { word: "Суп", hint: "Его едят ложкой", image: "/aac-pictograms/soup.png" },
    { word: "Хлеб", hint: "Его нарезают кусочками", image: "/aac-pictograms/bread.png" },
    { word: "Каша", hint: "Её едят из тарелки", image: "/aac-pictograms/porridge.png" },
  ],
  toys: [
    { word: "Мяч", hint: "Круглая игрушка", image: "/aac-pictograms/ball.png" },
    { word: "Машинка", hint: "Игрушка на колёсах", image: "/aac-pictograms/toy-car.png" },
    { word: "Кубики", hint: "Из них можно строить", icon: Blocks },
    { word: "Кукла", hint: "Игрушка в виде человека", image: "/aac-pictograms/doll.png" },
    { word: "Книга", hint: "В ней рассматривают картинки и читают", image: "/aac-pictograms/book.png" },
    { word: "Пазл", hint: "Картинка из частей", image: "/aac-pictograms/puzzle.png" },
    { word: "Краски", hint: "Ими рисуют", image: "/aac-pictograms/draw.png" },
    { word: "Барабан", hint: "Игрушечный музыкальный инструмент", icon: Drum },
  ],
  body: [
    { word: "Рука", hint: "Ею берут и держат предметы", icon: Hand },
    { word: "Ухо", hint: "Им мы слышим", icon: Ear },
    { word: "Глаз", hint: "Им мы видим", icon: Eye },
  ],
  clothes: [
    { word: "Рубашка", hint: "Её надевают на верхнюю часть тела", icon: Shirt },
    { word: "Рюкзак", hint: "Его носят за спиной", icon: Backpack },
    { word: "Очки", hint: "Их надевают на глаза", icon: Glasses },
  ],
  household: [
    { word: "Кресло", hint: "На нём сидят", icon: Armchair },
    { word: "Лампа", hint: "Она даёт свет", icon: LampDesk },
    { word: "Кровать", hint: "На ней спят", icon: BedDouble },
  ],
  actions: [
    { word: "Спит", hint: "Человек отдыхает в кровати", icon: BedDouble },
    { word: "Ест", hint: "Человек принимает пищу", icon: Utensils },
    { word: "Играет", hint: "Ребёнок занят игрой", icon: Gamepad2 },
  ],
  qualities: [
    { word: "Большой", hint: "Предмет большого размера", icon: Circle, visualClass: "is-large" },
    { word: "Маленький", hint: "Предмет маленького размера", icon: Circle, visualClass: "is-small" },
    { word: "Горячий", hint: "Предмет высокой температуры", icon: Flame },
  ],
  location: [
    { word: "На коробке", hint: "Предмет находится сверху", icon: ArrowUp },
    { word: "В коробке", hint: "Предмет находится внутри", icon: Blocks },
    { word: "Под коробкой", hint: "Предмет находится снизу", icon: ArrowDown },
  ],
  places: [
    { word: "Дом", hint: "Место, где живёт семья", icon: House },
    { word: "Школа", hint: "Место, где учатся", icon: School },
    { word: "Парк", hint: "Место для прогулок", icon: Trees },
  ],
  opposites: [
    { word: "Холодный", hint: "Имеет низкую температуру", icon: Snowflake },
    { word: "Горячий", hint: "Имеет высокую температуру", icon: Flame },
    { word: "Маленький", hint: "Имеет небольшой размер", icon: Circle, visualClass: "is-small" },
  ],
  commands: [
    { word: "Хлопни и подними руки", hint: "Сначала хлопок, затем руки вверх", icon: Hand },
    { word: "Встань и помаши", hint: "Сначала встать, затем помахать рукой", icon: UserRoundCheck },
    { word: "Возьми мяч и положи его", hint: "Два действия с мячом по порядку", icon: Circle },
  ],
};

function SensoryVisual({ item }: { item: SensoryItem }) {
  const Icon = item.icon;
  return <span className={`sensory-visual ${item.visualClass || ""}`} aria-hidden="true">{item.image ? <Image src={item.image} alt="" width={112} height={112}/> : Icon ? <Icon strokeWidth={1.65}/> : null}</span>;
}

let currentSpeechAudio: HTMLAudioElement | null = null;
let currentSpeechUrl = "";
let speechController: AbortController | null = null;
let serverSpeechUnavailable = false;

function stopCurrentSpeech() {
  speechController?.abort();
  speechController = null;
  if (currentSpeechAudio) {
    currentSpeechAudio.pause();
    currentSpeechAudio.currentTime = 0;
  }
  if (currentSpeechUrl) URL.revokeObjectURL(currentSpeechUrl);
  currentSpeechAudio = null;
  currentSpeechUrl = "";
  window.speechSynthesis?.cancel();
}

function speakWithBrowserVoice(text: string, rate: number, language: "ru" | "kk" | "en"): Promise<boolean> {
  if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return Promise.resolve(false);
  const locale = { ru: "ru-RU", kk: "kk-KZ", en: "en-US" }[language];
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = locale;
  utterance.rate = Math.max(0.6, Math.min(1.1, rate));
  utterance.pitch = 1;
  utterance.volume = 0.92;
  const voices = window.speechSynthesis.getVoices();
  utterance.voice = voices.find((voice) => voice.lang.toLowerCase() === locale.toLowerCase())
    || voices.find((voice) => voice.lang.toLowerCase().startsWith(language))
    || null;
  return new Promise((resolve) => {
    utterance.onend = () => resolve(true);
    utterance.onerror = () => resolve(false);
    window.speechSynthesis.speak(utterance);
  });
}

async function speak(text: string, rate = 0.78, enabled = true, language: "ru" | "kk" | "en" = "ru"): Promise<boolean> {
  if (!enabled || typeof window === "undefined") return false;
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return false;
  stopCurrentSpeech();
  speechController = new AbortController();
  if (serverSpeechUnavailable) return speakWithBrowserVoice(cleaned, rate, language);
  try {
    const response = await fetch(`${API_URL}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
      credentials: "include",
      body: JSON.stringify({ text: cleaned, rate, language }),
      signal: speechController.signal,
    });
    if (!response.ok) {
      if (response.status === 404 || response.status >= 500) serverSpeechUnavailable = true;
      return speakWithBrowserVoice(cleaned, rate, language);
    }
    currentSpeechUrl = URL.createObjectURL(await response.blob());
    const audio = new Audio(currentSpeechUrl);
    currentSpeechAudio = audio;
    audio.volume = 0.92;
    const cleanupAudio = () => {
      if (currentSpeechUrl) URL.revokeObjectURL(currentSpeechUrl);
      currentSpeechUrl = "";
      currentSpeechAudio = null;
    };
    audio.onended = cleanupAudio;
    audio.onerror = cleanupAudio;
    await audio.play();
    return true;
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") return false;
    if (currentSpeechUrl) URL.revokeObjectURL(currentSpeechUrl);
    currentSpeechUrl = "";
    currentSpeechAudio = null;
    serverSpeechUnavailable = true;
    return speakWithBrowserVoice(cleaned, rate, language);
  }
}

type SensoryRound = { target: number; options: number[] };

function shuffled<T>(values: T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function createSensoryRound(itemCount: number, previousTarget?: number): SensoryRound {
  const all = Array.from({ length: itemCount }, (_, index) => index);
  const targets = all.filter((index) => index !== previousTarget);
  const target = shuffled(targets.length ? targets : all)[0];
  const distractors = shuffled(all.filter((index) => index !== target)).slice(0, 2);
  return { target, options: shuffled([target, ...distractors]) };
}

function SensoryGame({ exercise, soundEnabled, onBack, onComplete }: { exercise?: Exercise; soundEnabled: boolean; onBack: () => void; onComplete: (score: number, exerciseId: number, measurement: GameMeasurement, details?: Record<string, unknown>) => Promise<unknown> | void }) {
  const items = sensorySets[exercise?.target || "animals"] || sensorySets.animals;
  const [phase, setPhase] = useState<"demo" | "playing" | "resolved" | "technical">(soundEnabled ? "demo" : "technical");
  const [roundData, setRoundData] = useState<SensoryRound | null>(null);
  const [round, setRound] = useState(1);
  const [speechRate, setSpeechRate] = useState(0.78);
  const [audioPlayed, setAudioPlayed] = useState(false);
  const [audioPending, setAudioPending] = useState(false);
  const [attemptsThisRound, setAttemptsThisRound] = useState(0);
  const [wrongChoices, setWrongChoices] = useState<number[]>([]);
  const [reducedOptions, setReducedOptions] = useState<number[] | null>(null);
  const [roundCorrect, setRoundCorrect] = useState(false);
  const [feedback, setFeedback] = useState("");
  const correctAnswersRef = useRef(0);
  const independentAnswersRef = useRef(0);
  const promptsUsedRef = useRef(0);
  const promptLevelRef = useRef<0 | 1 | 2>(0);
  const promptTypesRef = useRef<string[]>([]);

  const playWord = async (target = roundData?.target) => {
    if (target === undefined || audioPending) return;
    setAudioPending(true);
    const played = await speak(items[target].word, speechRate, soundEnabled);
    setAudioPending(false);
    if (played) setAudioPlayed(true);
    else { setAudioPlayed(false); setPhase("technical"); }
  };

  const beginRound = async (previousTarget?: number) => {
    if (!soundEnabled) { setPhase("technical"); return; }
    const nextRound = createSensoryRound(items.length, previousTarget);
    setRoundData(nextRound);
    setPhase("playing");
    setAudioPlayed(false);
    setAttemptsThisRound(0);
    setWrongChoices([]);
    setReducedOptions(null);
    setRoundCorrect(false);
    setFeedback("");
    setAudioPending(true);
    const played = await speak(items[nextRound.target].word, speechRate, soundEnabled);
    setAudioPending(false);
    if (played) setAudioPlayed(true);
    else setPhase("technical");
  };

  const choose = (index: number) => {
    if (!roundData || phase !== "playing" || !audioPlayed) return;
    const attempt = attemptsThisRound + 1;
    setAttemptsThisRound(attempt);
    if (index === roundData.target) {
      correctAnswersRef.current += 1;
      if (attempt === 1) independentAnswersRef.current += 1;
      setRoundCorrect(true);
      setPhase("resolved");
      setFeedback(attempt === 1 ? "Ты нашёл картинку самостоятельно." : "Получилось. Подсказка помогла найти картинку.");
      void speak("Получилось.", 0.9, soundEnabled);
      return;
    }

    const nextWrongChoices = [...new Set([...wrongChoices, index])];
    setWrongChoices(nextWrongChoices);
    promptsUsedRef.current += 1;
    if (attempt === 1) {
      promptLevelRef.current = Math.max(promptLevelRef.current, 1) as 0 | 1 | 2;
      promptTypesRef.current.push("repeat_audio");
      setFeedback("Попробуй ещё. Послушай слово ещё раз.");
      void playWord(roundData.target);
    } else if (attempt === 2) {
      promptLevelRef.current = 2;
      promptTypesRef.current.push("reduced_choice");
      const other = shuffled(roundData.options.filter((value) => value !== roundData.target && !nextWrongChoices.includes(value)))[0]
        ?? roundData.options.find((value) => value !== roundData.target);
      setReducedOptions(other === undefined ? [roundData.target] : shuffled([roundData.target, other]));
      setFeedback("Теперь выбери из двух картинок.");
      void playWord(roundData.target);
    } else {
      promptLevelRef.current = 2;
      promptTypesRef.current.push("model_answer");
      setRoundCorrect(false);
      setPhase("resolved");
      setFeedback(`Посмотрим вместе: это ${items[roundData.target].word.toLowerCase()}.`);
      void speak(`Это ${items[roundData.target].word.toLowerCase()}.`, 0.75, soundEnabled);
    }
  };

  const next = async () => {
    if (!roundData) return;
    if (round === 5) {
      const correctAnswers = correctAnswersRef.current;
      const result = exercise ? await onComplete(Math.round(correctAnswers / 5 * 100), exercise.id, {
        attempts_count: 5,
        correct_answers: correctAnswers,
        prompts_used: promptsUsedRef.current,
        attempt_status: "completed",
        independence: Math.round(independentAnswersRef.current / 5 * 100),
        prompt_level: promptLevelRef.current === 0 ? "independent" : promptLevelRef.current === 1 ? "minimal" : "full",
      }, { prompt_types: promptTypesRef.current }) : null;
      if (exercise && !result) return;
      correctAnswersRef.current = 0;
      independentAnswersRef.current = 0;
      promptsUsedRef.current = 0;
      promptLevelRef.current = 0;
      promptTypesRef.current = [];
      setRound(1);
      setRoundData(null);
      setPhase("demo");
    } else {
      setRound((value) => value + 1);
      void beginRound(roundData.target);
    }
  };

  const recordTechnicalIssue = async () => {
    if (!exercise) return;
    const result = await onComplete(0, exercise.id, { attempts_count: 0, correct_answers: 0, prompts_used: 0, attempt_status: "technical_error" }, { reason: soundEnabled ? "audio_unavailable" : "sound_disabled" });
    if (result) onBack();
  };

  const visibleOptions = reducedOptions || roundData?.options || [];
  return (
    <div className="page-enter game-page">
      <GameHeader title={exercise?.title || "Слушай и находи"} subtitle="Слушаем слово — без чтения" step={phase === "demo" ? "Пример" : `${round} из 5`} onBack={onBack} />
      <div className="listen-card">
        {phase === "demo" ? <div className="sensory-demo"><SensoryVisual item={items[0]}/><span className="kicker">СНАЧАЛА ПОПРОБУЕМ</span><h2>Послушай. Потом покажи картинку.</h2><p>Слово прозвучит вслух. На карточках не будет подписей.</p><button className="primary-button" onClick={() => void beginRound()}>Понятно, начать <ChevronRight size={17}/></button></div> : phase === "technical" ? <div className="sensory-demo technical"><Volume2 size={42}/><span className="kicker">БЕЗ ОЦЕНКИ</span><h2>Звук сейчас недоступен</h2><p>Это задание проверяет понимание услышанного, поэтому без звука результат не считается.</p><button className="primary-button" onClick={recordTechnicalIssue}>Вернуться без оценки</button></div> : <>
          <div className="sound-zone"><button className="sound-button" disabled={audioPending} onClick={() => void playWord()} aria-label="Прослушать слово"><Volume2 size={34} strokeWidth={2} /></button><div><span className="kicker">ПОСЛУШАЙ</span><h2>{audioPending ? "Слово загружается…" : audioPlayed ? "Теперь покажи картинку" : "Нажми и послушай"}</h2><div className="wave"><i /><i /><i /><i /><i /><i /><i /></div><div className="speech-rate" aria-label="Скорость речи">{[{v:.65,l:"Медленно"},{v:.78,l:"Обычно"},{v:1,l:"Быстрее"}].map((item)=><button key={item.v} className={speechRate===item.v?"active":""} aria-pressed={speechRate===item.v} onClick={()=>setSpeechRate(item.v)}>{item.l}</button>)}</div></div><button className="replay" disabled={audioPending} onClick={() => void playWord()}><RotateCcw size={17} /> Повторить</button></div>
          <h3 className="choose-title">Послушай. Покажи картинку.</h3>
          <div className={`picture-options ${reducedOptions ? "reduced" : ""}`}>
            {visibleOptions.map((index) => { const item = items[index]; const isAnswer = roundData?.target === index; const revealed = phase === "resolved"; const optionNumber = visibleOptions.indexOf(index) + 1; return <button key={item.word} disabled={!audioPlayed || phase === "resolved" || (!reducedOptions && wrongChoices.includes(index))} aria-label={revealed ? item.word : `Вариант ${optionNumber}`} onClick={() => choose(index)} className={`${wrongChoices.includes(index) ? "wrong" : ""} ${revealed && isAnswer ? "answer" : ""}`}><SensoryVisual item={item}/>{revealed && <strong>{item.word}</strong>}{revealed && isAnswer && <i><Check size={16}/></i>}</button>; })}
          </div>
          {feedback && <div className={`answer-panel ${phase === "resolved" && roundCorrect ? "good" : "try"}`} role="status" aria-live="polite"><div className="answer-emoji">{phase === "resolved" && roundCorrect ? <Star fill="currentColor"/> : <Sparkles/>}</div><div><strong>{phase === "resolved" ? (roundCorrect ? "Получилось" : "Показываем вместе") : "Можно попробовать ещё"}</strong><span>{feedback}</span></div>{phase === "resolved" && <button className="primary-button" onClick={next}>{round === 5 ? "Завершить" : "Дальше"}<ChevronRight size={17}/></button>}</div>}
          <div className="score-dots" aria-label={`Раунд ${round} из 5`}>{[1,2,3,4,5].map((value) => <span key={value} className={value < round || (value === round && phase === "resolved") ? "filled" : ""}/>)}</div>
        </>}
      </div>
    </div>
  );
}

const aacCategories = [
  { id: "favorites", label: "Главные", icon: Star }, { id: "help", label: "Помощь", icon: HandHelping },
  { id: "wants", label: "Желания", icon: Heart }, { id: "needs", label: "Потребности", icon: Activity },
  { id: "feelings", label: "Чувства", icon: Smile }, { id: "yes_no", label: "Да / Нет", icon: Check },
  { id: "people", label: "Люди", icon: Users }, { id: "food", label: "Еда", icon: Apple },
  { id: "play", label: "Игры", icon: Gamepad2 }, { id: "places", label: "Места", icon: MapPin }, { id: "actions", label: "Действия", icon: Play },
] as const;

const aacIconByLabel: Record<string, LucideIcon> = {
  "Помоги": HandHelping, "Больно": HeartPulse, "Перерыв": Pause, "Не хочу": CircleX,
  "Ещё": Plus, "Хочу": HandHeart, "Пить": GlassWater, "Есть": Utensils, "Туалет": Toilet, "Отдых": Armchair,
  "Я": CircleUserRound, "Мама": Contact, "Папа": UserRoundCheck, "Бабушка": Glasses, "Дедушка": UserRound,
  "Брат": PersonStanding, "Сестра": Baby, "Сок": CupSoda, "Вода": GlassWater, "Чай": Coffee,
  "Яблоко": Apple, "Банан": Banana, "Хлеб": Croissant, "Суп": Soup, "Каша": CookingPot,
  "Мяч": Volleyball, "Машинка": Car, "Кукла": Baby, "Книга": BookOpen, "Пазл": Puzzle, "Кот": Cat,
  "Люблю": HandHeart, "Вижу": Eye, "Иду": PersonStanding, "Играю": Gamepad2, "Рисовать": Paintbrush,
  "Читать": BookOpen, "Спать": BedDouble, "Гулять": Trees, "Играл": Gamepad2, "Гулял": PersonStanding,
  "Да": CircleCheck, "Нет": CircleX, "Весело": Laugh, "Грустно": Frown, "Устал": Meh, "Спокойно": Smile,
  "Злюсь": Angry, "Страшно": ShieldAlert, "Жарко": ThermometerSun, "Холодно": ThermometerSnowflake,
  "Домой": House, "Школа": School, "Площадка": FerrisWheel, "Магазин": ShoppingCart, "Детский сад": Building2,
  "Привет": Hand, "Где?": CircleHelp, "Что это?": CircleHelp, "На столе": TableProperties,
  "В коробке": PackageOpen, "Под стулом": Armchair, "Вчера": Timer,
};

const aacCategoryIcons: Record<string, LucideIcon> = {
  help: HandHelping, wants: Heart, needs: Activity, feelings: Smile, yes_no: Check,
  people: Users, food: Apple, play: Gamepad2, places: MapPin, actions: Play,
};

const aacPictogramByLabel: Record<string, string> = {
  "Помоги": "help", "Больно": "pain", "Перерыв": "break", "Не хочу": "dont-want",
  "Ещё": "more", "Хочу": "want", "Пить": "drink", "Есть": "eat", "Туалет": "toilet", "Отдых": "rest",
  "Я": "me", "Мама": "mother", "Папа": "father", "Бабушка": "grandmother", "Дедушка": "grandfather",
  "Брат": "brother", "Сестра": "sister", "Привет": "hello",
  "Сок": "juice", "Вода": "water", "Чай": "tea", "Яблоко": "apple", "Банан": "banana",
  "Хлеб": "bread", "Суп": "soup", "Каша": "porridge",
  "Мяч": "ball", "Машинка": "toy-car", "Кукла": "doll", "Книга": "book", "Пазл": "puzzle", "Кот": "cat",
  "Да": "yes", "Нет": "no", "Весело": "happy", "Грустно": "sad", "Устал": "tired", "Спокойно": "calm",
  "Злюсь": "angry", "Страшно": "scared", "Жарко": "hot", "Холодно": "cold",
  "Люблю": "love", "Вижу": "see", "Иду": "go", "Играю": "play", "Рисовать": "draw", "Читать": "read",
  "Спать": "sleep", "Гулять": "walk", "Что это?": "what-is-this", "Вчера": "yesterday", "Играл": "played", "Гулял": "walked",
  "Домой": "home", "Школа": "school", "Площадка": "playground", "Где?": "where", "На столе": "on-table",
  "В коробке": "in-box", "Под стулом": "under-chair", "Магазин": "shop", "Детский сад": "kindergarten",
};

function AACVisual({ card, compact = false }: { card: AACCard; compact?: boolean }) {
  const pictogram = aacPictogramByLabel[card.label];
  const Icon = aacIconByLabel[card.label] || aacCategoryIcons[card.category] || MessageCircle;
  const relation = card.label === "На столе" ? "above" : card.label === "В коробке" ? "inside" : card.label === "Под стулом" ? "below" : "";
  const past = ["Вчера", "Играл", "Гулял"].includes(card.label);
  return <span className={`aac-visual aac-${card.category} ${!pictogram && relation ? `relation-${relation}` : ""} ${compact ? "compact" : ""}`} data-label={card.label} aria-hidden="true">{pictogram ? <Image className="aac-pictogram-image" src={`/aac-pictograms/${pictogram}.png`} alt="" width={128} height={128}/> : <><Icon strokeWidth={1.75}/>{relation && <i className="aac-relation-dot"/>}{past && <i className="aac-past-mark"/>}</>}</span>;
}

const aacScenarios: Record<string, { title: string; situation: string; criterion: string; labels: string[] }> = {
  request: { title: "Попросить предмет", situation: "Выбери то, что хочешь попросить.", criterion: "Засчитывается любое понятное сообщение: одна карточка или короткая фраза.", labels: ["Хочу", "Сок", "Вода", "Мяч", "Книга"] },
  choice: { title: "Сделать выбор", situation: "Что ты выбираешь: сок или воду?", criterion: "Любой из двух вариантов считается самостоятельным выбором.", labels: ["Сок", "Вода"] },
  refusal: { title: "Отказаться", situation: "Можно сказать «нет» или «не хочу».", criterion: "Отказ принимается сразу и не считается ошибкой.", labels: ["Нет", "Не хочу"] },
  feelings: { title: "Сообщить о состоянии", situation: "Выбери карточку, которая помогает сообщить о состоянии.", criterion: "Фиксируется инициатива общения, а не истинность или правильность чувства.", labels: ["Больно", "Устал", "Весело", "Грустно", "Спокойно", "Злюсь", "Страшно"] },
  help: { title: "Попросить помощь", situation: "Используй карточку, чтобы попросить о помощи.", criterion: "Одной карточки «Помоги» достаточно.", labels: ["Помоги"] },
  answer: { title: "Ответить", situation: "Хочешь продолжить? Ответь «да» или «нет».", criterion: "Оценивается факт ответа, а не выбранный вариант.", labels: ["Да", "Нет"] },
  observation: { title: "Прокомментировать", situation: "Выбери, кого или что ты видишь, и при желании добавь действие.", criterion: "Короткий комментарий считается полноценным.", labels: ["Я", "Мама", "Папа", "Кот", "Вижу", "Играю"] },
  past_event: { title: "Сообщить о событии", situation: "Собери короткое сообщение о знакомом событии.", criterion: "Принимается сообщение без проверки фактической истинности.", labels: ["Я", "Вчера", "Играл", "Гулял", "Мяч"] },
  question: { title: "Задать вопрос", situation: "Выбери готовый вопрос.", criterion: "Одна вопросительная карточка завершает сценарий.", labels: ["Что это?", "Где?"] },
  routine: { title: "Рассказать о дне", situation: "Выбери одно знакомое действие дня.", criterion: "Одна карточка действия уже является сообщением.", labels: ["Есть", "Пить", "Играю", "Гулять", "Читать", "Спать"] },
};

function isAACScenarioSuccess(target: string | undefined, labels: string[]) {
  const expected: Record<string, string[]> = {
    request: ["Хочу", "Сок", "Вода", "Мяч", "Книга"],
    choice: ["Сок", "Вода"],
    refusal: ["Нет", "Не хочу"],
    feelings: ["Больно", "Устал", "Весело", "Грустно", "Спокойно", "Злюсь", "Страшно"],
    help: ["Помоги"],
    answer: ["Да", "Нет"],
    observation: ["Я", "Мама", "Папа", "Кот", "Вижу", "Играю"],
    past_event: ["Играл", "Гулял"],
    question: ["Что это?", "Где?"],
    routine: ["Есть", "Пить", "Играю", "Гулять", "Читать", "Спать"],
  };
  return Boolean(target && labels.some((label) => expected[target]?.includes(label)));
}

function PhraseGame({ childId, canManage, exercise, freeMode = false, soundEnabled, onBack, onComplete }: { childId?: number; canManage: boolean; exercise?: Exercise; freeMode?: boolean; soundEnabled: boolean; onBack: () => void; onComplete?: (score: number, phrase: string, exerciseId: number, measurement: GameMeasurement) => Promise<unknown> | void }) {
  const [cards, setCards] = useState<AACCard[]>([]);
  const [selected, setSelected] = useState<AACCard[]>([]);
  const [category, setCategory] = useState<string>(() => ({
    help: "help", refusal: "yes_no", need: "needs", desire: "wants", request: "wants", preference: "food", choice: "food",
    feelings: "feelings", answer: "yes_no", family: "people", greeting: "people", observation: "actions", agent_action: "actions",
    routine: "actions", past_event: "actions", spatial_phrase: "places", question: "places",
  }[exercise?.target || ""] || "favorites"));
  const [history, setHistory] = useState<Array<{ id: number; phrase: string }>>([]);
  const [cardQuery, setCardQuery] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState({ label: "", speech: "", category: "needs" });
  const [aacNotice, setAacNotice] = useState("");
  const [promptLevel, setPromptLevel] = useState<"independent" | "minimal" | "full">("independent");
  const savedRef = useRef(false);
  const composition = composeAACMessage(selected);
  const sentence = composition.valid ? composition.phrase : selected.map((item) => item.label).join(" + ");
  const loadBoard = useCallback(() => {
    if (!childId) return;
    api<AACCard[]>(`/api/aac/cards/${childId}`).then(setCards).catch(() => setCards([]));
    if (!freeMode) api<Array<{ id: number; phrase: string }>>(`/api/aac/history/${childId}`).then(setHistory).catch(() => setHistory([]));
  }, [childId, freeMode]);
  useEffect(loadBoard, [loadBoard]);
  const normalizedCardQuery = cardQuery.trim().toLocaleLowerCase("ru");
  const scenario = !freeMode && exercise ? aacScenarios[exercise.target] : null;
  const scenarioLabels = scenario ? new Set(scenario.labels) : null;
  const availableCards = scenarioLabels ? cards.filter((card) => scenarioLabels.has(card.label)) : cards;
  const visibleCards = (freeMode ? (category === "favorites" ? availableCards.filter((card) => card.favorite || card.is_core) : availableCards.filter((card) => card.category === category)) : availableCards).filter((card) => !normalizedCardQuery || `${card.label} ${card.speech}`.toLocaleLowerCase("ru").includes(normalizedCardQuery));
  const safetyCards = ["Помоги", "Перерыв", "Не хочу"].flatMap((label) => scenarioLabels?.has(label) ? [] : cards.find((card) => card.label === label) || []);
  const addCard = (card: AACCard) => { savedRef.current = false; setSelected((items) => [...items, card].slice(-8)); };
  const toggleFavorite = async (card: AACCard) => {
    if (!childId) return;
    await api(`/api/aac/cards/${card.id}/favorite?child_id=${childId}`, { method: "PATCH", body: JSON.stringify({ favorite: !card.favorite }) });
    setCards((items) => items.map((item) => item.id === card.id ? { ...item, favorite: !item.favorite } : item));
  };
  const sayPhrase = async () => {
    if (!selected.length || !childId) return;
    const composed = await api<{ valid: boolean; phrase: string; reason: string }>("/api/aac/compose", { method: "POST", body: JSON.stringify({ child_id: childId, card_ids: selected.map((item) => item.id), language: selected[0].language || "ru" }) }).catch(() => composition);
    if (!composed.valid) { setAacNotice(composed.reason || "Эту комбинацию пока нельзя озвучить как готовую фразу."); return; }
    setAacNotice("");
    speak(composed.phrase, 0.72, freeMode || soundEnabled, selected[0]?.language || "ru");
    if (!freeMode) {
      const saved = await api<{ id: number; phrase: string }>("/api/aac/history", { method: "POST", body: JSON.stringify({ child_id: childId, phrase: composed.phrase, card_ids: selected.map((item) => item.id) }) }).catch(() => null);
      if (saved) setHistory((items) => [saved, ...items.filter((item) => item.phrase !== saved.phrase)].slice(0, 12));
    }
    if (!freeMode && !savedRef.current && exercise && onComplete) {
      const labels = selected.map((card) => card.label);
      const scenarioSuccess = isAACScenarioSuccess(exercise.target, labels);
      const refused = labels.includes("Не хочу") && exercise.target !== "refusal";
      const paused = selected.some((card) => card.label === "Перерыв");
      if (!scenarioSuccess && !refused && !paused) {
        setAacNotice("Сообщение озвучено. Для завершения задания выбери карточку из учебной ситуации.");
        return;
      }
      const result = await onComplete(0, composed.phrase, exercise.id, { prompts_used: promptLevel === "independent" ? 0 : 1, prompt_level: promptLevel, attempt_status: refused ? "refused" : paused ? "break" : "participated", independence: promptLevel === "independent" ? 100 : promptLevel === "minimal" ? 60 : 30, communication_initiatives: 1 });
      if (result) savedRef.current = true;
    }
  };
  const sendQuickMessage = async (card: AACCard) => {
    setSelected([card]);
    setAacNotice(card.label === "Перерыв" ? "Сообщение озвучено. Можно сделать паузу или вернуться на главную." : ["Нет", "Не хочу"].includes(card.label) ? "Сообщение озвучено. Продолжать действие не нужно." : "Сообщение озвучено.");
    speak(card.speech, 0.72, true, card.language || "ru");
    if (!freeMode && !savedRef.current && exercise && onComplete && ["Перерыв", "Не хочу"].includes(card.label)) {
      const result = await onComplete(0, card.speech, exercise.id, { attempts_count: 0, correct_answers: 0, prompts_used: 0, attempt_status: card.label === "Перерыв" ? "break" : "refused", communication_initiatives: 1 });
      if (result) savedRef.current = true;
    }
  };
  const createCustom = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!childId) return;
    const card = await api<AACCard>("/api/aac/cards", { method: "POST", body: JSON.stringify({ child_id: childId, ...custom, image: "/soyle-mark-v2.png" }) }).catch(() => null);
    if (card) { setCards((items) => [...items, card]); setCustom({ label: "", speech: "", category: "needs" }); setCustomOpen(false); setCategory(card.category); }
  };
  const replayHistory = (phrase: string) => {
    speak(phrase, 0.72, soundEnabled);
  };
  const activeCategory = aacCategories.find((item) => item.id === category) || aacCategories[0];
  const quickCards = ["Помоги", "Больно", "Перерыв", "Не хочу", "Да", "Нет"].flatMap((label) => cards.find((card) => card.label === label) || []);
  return <div className="page-enter game-page aac-page redesigned">
    <GameHeader title={freeMode ? "Сказать" : exercise?.title || "Учебное AAC-задание"} subtitle={freeMode ? "Свободное сообщение без оценок" : "Практика с карточками AAC"} step={freeMode ? "Всегда доступно" : `${selected.length} карточек`} onBack={onBack}/>
    {freeMode && <section className="aac-quick" aria-label="Быстрые сообщения"><div className="aac-quick-head"><div><span className="kicker">СКАЗАТЬ СЕЙЧАС</span><strong>Важное сообщение — одним нажатием</strong></div><ShieldCheck size={22}/></div><div>{quickCards.map((card) => <button key={card.id} onClick={() => sendQuickMessage(card)}><AACVisual card={card} compact/><span>{card.label}</span></button>)}</div>{aacNotice && <p role="status">{aacNotice}{selected[0]?.label === "Перерыв" && <button onClick={onBack}>Сделать паузу</button>}</p>}</section>}
    {!freeMode && <div className="aac-goal"><div><span className="kicker">УЧЕБНАЯ СИТУАЦИЯ</span><strong>{scenario?.title || exercise?.instruction || "Собери сообщение"}</strong><p>{scenario?.situation}</p></div><ShieldCheck size={22}/><p>{scenario?.criterion || "Одной понятной карточки достаточно."}</p>{canManage && <div className="aac-prompt-level" aria-label="Как выполнено"><span>Поддержка взрослого:</span>{([['independent','Самостоятельно'],['minimal','С подсказкой'],['full','Вместе']] as const).map(([value,label]) => <button key={value} className={promptLevel === value ? "active" : ""} aria-pressed={promptLevel === value} onClick={() => setPromptLevel(value)}>{label}</button>)}</div>}</div>}
    <section className="aac-composer aac-composer-top"><div className="aac-composer-head"><div><span className="kicker">{freeMode ? "МОЁ СООБЩЕНИЕ" : "СОБЕРИ ФРАЗУ"}</span><strong>{sentence || "Сообщение пока пустое"}</strong><small>{selected.length ? composition.valid ? "Одной карточки уже достаточно, чтобы сообщить важное" : composition.reason : "Выбери одну или несколько карточек ниже"}</small></div><div className="aac-composer-actions"><button className="clear-button" disabled={!selected.length} onClick={() => { setSelected([]); setAacNotice(""); savedRef.current = false; }}>Очистить всё</button><button className="speak-button" disabled={!selected.length || !composition.valid} onClick={sayPhrase}><Volume2 size={21}/>Озвучить сообщение</button></div></div><div className={`aac-sentence ${selected.length ? "filled" : ""}`}>{selected.length ? selected.map((card, index) => <button key={`${card.id}-${index}`} aria-label={`Убрать карточку ${card.label}`} onClick={() => { savedRef.current = false; setSelected((items) => items.filter((_, itemIndex) => itemIndex !== index)); }}><span className="aac-card-order">{index + 1}</span><AACVisual card={card} compact/><span>{card.label}</span><X size={13}/></button>) : <div className="aac-empty-message"><MessageCircle size={24}/><div><strong>Выбери первую карточку</strong><span>Короткое сообщение — полноценное сообщение</span></div></div>}</div>{selected.length > 0 && <p className="aac-remove-hint">Чтобы убрать одну карточку, нажми на неё в строке сообщения.</p>}</section>
    {aacNotice && !freeMode && <div className="aac-notice" role="status"><Volume2 size={18}/><span>{aacNotice}</span>{selected[0]?.label === "Перерыв" && <button className="small-button" onClick={onBack}>Сделать паузу</button>}</div>}
    {!freeMode ? <div className="aac-guided-workspace">
      <section className="aac-board guided"><div className="aac-toolbar"><div><span className="kicker">ВЫБЕРИ СООБЩЕНИЕ</span><h3>{scenario?.title || "Карточки для задания"}</h3></div><small>{availableCards.length} {availableCards.length === 1 ? "вариант" : availableCards.length < 5 ? "варианта" : "вариантов"}</small></div>
        <div className="aac-card-grid guided">{visibleCards.map((card) => <div className={`aac-card aac-card-${card.category} ${card.is_core ? "core" : ""}`} key={card.id}><button className="aac-card-main" onClick={() => addCard(card)}><AACVisual card={card}/><strong>{card.label}</strong><small>{card.speech}</small></button></div>)}</div>
      </section>
      {safetyCards.length > 0 && <section className="aac-guided-safety" aria-label="Важные сообщения"><div><span className="kicker">МОЖНО СКАЗАТЬ В ЛЮБОЙ МОМЕНТ</span><strong>Помощь, перерыв или отказ</strong></div><div>{safetyCards.map((card) => <button key={card.id} onClick={() => sendQuickMessage(card)}><AACVisual card={card} compact/><span>{card.label}</span></button>)}</div></section>}
    </div> : <div className="aac-workspace">
      <aside className="aac-category-panel"><div><span className="kicker">КАТЕГОРИИ</span><h3>Выбери слово или фразу</h3></div><nav className="aac-tabs" aria-label="Категории карточек">{aacCategories.map((item) => { const Icon = item.icon; const count = item.id === "favorites" ? availableCards.filter((card) => card.favorite || card.is_core).length : availableCards.filter((card) => card.category === item.id).length; return <button key={item.id} className={category === item.id ? "active" : ""} aria-pressed={category === item.id} onClick={() => { setCategory(item.id); setCardQuery(""); }}><Icon size={18}/><span>{item.label}</span><small>{count}</small></button>; })}</nav>{history.length > 0 && <div className="aac-history"><span className="kicker">НЕДАВНИЕ</span>{history.slice(0,3).map((item) => <button key={item.id} onClick={() => replayHistory(item.phrase)}><RotateCcw size={14}/><span>{item.phrase}</span></button>)}</div>}</aside>
      <section className="aac-board"><div className="aac-toolbar"><div><span className="kicker">{category === "favorites" ? "БЫСТРЫЙ ДОСТУП" : "КАТЕГОРИЯ"}</span><h3>{activeCategory.label}</h3></div><div className="aac-tools"><label className="aac-search"><Search size={16}/><input value={cardQuery} onChange={(event) => setCardQuery(event.target.value)} placeholder="Найти слово" aria-label="Найти слово"/></label><button className="small-button" onClick={() => document.querySelector<HTMLElement>(".aac-page")?.requestFullscreen?.()}><LayoutDashboard size={15}/> На весь экран</button>{canManage && freeMode && <button className="small-button" onClick={() => setCustomOpen((value) => !value)}><Plus size={15}/> Своя карточка</button>}</div></div>
        {customOpen && <form className="aac-custom-form" onSubmit={createCustom}><input value={custom.label} onChange={(e) => setCustom({...custom,label:e.target.value})} placeholder="Короткая подпись" required/><input value={custom.speech} onChange={(e) => setCustom({...custom,speech:e.target.value})} placeholder="Что должна сказать карточка" required/><select value={custom.category} onChange={(e) => setCustom({...custom,category:e.target.value})}>{aacCategories.filter((item) => item.id !== "favorites").map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><button className="primary-button">Добавить</button></form>}
        <div className="aac-card-grid">{visibleCards.map((card) => <div className={`aac-card aac-card-${card.category} ${card.is_core ? "core" : ""}`} key={card.id}><button className="aac-card-main" onClick={() => addCard(card)}><AACVisual card={card}/><strong>{card.label}</strong><small>{card.speech}</small></button><button className={`aac-favorite ${card.favorite ? "active" : ""}`} onClick={() => toggleFavorite(card)} aria-label={card.favorite ? `Убрать ${card.label} из избранного` : `Добавить ${card.label} в избранное`}><Star size={15} fill={card.favorite ? "currentColor" : "none"}/></button></div>)}</div>
        {!visibleCards.length && <div className="aac-empty"><Search size={24}/><strong>Карточки не найдены</strong><span>Измените поиск или выберите другую категорию.</span></div>}
      </section>
    </div>}
  </div>;
}

function ProgressScreen({ childId, dashboard }: { childId?: number; dashboard: Dashboard | null }) {
  const [data, setData] = useState<{ child?: Child; overall: number; total_sessions: number; skill_progress: SkillProgress[] } | null>(null);
  useEffect(() => { if (childId) api<typeof data>(`/api/progress/${childId}`).then(setData).catch(() => undefined); }, [childId]);
  const skillColors = ["coral", "blue", "mint", "lavender", "coral", "blue"];
  const skills = (data?.skill_progress || dashboard?.skill_progress || []).map((skill, index) => ({ ...skill, color: skillColors[index] }));
  const chartDays = dashboard?.daily || [];
  const daysWithData = chartDays.filter((point) => point.sensory !== null).length;
  const chartCoordinates = (module: ModuleName) => chartDays.flatMap((point, index) => point[module] === null ? [] : [{ x: index * (700 / 6), y: 205 - Number(point[module]) * 1.7 }]);
  const chartPoints = (module: ModuleName) => chartCoordinates(module).map((point) => `${point.x},${point.y}`).join(" ");
  return (
    <div className="page-enter stack-xl progress-page">
      <section className="progress-hero"><div><span className="kicker">ИСТОРИЯ ПРАКТИКИ</span><h1>{`Занятия ${data?.child?.name || "ребёнка"}`}</h1><p>Процент справа означает только охват доступных заданий. Результаты игр, участие и помощь показываются отдельно и не оценивают развитие речи.</p></div><div className="progress-hero-score"><strong>{dashboard?.overall ?? data?.overall ?? 0}%</strong><span>доступных заданий пройдено</span></div></section>
      <div className="stats-row"><StatCard icon={<TrendingUp/>} value={`${dashboard?.overall ?? data?.overall ?? 0}%`} label="пройдено программы" /><StatCard icon={<Timer/>} value={String(dashboard?.total_minutes || 0)} label="минут практики" /><StatCard icon={<Star/>} value={String(dashboard?.stars || 0)} label="звёзд за игры" /><StatCard icon={<Target/>} value={String(dashboard?.total_sessions ?? data?.total_sessions ?? 0)} label="игровых попыток" /></div>
      <div className="progress-grid">
        <section className="chart-card"><div className="card-heading"><div><span className="kicker">ИГРОВЫЕ ПОПЫТКИ</span><h3>Ответы в заданиях на слух за 7 дней</h3></div></div><div className="chart-area"><div className="chart-lines"><i/><i/><i/><i/></div>{daysWithData ? <><svg viewBox="0 0 700 230" preserveAspectRatio="none" aria-label="График ответов в заданиях на слух">{daysWithData >= 3 && <polyline points={chartPoints("sensory")} className="line blue-line"/>}{chartCoordinates("sensory").map((point, index) => <circle key={`sensory-${index}`} cx={point.x} cy={point.y} r="6" className="chart-point sensory-point"/>)}</svg>{daysWithData < 3 && <div className="chart-sparse-note">Пока есть результаты за {daysWithData === 1 ? "один день" : "два дня"}. Это история конкретной игры, а не оценка понимания речи.</div>}</> : <div className="chart-empty">Завершите задание на слух — здесь появится история ответов</div>}<div className="chart-labels">{chartDays.map((point) => <span key={point.date}>{point.label}</span>)}</div></div><div className="legend"><span><i className="blue-dot"/>Доля правильных выборов в игре</span></div></section>
        <section className="skills-card"><span className="kicker">ПРАКТИКА ПО НАПРАВЛЕНИЯМ</span><h3>Игровые ответы и участие</h3>{skills.length ? skills.map((skill) => <div className="skill" key={skill.skill}><div><span>{skill.label}<small>{skill.average_game_score !== null ? `среднее по ${skill.sessions} игровым попыткам` : skill.participations ? "отмечено участие без оценки правильности" : "ещё нет попыток"}</small></span><strong>{skill.average_game_score !== null ? `${skill.average_game_score}% в игре` : `${skill.participations} участий`}</strong></div></div>) : <div className="empty-state">Завершите первое игровое задание — здесь появится история.</div>}<div className="insight-note"><ShieldCheck size={19}/><p>Söyle AI может объяснить эти данные простыми словами, но не оценивает развитие речи и не ставит диагноз.</p></div></section>
      </div>
      <section className="achievements"><div className="section-heading"><div><span className="kicker">ДОСТИЖЕНИЯ</span><h2>Значки за регулярную практику</h2></div></div><div className="badges"><Badge icon={<Star/>} title="Первая пятёрка" text="5 игровых попыток" unlocked={dashboard?.achievements.first_five}/><Badge image="/illustrations/module-listening.png" title="Чуткое ушко" text="5 заданий на понимание" unlocked={dashboard?.achievements.good_listener}/><Badge image="/illustrations/module-phrases.png" title="Мастер фраз" text="5 игр с фразами" unlocked={dashboard?.achievements.phrase_master}/><Badge icon={<Trophy/>} title="Неделя практики" text="7 дней подряд" unlocked={dashboard?.achievements.week_streak}/></div></section>
    </div>
  );
}

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) { return <div className="stat-card"><span>{icon}</span><div><strong>{value}</strong><small>{label}</small></div></div>; }
function Badge({ icon, image, title, text, unlocked = false }: { icon?: React.ReactNode; image?: string; title: string; text: string; unlocked?: boolean }) { return <div className={`badge-card ${unlocked ? "unlocked" : "locked"}`}><span>{unlocked ? (image ? <Image src={image} alt="" width={42} height={42}/> : icon) : <LockKeyhole/>}</span><div><strong>{title}</strong><small>{unlocked ? "Получено" : text}</small></div></div>; }

function AIParentScreen({ child, consent, onOpenConsent }: { child?: Child; consent: ChildConsent | null; onOpenConsent: () => void }) {
  const [question, setQuestion] = useState("");
  const [submittedQuestion, setSubmittedQuestion] = useState("");
  const [answer, setAnswer] = useState<AIAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const quickQuestions = [
    { title: "Мягко начать занятие", question: "Как мягко начать короткое занятие без давления?" },
    { title: "Ребёнок отказывается", question: "Что делать, если ребёнок отказывается от занятия?" },
    { title: "AAC дома", question: "Как использовать AAC-карточки в обычных домашних ситуациях?" },
  ];
  const ask = async (event?: React.FormEvent, preparedQuestion?: string) => {
    event?.preventDefault();
    const value = (preparedQuestion || question).trim();
    if (!child || value.length < 3 || loading) return;
    setSubmittedQuestion(value); setQuestion(""); setLoading(true); setError(""); setAnswer(null);
    try {
      setAnswer(await api<AIAnswer>(`/api/ai/ask/${child.id}`, { method: "POST", body: JSON.stringify({ question: value }) }));
    } catch (cause) { setQuestion(value); setError(cause instanceof Error ? cause.message : "Не удалось получить ответ"); }
    finally { setLoading(false); }
  };
  const chooseQuestion = (value: string) => {
    setQuestion(value);
    setError("");
    requestAnimationFrame(() => questionRef.current?.focus());
  };
  const resetConversation = () => {
    setAnswer(null);
    setSubmittedQuestion("");
    setError("");
    requestAnimationFrame(() => questionRef.current?.focus());
  };
  return <div className="page-enter ai-parent-page redesigned-ai">
    <header className="ai-page-heading">
      <div className="ai-page-title"><span className="ai-mark"><Bot size={24}/></span><div><span className="kicker">SÖYLE AI · ДЛЯ РОДИТЕЛЯ</span><h1>Спокойно разберём ситуацию</h1><p>Короткие безопасные подсказки для домашней практики и AAC. Решение всегда остаётся за вами.</p></div></div>
      <span className={`ai-status ${consent?.ai_processing ? "ready" : "off"}`}><i/>{consent?.ai_processing ? "AI включён" : "Нужно разрешение"}</span>
    </header>

    {!consent?.ai_processing ? <section className="ai-consent-callout"><span className="ai-consent-icon"><ShieldCheck size={25}/></span><div><span className="kicker">ПРИВАТНОСТЬ</span><h2>Разрешите AI-подсказки отдельно</h2><p>В OpenAI отправляется вопрос, возраст и обезличенная сводка занятий. Имя ребёнка и точная дата рождения не передаются.</p></div><button className="primary-button" onClick={onOpenConsent}>Открыть разрешения</button></section> : <div className="ai-chat-layout">
      <aside className="ai-prompt-panel" aria-label="Готовые вопросы">
        <div><span className="kicker">С ЧЕГО НАЧАТЬ</span><h2>Готовые вопросы</h2><p>Выберите тему — вопрос появится в поле, и его можно изменить перед отправкой.</p></div>
        <div className="ai-quick-questions">{quickQuestions.map((item) => <button type="button" key={item.title} onClick={() => chooseQuestion(item.question)}><span><MessageCircle size={17}/></span><strong>{item.title}</strong><ChevronRight size={16}/></button>)}</div>
        <div className="ai-privacy-note"><ShieldCheck size={18}/><div><strong>Без имени и даты рождения</strong><span>Не пишите в вопросе адрес, контакты и другие лишние личные данные.</span></div></div>
        <div className="ai-limits"><strong>Что умеет помощник</strong><ul><li>Объясняет результаты простыми словами</li><li>Предлагает короткие безопасные шаги</li><li>Помогает использовать AAC дома</li></ul><small>Не ставит диагноз и не заменяет специалиста.</small></div>
      </aside>

      <section className="ai-conversation" aria-label="Диалог с Söyle AI">
        <div className="ai-conversation-head"><div><span className="ai-mini-avatar"><Bot size={18}/></span><span><strong>Söyle AI</strong><small>Может ошибаться — проверяйте важные рекомендации</small></span></div>{(answer || submittedQuestion) && <button type="button" className="ai-new-chat" onClick={resetConversation} disabled={loading}><Plus size={16}/>Новый вопрос</button>}</div>

        <div className={`ai-thread ${!answer && !loading ? "empty" : ""}`} aria-live="polite" aria-busy={loading}>
          {!answer && !loading && !submittedQuestion && <div className="ai-welcome"><span><Bot size={28}/></span><h2>Чем помочь сегодня?</h2><p>Опишите одну конкретную ситуацию. Чем проще вопрос, тем понятнее будет ответ.</p><div><ShieldCheck size={16}/> Ответ не является медицинской рекомендацией</div></div>}

          {submittedQuestion && <div className="ai-message user-message"><small>Вы</small><p>{submittedQuestion}</p></div>}

          {loading && <div className="ai-message assistant-message ai-thinking" role="status"><div className="ai-message-meta"><span><Bot size={16}/></span><strong>Söyle AI</strong></div><div className="ai-thinking-row"><i/><i/><i/><span>Готовлю короткий ответ…</span></div></div>}

          {answer && <article className="ai-message assistant-message ai-answer-card">
            <div className="ai-message-meta"><span><Bot size={16}/></span><div><strong>Söyle AI</strong><small>{answer.generated_by === "openai" ? `Ответ создан ИИ${answer.model ? ` · ${answer.model}` : ""}` : "Безопасная резервная подсказка"}</small></div></div>
            {answer.provider_message && <div className="inline-error ai-provider-error" role="status"><ShieldAlert size={17} aria-hidden="true"/><span>{answer.provider_message}</span></div>}
            <p className="ai-answer-text">{answer.answer}</p>
            {answer.suggested_actions.length > 0 && <div className="ai-action-plan"><strong>Что можно попробовать</strong><ol>{answer.suggested_actions.map((item, index) => <li key={item}><span>{index + 1}</span><p>{item}</p></li>)}</ol></div>}
            <div className={answer.needs_professional_help ? "ai-safety warning" : "ai-safety"}><ShieldCheck size={18} aria-hidden="true"/><span>{answer.safety_note}</span></div>
            <small className="ai-disclaimer">{answer.disclaimer}</small>
            <div className="ai-answer-actions"><button type="button" onClick={() => void ask(undefined, submittedQuestion)} disabled={loading}><RotateCcw size={15}/>Получить другой ответ</button><button type="button" onClick={resetConversation}><Plus size={15}/>Спросить ещё</button></div>
          </article>}
        </div>

        {error && <div className="inline-error ai-chat-error" role="alert"><CircleAlert size={17}/><span>{error}</span></div>}
        <form className="ai-composer" onSubmit={ask}>
          <label className="sr-only" htmlFor="ai-parent-question">Вопрос для Söyle AI</label>
          <textarea id="ai-parent-question" ref={questionRef} value={question} onChange={(event) => setQuestion(event.target.value)} minLength={3} maxLength={600} rows={2} placeholder="Опишите ситуацию или задайте вопрос…"/>
          <div className="ai-composer-footer"><span>{question.length}/600 · Не указывайте личные данные</span><button className="primary-button" aria-label="Отправить вопрос" disabled={loading || question.trim().length < 3}><ArrowUp size={19}/><span>Отправить</span></button></div>
        </form>
      </section>
    </div>}
  </div>;
}

function ParentScreen({ child, childProfiles, onSelectChild, onDeleted, dashboard, onConsentChange }: { child?: Child; childProfiles: Child[]; onSelectChild: (id: number) => void; onDeleted: (id: number) => void; dashboard: Dashboard | null; onConsentChange: (consent: ChildConsent) => void }) {
  const [student, setStudent] = useState<{ username: string } | null>(null);
  const [studentForm, setStudentForm] = useState({ username: "", pin: "" });
  const [accountMessage, setAccountMessage] = useState("");
  const [consent, setConsent] = useState<ChildConsent>({ child_id: child?.id || 0, privacy_accepted: false, camera_processing: false, ai_processing: false, analytics_processing: false, version: "", updated_at: null });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [dataMessage, setDataMessage] = useState("");
  useEffect(() => {
    if (!child?.id) return;
    api<ChildConsent>(`/api/children/${child.id}/consent`).then((value) => { setConsent(value); onConsentChange(value); }).catch(() => undefined);
    api<{ username: string } | null>(`/api/children/${child.id}/student-account`).then((value) => { setStudent(value); if (value) setStudentForm((current) => ({ ...current, username: value.username })); }).catch(() => undefined);
  }, [child?.id, onConsentChange]);
  const saveStudent = async (event: React.FormEvent) => {
    event.preventDefault(); setAccountMessage("");
    if (!child) return;
    try {
      const result = await api<{ username: string }>(`/api/children/${child.id}/student-account`, { method: "POST", body: JSON.stringify(studentForm) });
      setStudent(result); setStudentForm((current) => ({ ...current, pin: "" })); setAccountMessage("Логин и PIN сохранены");
    } catch (cause) { setAccountMessage(cause instanceof Error ? cause.message : "Не удалось сохранить"); }
  };
  const exportData = async () => {
    if (!child) return;
    const data = await api<Record<string, unknown>>(`/api/children/${child.id}/export`);
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `soyle-${child.name}.json`; link.click(); URL.revokeObjectURL(url);
  };
  const saveConsent = async () => {
    if (!child) return;
    setDataMessage("");
    try {
      const value = await api<ChildConsent>(`/api/children/${child.id}/consent`, { method: "PUT", body: JSON.stringify({ privacy_accepted: consent.privacy_accepted, camera_processing: consent.camera_processing, ai_processing: consent.ai_processing, analytics_processing: consent.analytics_processing }) });
      setConsent(value); onConsentChange(value); setDataMessage("Настройки приватности сохранены");
    } catch (cause) { setDataMessage(cause instanceof Error ? cause.message : "Не удалось сохранить настройки"); }
  };
  const deleteData = async (event: React.FormEvent) => {
    event.preventDefault(); if (!child) return; setDataMessage("");
    try { await api(`/api/children/${child.id}`, { method: "DELETE", body: JSON.stringify({ password: deletePassword }) }); onDeleted(child.id); }
    catch (cause) { setDataMessage(cause instanceof Error ? cause.message : "Не удалось удалить данные"); }
  };
  const age = child ? (() => { const born = new Date(child.birth_date); const now = new Date(); let years = now.getFullYear() - born.getFullYear(); if (now.getMonth() < born.getMonth() || (now.getMonth() === born.getMonth() && now.getDate() < born.getDate())) years -= 1; return Math.max(0, years); })() : 0;
  const sessionLabels = { motor: ["/illustrations/module-articulation-fox.png", "Практика перед зеркалом"], sensory: ["/illustrations/module-listening.png", "Слушай и находи"], mixed: ["/illustrations/module-phrases.png", "Собери фразу"] } as const;
  return <div className="page-enter stack-xl parent-page">
    <PageTitle eyebrow="КАБИНЕТ РОДИТЕЛЯ" title={`Вместе поддерживаем ${child?.name || "ребёнка"}`} subtitle="История практики, ученический вход и понятные настройки приватности." />
    {childProfiles.length > 1 && <div className="child-switcher" aria-label="Выбор профиля ребёнка">{childProfiles.map((item) => <button key={item.id} className={item.id === child?.id ? "active" : ""} onClick={() => onSelectChild(item.id)}><span className="avatar" style={{background:item.avatar_color}}>{item.name[0]}</span><strong>{item.name}</strong></button>)}</div>}
    <section className="parent-overview">
      <div className="parent-profile"><div className="avatar large">{child?.name[0] || "Р"}</div><div><span className="kicker">ПРОФИЛЬ РЕБЁНКА</span><h2>{child?.name || "Ребёнок"}, {age} лет</h2><p>{dashboard?.total_sessions || 0} игровых попыток · {dashboard?.total_minutes || 0} минут практики</p></div></div>
      <div className="parent-progress"><div><span>Пройдено программы</span><strong>{dashboard?.overall || 0}%</strong></div><div className="parent-progress-track" aria-label={`Пройдено ${dashboard?.overall || 0}% программы`}><i style={{width:`${Math.min(dashboard?.overall || 0,100)}%`}}/></div><small><Flame size={15}/> {dashboard?.streak_days || 0} дней подряд</small></div>
    </section>
    <div className="stats-row parent-stats"><StatCard icon={<Check/>} value={String(dashboard?.today_sessions || 0)} label="заданий сегодня"/><StatCard icon={<Gamepad2/>} value={String(dashboard?.week_sessions || 0)} label="заданий за неделю"/><StatCard icon={<Timer/>} value={`${dashboard?.week_minutes || 0} мин`} label="практики за неделю"/><StatCard icon={<Bot/>} value={consent.ai_processing ? "Включён" : "Выключен"} label="Söyle AI"/></div>
    <section className="admin-card family-support-guide"><div className="admin-card-head"><div><span className="kicker">КАК БЫТЬ РЯДОМ</span><h3>Короткая памятка для занятия</h3><p>Цель — дать ребёнку понятный способ ответить, а не добиться ответа любой ценой.</p></div></div><div><article><span>1</span><div><strong>Подготовьте</strong><p>Проверьте звук, уберите лишние раздражители и предложите выбрать длительность.</p></div></article><article><span>2</span><div><strong>Подождите</strong><p>После инструкции оставьте не меньше пяти спокойных секунд на ответ.</p></div></article><article><span>3</span><div><strong>Помогайте по одному шагу</strong><p>Сначала повторите, затем сократите выбор. Не ведите руку ребёнка без согласия.</p></div></article><article className="stop"><Pause size={18}/><div><strong>Остановитесь сразу</strong><p>«Нет», «не хочу», «перерыв», боль, усталость или заметный дискомфорт — достаточная причина завершить действие без ошибки и уговоров.</p></div></article></div></section>
    <div className="parent-grid">
      <section className="recommend-card"><div className="recommend-icon"><Bot /></div><span className="kicker">SÖYLE AI</span><h2>Подсказки для родителя</h2><p>AI собирает короткий план только из безопасной библиотеки и объясняет, как поддержать ребёнка без давления.</p><ul><li><Check size={16}/>Не ставит диагноз</li><li><Check size={16}/>Не назначает моторные упражнения</li><li><Check size={16}/>Уважает отказ и AAC-ответ</li></ul></section>
      <section className="sessions-card"><div className="card-heading"><div><span className="kicker">ПОСЛЕДНИЕ ПОПЫТКИ</span><h3>История игровых заданий</h3></div></div>{dashboard?.recent.length ? dashboard.recent.map((item) => <div className="session-row" key={item.id}><span><Image src={sessionLabels[item.module][0]} alt="" width={42} height={42}/></span><div><strong>{sessionLabels[item.module][1]}</strong><small>{new Date(item.created_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{item.attempts_count ? ` · ${item.correct_answers || 0} из ${item.attempts_count}` : ""}</small></div><b>{item.attempt_status === "technical_error" ? "Техническая ошибка" : item.attempt_status === "participated" ? "Участие отмечено" : item.attempt_status === "refused" ? "Отказ" : item.attempt_status === "break" ? "Перерыв" : `${item.score}% в игре`}</b></div>) : <p>Игровых попыток пока нет.</p>}</section>
    </div>
    <div className="parent-management-grid">
      <section className="admin-card student-access"><div className="admin-card-head"><div><span className="kicker">ДОСТУП РЕБЁНКА</span><h3>{student ? "Изменить ученический вход" : "Создать вход для ученика"}</h3><p>Отдельный безопасный вход без электронной почты.</p></div><span className="period-pill">Только логин и PIN</span></div><form className="student-access-form" onSubmit={saveStudent}><label>Логин ученика<input value={studentForm.username} onChange={(e) => setStudentForm({...studentForm, username:e.target.value})} placeholder="Например, alikhan" pattern="[A-Za-z0-9_.-]+" minLength={3} required/></label><label>Новый PIN<input value={studentForm.pin} onChange={(e) => setStudentForm({...studentForm, pin:e.target.value.replace(/\D/g, "")})} placeholder="4–12 цифр" inputMode="numeric" minLength={4} maxLength={12} required/></label><button className="primary-button">Сохранить доступ</button></form>{accountMessage && <div className="usage-note" role="status"><Check size={18}/><p>{accountMessage}</p></div>}</section>
      <section className="admin-card privacy-control"><div className="admin-card-head"><div><span className="kicker">ПРИВАТНОСТЬ И ДАННЫЕ</span><h3>Разрешения семьи</h3><p>Каждое необязательное разрешение включается отдельно и может быть отозвано.</p></div></div><div className="consent-options"><label><input type="checkbox" checked={consent.privacy_accepted} onChange={(e)=>setConsent(e.target.checked ? {...consent,privacy_accepted:true} : {...consent,privacy_accepted:false,camera_processing:false,ai_processing:false,analytics_processing:false})}/><span><b>Сохранение программы и результатов</b><small>Нужно для занятий и истории игровых попыток.</small></span></label><label className={!consent.privacy_accepted ? "disabled" : ""}><input type="checkbox" disabled={!consent.privacy_accepted} checked={consent.ai_processing} onChange={(e)=>setConsent({...consent,ai_processing:e.target.checked})}/><span><b>Söyle AI через OpenAI</b><small>Передаёт вопрос, возраст и обезличенную сводку — без имени и даты рождения.</small></span></label><label className={!consent.privacy_accepted ? "disabled" : ""}><input type="checkbox" disabled={!consent.privacy_accepted} checked={consent.analytics_processing} onChange={(e)=>setConsent({...consent,analytics_processing:e.target.checked})}/><span><b>Описательная история и AAC</b><small>Сохраняет AAC-фразы и участие без клинических выводов.</small></span></label></div><div className="privacy-actions"><button className="primary-button" onClick={saveConsent}>Сохранить разрешения</button>{consent.updated_at && <small className="consent-updated">Изменено {new Date(consent.updated_at).toLocaleString("ru-RU")}</small>}</div></section>
    </div>
    <section className="data-control"><div><ShieldCheck/><span><strong>Данные ребёнка принадлежат семье</strong><small>Экспорт включает профиль, согласия, настройки, занятия, пользовательские AAC-карточки, избранное и историю.</small></span></div><div className="data-actions"><button className="secondary-button" onClick={exportData}>Скачать данные</button><button className="small-button danger-button" onClick={() => setDeleteOpen(!deleteOpen)}>Удалить данные</button></div></section>{deleteOpen && <form className="delete-data-form" onSubmit={deleteData}><div><strong>Удалить профиль и все связанные данные?</strong><p>Действие необратимо. Введите пароль родительского аккаунта для подтверждения.</p></div><input type="password" value={deletePassword} onChange={(e)=>setDeletePassword(e.target.value)} placeholder="Пароль" required/><button className="small-button danger-button">Удалить навсегда</button></form>}{dataMessage && <div className="usage-note"><Check size={18}/><p>{dataMessage}</p></div>}
    <div className="medical-note"><ShieldCheck size={25}/><div><strong>Söyle — помощник, а не врач</strong><p>Платформа не ставит диагноз и не заменяет занятия с логопедом или консультацию специалиста.</p></div></div>
  </div>;
}

function AdminScreen() {
  type StudentAccount = { id: number; username: string; child_name: string; parent_name: string; is_active: number | boolean };
  type UsageDaily = { date: string; requests: number; input_tokens: number; output_tokens: number; total_tokens: number; estimated_cost_usd: number };
  type UsageEvent = { id: number; actor_id: number; actor_type: "user" | "student"; actor_name: string; actor_username: string; actor_role: Role | "unknown"; child_id: number | null; child_name: string | null; provider: string; model: string; feature: string; input_tokens: number; output_tokens: number; total_tokens: number; estimated_cost_usd: number; created_at: string };
  type UsageData = { period_days: number; requests: number; input_tokens: number; output_tokens: number; total_tokens: number; estimated_cost_usd: number; note: string; breakdown: Array<{ provider: string; model: string; feature: string; requests: number; input_tokens: number; output_tokens: number; cost: number }>; daily: UsageDaily[]; recent: UsageEvent[] };
  type AuditEvent = { id: number; actor_key: string; action: string; object_type: string; object_id: string | null; metadata: Record<string, unknown>; created_at: string };
  const [stats, setStats] = useState({ users: 0, children: 0, sessions: 0, exercises: 0 });
  const [users, setUsers] = useState<User[]>([]);
  const [students, setStudents] = useState<StudentAccount[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [usage, setUsage] = useState<UsageData>({ period_days: 30, requests: 0, input_tokens: 0, output_tokens: 0, total_tokens: 0, estimated_cost_usd: 0, note: "", breakdown: [], daily: [], recent: [] });
  const [usageDays, setUsageDays] = useState<7 | 30 | 90>(30);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState("");
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [tab, setTab] = useState<"users" | "exercises" | "usage" | "audit">("users");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ module: "sensory", skill: "speech_comprehension" as SkillProgress["skill"], title: "", instruction: "", difficulty: 1, target: "custom", icon: "/illustrations/module-listening.png", is_active: true });
  const load = useCallback(() => {
    api<typeof stats>("/api/admin/stats").then(setStats);
    api<User[]>("/api/admin/users").then(setUsers);
    api<StudentAccount[]>("/api/admin/students").then(setStudents);
    api<Exercise[]>("/api/exercises").then(setExercises);
    api<AuditEvent[]>("/api/admin/audit").then(setAuditEvents);
  }, []);
  useEffect(load, [load]);
  const loadUsage = useCallback(async (days: 7 | 30 | 90) => {
    setUsageLoading(true);
    setUsageError("");
    try {
      setUsage(await api<UsageData>(`/api/admin/usage?days=${days}&limit=50`));
    } catch (error) {
      setUsageError(error instanceof Error ? error.message : "Не удалось загрузить расход токенов");
    } finally {
      setUsageLoading(false);
    }
  }, []);
  const changeRole = async (id: number, role: Exclude<Role, "student">) => { await api(`/api/admin/users/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) }); load(); };
  const toggleUser = async (item: User) => { await api(`/api/admin/users/${item.id}/active`, { method: "PATCH", body: JSON.stringify({ is_active: !item.is_active }) }); load(); };
  const addExercise = async (event: React.FormEvent) => { event.preventDefault(); const payload = { ...form, icon: moduleImages[form.module as ModuleName] }; await api("/api/admin/exercises", { method: "POST", body: JSON.stringify(payload) }); setFormOpen(false); setForm({ module: "sensory", skill: "speech_comprehension", title: "", instruction: "", difficulty: 1, target: "custom", icon: "/illustrations/module-listening.png", is_active: true }); load(); };
  const archiveExercise = async (id: number) => { await api(`/api/admin/exercises/${id}`, { method: "DELETE" }); load(); };
  const featureLabel = (feature: string) => ({ home_practice_plan: "План занятия", parent_support_answer: "Ответ родителю" }[feature] || feature);
  const actorRoleLabel = (role: UsageEvent["actor_role"]) => ({ parent: "родитель", student: "ученик", admin: "администратор", specialist: "специалист", unknown: "аккаунт удалён" }[role]);
  const formatTokens = (value: number) => value.toLocaleString("ru-RU");
  const formatCost = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 6 }).format(value);
  const maxDailyTokens = Math.max(0, ...usage.daily.map((item) => item.total_tokens));
  return <div className="page-enter stack-xl admin-page">
    <div className="admin-heading"><PageTitle eyebrow="УПРАВЛЕНИЕ ПЛАТФОРМОЙ" title="Админ-панель" subtitle="Пользователи, контент и прозрачный учёт автоматических функций."/><span className="system-status"><i/> Система работает</span></div>
    <div className="stats-row admin-stats"><StatCard icon={<Users/>} value={String(stats.users)} label="аккаунтов"/><StatCard icon={<UserRound/>} value={String(stats.children)} label="профилей детей"/><StatCard icon={<Target/>} value={String(stats.sessions)} label="занятий пройдено"/><StatCard icon={<Gamepad2/>} value={String(stats.exercises)} label="активных заданий"/></div>
    <div className="admin-tabs" role="tablist" aria-label="Разделы админ-панели"><button type="button" role="tab" aria-selected={tab === "users"} className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}><Users size={17}/>Пользователи</button><button type="button" role="tab" aria-selected={tab === "exercises"} className={tab === "exercises" ? "active" : ""} onClick={() => setTab("exercises")}><Gamepad2 size={17}/>Задания</button><button type="button" role="tab" aria-selected={tab === "usage"} className={tab === "usage" ? "active" : ""} onClick={() => { setTab("usage"); void loadUsage(usageDays); }}><BarChart3 size={17}/>AI и токены</button><button type="button" role="tab" aria-selected={tab === "audit"} className={tab === "audit" ? "active" : ""} onClick={() => setTab("audit")}><ShieldCheck size={17}/>Журнал</button></div>
    {tab === "users" && <section className="admin-card"><div className="admin-card-head"><div><span className="kicker">ДОСТУП И РОЛИ</span><h3>Взрослые аккаунты</h3><p>Роль определяет доступ к семейным и административным разделам.</p></div></div><div className="admin-table-wrap"><table className="account-table"><caption className="sr-only">Взрослые аккаунты и их права доступа</caption><thead><tr><th scope="col">Пользователь</th><th scope="col">Роль</th><th scope="col">Статус</th><th scope="col">Действие</th></tr></thead><tbody>{users.map((item) => <tr key={item.id}><td data-label="Пользователь"><b>{item.full_name}</b><small>{item.email}</small></td><td data-label="Роль"><select aria-label={`Роль пользователя ${item.full_name}`} value={item.role} onChange={(e) => changeRole(item.id, e.target.value as Exclude<Role,"student">)}><option value="parent">Родитель</option><option value="admin">Администратор</option></select></td><td data-label="Статус"><i className={`status ${item.is_active ? "active" : "blocked"}`}>{item.is_active ? "Активен" : "Отключён"}</i></td><td data-label="Действие"><button type="button" className="small-button" onClick={() => toggleUser(item)}>{item.is_active ? "Отключить" : "Включить"}</button></td></tr>)}</tbody></table></div><div className="student-accounts"><div className="student-accounts-head"><span className="kicker">УЧЕНИЧЕСКИЕ АККАУНТЫ</span><small>{students.length} всего</small></div><div className="student-account-grid">{students.map((item) => <article key={item.id}><span className="student-icon"><Backpack/></span><div><strong>{item.child_name}</strong><small>Логин: {item.username}</small><small>Родитель: {item.parent_name}</small></div><i className="status active">Ученик</i></article>)}</div></div></section>}
    {tab === "exercises" && <section className="admin-card"><div className="admin-card-head"><div><span className="kicker">КОНТЕНТ</span><h3>Библиотека заданий</h3><p>Активные упражнения, которые ребёнок видит во время практики.</p></div><button type="button" className="primary-button" aria-expanded={formOpen} onClick={() => setFormOpen(!formOpen)}>{formOpen ? "Закрыть форму" : "+ Добавить"}</button></div>{formOpen && <form className="exercise-form" onSubmit={addExercise}><label>Направление<select value={form.module} onChange={(e) => setForm({...form,module:e.target.value})}><option value="sensory">Понимание речи</option><option value="mixed">Коммуникация и фразы</option></select></label><label>Название<input placeholder="Например, Найди картинку" value={form.title} onChange={(e) => setForm({...form,title:e.target.value})} required/></label><label>Инструкция<input placeholder="Короткая инструкция для ребёнка" value={form.instruction} onChange={(e) => setForm({...form,instruction:e.target.value})} required/></label><button className="primary-button">Сохранить</button></form>}<div className="admin-exercises">{exercises.map((item) => <div key={item.id}><span><Image src={moduleImages[item.module]} alt="" width={42} height={42}/></span><div><strong>{item.title}</strong><small>{item.module === "sensory" ? "Понимание речи" : "Коммуникация"} · уровень {item.difficulty}</small></div><button type="button" onClick={() => archiveExercise(item.id)}>В архив</button></div>)}</div></section>}
    {tab === "usage" && <section className="usage-dashboard" aria-busy={usageLoading}>
      <div className="usage-toolbar">
        <div><span className="kicker">OPENAI API</span><h2>Расход токенов</h2><p>Сколько токенов использовано, когда был запрос и кто его запустил.</p></div>
        <div className="usage-periods" aria-label="Период отчёта">{([7, 30, 90] as const).map((days) => <button key={days} className={usageDays === days ? "active" : ""} aria-pressed={usageDays === days} onClick={() => { setUsageDays(days); void loadUsage(days); }}>{days} дней</button>)}</div>
      </div>
      {usageLoading ? <div className="admin-card usage-loading" role="status"><span className="sr-only">Загрузка статистики токенов</span>{[1,2,3,4].map((item) => <i key={item}/>)}</div> : usageError ? <div className="admin-card usage-error" role="alert"><CircleAlert/><div><strong>Не удалось загрузить статистику</strong><p>{usageError}</p></div><button className="secondary-button" onClick={() => void loadUsage(usageDays)}><RotateCcw size={16}/>Повторить</button></div> : <>
        <div className="usage-cards">
          <StatCard icon={<Bot/>} value={formatTokens(usage.requests)} label="успешных AI-запросов"/>
          <StatCard icon={<BarChart3/>} value={formatTokens(usage.total_tokens)} label="токенов всего"/>
          <StatCard icon={<ArrowUp/>} value={formatTokens(usage.input_tokens)} label="входных токенов"/>
          <StatCard icon={<ArrowDown/>} value={formatTokens(usage.output_tokens)} label="выходных токенов"/>
          <StatCard icon={<CreditCard/>} value={formatCost(usage.estimated_cost_usd)} label="примерная стоимость"/>
        </div>
        <div className="usage-insights-grid">
          <section className="admin-card usage-chart-card">
            <div className="admin-card-head"><div><span className="kicker">КОГДА ТРАТИЛИСЬ ТОКЕНЫ</span><h3>Расход по дням</h3></div><span className="period-pill">{usage.period_days} дней</span></div>
            {maxDailyTokens > 0 ? <figure className="usage-chart" role="img" aria-label={`Расход токенов по дням. Максимум за день: ${formatTokens(maxDailyTokens)}`}>
              <div className="usage-chart-bars">{usage.daily.map((item) => {
                const label = new Date(item.date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
                const height = item.total_tokens ? Math.max(3, Math.round(item.total_tokens / maxDailyTokens * 100)) : 0;
                return <span className="usage-chart-day" key={item.date} title={`${label}: ${formatTokens(item.total_tokens)} токенов, ${item.requests} запросов`}><i style={{height: `${height}%`}}/><small>{label}</small></span>;
              })}</div>
              <figcaption>Высота столбца — общее число входных и выходных токенов за день.</figcaption>
            </figure> : <div className="usage-empty"><BarChart3/><strong>За этот период запросов не было</strong><p>Статистика появится после успешного ответа Söyle AI через OpenAI.</p></div>}
          </section>
          <section className="admin-card usage-breakdown-card">
            <div className="admin-card-head"><div><span className="kicker">НА ЧТО УШЛИ ТОКЕНЫ</span><h3>По функциям</h3></div></div>
            {usage.breakdown.length ? <div className="usage-table"><div className="usage-row header"><span>Функция и модель</span><span>Запросы</span><span>Токены</span><span>Стоимость</span></div>{usage.breakdown.map((item) => <div className="usage-row" key={`${item.model}-${item.feature}`}><span><b>{featureLabel(item.feature)}</b><small>{item.provider} · {item.model}</small></span><span>{formatTokens(item.requests)}</span><span>{formatTokens(item.input_tokens + item.output_tokens)}</span><span>{formatCost(Number(item.cost || 0))}</span></div>)}</div> : <div className="usage-empty compact"><PackageOpen/><strong>Нет данных для разбивки</strong></div>}
          </section>
        </div>
        <section className="admin-card usage-history-card">
          <div className="admin-card-head"><div><span className="kicker">КТО И КОГДА</span><h3>Последние AI-запросы</h3><p>Показаны последние {usage.recent.length} событий за выбранный период.</p></div><button className="small-button" onClick={() => void loadUsage(usageDays)} aria-label="Обновить расход токенов"><RotateCcw size={15}/>Обновить</button></div>
          {usage.recent.length ? <div className="usage-history-wrap"><table className="usage-history-table"><caption className="sr-only">История расхода токенов OpenAI по пользователям и времени</caption><thead><tr><th scope="col">Когда</th><th scope="col">Кто запустил</th><th scope="col">Профиль ребёнка</th><th scope="col">Функция</th><th scope="col">Токены</th><th scope="col">Стоимость</th></tr></thead><tbody>{usage.recent.map((event) => <tr key={event.id}>
            <td data-label="Когда"><time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString("ru-RU", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</time></td>
            <td data-label="Кто запустил"><strong>{event.actor_name}</strong><small>{event.actor_username ? `@${event.actor_username} · ` : ""}{actorRoleLabel(event.actor_role)}</small></td>
            <td data-label="Профиль ребёнка">{event.child_name || "Профиль удалён"}</td>
            <td data-label="Функция"><strong>{featureLabel(event.feature)}</strong><small>{event.provider} · {event.model}</small></td>
            <td data-label="Токены"><strong>{formatTokens(event.total_tokens)}</strong><small>{formatTokens(event.input_tokens)} вход · {formatTokens(event.output_tokens)} выход</small></td>
            <td data-label="Стоимость">{formatCost(event.estimated_cost_usd)}</td>
          </tr>)}</tbody></table></div> : <div className="usage-empty"><Bot/><strong>История пока пуста</strong><p>Локальные резервные ответы сюда не попадают и ничего не стоят.</p></div>}
          <div className="usage-note"><Sparkles size={19}/><p>{usage.note}</p></div>
        </section>
      </>}
    </section>}
    {tab === "audit" && <section className="admin-card"><div className="admin-card-head"><div><span className="kicker">БЕЗОПАСНОСТЬ</span><h3>Журнал критичных действий</h3></div><span className="period-pill">Последние 100 записей</span></div><div className="data-table audit-table"><div className="table-row header"><span>Действие</span><span>Объект</span><span>Автор</span><span>Время</span></div>{auditEvents.length ? auditEvents.map((event) => <div className="table-row" key={event.id}><span><b>{event.action}</b><small>{Object.keys(event.metadata).length ? JSON.stringify(event.metadata) : "Без дополнительных данных"}</small></span><span>{event.object_type}{event.object_id ? ` #${event.object_id}` : ""}</span><span>{event.actor_key}</span><span>{new Date(event.created_at).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span></div>) : <div className="empty-state">Критичных действий пока не было.</div>}</div></section>}
  </div>;
}

function ProfileScreen({ user, child, dashboard, settings, onOpen, onLogout }: { user: User; child?: Child; dashboard: Dashboard | null; settings: AppSettings; onOpen: (screen: Screen) => void; onLogout: () => void }) {
  const age = child ? Math.max(0, new Date().getFullYear() - new Date(child.birth_date).getFullYear() - (new Date() < new Date(new Date().getFullYear(), new Date(child.birth_date).getMonth(), new Date(child.birth_date).getDate()) ? 1 : 0)) : null;
  const primaryModule = child ? modules.find((item) => item.id === child.primary_module)?.title : null;
  const languageName = { ru: "Русский", en: "English", kk: "Қазақша" }[settings.language];
  const themeName = { peach: "Базовая", ocean: "Мягкий океан", lavender: "Лаванда", contrast: "Высокий контраст" }[settings.theme];
  return <div className="page-enter profile-page">
    <PageTitle eyebrow="ПРОФИЛЬ" title="Личный кабинет" subtitle="Информация об аккаунте, ребёнке и текущих настройках."/>
    <section className="profile-hero-card">
      <div className="profile-avatar-large">{user.full_name[0]}</div>
      <div><span className="kicker">{roleLabel(user.role)}</span><h2>{user.full_name}</h2><p>@{user.username}</p></div>
      <button className="small-button" onClick={() => onOpen("settings")}><Settings size={16}/> Настройки</button>
    </section>
    <div className="profile-grid">
      <section className="profile-info-card"><div className="profile-card-title"><UserRound size={20}/><div><span className="kicker">АККАУНТ</span><h3>Основная информация</h3></div></div><dl><div><dt>Имя</dt><dd>{user.full_name}</dd></div><div><dt>Логин</dt><dd>{user.username}</dd></div><div><dt>Роль</dt><dd>{roleLabel(user.role)}</dd></div><div><dt>Язык</dt><dd>{languageName}</dd></div><div><dt>Оформление</dt><dd>{themeName}</dd></div></dl></section>
      {child && <section className="profile-info-card child-profile-card"><div className="profile-card-title"><Baby size={20}/><div><span className="kicker">ПРОФИЛЬ РЕБЁНКА</span><h3>{child.name}</h3></div></div><dl><div><dt>Возраст</dt><dd>{age} лет</dd></div><div><dt>Основное направление</dt><dd>{primaryModule}</dd></div><div><dt>Всего занятий</dt><dd>{dashboard?.total_sessions || 0}</dd></div><div><dt>Минут практики</dt><dd>{dashboard?.total_minutes || 0}</dd></div><div><dt>Звёзд</dt><dd>{dashboard?.stars || 0}</dd></div></dl>{user.role === "parent" && <button className="secondary-button wide" onClick={() => onOpen("parent")}>Открыть кабинет родителя <ChevronRight size={16}/></button>}</section>}
    </div>
    <button className="profile-logout" onClick={onLogout}><LogOut size={17}/> Выйти из аккаунта</button>
  </div>;
}

function SettingsScreen({ settings, onChange, onLogout }: { settings: AppSettings; onChange: (settings: AppSettings) => void; onLogout: () => void }) {
  const themes = [
    { id: "peach", name: "Спокойная", description: "Нейтральный фон и синий акцент", colors: ["#1668c7", "#eaf3ff", "#ffffff"] },
    { id: "ocean", name: "Океан", description: "Приглушённый бирюзовый акцент", colors: ["#2d7180", "#e5f2f4", "#ffffff"] },
    { id: "lavender", name: "Лаванда", description: "Мягкий фиолетовый акцент", colors: ["#6759aa", "#f0eef8", "#ffffff"] },
    { id: "contrast", name: "Контрастная", description: "Чёткие границы и более тёмный текст", colors: ["#164f91", "#dcecff", "#ffffff"] },
  ] as const;
  const languages = [{id:"ru",short:"RU",name:"Русский — проверенная версия"}] as const;
  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => onChange({ ...settings, [key]: value });
  const activeTheme = themes.find((item) => item.id === settings.theme) || themes[0];
  return <div className="page-enter settings-page redesigned-settings">
    <PageTitle eyebrow="НАСТРОЙКИ" title="Удобно для вашей семьи" subtitle="Оформление и параметры занятий применяются сразу и сохраняются в аккаунте."/>
    <div className="settings-layout">
      <aside className="settings-summary" aria-label="Текущие настройки">
        <span className="settings-summary-icon"><Paintbrush size={24}/></span>
        <span className="kicker">СЕЙЧАС ВКЛЮЧЕНО</span>
        <h2>{activeTheme.name}</h2>
        <p>{activeTheme.description}</p>
        <dl>
          <div><dt>Язык</dt><dd>Русский</dd></div>
          <div><dt>Звук</dt><dd>{settings.sound_enabled ? "Включён" : "Выключен"}</dd></div>
          <div><dt>Анимация</dt><dd>{settings.calm_mode ? "Сокращена" : "Обычная"}</dd></div>
        </dl>
        <small><CircleCheck size={15}/> Изменения сохраняются автоматически</small>
      </aside>
      <div className="settings-sections">
        <section className="settings-section theme-setting">
          <div className="settings-section-heading"><div><span className="kicker">ОФОРМЛЕНИЕ</span><h3>Цветовая тема</h3><p>Меняется фон, акцентные кнопки и выбранные элементы. Цвета успеха и ошибок остаются привычными.</p></div></div>
          <div className="theme-options" role="group" aria-label="Цветовая тема">{themes.map((item) => <button type="button" key={item.id} className={settings.theme === item.id ? "active" : ""} aria-pressed={settings.theme === item.id} onClick={() => update("theme", item.id as AppSettings["theme"])}><span className="theme-swatch">{item.colors.map((color) => <i key={color} style={{background:color}}/>)}</span><span className="theme-copy"><strong>{item.name}</strong><small>{item.description}</small></span>{settings.theme === item.id && <span className="theme-selected"><Check size={14}/> Выбрано</span>}</button>)}</div>
        </section>
        <section className="settings-section preference-setting">
          <div className="settings-section-heading"><span className="kicker">ЗАНЯТИЯ И ДОСТУПНОСТЬ</span><h3>Комфорт во время практики</h3></div>
          <SettingRow icon={<Volume2/>} title="Звуковые подсказки" text="Голос и мягкие сигналы во время задания" value={settings.sound_enabled} onChange={(value) => update("sound_enabled", value)}/>
          <SettingRow icon={<Sparkles/>} title="Спокойный режим" text="Меньше анимации и визуальных эффектов" value={settings.calm_mode} onChange={(value) => update("calm_mode", value)}/>
        </section>
        <section className="settings-section language-setting">
          <div className="settings-section-heading"><span className="kicker">ЯЗЫК И КОНТЕНТ</span><h3>Проверенная версия интерфейса</h3><p>Другие языки появятся после проверки носителями языка и AAC-специалистом.</p></div>
          <div className="language-options">{languages.map((item) => <button type="button" key={item.id} className={settings.language === item.id ? "active" : ""} aria-pressed={settings.language === item.id} onClick={() => update("language", item.id)}><b>{item.short}</b><span>{item.name}</span><Check size={16}/></button>)}</div>
        </section>
        <section className="settings-section account-setting">
          <div className="settings-section-heading"><span className="kicker">АККАУНТ</span><h3>Данные и сеанс</h3></div>
          <div className="setting-row"><div className="setting-icon"><LockKeyhole/></div><div><strong>Данные защищены</strong><span>Видео не сохраняется; результаты находятся в профиле ребёнка</span></div><span className="status active">Защищено</span></div>
          <div className="setting-row"><div className="setting-icon danger"><LogOut/></div><div><strong>Выйти из аккаунта</strong><span>На этом устройстве потребуется повторный вход</span></div><button type="button" className="small-button" onClick={onLogout}>Выйти</button></div>
        </section>
      </div>
    </div>
  </div>;
}

function SettingRow({ icon, title, text, value, onChange }: { icon: React.ReactNode; title: string; text: string; value: boolean; onChange: (v: boolean) => void }) {
  return <div className="setting-row"><div className="setting-icon">{icon}</div><div><strong>{title}</strong><span>{text}</span></div><button type="button" className={`toggle ${value ? "on" : ""}`} onClick={() => onChange(!value)} aria-label={`${title}: ${value ? "включено" : "выключено"}`} aria-pressed={value}><i/></button></div>;
}
