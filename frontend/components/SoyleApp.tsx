"use client";

import { speak, stopCurrentSpeech } from "@/lib/speech";

import {
  ArrowLeft,
  ArrowRight,
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
  CircleEllipsis,
  CircleCheck,
  CircleX,
  CircleUserRound,
  Clock3,
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
  ImageIcon,
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
import { BrandLogo } from "@/components/BrandLogo";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { api, ApiError, AACCard, AIAnswer, type AdaptivePlan, AppSettings, Child, ChildConsent, clearLegacyAuth, Dashboard, Exercise, LearningSession, NotificationsData, Role, SkillProgress, User } from "@/lib/api";
import { compressPhoto } from "@/lib/imageUpload";
import { composeAACMessage } from "@/lib/aacGrammar";
import { canAddAACScenarioCard, evaluateAACScenario } from "@/lib/aacScenarioRuntime";
import { supportedInterfaceLanguages, useInterfaceLanguage } from "@/lib/i18n";
import { exerciseCountLabel, SESSION_EXERCISE_COUNTS } from "@/lib/homePractice";
import { nextIncompleteExerciseIndex, reconcileActiveSession, summarizeSessionResults } from "@/lib/sessionRuntime";
import { categoriesToScores, evaluateMotorMovement, mergeBaseline, targetForSequenceStep, type BlendshapeScores } from "@/lib/motorDetection";
import { newAnswerEvidence, withSupport, withResponse, responseOutcome } from "@/lib/answerEvidence";
import { chooseExemplar, createChoiceRound, resolveDifficulty, shuffleWithRandom as shuffled } from "@/lib/exerciseRuntime";
import { PublishedInstructionRunner, type DraftExerciseVersion } from "@/components/P1ExerciseRunners";
import { ContentReviewWorkspace, HomeActivityReviewPreview, type ContentReviewWorkspaceData, type HomeActivityDraft } from "@/components/ContentReviewWorkspace";
import { FunctionalSkillMap, HomePracticeLibrary, P1ResultsSummary } from "@/components/FamilyPractice";
import { GoalsAndPractice } from "@/components/GoalsAndPractice";
import { AdminShell, ChildShell, ExerciseFocusShell, ParentShell } from "@/components/AppShells";
import { AchievementsExperience } from "@/components/AchievementsExperience";
import { ParentOverview } from "@/components/ParentOverview";
import { InteractiveBook } from "./storybook/book/InteractiveBook";
import { StoryExperience } from "@/components/StoryExperience";
import { WorldExperience } from "@/components/WorldExperience";
import {
  GuidesExperience,
  ParentDashboardExperience,
  SkillsExperience,
} from "@/components/ProductExperience";

type Screen = "comic-preview" | "story-preview" | "home" | "stories" | "world" | "skills" | "achievements" | "guides" | "games" | "session" | "exercise-complete" | "motor" | "sensory" | "mixed" | "aac" | "ai" | "progress" | "goals" | "parent" | "profile" | "settings" | "more" | "admin";
type ModuleName = "motor" | "sensory" | "mixed";
type GameMeasurement = { attempts_count?: number; correct_answers?: number; prompts_used?: number; gameplay_choices?: number; independent_completions?: number; prompted_completions?: number; attempt_status?: "completed" | "participated" | "refused" | "break" | "technical_error"; independence?: number; prompt_level?: "independent" | "minimal" | "full"; response_ms?: number; communication_initiatives?: number };
type ExerciseCompletion = { refused?: boolean; title: string; message: string; nextExercise: Exercise | null; sessionMode: boolean; sessionFinished: boolean };
type ParentPracticeMode = "adult_preview" | "child_practice";
type SessionSaveResult = { awarded_stars: number; score: number; duration_seconds: number; attempt_status: GameMeasurement["attempt_status"]; created_at: string; preview?: boolean };
const defaultSettings: AppSettings = { camera_enabled: false, sound_enabled: true, calm_mode: false, theme: "peach", language: "ru" };

const modules = [
  {
    id: "sensory" as const,
    title: "Слушай и находи",
    eyebrow: "Сенсорный модуль",
    description: "Слушай слово и выбирай правильную картинку",
    accent: "blue",
    progress: 0,
    time: "4 минуты",
  },
  {
    id: "mixed" as const,
    title: "Собери свою фразу",
    eyebrow: "Модуль общения",
    description: "Складывай карточки и составляй понятные сообщения",
    accent: "mint",
    progress: 0,
    time: "6 минут",
  },
];
function BrandIcon({ size = 26 }: { size?: number }) {
  return <BrandLogo variant="icon" width={size} decorative />;
}

function ModuleGlyph({ module, size = 30 }: { module: ModuleName; size?: number }) {
  const Icon = module === "motor" ? Mic2 : module === "sensory" ? Ear : MessageCircle;
  return <span className={`module-glyph ${module}`} aria-hidden="true"><Icon size={size} strokeWidth={1.8}/><i/></span>;
}

import { SpecialistWorkspace, FamilySpecialistAccess, ParentAccountDeletion } from "./SpecialistWorkspace";
import { CabinetNavigation, useCabinetSection } from "./CabinetNavigation";
import { SpecialistInvitation } from "./SpecialistInvitation";
import { AdminContentQueue } from "./AdminContentQueue";

export function SoyleApp() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authActionError, setAuthActionError] = useState("");
  const [invitationToken, setInvitationToken] = useState("");
  useEffect(() => {
    const read = () => setInvitationToken(new URLSearchParams(window.location.hash.slice(1)).get("invite") || "");
    read(); window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

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
    if (!("serviceWorker" in navigator)) return;

    const localDevelopmentHosts = new Set(["localhost", "127.0.0.1"]);
    if (process.env.NODE_ENV !== "production" || localDevelopmentHosts.has(window.location.hostname)) {
      const removeStaleLocalWorker = async () => {
        const hadController = Boolean(navigator.serviceWorker.controller);
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));

        if ("caches" in window) {
          const cacheNames = await caches.keys();
          await Promise.all(
            cacheNames
              .filter((cacheName) => cacheName.startsWith("soyle-"))
              .map((cacheName) => caches.delete(cacheName)),
          );
        }

        const reloadGuard = "soyle-local-worker-cleared-v1";
        if (hadController && !window.sessionStorage.getItem(reloadGuard)) {
          window.sessionStorage.setItem(reloadGuard, "1");
          window.location.reload();
        }
      };

      void removeStaleLocalWorker().catch(() => undefined);
      return;
    }

    void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => undefined);
  }, []);

  if (authLoading) return <div className="auth-loading"><div className="brand-mark"><BrandIcon /></div><span>Söyle загружается…</span></div>;
  const logout = async () => {
    stopCurrentSpeech();
    setAuthActionError("");
    try {
      await api("/api/auth/logout", { method: "POST" });
      clearLegacyAuth();
      setUser(null);
    } catch (cause) {
      setAuthActionError(cause instanceof Error ? `Не удалось завершить сеанс: ${cause.message}` : "Не удалось завершить сеанс");
    }
  };
  const invitation = invitationToken ? <SpecialistInvitation token={invitationToken} user={user} onClose={() => { setInvitationToken(""); window.history.replaceState(null, "", window.location.pathname + window.location.search); }}/> : null;
  if (!user) return <>{invitation}<AuthScreen onAuthenticated={setUser} /></>;
  if (user.role === "specialist") return <>{invitation}<SpecialistWorkspace user={user} onLogout={logout}/>{authActionError && <p role="alert">{authActionError}</p>}</>;
  return <>{invitation}<AuthenticatedApp user={user} onLogout={logout} externalError={authActionError} onDismissExternalError={() => setAuthActionError("")} /></>;
}

function AuthenticatedApp({ user, onLogout, externalError, onDismissExternalError }: { user: User; onLogout: () => void; externalError: string; onDismissExternalError: () => void }) {
  const [screen, setScreen] = useState<Screen>(() => user.role === "admin" ? "admin" : user.role === "parent" && new URLSearchParams(window.location.search).get("cabinet") === "parent" ? "parent" : "home");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [compactNavigation, setCompactNavigation] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarCloseRef = useRef<HTMLButtonElement>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<number | null>(() => user.child_id || (user.role === "parent" ? Number(new URLSearchParams(window.location.search).get("child")) || null : null));
  useEffect(() => {
    if (user.role !== "parent") return;
    const sync = () => {
      const params = new URLSearchParams(window.location.search);
      setScreen(params.get("cabinet") === "parent" ? "parent" : "home");
      const childId = Number(params.get("child"));
      if (childId > 0) setSelectedChildId(childId);
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [user.role]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [catalogRevision, setCatalogRevision] = useState(0);
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
  const [globalSearch, setGlobalSearch] = useState("");
  const [reward, setReward] = useState<{ stars: number; nonce: number } | null>(null);
  const gameStartedAtRef = useRef(0);
  const pendingAttemptRef = useRef<{ key: string; body: string } | null>(null);
  const savingAttemptRef = useRef(false);
  const [childrenLoading, setChildrenLoading] = useState(true);
  const [childrenError, setChildrenError] = useState("");
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const settingsRef = useRef<AppSettings>(defaultSettings);
  const settingsSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const settingsSaveVersionRef = useRef(0);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [consent, setConsent] = useState<ChildConsent | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [requestError, setRequestError] = useState("");
  const [parentPracticeMode, setParentPracticeMode] = useState<ParentPracticeMode>("adult_preview");
  const [focusStopping, setFocusStopping] = useState(false);
  useInterfaceLanguage(settings.language);

  useEffect(() => {
    if (user.role !== "student" || screen !== "more") return;
    const mobile = window.matchMedia("(max-width: 760px)");
    const leaveMobileMore = () => { if (!mobile.matches) setScreen("home"); };
    mobile.addEventListener("change", leaveMobileMore);
    const timer = window.setTimeout(leaveMobileMore, 0);
    return () => { window.clearTimeout(timer); mobile.removeEventListener("change", leaveMobileMore); };
  }, [screen, user.role]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.dataset.calm = settings.calm_mode ? "true" : "false";
    settingsRef.current = settings;
  }, [settings]);
  useEffect(() => {
    const updateConnection = () => {
      const online = navigator.onLine;
      setIsOnline(online);
      if (online) setSessionError((current) => current.includes("нет интернета") ? "Связь восстановлена. Если страница не обновлялась, нажмите кнопку сохранения ещё раз." : current);
    };
    updateConnection();
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, []);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1050px)");
    const update = () => setCompactNavigation(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const sidebarIsDialog = compactNavigation && user.role !== "student";
  useEffect(() => {
    if (!sidebarIsDialog || !sidebarOpen) return;
    sidebarCloseRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSidebarOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [sidebarIsDialog, sidebarOpen]);
  const loadChildren = useCallback(() => {
    if (!["parent", "student"].includes(user.role)) { setChildrenLoading(false); return; }
    setChildrenLoading(true);
    setChildrenError("");
    api<Child[]>("/api/children")
      .then((items) => { setChildren(items); setSelectedChildId((current) => items.some(item => item.id === current) ? current : items[0]?.id || null); })
      .catch((cause) => { setChildrenError(cause instanceof Error ? cause.message : "Не удалось загрузить профиль ребёнка"); })
      .finally(() => setChildrenLoading(false));
  }, [user.role]);
  useEffect(() => {
    const timer = window.setTimeout(loadChildren, 0);
    return () => window.clearTimeout(timer);
  }, [loadChildren]);
  useEffect(() => {
    api<AppSettings>("/api/settings").then((value) => setSettings({ ...value, language: supportedInterfaceLanguages.includes(value.language) ? value.language : "ru" })).catch((cause) => {
      setSettings(defaultSettings);
      setRequestError(cause instanceof Error ? `Не удалось загрузить настройки: ${cause.message}` : "Не удалось загрузить настройки");
    });
  }, []);
  const loadNotifications = useCallback(() => {
    if (user.role === "parent") api<NotificationsData>("/api/notifications").then(setNotifications).catch((cause) => {
      setRequestError(cause instanceof Error ? `Не удалось загрузить уведомления: ${cause.message}` : "Не удалось загрузить уведомления");
    });
  }, [user.role]);
  useEffect(loadNotifications, [loadNotifications]);

  const navigation: { id: Screen; label: string; icon: typeof Home }[] = user.role === "admin"
    ? [{ id: "admin", label: "Админ-панель", icon: LayoutDashboard }, { id: "settings", label: "Настройки", icon: Settings }]
    : user.role === "student"
        ? [
          { id: "home", label: "Главная", icon: Home },
          { id: "stories", label: "Истории", icon: BookOpen },
          { id: "games", label: "Занятия", icon: Gamepad2 },
          { id: "aac", label: "Мои слова", icon: MessageCircle },
          { id: "more", label: "Ещё", icon: CircleEllipsis },
          { id: "world", label: "Мой мир", icon: ImageIcon },
          { id: "skills", label: "Навыки", icon: BarChart3 },
          { id: "achievements", label: "Достижения", icon: Trophy },
        ]
      : [
          { id: "home", label: "Главная", icon: Home },
          { id: "parent", label: "Кабинет родителя", icon: UserRound },
          { id: "guides", label: "Гайды", icon: BookOpen },
        ];

  const child = children.find((item) => item.id === selectedChildId) || children[0];

  useEffect(() => {
    const path = ["parent", "student"].includes(user.role) && selectedChildId
      ? `/api/exercises?child_id=${selectedChildId}`
      : "/api/exercises";
    api<Exercise[]>(path).then(setExercises).catch((cause) => {
      setExercises([]);
      setRequestError(cause instanceof Error ? `Не удалось загрузить задания: ${cause.message}` : "Не удалось загрузить задания");
    });
  }, [selectedChildId, user.role, catalogRevision]);

  useEffect(() => {
    if (!child?.id || !["parent", "student"].includes(user.role)) {
      queueMicrotask(() => setConsent(null));
      return;
    }
    let active = true;
    api<ChildConsent>(`/api/children/${child.id}/consent`).then(value => { if (active) setConsent(value); }).catch((cause) => {
      if (!active) return;
      setConsent(null);
      setRequestError(cause instanceof Error ? `Не удалось проверить разрешения семьи: ${cause.message}` : "Не удалось проверить разрешения семьи");
    });
    return () => { active = false; };
  }, [child?.id, user.role]);

  useEffect(() => {
    if (!child?.id) { queueMicrotask(() => setActiveSessionLoading(false)); return; }
    let cancelled = false;
    api<LearningSession | null>(`/api/children/${child.id}/active-session`).then((session) => {
      if (cancelled) return;
      setActiveSession(current => reconcileActiveSession(current, session, child.id, ["session", "exercise-complete"].includes(screen)));
      if (session && session.status !== "completed") setDailyMinutes(session.target_minutes);
    }).catch((cause) => {
      if (cancelled) return;
      setRequestError(cause instanceof Error ? `Не удалось проверить незавершённое занятие: ${cause.message}` : "Не удалось проверить незавершённое занятие");
    }).finally(() => { if (!cancelled) setActiveSessionLoading(false); });
    return () => { cancelled = true; };
  }, [child?.id, screen]);

  const refreshDashboard = useCallback(() => {
    if (child?.id) api<Dashboard>(`/api/dashboard/${child.id}`).then(setDashboard).catch((cause) => {
      setRequestError(cause instanceof Error ? `Не удалось обновить историю практики: ${cause.message}` : "Не удалось обновить историю практики");
    });
  }, [child]);
  useEffect(refreshDashboard, [refreshDashboard]);

  const saveSession = async (exerciseId: number, module: ModuleName, score: number, details: Record<string, unknown>, measurement: GameMeasurement = {}) => {
    if (!child || !exerciseId) return;
    setSessionError("");
    const startedAt = gameStartedAtRef.current || Date.now();
    const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    if (user.role === "parent" && parentPracticeMode === "adult_preview") {
      const currentIndex = exercises.findIndex((item) => item.id === exerciseId);
      const nextExercise = currentIndex >= 0 ? exercises[currentIndex + 1] || null : null;
      const previewResult: SessionSaveResult = {
        awarded_stars: 0,
        score,
        duration_seconds: durationSeconds,
        attempt_status: measurement.attempt_status || "completed",
        created_at: new Date().toISOString(),
        preview: true,
      };
      setExerciseCompletion({
        title: "Предпросмотр завершён",
        message: "Это был просмотр взрослого. Ответы не сохранены в истории ребёнка и не влияют на подбор заданий.",
        nextExercise,
        sessionMode: false,
        sessionFinished: false,
      });
      setScreen("exercise-complete");
      return previewResult;
    }
    if (!consent?.privacy_accepted) {
      setSessionError(user.role === "parent" ? "Сначала откройте кабинет родителя и разрешите сохранение результатов." : "Попроси взрослого разрешить сохранение результатов.");
      return null;
    }
    if (!navigator.onLine) {
      setSessionError("Сейчас нет интернета. Результат не сохранён автоматически и пропадёт при обновлении или закрытии страницы. Не обновляйте страницу; после восстановления связи нажмите сохранение ещё раз.");
      return null;
    }
    const sequenceIndex = sessionExerciseActive ? activeSession?.exercises.findIndex((item) => item.id === exerciseId) : undefined;
    const supportContext = user.role === "student"
      ? "independent"
      : measurement.prompt_level === "full"
        ? "caregiver_modelled"
        : measurement.prompt_level === "minimal"
          ? "caregiver_supported"
          : "independent";
    if (savingAttemptRef.current) return null;
    const attemptKey = `${child.id}:${exerciseId}:${gameStartedAtRef.current}:${measurement.attempt_status || "completed"}`;
    if (pendingAttemptRef.current?.key !== attemptKey) {
      pendingAttemptRef.current = { key: attemptKey, body: JSON.stringify({ child_id: child.id, exercise_id: exerciseId, module, score, duration_seconds: durationSeconds, details, ...measurement, event_id: crypto.randomUUID(), actor_role: user.role, response_owner: "child", support_context: supportContext, learning_session_id: sessionExerciseActive ? activeSession?.id || null : null, sequence_index: sequenceIndex !== undefined && sequenceIndex >= 0 ? sequenceIndex : null }) };
    }
    savingAttemptRef.current = true;
    const result = await api<SessionSaveResult>("/api/sessions", { method: "POST", body: pendingAttemptRef.current.body }).catch(async (cause) => {
      if (cause instanceof ApiError && cause.status === 409 && sessionExerciseActive && activeSession) {
        if (["refused", "break"].includes(measurement.attempt_status || "")) {
          await api(`/api/learning-sessions/${activeSession.id}/pause`, { method: "PATCH", body: JSON.stringify({ paused: true }) }).catch(() => null);
        }
        const refreshed = await api<LearningSession>(`/api/learning-sessions/${activeSession.id}`).catch(() => null);
        if (refreshed) { setActiveSession(refreshed); setSessionExerciseActive(false); setScreen("session"); }
        setSessionError(`${cause.message}. ${refreshed ? "Текущий план обновлён; повторный результат не записан." : "Не удалось обновить план. Вернитесь на главную и восстановите занятие."}`);
        return null;
      }
      setSessionError(`${cause instanceof Error ? cause.message : "Не удалось сохранить результат"}. Попытка осталась на экране — можно повторить сохранение.`);
      return null;
    }).finally(() => { savingAttemptRef.current = false; });
    if (result) {
      if (result.awarded_stars > 0 && !settingsRef.current.calm_mode) {
        setReward({ stars: result.awarded_stars, nonce: Date.now() });
        window.setTimeout(() => setReward(null), 2200);
      }
      gameStartedAtRef.current = Date.now();
      refreshDashboard();
      loadNotifications();
      if (sessionExerciseActive && activeSession && sequenceIndex !== undefined && sequenceIndex >= 0) {
        const advancesSession = ["completed", "participated", "refused"].includes(result.attempt_status || "completed");
        const updatedResults = [...(activeSession.results || []), { exercise_id: exerciseId, score: result.score, duration_seconds: result.duration_seconds, attempt_status: result.attempt_status, created_at: result.created_at }];
        const exerciseIds = activeSession.exercises.map((exercise) => exercise.id);
        const nextIndex = advancesSession ? nextIncompleteExerciseIndex(updatedResults, exerciseIds) : activeSession.current_index;
        const updatedSession = { ...activeSession, current_index: nextIndex, status: nextIndex >= activeSession.exercises.length ? "completed" as const : ["refused", "break", "technical_error"].includes(result.attempt_status || "") ? "paused" as const : "in_progress" as const, results: updatedResults };
        setActiveSession(updatedSession);
        if (!advancesSession) return result;
        setExerciseCompletion({
          refused: result.attempt_status === "refused",
          title: result.attempt_status === "refused" ? "Сообщение принято" : "Задание завершено",
          message: result.attempt_status === "refused" ? "«Нет» и «не хочу» - полноценные сообщения. Продолжать не нужно." : "Попытка сохранена. Можно спокойно перейти дальше.",
          nextExercise: updatedSession.exercises[nextIndex] || null,
          sessionMode: true,
          sessionFinished: nextIndex >= updatedSession.exercises.length,
        });
        setScreen("exercise-complete");
      } else if (["completed", "participated", "refused"].includes(result.attempt_status || "completed")) {
        const currentIndex = exercises.findIndex((item) => item.id === exerciseId);
        const nextExercise = currentIndex >= 0 ? exercises[currentIndex + 1] || null : null;
        setExerciseCompletion({
          refused: result.attempt_status === "refused",
          title: result.attempt_status === "refused" ? "Сообщение принято" : "Готово!",
          message: result.attempt_status === "refused" ? "Ребёнок отказался - это не ошибка. Задание можно закончить." : "Попытка сохранена. Выбери, продолжить или вернуться к занятиям.",
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
    if (user.role === "parent") setParentPracticeMode("child_practice");
    setSessionLoading(true); setSessionError("");
    try {
      if (!consent?.privacy_accepted) throw new Error(user.role === "parent" ? "Сначала откройте кабинет родителя и разрешите сохранение программы и результатов." : "Попроси взрослого разрешить сохранение программы и результатов.");
      const existing = await api<LearningSession | null>(`/api/children/${child.id}/active-session`);
      if (existing) {
        setActiveSession(existing);
        setScreen("session");
        return;
      }
      const plan = await api<AdaptivePlan>(`/api/adaptive-plans/${child.id}`, { method: "POST", body: JSON.stringify({ target_minutes: dailyMinutes }) });
      if (!plan.items.length) throw new Error(plan.notices[0]?.message || "Для активных целей пока нет утверждённых заданий.");
      const created = await api<LearningSession>("/api/learning-sessions", { method: "POST", body: JSON.stringify({ child_id: child.id, exercise_ids: plan.items.map((item) => item.exercise_id), target_minutes: plan.target_minutes, adaptive_plan_id: plan.id }) });
      setActiveSession({ ...created, results: [] });
      setScreen("session");
    } catch (cause) {
      setSessionError(cause instanceof Error ? cause.message : "Не удалось подготовить занятие");
    } finally { setSessionLoading(false); }
  };

  const startPreparedPlan = async (plan: AdaptivePlan) => {
    if (!child || !plan.items.length) throw new Error("В подготовленном плане нет доступных заданий");
    if (!consent?.privacy_accepted) throw new Error("Сначала разрешите сохранение программы и результатов в кабинете родителя.");
    if (user.role === "parent") setParentPracticeMode("child_practice");
    const existing = await api<LearningSession | null>(`/api/children/${child.id}/active-session`);
    if (existing) {
      if (existing.adaptive_plan_id !== plan.id) throw new Error("Есть незавершённое занятие. Продолжите его с главной страницы перед запуском другого плана.");
      setActiveSession(existing);
      setScreen("session");
      return;
    }
    const created = await api<LearningSession>("/api/learning-sessions", {
      method: "POST",
      body: JSON.stringify({ child_id: child.id, exercise_ids: plan.items.map((item) => item.exercise_id), target_minutes: plan.target_minutes, adaptive_plan_id: plan.id }),
    });
    setActiveSession({ ...created, results: [] });
    setScreen("session");
  };

  const continueSession = async () => {
    if (!activeSession || sessionLoading) return;
    setSessionLoading(true); setSessionError("");
    setScreen("session");
    try {
      if (activeSession.status === "paused") await api(`/api/learning-sessions/${activeSession.id}/pause`, { method: "PATCH", body: JSON.stringify({ paused: false }) });
      const refreshed = await api<LearningSession>(`/api/learning-sessions/${activeSession.id}`);
      setActiveSession(refreshed);
      if (refreshed.status === "completed" || refreshed.current_index >= refreshed.exercises.length) return;
      if (refreshed.status === "paused") throw new Error("Занятие приостановлено в другом окне. Вернитесь на главную и продолжите его заново.");
      const exercise = refreshed.exercises[refreshed.current_index];
      setSessionExerciseActive(true);
      setSelectedExercise(exercise);
      gameStartedAtRef.current = Date.now();
      setScreen(exercise.module);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (cause) {
      setSessionError(cause instanceof Error ? cause.message : "Не удалось продолжить занятие");
    } finally { setSessionLoading(false); }
  };

  const pauseSession = async () => {
    if (sessionLoading) return;
    if (!activeSession || activeSession.status === "completed") { setActiveSession(null); setScreen("home"); return; }
    setSessionLoading(true); setSessionError("");
    try {
      const value = await api<{ status: "paused" }>(`/api/learning-sessions/${activeSession.id}/pause`, { method: "PATCH", body: JSON.stringify({ paused: true }) });
      setActiveSession({ ...activeSession, status: value.status });
      setScreen("home");
    } catch (cause) {
      setSessionError(cause instanceof Error ? cause.message : "Не удалось поставить занятие на паузу");
    } finally { setSessionLoading(false); }
  };

  const resumeSession = async () => {
    if (!activeSession || !child || sessionLoading) return;
    setSessionLoading(true); setSessionError("");
    if (user.role === "parent") setParentPracticeMode("child_practice");
    try {
      if (activeSession.status === "paused") await api(`/api/learning-sessions/${activeSession.id}/pause`, { method: "PATCH", body: JSON.stringify({ paused: false }) });
      const refreshed = await api<LearningSession | null>(`/api/children/${child.id}/active-session`);
      if (!refreshed) {
        setActiveSession(null);
        setSessionError("Предыдущее занятие уже завершено. Можно начать новое.");
        return;
      }
      setActiveSession(refreshed);
      setScreen("session");
    } catch (cause) {
      setSessionError(cause instanceof Error ? cause.message : "Не удалось восстановить занятие");
    } finally {
      setSessionLoading(false);
    }
  };

  const markNotificationRead = async (id: number) => {
    if (notifications.items.find((item) => item.id === id)?.is_read) return;
    setRequestError("");
    try {
      await api(`/api/notifications/${id}/read`, { method: "PATCH" });
      setNotifications((current) => ({ unread: Math.max(0, current.unread - (current.items.find((item) => item.id === id && !item.is_read) ? 1 : 0)), items: current.items.map((item) => item.id === id ? { ...item, is_read: true } : item) }));
    } catch (cause) {
      setRequestError(cause instanceof Error ? `Уведомление не отмечено прочитанным: ${cause.message}` : "Уведомление не отмечено прочитанным");
    }
  };
  const markAllNotificationsRead = async () => {
    setRequestError("");
    try {
      await api("/api/notifications/actions/read-all", { method: "PATCH" });
      setNotifications((current) => ({ unread: 0, items: current.items.map((item) => ({ ...item, is_read: true })) }));
    } catch (cause) {
      setRequestError(cause instanceof Error ? `Уведомления не изменены: ${cause.message}` : "Уведомления не изменены");
    }
  };

  const changeSettings = (next: AppSettings) => {
    const previous = settingsRef.current;
    const version = ++settingsSaveVersionRef.current;
    settingsRef.current = next;
    setSettings(next);
    setSettingsSaving(true);
    setRequestError("");
    settingsSaveQueueRef.current = settingsSaveQueueRef.current.then(async () => {
      try {
        const saved = await api<AppSettings>("/api/settings", { method: "PUT", body: JSON.stringify(next) });
        if (version === settingsSaveVersionRef.current) {
          settingsRef.current = saved;
          setSettings(saved);
        }
      } catch (cause) {
        if (version === settingsSaveVersionRef.current) {
          settingsRef.current = previous;
          setSettings(previous);
          setRequestError(cause instanceof Error ? `Настройки не сохранены и возвращены к предыдущим: ${cause.message}` : "Настройки не сохранены и возвращены к предыдущим");
        }
      } finally {
        if (version === settingsSaveVersionRef.current) setSettingsSaving(false);
      }
    });
  };

  if (user.role === "parent" && childrenLoading) return <div className="auth-loading"><div className="brand-mark"><BrandIcon /></div><span>Загружаем профиль ребёнка…</span></div>;
  if (["parent", "student"].includes(user.role) && childrenError) return <div className="auth-loading" role="alert"><ShieldAlert size={30}/><span>{childrenError}</span><button className="primary-button" onClick={loadChildren}>Повторить загрузку</button></div>;
  if (user.role === "parent" && !children.length) return <ChildOnboarding user={user} onCreated={(newChild) => { setChildren([newChild]); setSelectedChildId(newChild.id); }} onLogout={onLogout} />;

  const openScreen = (next: Screen, cabinetSection = "overview") => {
    if (user.role === "parent") {
      const url = new URL(window.location.href);
      if (next === "parent") { url.searchParams.set("cabinet", "parent"); url.searchParams.set("section", cabinetSection); }
      else if (!["story-preview", "comic-preview"].includes(next)) { url.searchParams.delete("cabinet"); url.searchParams.delete("section"); }
      window.history.pushState(null, "", url);
      if (next === "parent" && screen === "parent") window.dispatchEvent(new PopStateEvent("popstate"));
    }
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

  const submitGlobalSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const query = globalSearch.trim().toLocaleLowerCase("ru");
    if (!query) return;
    if (/истор|сюжет/.test(query)) openScreen("stories");
    else if (/фото|мир|люд|мест|вещ/.test(query)) openScreen("world");
    else if (/навык|прогресс|карт/.test(query)) openScreen("skills");
    else if (/гайд|родител|совет|помощ/.test(query)) openScreen("guides");
    else if (/слово|aac|общен|сказать/.test(query)) openScreen("aac");
    else openScreen("games");
  };

  const closeSidebar = () => {
    setSidebarOpen(false);
    window.requestAnimationFrame(() => menuButtonRef.current?.focus());
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
      setExerciseCompletion(null);
      void continueSession();
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

  const exerciseBack = () => sessionExerciseActive && activeSession ? setScreen("session") : openScreen("games");
  const activeExerciseContent = <>
    {screen === "motor" && <MotorGame exercises={exercises.filter((item) => item.module === "motor")} initialExercise={selectedExercise} cameraConsentGranted={Boolean(consent?.privacy_accepted && consent?.camera_processing && settings.camera_enabled)} canManageConsent={user.role === "parent"} onOpenConsent={() => openScreen("parent")} onBack={exerciseBack} onComplete={(score, exerciseId, measurement, details) => saveSession(exerciseId, "motor", score, details || { source: "manual" }, measurement)} />}
    {screen === "sensory" && selectedExercise?.engine?.mechanic === "tap_instruction" ? <div className="page-enter game-page"><GameHeader title={selectedExercise.title} subtitle="Выполни один шаг" step="Предмет → цель" onBack={exerciseBack}/><PublishedInstructionRunner scenarios={selectedExercise.engine.content.scenarios || []} soundEnabled={settings.sound_enabled} onSpeak={(text, rate) => speak(text, rate, settings.sound_enabled)} onBack={exerciseBack} onComplete={(measurement, details) => saveSession(selectedExercise.id, "sensory", 0, details, measurement)}/></div> : null}
    {screen === "sensory" && selectedExercise?.engine?.mechanic !== "tap_instruction" && <SensoryGame key={selectedExercise?.id || "sensory"} exercise={selectedExercise?.module === "sensory" ? selectedExercise : exercises.find((item) => item.module === "sensory")} soundEnabled={settings.sound_enabled} onBack={exerciseBack} onComplete={(score, exerciseId, measurement, details) => saveSession(exerciseId, "sensory", score, details || {}, measurement)} />}
    {screen === "mixed" && <PhraseGame key={selectedExercise?.id || "mixed"} childId={child?.id} canManage={user.role === "parent"} exercise={selectedExercise?.module === "mixed" ? selectedExercise : exercises.find((item) => item.module === "mixed")} soundEnabled={settings.sound_enabled} onBack={exerciseBack} onComplete={(score, phrase, exerciseId, measurement) => saveSession(exerciseId, "mixed", score, { phrase }, measurement)} />}
  </>;
  const isChildExerciseFocus = ["motor", "sensory", "mixed"].includes(screen) && (user.role === "student" || (user.role === "parent" && parentPracticeMode === "child_practice"));
  const focusExercise = selectedExercise || exercises.find((item) => item.module === screen);
  const stopFocusedExercise = async (status: "break" | "refused") => {
    if (focusStopping) return;
    if (!focusExercise || !["motor", "sensory", "mixed"].includes(focusExercise.module)) {
      exerciseBack();
      return;
    }
    setFocusStopping(true);
    try {
      const result = await saveSession(focusExercise.id, focusExercise.module, 0, { source: "exercise_focus_shell", reason: "child_choice" }, { attempts_count: 0, correct_answers: 0, prompts_used: 0, attempt_status: status });
      if (result && status === "break") exerciseBack();
    } finally {
      setFocusStopping(false);
    }
  };

  if (screen === "comic-preview" && user.role === "parent") {
    return <InteractiveBook childId={child?.id} storyKey="picnic" onExit={() => openScreen("parent")} calmMode={settings.calm_mode}/>;
  }
  if (screen === "story-preview" && user.role === "parent") {
    return <InteractiveBook childId={child?.id} onExit={() => openScreen("parent")} calmMode={settings.calm_mode}/>;
  }

  if (isChildExerciseFocus) {
    const progress = sessionExerciseActive && activeSession
      ? `Шаг ${Math.min(activeSession.current_index + 1, activeSession.exercises.length)} из ${activeSession.exercises.length}`
      : "Одно задание";
    return <ExerciseFocusShell
      title={focusExercise?.title || "Спокойная практика"}
      progress={progress}
      soundEnabled={settings.sound_enabled}
      stopping={focusStopping}
      onBack={exerciseBack}
      onToggleSound={() => changeSettings({ ...settingsRef.current, sound_enabled: !settingsRef.current.sound_enabled })}
      onBreak={() => void stopFocusedExercise("break")}
      onRefuse={() => void stopFocusedExercise("refused")}
    >
      {!isOnline && <div className="offline-banner" role="status"><CircleAlert size={18}/><span><strong>Нет соединения.</strong> Результат не сохранится автоматически. Не закрывай страницу.</span></div>}
      {externalError && <div className="game-error global-request-error" role="alert"><ShieldAlert size={18}/><span>{externalError}</span><button type="button" className="small-button" onClick={onDismissExternalError}>Закрыть</button></div>}
      {requestError && <div className="game-error global-request-error" role="alert"><ShieldAlert size={18}/><span>{requestError}</span><button type="button" className="small-button" onClick={() => setRequestError("")}>Закрыть</button></div>}
      {sessionError && <div className="game-error" role="alert"><ShieldAlert size={18}/><span>{sessionError}</span></div>}
      {activeExerciseContent}
    </ExerciseFocusShell>;
  }

  const AppRoleShell = user.role === "student" ? ChildShell : user.role === "admin" ? AdminShell : ParentShell;

  return (
    <AppRoleShell>
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <aside id="primary-navigation" className={`sidebar ${sidebarOpen ? "open" : ""}`} aria-hidden={sidebarIsDialog && !sidebarOpen ? true : undefined} inert={sidebarIsDialog && !sidebarOpen ? true : undefined}>
        <button type="button" className="brand" onClick={() => openScreen("home")} aria-label="Söyle - на главную">
          <BrandLogo variant="compact" width={170} decorative />
        </button>
        <button ref={sidebarCloseRef} className="sidebar-close" onClick={closeSidebar} aria-label="Закрыть меню"><X /></button>
        <nav aria-label="Основное меню">
          {navigation.map((item) => {
            const active = screen === item.id || (item.id === "games" && ["session", "exercise-complete", "motor", "sensory", "mixed"].includes(screen));
            const Icon = item.icon;
            return (
              <button key={item.id} className={`${active ? "active " : ""}${item.id === "more" ? "mobile-more-link" : ""}`} onClick={() => openScreen(item.id)}>
                <Icon size={20} strokeWidth={2} /><span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-note">
          <span className="note-spark">{user.role === "student" ? "‖" : "✦"}</span>
          <strong>{user.role === "student" ? "Твой спокойный темп" : "История практики"}</strong>
          <span>{user.role === "student" ? "Можно сделать паузу в любой момент" : `${dashboard?.week_sessions || 0} занятий на этой неделе`}</span>
        </div>
        <button type="button" className="sidebar-logout" onClick={onLogout}><LogOut size={20} aria-hidden="true"/><span>Выйти из аккаунта</span></button>
        <div className="profile-mini">
          <button className="avatar avatar-button" onClick={() => openScreen("profile")} aria-label="Открыть профиль">{user.full_name[0]}</button>
          <button className="profile-mini-info" onClick={() => openScreen("profile")}><strong>{user.full_name}</strong><span>{roleLabel(user.role)}</span></button>
          <button className="logout-mini" onClick={onLogout} aria-label="Выйти"><LogOut size={17} /></button>
        </div>
      </aside>

      {sidebarOpen && sidebarIsDialog && <button className="overlay" onClick={closeSidebar} aria-label="Закрыть меню" />}

      <main className="main">
        <header className="topbar v2-topbar">
          <button ref={menuButtonRef} className="menu-button" onClick={() => setSidebarOpen(true)} aria-label="Открыть меню" aria-expanded={sidebarOpen} aria-controls="primary-navigation"><Menu /></button>
          <div className="mobile-logo"><BrandLogo variant="compact" width={116} /></div>
          {user.role === "parent" && <form className="v2-global-search" role="search" onSubmit={submitGlobalSearch}><Search/><input value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} placeholder="Поиск по занятиям, историям, гайдам…" aria-label="Поиск по Söyle"/><button aria-label="Найти"><ArrowRight/></button></form>}
          <div className="top-actions v2-top-actions">
            {user.role !== "student" && user.role !== "parent" && <button className="language" data-i18n-native onClick={() => openScreen("settings")} aria-label={{ ru: "Язык интерфейса: русский", en: "Interface language: English", kk: "Интерфейс тілі: қазақша" }[settings.language]}><Languages size={17} /> {{ ru: "RU", en: "EN", kk: "ҚАЗ" }[settings.language]}</button>}
            {user.role !== "student" && user.role !== "parent" && <div className="stars"><Star size={18} fill="currentColor" /> {dashboard?.stars || 0}</div>}
            <button className="v2-icon-button" onClick={() => openScreen("settings")} aria-label="Настройки"><Settings size={21}/></button>
            {user.role === "parent" && <div className="notification-wrap"><button className="notification-button" onClick={() => setNotificationsOpen((value) => !value)} aria-label="Уведомления"><Bell size={19}/>{notifications.unread > 0 && <i>{notifications.unread}</i>}</button>{notificationsOpen && <div className="notification-panel"><div className="notification-head"><div><span className="kicker">УВЕДОМЛЕНИЯ</span><strong>События программы</strong></div>{notifications.unread > 0 && <button onClick={markAllNotificationsRead}>Прочитать все</button>}</div><div className="notification-list">{notifications.items.length ? notifications.items.map((item) => <button key={item.id} className={item.is_read ? "read" : "unread"} onClick={() => markNotificationRead(item.id)}><span className="notification-symbol"><Trophy size={18}/></span><div><strong>{item.title}</strong><p>{item.message}</p><small>{new Date(item.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</small></div>{!item.is_read && <i/>}</button>) : <div className="notification-empty"><Bell size={24}/><strong>Пока всё спокойно</strong><span>Здесь появятся отметки о занятиях и новых шагах программы.</span></div>}</div></div>}</div>}
            {user.role === "parent" && <span className="v2-top-divider"/>}
            {user.role === "parent" && <button className="v2-user-greeting" onClick={() => openScreen("profile")}><span>Привет,</span><strong>{user.full_name.split(" ")[0]}!</strong></button>}
            <button className="avatar small avatar-button" onClick={() => openScreen("profile")} aria-label="Открыть профиль">{user.full_name[0]}</button>
          </div>
        </header>

        {!isOnline && <div className="offline-banner" role="status"><CircleAlert size={18}/><span><strong>Нет соединения.</strong> Результат не сохранится автоматически и пропадёт при обновлении или закрытии страницы. Не обновляйте страницу; после восстановления связи повторите сохранение.</span></div>}
        {externalError && <div className="game-error global-request-error" role="alert"><ShieldAlert size={18}/><span>{externalError}</span><button type="button" className="small-button" onClick={onDismissExternalError}>Закрыть</button></div>}
        {requestError && <div className="game-error global-request-error" role="alert"><ShieldAlert size={18}/><span>{requestError}</span><button type="button" className="small-button" onClick={() => setRequestError("")}>Закрыть</button></div>}

        <div className="page">
          {screen === "home" && <HomeScreen onOpenSpecialist={() => openScreen("parent", "specialist")} onOpen={openScreen} onExercise={openExercise} onStartSession={startDailySession} onResume={resumeSession} activeSession={activeSession} activeSessionLoading={activeSessionLoading} dailyMinutes={dailyMinutes} onMinutesChange={setDailyMinutes} sessionLoading={sessionLoading} sessionError={sessionError} child={child} dashboard={dashboard} consent={consent} userRole={user.role} exercises={exercises} />}
          {screen === "stories" && user.role === "student" && <StoryExperience childId={child?.id} calmMode={settings.calm_mode}/>}
          {screen === "world" && ["student", "parent"].includes(user.role) && <WorldExperience key={child?.id} childId={child?.id} canManage={user.role === "parent"} onWords={() => openScreen("aac")} onSpeak={(text) => speak(text, .82, true)}/>}
          {screen === "skills" && user.role === "student" && <SkillsExperience child={child} dashboard={dashboard} exercises={exercises} onNavigate={openScreen} onExercise={openExercise}/>}
          {screen === "achievements" && user.role === "student" && <AchievementsExperience childId={child?.id} dashboard={dashboard} onStories={() => openScreen("stories")} onGames={() => openScreen("games")}/>}
          {screen === "guides" && user.role === "parent" && <GuidesExperience child={child} dashboard={dashboard} exercises={exercises} onNavigate={openScreen} onExercise={openExercise}/>}
          {screen === "games" && <GamesScreen onOpen={openScreen} onExercise={openExercise} dashboard={dashboard} exercises={exercises} childMode={user.role === "student"} parentPracticeMode={user.role === "parent" ? parentPracticeMode : undefined} onParentPracticeModeChange={setParentPracticeMode} />}
          {screen === "session" && sessionError && <div className="v2-inline-alert" role="alert">{sessionError}</div>}
          {screen === "session" && activeSession && <SessionScreen session={activeSession} busy={sessionLoading} onContinue={continueSession} onPause={pauseSession} onFinish={() => { setActiveSession(null); refreshDashboard(); setScreen("home"); }} />}
          {screen === "exercise-complete" && exerciseCompletion && <ExerciseCompletionScreen completion={exerciseCompletion} onContinue={continueAfterExercise} onFinish={() => { if (exerciseCompletion.refused) { if (exerciseCompletion.sessionMode) void pauseSession(); else openScreen("home"); } else openScreen(exerciseCompletion.sessionMode ? "session" : "games"); }} />}
          {user.role === "parent" && parentPracticeMode === "adult_preview" && ["motor", "sensory", "mixed"].includes(screen) && <div className="adult-preview-banner" role="status"><Eye size={19}/><div><strong>Предпросмотр взрослого</strong><span>Ответы не сохраняются в профиль ребёнка.</span></div><button type="button" onClick={() => setParentPracticeMode("child_practice")}>Перейти к практике ребёнка</button></div>}
          {sessionError && ["motor", "sensory", "mixed"].includes(screen) && <div className="game-error" role="alert"><ShieldAlert size={18}/><span>{sessionError}</span></div>}
          {activeExerciseContent}
          {screen === "aac" && <PhraseGame key="free-aac" childId={child?.id} canManage={user.role === "parent"} freeMode soundEnabled={settings.sound_enabled} onBack={() => openScreen("home")} />}
          {screen === "ai" && user.role === "parent" && <AIParentScreen child={child} />}
          {screen === "progress" && <ProgressScreen childId={child?.id} dashboard={dashboard} onStartPractice={() => openScreen("games")} />}
          {screen === "goals" && user.role === "parent" && <GoalsAndPractice child={child} targetMinutes={dailyMinutes} onStartPlan={startPreparedPlan} onPracticeChanged={() => { setExercises([]); setCatalogRevision(value => value + 1); refreshDashboard(); }}/>}
          {screen === "parent" && <ParentScreen key={child?.id} child={child} childProfiles={children} onSelectChild={setSelectedChildId} onDeleted={(id) => { const remaining = children.filter((item) => item.id !== id); setChildren(remaining); setSelectedChildId(remaining[0]?.id || null); setScreen("home"); }} dashboard={dashboard} onConsentChange={setConsent} onNavigate={openScreen} />}
          {screen === "more" && user.role === "student" && <ChildMoreScreen onOpen={openScreen}/>}
          {screen === "more" && user.role === "parent" && <ParentMoreScreen onOpen={openScreen}/>}
          {screen === "profile" && user.role === "parent" && <ParentAccountDeletion onDeleted={onLogout}/>}
          {screen === "profile" && <ProfileScreen user={user} child={child} dashboard={dashboard} settings={settings} onOpen={openScreen} onLogout={onLogout}/>}
          {screen === "admin" && <AdminScreen />}
          {screen === "settings" && <SettingsScreen role={user.role} settings={settings} saving={settingsSaving} onChange={changeSettings} onLogout={onLogout} onOpenParent={() => openScreen("parent")} />}
        </div>
      </main>
      {reward && <RewardCelebration key={reward.nonce} stars={reward.stars} />}
    </AppRoleShell>
  );
}

function RewardCelebration({ stars }: { stars: number }) {
  return <div className="reward-layer" role="status" aria-live="polite"><div className="reward-card"><div className="reward-star">★</div><strong>+{stars} {stars === 1 ? "звезда" : stars < 5 ? "звезды" : "звёзд"}</strong><span>Игровая попытка сохранена</span></div>{[0,1,2,3,4,5,6,7].map((item) => <i key={item} style={{ "--reward-index": item } as React.CSSProperties}>★</i>)}</div>;
}

function ChildOnboarding({ user, onCreated, onLogout }: { user: User; onCreated: (child: Child) => void; onLogout: () => void }) {
  const [name, setName] = useState(""); const [birthDate, setBirthDate] = useState(""); const [module, setModule] = useState<ModuleName>("mixed"); const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setError(""); try { const child = await api<Child>("/api/children", { method: "POST", body: JSON.stringify({ name, birth_date: birthDate, primary_module: module, avatar_color: "#f07d68" }) }); onCreated(child); } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось создать профиль"); } };
  return <div className="onboarding-page"><div className="onboarding-card"><div className="brand"><BrandLogo variant="vertical" width={150} /><span>первичная настройка</span></div><span className="kicker">ДОБРО ПОЖАЛОВАТЬ, {user.full_name.toUpperCase()}</span><h1>Создадим профиль ребёнка</h1><p>Это поможет сохранять историю практики и готовить короткие адаптивные планы по локальным правилам.</p><form onSubmit={submit}><label>Имя ребёнка<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Алихан" required minLength={2}/></label><label>Дата рождения<input type="date" max={new Date().toISOString().slice(0,10)} value={birthDate} onChange={(e) => setBirthDate(e.target.value)} required/></label><label>Стартовое направление<select value={module} onChange={(e) => setModule(e.target.value as ModuleName)}><option value="sensory">Игровые задания на слух</option><option value="mixed">AAC-коммуникация и смешанная практика</option></select></label>{error && <div className="auth-error">{error}</div>}<button className="primary-button">Создать профиль <ChevronRight size={18}/></button></form><button className="auth-switch" onClick={onLogout}>Выйти из аккаунта</button></div></div>;
}

function roleLabel(role: Role) {
  return { admin: "Администратор", parent: "Родитель", student: "Ученик", specialist: "Специалист" }[role];
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
      await api<{ user: User }>(`/api/auth/${endpoint}`, {
        method: "POST", body: JSON.stringify(payload),
      });
      const currentUser = await api<User>("/api/auth/me");
      clearLegacyAuth(); onAuthenticated(currentUser);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Ошибка авторизации";
      setError(message === "Не удалось подтвердить авторизацию"
        ? "Вход не сохранился в браузере. Разрешите cookies или откройте Söyle в Safari/Chrome и попробуйте ещё раз."
        : message);
    }
    finally { setLoading(false); }
  };

  const heading = mode === "student" ? "Вход для ребёнка" : mode === "login" ? "Вход в аккаунт" : "Регистрация родителя";
  const switchMode = (next: "login" | "register" | "student") => { setMode(next); setUsername(""); setPassword(""); setError(""); setShowPassword(false); };
  return <div className="auth-page">
    <div className="auth-visual">
      <div className="auth-brand"><BrandLogo variant="primary" width={270} priority /></div>
      <div className="auth-copy"><span className="pill"><ShieldCheck size={15}/> Спокойная ежедневная практика</span><h1>Помогаем ребёнку<br/><em>понимать и общаться</em></h1><p>Короткие игровые задания на слуховое различение и поддерживаемую коммуникацию.</p><div className="auth-benefits"><span><Check/> Пошаговая программа</span><span><Check/> История практики</span><span><Check/> Отдельный вход ребёнка</span></div></div>
      <div className="auth-orbs"><i><Bot/></i><i><ModuleGlyph module="sensory"/></i><i><ModuleGlyph module="mixed"/></i></div>
    </div>
    <div className="auth-form-wrap"><Link href="/" className="auth-back-home"><ArrowLeft size={17}/> На главную</Link><form className="auth-card" autoComplete="off" onSubmit={submit}>
      <div className="auth-card-brand"><BrandLogo variant="primary" width={230} priority /></div>
      <div className="auth-role-tabs" aria-label="Тип входа"><button type="button" className={mode !== "student" ? "active" : ""} onClick={() => switchMode("login")}><UserRoundCheck size={18}/> Взрослый</button><button type="button" className={mode === "student" ? "active" : ""} onClick={() => switchMode("student")}><Backpack size={18}/> Ребёнок</button></div>
      <span className="kicker">{mode === "register" ? "НОВЫЙ АККАУНТ" : "ДОБРО ПОЖАЛОВАТЬ"}</span><h2>{heading}</h2><p>{mode === "student" ? "Введите логин и цифровой PIN, которые выдал родитель." : mode === "login" ? "Продолжите занятия или посмотрите историю практики ребёнка." : "После регистрации вы создадите профиль ребёнка и выберете направление занятий."}</p>
      {mode === "register" && <label>Ваше имя<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Айгерим" autoComplete="name" required minLength={2}/></label>}
      <label>{mode === "student" ? "Логин ребёнка" : "Логин"}<span className="auth-input"><UserRound size={17}/><input type="text" autoComplete="off" autoCapitalize="none" spellCheck={false} data-1p-ignore data-lpignore="true" value={username} onChange={(e) => setUsername(e.target.value.replace(/[^A-Za-z0-9_.-]/g, ""))} placeholder={mode === "student" ? "Логин от родителя" : "Латинские буквы и цифры"} pattern={"[A-Za-z0-9_.\\-]+"} required minLength={3}/></span>{mode === "register" && <small>Не менее 3 символов: латинские буквы, цифры, точка, дефис или подчёркивание.</small>}</label>
      <label>{mode === "student" ? "PIN-код" : "Пароль"}<span className="auth-input"><KeyRound size={17}/><input type={showPassword ? "text" : "password"} autoComplete="new-password" data-1p-ignore data-lpignore="true" inputMode={mode === "student" ? "numeric" : undefined} value={password} onChange={(e) => setPassword(mode === "student" ? e.target.value.replace(/\D/g, "") : e.target.value)} placeholder={mode === "student" ? "4-12 цифр" : "Введите пароль"} required minLength={mode === "register" ? 8 : mode === "student" ? 4 : 1} maxLength={mode === "student" ? 12 : undefined}/><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></span>{mode === "register" && <small>Не менее 8 символов.</small>}</label>
      {error && <div className="auth-error" role="alert"><CircleHelp size={17}/><span>{error}</span></div>}
      <button className="primary-button auth-submit" disabled={loading}>{loading ? "Подождите…" : mode === "register" ? "Создать аккаунт" : mode === "student" ? "Начать заниматься" : "Войти"}<ChevronRight size={18}/></button>
      {mode !== "student" && <div className="auth-secondary">{mode === "login" ? "Впервые в Söyle?" : "Уже зарегистрированы?"}<button type="button" onClick={() => switchMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "Создать аккаунт родителя" : "Войти"}</button></div>}
      {mode === "student" && <div className="student-help"><ShieldCheck size={17}/><span>Логин и PIN ребёнка создаются в кабинете родителя. Электронная почта не нужна.</span></div>}
    </form></div>
  </div>;
}

type HomeScreenProps = { onOpenSpecialist: () => void; onOpen: (screen: Screen) => void; onExercise: (exercise: Exercise) => void; onStartSession: () => void; onResume: () => void; activeSession: LearningSession | null; activeSessionLoading: boolean; dailyMinutes: 3 | 5 | 10; onMinutesChange: (value: 3 | 5 | 10) => void; sessionLoading: boolean; sessionError: string; child?: Child; dashboard: Dashboard | null; consent: ChildConsent | null; userRole: Role; exercises: Exercise[] };

function HomeScreen(props: HomeScreenProps) {
  if (props.userRole === "student") return <ChildHomeScreen {...props}/>;
  if (props.userRole !== "parent") return null;
  return <>{props.sessionError && <div className="v2-inline-alert" role="alert">{props.sessionError}</div>}<ParentOverview exercises={props.exercises} onExercise={props.onExercise} onOpenSpecialist={props.onOpenSpecialist} child={props.child} dashboard={props.dashboard} activeSession={props.activeSession} onStartSession={props.onStartSession} onResume={props.onResume} onNavigate={props.onOpen}/></>;
}

function ChildHomeScreen({ onOpen, onExercise, onStartSession, onResume, activeSession, activeSessionLoading, dailyMinutes, onMinutesChange, sessionLoading, sessionError, child, dashboard, consent, exercises }: HomeScreenProps) {
  const currentSession = activeSession && activeSession.status !== "completed" ? activeSession : null;
  return <div className="v2-child-dashboard">
    {!consent?.privacy_accepted && <section className="consent-banner child-consent" role="status"><ShieldAlert size={24}/><div><strong>Попроси взрослого включить сохранение</strong><p>Игры можно посмотреть, но результат пока не сохранится.</p></div></section>}
    <ParentDashboardExperience child={child} dashboard={dashboard} exercises={exercises} currentSession={currentSession} activeSessionLoading={activeSessionLoading} dailyMinutes={dailyMinutes} onMinutesChange={onMinutesChange} sessionLoading={sessionLoading} sessionError={sessionError} canSaveResults={Boolean(consent?.privacy_accepted)} onStartSession={onStartSession} onResume={onResume} onNavigate={onOpen} onExercise={onExercise} onProductScreen={(screen) => onOpen(screen)} childMode/>
  </div>;
}

function SessionScreen({ session, busy, onContinue, onPause, onFinish }: { session: LearningSession; busy: boolean; onContinue: () => void; onPause: () => void; onFinish: () => void }) {
  const complete = session.current_index >= session.exercises.length || session.status === "completed";
  const results = session.results || [];
  const summary = summarizeSessionResults(results, session.exercises.map((exercise) => exercise.id));
  const totalMinutes = Math.max(1, Math.round(summary.durationSeconds / 60));
  if (complete) return <div className="page-enter session-complete"><div className="completion-mascot"><Image src="/illustrations/session-complete-parrot.webp" alt="Попугай Söyle в новой праздничной позе отмечает завершение занятия" width={190} height={285}/></div><span className="kicker">ЗАНЯТИЕ ЗАВЕРШЕНО</span><h1>Отличная работа!</h1><p>Результаты сохранены в профиле. Это показатели игровых заданий, а не медицинская оценка.</p><div className="session-summary"><StatCard icon={<Check/>} value={`${summary.completedCount}/${session.exercises.length}`} label="заданий выполнено"/><StatCard icon={<Target/>} value={summary.averageScore === null ? "без оценки" : `${summary.averageScore}%`} label="средний игровой результат"/><StatCard icon={<Timer/>} value={`${totalMinutes} мин`} label="время занятия"/></div><button className="primary-button" onClick={onFinish}>Вернуться на главную <ChevronRight size={18}/></button></div>;
  return <div className="page-enter stack-xl"><PageTitle eyebrow="СЕГОДНЯШНЕЕ ЗАНЯТИЕ" title="Короткая практика шаг за шагом" subtitle="Перед сменой активности посмотри, что будет дальше. Пауза сохранит занятие."/><section className="session-mode"><div className="session-progress-head"><div><strong>{session.current_index} из {session.exercises.length} шагов завершено</strong><span>Осталось примерно {Math.max(1, Math.round(session.target_minutes * (session.exercises.length - session.current_index) / session.exercises.length))} минут</span></div><b>{Math.round(session.current_index / session.exercises.length * 100)}%</b></div><div className="session-progress-track"><i style={{width:`${session.current_index / session.exercises.length * 100}%`}}/></div><div className="activity-warning"><Sparkles size={18}/><span>Сейчас: <b>{session.exercises[session.current_index]?.title}</b>{session.exercises[session.current_index + 1] ? ` · затем ${session.exercises[session.current_index + 1].title}` : " · это последнее задание"}</span></div><div className="session-steps">{session.exercises.map((exercise, index) => { const done = index < session.current_index; const current = index === session.current_index; return <div key={exercise.id} className={`${done ? "done" : ""} ${current ? "current" : ""}`}><span>{done ? <Check size={20}/> : index + 1}</span><div><small>{exercise.adaptive ? `Цель: ${exercise.adaptive.goal_title}` : exercise.skill ? skillLabel(exercise.skill) : "Практика"}</small><strong>{exercise.title}</strong><p>{exercise.instruction}</p>{exercise.adaptive && <em className="session-adaptive-note">{exercise.adaptive.assignment_reason.messages[0]}</em>}</div>{current ? <Play size={20}/> : done ? <Star size={18} fill="currentColor"/> : <LockKeyhole size={18}/>}</div>; })}</div><div className="session-actions"><button className="small-button" disabled={busy} onClick={onPause}>Сделать паузу</button><button className="primary-button session-continue" disabled={busy} onClick={onContinue}><Play size={18} fill="currentColor"/>{session.current_index ? "Продолжить занятие" : "Начать с разминки"}</button></div></section></div>;
}

function ExerciseCompletionScreen({ completion, onContinue, onFinish }: { completion: ExerciseCompletion; onContinue: () => void; onFinish: () => void }) {
  const nextLabel = completion.sessionFinished
    ? "Посмотреть итог занятия"
    : completion.nextExercise
      ? `Дальше: ${completion.nextExercise.title}`
      : "Вернуться к занятиям";
  return <div className="page-enter exercise-completion" role="status" aria-live="polite">
    <div className="completion-check"><Check size={42} strokeWidth={2.2}/></div>
    <span className="kicker">{completion.refused ? "ПРАКТИКА ОСТАНОВЛЕНА" : "ШАГ ЗАВЕРШЁН"}</span>
    <h1>{completion.title}</h1>
    <p>{completion.message}</p>
    {!completion.refused && completion.nextExercise && !completion.sessionFinished && <div className="next-activity-preview"><span>СЛЕДУЮЩЕЕ ЗАДАНИЕ</span><strong>{completion.nextExercise.title}</strong><small>{completion.nextExercise.instruction}</small></div>}
    <div className="completion-actions">
      <button className="primary-button" onClick={completion.refused ? onFinish : onContinue}>{completion.refused ? "Закончить практику" : nextLabel}<ChevronRight size={18}/></button>
      {!completion.refused && !completion.sessionFinished && <button className="secondary-button" onClick={onFinish}>{completion.sessionMode ? "Вернуться к плану" : "Закончить практику"}</button>}
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
      <div className="module-bottom"><small>Охват попытками: {module.progress}%{total ? ` · ${Math.min(completed || 0, total)} из ${total}` : ""}</small><span className="round-arrow"><ChevronRight size={18} /></span></div>
    </button>
  );
}

function GamesScreen({ onOpen, onExercise, dashboard, exercises, childMode, parentPracticeMode, onParentPracticeModeChange }: { onOpen: (screen: Screen) => void; onExercise: (exercise: Exercise) => void; dashboard: Dashboard | null; exercises: Exercise[]; childMode: boolean; parentPracticeMode?: ParentPracticeMode; onParentPracticeModeChange?: (mode: ParentPracticeMode) => void }) {
  return (
    <div className={`page-enter stack-xl exercise-catalog-page ${childMode ? "child-games" : ""}`}>
      <section className="exercise-catalog-hero">
        <div className="exercise-catalog-hero-copy"><span className="kicker">ЗАНЯТИЯ · {exercises.length}</span><h1>{childMode ? "Выбери игру" : "Все занятия"}</h1><p>Все доступные задания собраны здесь. Выбирай любое — проходить их по порядку не нужно.</p></div>
        <Image src="/app-illustrations/exercise-library-hero.webp" width={768} height={512} alt="Ребёнок выбирает карточку с водой вместе с мишкой" priority />
      </section>
      {exercises.some((item) => item.engine?.review_gate.demo_only) && <div className="unreviewed-demo-banner" role="status"><ShieldAlert size={20}/><div><strong>{childMode ? "Знакомые игры" : "Практика из прежней библиотеки"}</strong><span>{childMode ? "Выбирай любую игру. Если понадобится помощь, позови взрослого." : "Эти задания доступны для свободной игры, но пока не прошли повторную независимую проверку. Это не утверждённая программа занятий."}</span></div></div>}
      <button className="child-aac-entry" onClick={() => onOpen("aac")}><Image src="/app-illustrations/aac-help.webp" width={78} height={78} alt="Карточка помощи"/><div><strong>Сказать, что нужно</strong><small>Помощь, перерыв, отказ и другие важные сообщения</small></div><ChevronRight size={24}/></button>
      {parentPracticeMode && <section className="practice-mode-card" aria-labelledby="practice-mode-title"><div><Eye size={22}/><span><strong id="practice-mode-title">Кто сейчас выполняет задание?</strong><small>Предпросмотр взрослого никогда не попадает в историю и адаптивный подбор.</small></span></div><div className="practice-mode-options"><button type="button" className={parentPracticeMode === "adult_preview" ? "active" : ""} aria-pressed={parentPracticeMode === "adult_preview"} onClick={() => onParentPracticeModeChange?.("adult_preview")}><Eye size={17}/> Предпросмотр взрослого</button><button type="button" className={parentPracticeMode === "child_practice" ? "active" : ""} aria-pressed={parentPracticeMode === "child_practice"} onClick={() => onParentPracticeModeChange?.("child_practice")}><Baby size={17}/> Практика ребёнка</button></div></section>}
      <ExerciseLibrary items={exercises} completedIds={dashboard?.completed_exercise_ids || []} onExercise={onExercise} />
      {!childMode && <div className="tip-banner"><div className="tip-icon"><Sparkles/></div><div><strong>Подсказка для взрослых</strong><p>Короткую практику можно закончить в любой момент. Частоту, длительность и цели согласуйте со специалистом и состоянием ребёнка.</p></div></div>}
    </div>
  );
}

const exerciseImages: Record<string, string> = {
  animals: "aac-cat.webp", food: "aac-apple.webp", toys: "aac-teddy.webp", body: "aac-me.webp", clothes: "aac-school.webp", household: "aac-home.webp", actions: "aac-walk.webp", qualities: "aac-hot.webp", location: "aac-on-table.webp", places: "aac-playground.webp", opposites: "aac-cold.webp", commands: "aac-play.webp",
  request: "aac-juice.webp", observation: "aac-see.webp", preference: "aac-love.webp", family: "aac-mother.webp", feelings: "aac-happy.webp", routine: "aac-yesterday.webp", help: "aac-help.webp", desire: "aac-want.webp", need: "aac-drink.webp", refusal: "aac-no.webp", choice: "aac-water.webp", greeting: "aac-hello.webp", answer: "aac-yes.webp", agent_action: "aac-played.webp", spatial_phrase: "aac-in-box.webp", question: "aac-what-is-this.webp", past_event: "aac-walked.webp",
};

function ExerciseLibrary({ items, completedIds, onExercise }: { items: Exercise[]; completedIds: number[]; onExercise: (exercise: Exercise) => void }) {
  const completed = new Set(completedIds);
  const labels = { motor: "Зеркало", sensory: "Слушай и выбирай", mixed: "Карточки и фразы" };
  return <section className="exercise-library" aria-labelledby="all-exercises-title"><div className="section-heading"><div><span className="kicker">ВСЁ В ОДНОМ МЕСТЕ</span><h2 id="all-exercises-title">Доступные задания · {items.length}</h2></div></div><div className="exercise-grid">{items.map((exercise) => <button key={exercise.id} className={`exercise-card ${exercise.module}`} onClick={() => onExercise(exercise)}><span className="exercise-card-visual"><Image src={exerciseImages[exercise.target] ? `/app-illustrations/${exerciseImages[exercise.target]}` : exercise.icon} width={320} height={230} alt="" /></span><div className="exercise-card-copy"><small>{labels[exercise.module]}{completed.has(exercise.id) ? " · можно повторить" : ""}</small><strong>{exercise.title}</strong><p>{exercise.instruction}</p><span className="exercise-card-open">Начать <ArrowRight size={18}/></span></div></button>)}</div>{!items.length && <div className="empty-state large"><ShieldAlert size={28}/><strong>Задания пока не загрузились</strong><span>Попробуйте обновить страницу. Черновики и задания на внутренней проверке не входят в этот список.</span></div>}</section>;
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
  { id: "sequence", title: "Улыбка - трубочка", text: "Сначала широко улыбнись, затем сложи губы трубочкой." },
] as const;
type MotorExercise = typeof motorExercises[number]["id"];
type MotorPracticePhase = "idle" | "prepare" | "checking" | "matched" | "not_found";
type MotorDetectionStatus = "idle" | "loading" | "calibrating" | "tracking" | "no_face" | "error";
type MotorDetectionState = { status: MotorDetectionStatus; confidence: number; sequenceStep: 0 | 1; message: string };

const idleMotorDetection: MotorDetectionState = { status: "idle", confidence: 0, sequenceStep: 0, message: "" };

function MouthGuide({ type }: { type: MotorExercise }) {
  if (type === "sequence") return <div className="mouth-sequence" aria-label="Сначала улыбка, затем губы трубочкой"><MouthGuide type="smile"/><ChevronRight/><MouthGuide type="tube"/></div>;
  return <div className={`mouth-guide ${type}`} aria-hidden="true"><i className="guide-eye left"/><i className="guide-eye right"/><span className="guide-mouth">{type === "teeth" && <b><i/><i/><i/><i/></b>}</span>{type === "cheeks" && <><i className="guide-cheek left"/><i className="guide-cheek right"/></>}</div>;
}

function MotorGame({ exercises, initialExercise, cameraConsentGranted, canManageConsent, onOpenConsent, onBack, onComplete }: { exercises: Exercise[]; initialExercise: Exercise | null; cameraConsentGranted: boolean; canManageConsent: boolean; onOpenConsent: () => void; onBack: () => void; onComplete: (score: number, exerciseId: number, measurement: GameMeasurement, details?: Record<string, unknown>) => Promise<unknown> | void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const lastDetectionAtRef = useRef(0);
  const baselineRef = useRef<BlendshapeScores>({});
  const baselineSamplesRef = useRef(0);
  const stableMatchesRef = useRef(0);
  const sequenceStepRef = useRef<0 | 1>(0);
  const bestConfidenceRef = useRef(0);
  const [cameraState, setCameraState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const availableMotorExercises = motorExercises.filter((item) => exercises.some((exercise) => exercise.target === item.id) || initialExercise?.target === item.id);
  const initialIndex = Math.max(0, availableMotorExercises.findIndex((item) => item.id === initialExercise?.target));
  const [exerciseIndex, setExerciseIndex] = useState(initialIndex);
  const [saved, setSaved] = useState<"independent" | "supported" | null>(null);
  const exercise = availableMotorExercises[exerciseIndex] || availableMotorExercises[0];
  const [practice, setPractice] = useState<{ phase: MotorPracticePhase; seconds: number }>({ phase: "idle", seconds: 0 });
  const [detection, setDetection] = useState<MotorDetectionState>(idleMotorDetection);

  const stopAnalysis = useCallback(() => {
    if (animationFrameRef.current !== null) window.cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
    lastVideoTimeRef.current = -1;
    lastDetectionAtRef.current = 0;
  }, []);

  const stopCamera = useCallback(() => {
    stopAnalysis();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, [stopAnalysis]);

  useEffect(() => () => {
    stopCamera();
    faceLandmarkerRef.current?.close();
    faceLandmarkerRef.current = null;
  }, [stopCamera]);

  useEffect(() => {
    if (practice.phase !== "prepare" && practice.phase !== "checking") return;
    const timer = window.setTimeout(() => {
      if (practice.seconds > 1) {
        setPractice({ ...practice, seconds: practice.seconds - 1 });
      } else if (practice.phase === "prepare") {
        if (baselineSamplesRef.current < 3) {
          setPractice({ phase: "not_found", seconds: 0 });
          setDetection({ status: "no_face", confidence: 0, sequenceStep: 0, message: "Не удалось настроить проверку: лицо не было видно" });
        } else {
          setPractice({ phase: "checking", seconds: 10 });
          setDetection({ status: "tracking", confidence: 0, sequenceStep: 0, message: exercise?.id === "sequence" ? "Сначала улыбнись" : "Покажи нужное движение" });
        }
      } else {
        setPractice({ phase: "not_found", seconds: 0 });
        setDetection((current) => ({ ...current, status: "tracking", confidence: 0, message: "Движение пока не найдено" }));
      }
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [exercise?.id, practice]);

  const loadFaceLandmarker = useCallback(async () => {
    if (faceLandmarkerRef.current) return faceLandmarkerRef.current;
    const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
    const landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: "/mediapipe/models/face_landmarker.task", delegate: "CPU" },
      runningMode: "VIDEO",
      numFaces: 1,
      minFaceDetectionConfidence: 0.55,
      minFacePresenceConfidence: 0.55,
      minTrackingConfidence: 0.55,
      outputFaceBlendshapes: true,
    });
    faceLandmarkerRef.current = landmarker;
    return landmarker;
  }, []);

  useEffect(() => {
    if (!exercise || cameraState !== "ready" || (practice.phase !== "prepare" && practice.phase !== "checking")) return;
    let cancelled = false;

    const scanFrame = () => {
      if (cancelled) return;
      const video = videoRef.current;
      const landmarker = faceLandmarkerRef.current;
      const timestamp = performance.now();
      if (video && landmarker && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.currentTime !== lastVideoTimeRef.current && timestamp - lastDetectionAtRef.current >= 120) {
        lastVideoTimeRef.current = video.currentTime;
        lastDetectionAtRef.current = timestamp;
        try {
          const result = landmarker.detectForVideo(video, timestamp);
          const categories = result.faceBlendshapes[0]?.categories || [];
          if (!categories.length) {
            stableMatchesRef.current = 0;
            if (practice.phase === "checking") setDetection((current) => ({ ...current, status: "no_face", confidence: 0, message: "Покажи лицо целиком в рамке" }));
          } else {
            const scores = categoriesToScores(categories);
            if (practice.phase === "prepare") {
              baselineRef.current = mergeBaseline(baselineRef.current, scores, baselineSamplesRef.current);
              baselineSamplesRef.current += 1;
              setDetection({ status: "calibrating", confidence: 0, sequenceStep: 0, message: "Смотри прямо и расслабь лицо" });
            } else {
              const checkedTarget = targetForSequenceStep(exercise.id, sequenceStepRef.current);
              const check = evaluateMotorMovement(checkedTarget, scores, baselineRef.current);
              const confidence = Math.round(check.confidence * 100);
              bestConfidenceRef.current = Math.max(bestConfidenceRef.current, confidence);
              stableMatchesRef.current = check.matched ? stableMatchesRef.current + 1 : 0;

              if (stableMatchesRef.current >= 6) {
                if (exercise.id === "sequence" && sequenceStepRef.current === 0) {
                  sequenceStepRef.current = 1;
                  stableMatchesRef.current = 0;
                  setDetection({ status: "tracking", confidence: 0, sequenceStep: 1, message: "Теперь сложи губы трубочкой" });
                } else {
                  setPractice({ phase: "matched", seconds: 0 });
                  setDetection({ status: "tracking", confidence: 100, sequenceStep: sequenceStepRef.current, message: "Движение распознано" });
                }
              } else {
                const message = exercise.id === "sequence"
                  ? sequenceStepRef.current === 0 ? "Сначала улыбнись" : "Теперь сложи губы трубочкой"
                  : confidence >= 55 ? "Почти получилось — удерживай" : "Повтори движение с картинки";
                setDetection({ status: "tracking", confidence, sequenceStep: sequenceStepRef.current, message });
              }
            }
          }
        } catch {
          setPractice({ phase: "idle", seconds: 0 });
          setDetection({ status: "error", confidence: 0, sequenceStep: 0, message: "Локальная проверка остановилась. Попробуйте запустить ещё раз." });
        }
      }
      animationFrameRef.current = window.requestAnimationFrame(scanFrame);
    };

    animationFrameRef.current = window.requestAnimationFrame(scanFrame);
    return () => {
      cancelled = true;
      stopAnalysis();
    };
  }, [cameraState, exercise, practice.phase, stopAnalysis]);

  const startCamera = async () => {
    if (!cameraConsentGranted) return;
    setCameraState("loading");
    setCameraError(null);
    stopCamera();
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("camera_api_unavailable");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 720, height: 540 }, audio: false });
      streamRef.current = stream;
      if (!videoRef.current) throw new Error("video_element_unavailable");
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCameraState("ready");
      setDetection(idleMotorDetection);
    } catch (cause) {
      stopCamera();
      setCameraState("error");
      const name = cause instanceof DOMException ? cause.name : "";
      if (["NotAllowedError", "SecurityError"].includes(name)) {
        setCameraError("Доступ к камере запрещён в браузере. Разрешите камеру для этого сайта и попробуйте снова.");
      } else if (["NotFoundError", "DevicesNotFoundError"].includes(name)) {
        setCameraError("Камера не найдена. Подключите её или выберите другое устройство.");
      } else if (["NotReadableError", "TrackStartError"].includes(name)) {
        setCameraError("Камера занята другим приложением. Закройте его и попробуйте снова.");
      } else {
        setCameraError("Браузер не смог включить камеру. Проверьте разрешение камеры и откройте сайт через HTTPS или localhost.");
      }
    }
  };

  const disableCamera = () => {
    stopCamera();
    setCameraState("idle");
    setCameraError(null);
    setPractice({ phase: "idle", seconds: 0 });
    setDetection(idleMotorDetection);
  };

  const startPractice = async () => {
    if (cameraState !== "ready") {
      setDetection({ status: "error", confidence: 0, sequenceStep: 0, message: "Сначала включите камеру — без распознанного движения попытка не засчитывается." });
      return;
    }
    setSaved(null);
    setDetection({ status: "loading", confidence: 0, sequenceStep: 0, message: "Готовим локальную проверку…" });
    try {
      await loadFaceLandmarker();
      if (!streamRef.current?.active) {
        setPractice({ phase: "idle", seconds: 0 });
        setDetection({ status: "error", confidence: 0, sequenceStep: 0, message: "Камера была выключена. Включите её и начните проверку снова." });
        return;
      }
      baselineRef.current = {};
      baselineSamplesRef.current = 0;
      stableMatchesRef.current = 0;
      sequenceStepRef.current = 0;
      bestConfidenceRef.current = 0;
      setDetection({ status: "calibrating", confidence: 0, sequenceStep: 0, message: "Смотри прямо и расслабь лицо" });
      setPractice({ phase: "prepare", seconds: 3 });
    } catch {
      setPractice({ phase: "idle", seconds: 0 });
      setDetection({ status: "error", confidence: 0, sequenceStep: 0, message: "Не удалось загрузить локальную проверку. Обновите страницу и попробуйте снова." });
    }
  };

  const resetPractice = () => {
    setPractice({ phase: "idle", seconds: 0 });
    setDetection(idleMotorDetection);
    stableMatchesRef.current = 0;
  };

  const changeExercise = () => {
    const nextIndex = (exerciseIndex + 1) % Math.max(availableMotorExercises.length, 1);
    setExerciseIndex(nextIndex);
    setSaved(null);
    resetPractice();
  };

  const finishDetectedMovement = async (support: "independent" | "supported") => {
    const completedExerciseId = exercises.find((item) => item.target === exercise?.id)?.id;
    if (!completedExerciseId || saved || practice.phase !== "matched") return;
    const result = await onComplete(0, completedExerciseId, {
      attempt_status: "participated",
      attempts_count: 1,
      correct_answers: 1,
      independence: support === "independent" ? 100 : 50,
      prompt_level: support === "independent" ? "independent" : "minimal",
    }, {
      source: "local-face-movement-check",
      detector: "mediapipe-face-blendshapes",
      target: exercise.id,
      movement_detected: true,
      threshold_signal: bestConfidenceRef.current,
      media_sent_to_server: false,
      media_saved: false,
    });
    if (result) setSaved(support);
  };

  const stopExercise = async (status: "break" | "refused") => {
    const completedExerciseId = exercises.find((item) => item.target === exercise?.id)?.id;
    if (!completedExerciseId) return;
    const result = await onComplete(0, completedExerciseId, { attempt_status: status, prompts_used: 0 }, { source: "manual_choice" });
    if (result && status === "break") onBack();
  };

  if (!exercise) return <div className="empty-state large"><ShieldAlert size={28}/><strong>Задания для зеркала пока не загрузились</strong><span>Вернитесь к занятиям, обновите страницу и попробуйте снова.</span><button className="secondary-button" onClick={onBack}>Вернуться к занятиям</button></div>;

  return (
    <div className="page-enter game-page">
      <GameHeader title="Повтори движение перед зеркалом" subtitle="Локальное зеркало" step={`${exerciseIndex + 1} из ${availableMotorExercises.length}`} onBack={onBack} />
      <div className="game-layout">
        <div className="camera-panel">
          <video ref={videoRef} playsInline muted aria-hidden="true" className={cameraState === "ready" ? "visible" : ""} />
          {cameraState !== "ready" && <div className="camera-placeholder" aria-live="polite"><Image className="camera-placeholder-art" src="/app-illustrations/exercise-camera-hero.webp" width={768} height={512} alt="Мальчик с мишкой улыбается перед камерой планшета"/><div className="camera-placeholder-content"><h3>{!cameraConsentGranted ? "Нужно разрешение родителя" : cameraState === "loading" ? "Включаем камеру…" : cameraState === "error" ? "Камеру не удалось запустить" : "Потренируемся перед зеркалом?"}</h3><p>{!cameraConsentGranted ? canManageConsent ? "Разрешите локальную проверку движения в кабинете родителя. Камера не включится автоматически." : "Попроси родителя включить «Локальную проверку движения» в своём кабинете." : cameraState === "error" ? "Исправьте указанную ниже причину и повторите попытку." : "После нажатия браузер отдельно спросит доступ. Кадры анализируются только на этом устройстве, не отправляются и не сохраняются."}</p>{cameraError && <div className="camera-error" role="alert"><ShieldAlert size={17}/><span>{cameraError}</span></div>}{!cameraConsentGranted ? canManageConsent && <button className="primary-button" onClick={onOpenConsent}><ShieldCheck size={19}/> Открыть разрешения</button> : <button className="primary-button" onClick={startCamera} disabled={cameraState === "loading"}><Camera size={19} /> {cameraState === "error" ? "Попробовать ещё раз" : "Включить камеру"}</button>}</div></div>}
          {cameraState === "ready" && <><div className="face-frame" /><div className="camera-label"><span className="live-dot" /> Камера работает локально</div><button className="camera-stop-button" onClick={disableCamera}><CircleX size={15}/> Выключить камеру</button>{practice.phase !== "idle" && !saved && <div className={`motor-attempt-overlay ${practice.phase}`} aria-hidden="true"><div>{practice.phase === "prepare" ? <><small>СПОКОЙНОЕ ЛИЦО</small><strong>{practice.seconds}</strong></> : practice.phase === "checking" ? <><small>{detection.message}</small><strong>{detection.confidence}%</strong></> : practice.phase === "matched" ? <><Check size={54}/><strong>Движение найдено</strong></> : <><RotateCcw size={45}/><strong>Попробуй ещё</strong></>}</div></div>}</>}
        </div>
        <div className="instruction-panel">
          <span className="kicker">ТВОЁ ЗАДАНИЕ</span>
          <div className={`mouth-demo ${exercise.id}`}><MouthGuide type={exercise.id}/></div>
          <h2>{exercise.title}</h2>
          <p>{exercise.text}</p>
          <div className="motor-camera-note"><ShieldCheck size={18}/><span>Алгоритм локально проверяет, появилось ли нужное движение. Это игровая проверка мимики, а не оценка речи, диагноза или качества выполнения.</span></div>
          <div className="coach-note"><Sparkles size={18} /> {cameraState === "ready" ? "Сначала спокойно смотри в камеру 3 секунды, затем повтори движение." : "Для зачёта движения нужно включить камеру слева."}</div>
          <div className="motor-practice-flow" aria-live="polite" aria-atomic="true">
            {saved ? <div className="success-box"><Check size={20}/><div><strong>Движение засчитано</strong><span>Камера увидела нужное изменение мимики. Звезда — за выполненную попытку.</span></div></div> : practice.phase === "idle" ? <><button className="primary-button motor-start-button" onClick={startPractice} disabled={cameraState !== "ready" || detection.status === "loading"}><Play size={18} fill="currentColor"/> {detection.status === "loading" ? "Готовим проверку…" : "Начать проверку"}</button>{detection.message && <div className={`motor-detection-message ${detection.status === "error" ? "error" : ""}`} role={detection.status === "error" ? "alert" : "status"}>{detection.message}</div>}</> : practice.phase === "prepare" || practice.phase === "checking" ? <div className={`motor-practice-status ${practice.phase}`}><span>{practice.phase === "prepare" ? practice.seconds : `${detection.confidence}%`}</span><div><strong>{practice.phase === "prepare" ? "Калибровка" : detection.message}</strong><small>{practice.phase === "prepare" ? "Смотри прямо и расслабь лицо" : detection.status === "no_face" ? "Лицо должно быть целиком внутри рамки" : `Осталось ${practice.seconds} сек.`}</small>{practice.phase === "checking" && <i className="motor-signal-track"><b style={{ width: `${detection.confidence}%` }}/></i>}</div><button className="small-button" onClick={resetPractice}>Остановить</button></div> : practice.phase === "matched" ? <><div className="success-box"><Check size={20}/><div><strong>Движение распознано</strong><span>Теперь отметьте, понадобилась ли помощь взрослого.</span></div></div><div className="motor-finish-actions"><button className="primary-button" onClick={() => finishDetectedMovement("independent")}><Check size={17}/> Самостоятельно</button><button className="secondary-button" onClick={() => finishDetectedMovement("supported")}>С помощью</button></div><button className="secondary-button motor-repeat-button" onClick={startPractice}><RotateCcw size={16}/> Повторить проверку</button></> : <><div className="motor-not-found" role="status"><CircleAlert size={20}/><div><strong>Движение пока не найдено</strong><span>Эта попытка не засчитана. Проверь положение лица и повтори.</span></div></div><button className="primary-button motor-repeat-button" onClick={startPractice}><RotateCcw size={16}/> Попробовать ещё раз</button></>}
          </div>
          {!saved && <div className="motor-stop-actions"><button className="small-button" onClick={() => stopExercise("break")}><Pause size={15}/> Перерыв</button><button className="small-button" onClick={() => stopExercise("refused")}><CircleX size={15}/> Не хочу</button></div>}
          {availableMotorExercises.length > 1 && <button className="secondary-button wide" onClick={changeExercise}>{saved ? "Следующее движение" : "Другое движение"}<ChevronRight size={18} /></button>}
        </div>
      </div>
    </div>
  );
}

type SensoryItem = { key: string; word: string; speech?: string; hint: string; icon?: LucideIcon; image?: string; visualClass?: string; isScene?: boolean };

const sensoryVisualTokens: Record<string, LucideIcon> = {
  dog: Dog, fish: Fish, bird: Bird, rabbit: Rabbit, turtle: Turtle, snail: Snail, bug: Bug,
  milk: Milk, blocks: Blocks, drum: Drum,
};

function SensoryVisual({ item }: { item: SensoryItem }) {
  const Icon = item.icon;
  return <span className={`sensory-visual ${item.visualClass || ""}`} aria-hidden="true">{item.image ? <Image src={item.image} alt="" width={item.isScene ? 960 : 112} height={item.isScene ? 720 : 112} sizes={item.isScene ? "(max-width:480px) calc(100vw - 64px), (max-width:1000px) 45vw, 300px" : undefined}/> : Icon ? <Icon strokeWidth={1.65}/> : null}</span>;
}


type SensoryRound = { target: number; options: number[] };

function createSensoryRound(itemCount: number, optionCount: 2 | 3 | 4, excludedTargets: ReadonlySet<number> = new Set()): SensoryRound {
  const stimuli = Array.from({ length: itemCount }, (_, index) => ({ key: String(index), label: "", speech: "" }));
  const round = createChoiceRound(stimuli, optionCount, [...excludedTargets].map(String));
  return { target: Number(round.targetKey), options: round.optionKeys.map(Number) };
}

function SensoryGame({ exercise, soundEnabled, onBack, onComplete }: { exercise?: Exercise; soundEnabled: boolean; onBack: () => void; onComplete: (score: number, exerciseId: number, measurement: GameMeasurement, details?: Record<string, unknown>) => Promise<unknown> | void }) {
  const sourceStimuli = exercise?.engine?.content.stimuli || [];
  const mixesVisualSystems = sourceStimuli.some((item) => Boolean(item.media_ref)) && sourceStimuli.some((item) => Boolean(item.visual_token));
  const consistentStimuli = mixesVisualSystems ? sourceStimuli.filter((item) => Boolean(item.media_ref)) : sourceStimuli;
  const [roundMedia, setRoundMedia] = useState<Record<string, string>>({});
  const previousMediaRef = useRef<Record<string, string>>({});
  const items: SensoryItem[] = consistentStimuli.map((item) => ({
    key: item.key,
    word: item.label,
    speech: item.speech,
    hint: item.hint || "",
    image: roundMedia[item.key] || item.media_ref,
    isScene: exercise?.engine?.mechanic === "action_choice",
    icon: item.visual_token ? sensoryVisualTokens[item.visual_token] : undefined,
  }));
  const [difficultyLevel, setDifficultyLevel] = useState<1 | 2 | 3>(exercise?.adaptive?.difficulty_params.difficulty_level || Math.min(3, Math.max(1, exercise?.difficulty || 2)) as 1 | 2 | 3);
  const baseDifficulty = resolveDifficulty(exercise?.engine?.content.difficulty_levels, difficultyLevel);
  const planned = exercise?.adaptive?.difficulty_params;
  const difficulty = planned ? { ...baseDifficulty, option_count: planned.option_count || baseDifficulty.option_count, rounds: planned.round_count } : baseDifficulty;
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
  const [accessibleSupportMode, setAccessibleSupportMode] = useState(false);
  const soundButtonRef = useRef<HTMLButtonElement>(null);
  const correctAnswersRef = useRef(0);
  const independentAnswersRef = useRef(0);
  const promptsUsedRef = useRef(0);
  const gameplayChoicesRef = useRef(0);
  const promptLevelRef = useRef<0 | 1 | 2>(0);
  const promptTypesRef = useRef<string[]>([]);
  const roundOutcomesRef = useRef<Array<Record<string, unknown>>>([]);
  const usedTargetsRef = useRef<Set<number>>(new Set());
  const evidenceRef = useRef(newAnswerEvidence());
  const answerLockRef = useRef(false);
  const audioLockRef = useRef(false);
  const stoppedRef = useRef(false);

  useEffect(() => {
    if (phase !== "playing" || audioPending) return;
    const frame = window.requestAnimationFrame(() => soundButtonRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [audioPending, phase, round]);

  if (items.length < difficulty.option_count) return <div className="empty-state large" role="alert"><ShieldAlert size={28}/><strong>Задание пока недоступно</strong><span>Опубликованная версия не содержит достаточного числа проверенных стимулов.</span><button className="secondary-button" onClick={onBack}>Вернуться к занятиям</button></div>;

  const playWord = async (target = roundData?.target, repeat = true) => {
    if (target === undefined || audioLockRef.current || stoppedRef.current) return;
    if (repeat && phase === "playing") {
      evidenceRef.current = withSupport(evidenceRef.current, "repeat_audio");
      promptsUsedRef.current += 1;
      promptTypesRef.current.push("repeat_audio");
      promptLevelRef.current = Math.max(1, promptLevelRef.current) as 1 | 2;
    }
    audioLockRef.current = true;
    setAudioPending(true);
    const played = await speak(items[target].speech || items[target].word, speechRate, soundEnabled);
    audioLockRef.current = false;
    if (stoppedRef.current) return;
    setAudioPending(false);
    if (played) setAudioPlayed(true);
    else { setAudioPlayed(false); setPhase("technical"); }
  };

  const beginRound = async () => {
    if (!soundEnabled) { setPhase("technical"); return; }
    if (usedTargetsRef.current.size >= items.length) usedTargetsRef.current.clear();
    evidenceRef.current = newAnswerEvidence();
    answerLockRef.current = false;
    const nextRound = createSensoryRound(items.length, difficulty.option_count, usedTargetsRef.current);
    usedTargetsRef.current.add(nextRound.target);
    const media: Record<string, string> = {};
    for (const item of consistentStimuli) {
      const path = chooseExemplar(item, previousMediaRef.current[item.key]);
      if (path) media[item.key] = path;
    }
    previousMediaRef.current = media;
    setRoundMedia(media);
    setRoundData(nextRound);
    setPhase("playing");
    setAudioPlayed(false);
    setAttemptsThisRound(0);
    setWrongChoices([]);
    setReducedOptions(null);
    setRoundCorrect(false);
    setFeedback("");
    audioLockRef.current = true;
    setAudioPending(true);
    const played = await speak(items[nextRound.target].speech || items[nextRound.target].word, speechRate, soundEnabled);
    audioLockRef.current = false;
    if (stoppedRef.current) return;
    setAudioPending(false);
    if (played) setAudioPlayed(true);
    else setPhase("technical");
  };

  const choose = (index: number) => {
    if (!roundData || phase !== "playing" || !audioPlayed || audioLockRef.current || answerLockRef.current || stoppedRef.current) return;
    evidenceRef.current = withResponse(evidenceRef.current, items[index].key);
    const attempt = attemptsThisRound + 1;
    gameplayChoicesRef.current += 1;
    setAttemptsThisRound(attempt);
    if (index === roundData.target) {
      correctAnswersRef.current += 1;
      answerLockRef.current = true;
      const independent = responseOutcome(evidenceRef.current) === "independent";
      if (independent) independentAnswersRef.current += 1;
      setRoundCorrect(true);
      roundOutcomesRef.current.push({
        target_key: items[roundData.target].key,
        media_ref: items[roundData.target].image,
        option_media: roundData.options.map((value) => ({ key: items[value].key, media_ref: items[value].image })),
        option_keys: roundData.options.map((value) => items[value].key),
        selected_key: items[index].key,
        attempts: attempt,
        outcome: responseOutcome(evidenceRef.current),
        supports: evidenceRef.current.supports,
        first_response: evidenceRef.current.first_response,
      });
      setPhase("resolved");
      setFeedback(independent ? "Ты нашёл картинку самостоятельно." : "Получилось. Подсказка помогла найти картинку.");
      void speak("Получилось.", 0.9, soundEnabled);
      return;
    }

    const nextWrongChoices = [...new Set([...wrongChoices, index])];
    setWrongChoices(nextWrongChoices);
    promptsUsedRef.current += 1;
    if (attempt === 1) {
      promptLevelRef.current = Math.max(promptLevelRef.current, 1) as 0 | 1 | 2;
      promptTypesRef.current.push("repeat_audio");
      evidenceRef.current = withSupport(evidenceRef.current, "repeat_audio");
      setFeedback("Попробуй ещё. Послушай слово ещё раз.");
      void playWord(roundData.target, false);
    } else if (attempt === 2) {
      promptLevelRef.current = 2;
      promptTypesRef.current.push("reduced_choice");
      evidenceRef.current = withSupport(evidenceRef.current, "reduced_choice");
      const other = shuffled(roundData.options.filter((value) => value !== roundData.target && !nextWrongChoices.includes(value)))[0]
        ?? roundData.options.find((value) => value !== roundData.target);
      setReducedOptions(other === undefined ? [roundData.target] : shuffled([roundData.target, other]));
      setFeedback("Теперь выбери из двух картинок.");
      void playWord(roundData.target, false);
    } else {
      promptLevelRef.current = 2;
      promptTypesRef.current.push("model_answer");
      evidenceRef.current = withSupport(evidenceRef.current, "model_answer");
      answerLockRef.current = true;
      setRoundCorrect(false);
      setPhase("resolved");
      roundOutcomesRef.current.push({
        target_key: items[roundData.target].key,
        media_ref: items[roundData.target].image,
        option_media: roundData.options.map((value) => ({ key: items[value].key, media_ref: items[value].image })),
        option_keys: roundData.options.map((value) => items[value].key),
        selected_key: items[index].key,
        attempts: attempt,
        outcome: "modelled",
        supports: evidenceRef.current.supports,
        first_response: evidenceRef.current.first_response,
      });
      const modelText = exercise?.engine?.mechanic === "action_choice" ? `Ребёнок ${items[roundData.target].word.toLowerCase()}.` : `Это ${items[roundData.target].word.toLowerCase()}.`;
      setFeedback(`Посмотрим вместе. ${modelText}`);
      void speak(modelText, 0.75, soundEnabled);
    }
  };

  const next = async () => {
    if (!roundData) return;
    if (round === difficulty.rounds) {
      const correctAnswers = correctAnswersRef.current;
      const measurement: GameMeasurement = accessibleSupportMode ? {
        attempts_count: difficulty.rounds,
        correct_answers: correctAnswers,
        prompts_used: promptsUsedRef.current,
        gameplay_choices: gameplayChoicesRef.current,
        independent_completions: independentAnswersRef.current,
        prompted_completions: Math.max(0, correctAnswers - independentAnswersRef.current),
        attempt_status: "participated",
        independence: 0,
        prompt_level: "full",
      } : {
        attempts_count: difficulty.rounds,
        correct_answers: correctAnswers,
        prompts_used: promptsUsedRef.current,
        gameplay_choices: gameplayChoicesRef.current,
        independent_completions: independentAnswersRef.current,
        prompted_completions: Math.max(0, correctAnswers - independentAnswersRef.current),
        attempt_status: "completed",
        independence: Math.round(independentAnswersRef.current / difficulty.rounds * 100),
        prompt_level: promptLevelRef.current === 0 ? "independent" : promptLevelRef.current === 1 ? "minimal" : "full",
      };
      const result = exercise ? await onComplete(Math.round(correctAnswers / difficulty.rounds * 100), exercise.id, measurement, { prompt_types: promptTypesRef.current, difficulty_level: difficultyLevel, option_count: difficulty.option_count, round_count: difficulty.rounds, round_outcomes: roundOutcomesRef.current, accessibility_mode: accessibleSupportMode ? "spoken_options_non_scored" : "visual_choice" }) : null;
      if (exercise && !result) return;
      correctAnswersRef.current = 0;
      independentAnswersRef.current = 0;
      promptsUsedRef.current = 0;
      gameplayChoicesRef.current = 0;
      promptLevelRef.current = 0;
      promptTypesRef.current = [];
      roundOutcomesRef.current = [];
      usedTargetsRef.current.clear();
      setRound(1);
      setRoundData(null);
      setPhase("demo");
    } else {
      setRound((value) => value + 1);
      void beginRound();
    }
  };

  const recordTechnicalIssue = async () => {
    if (!exercise) return;
    const result = await onComplete(0, exercise.id, { attempts_count: 0, correct_answers: 0, prompts_used: 0, attempt_status: "technical_error" }, { reason: soundEnabled ? "audio_unavailable" : "sound_disabled" });
    if (result) onBack();
  };

  const stopExercise = async (status: "break" | "refused") => {
    if (!exercise) { onBack(); return; }
    if (stoppedRef.current) return;
    stoppedRef.current = true;
    const result = await onComplete(0, exercise.id, { attempts_count: 0, correct_answers: 0, prompts_used: 0, attempt_status: status }, { reason: "child_choice" });
    if (!result) stoppedRef.current = false;
    if (result && status === "break") onBack();
  };

  const visibleOptions = reducedOptions || roundData?.options || [];
  return (
    <div className={`page-enter game-page ${exercise?.engine?.mechanic === "action_choice" ? "action-choice" : ""}`}>
      <GameHeader title={exercise?.title || "Слушай и находи"} subtitle="Слушаем слово - без чтения" step={phase === "demo" ? "Настройка" : `${round} из ${difficulty.rounds}`} onBack={onBack} />
      <div className="listen-card">
        {phase === "demo" ? <div className="sensory-demo"><SensoryVisual item={items[0]}/><span className="kicker">СНАЧАЛА ПОПРОБУЕМ</span><h2>Послушай. Потом покажи картинку.</h2><p>Слово прозвучит вслух. На карточках не будет подписей.</p><fieldset className="sensory-access-mode"><legend>Способ выполнения</legend><button type="button" className={!accessibleSupportMode ? "active" : ""} aria-pressed={!accessibleSupportMode} onClick={() => setAccessibleSupportMode(false)}><Eye size={17}/> Визуальный выбор</button><button type="button" className={accessibleSupportMode ? "active" : ""} aria-pressed={accessibleSupportMode} onClick={() => setAccessibleSupportMode(true)}><Volume2 size={17}/> Озвучивать все варианты</button></fieldset>{accessibleSupportMode && <p id="accessible-support-note" className="accessible-support-note"><ShieldAlert size={17}/> Это отдельный доступный режим: экранный диктор назовёт каждую карточку. Он фиксирует участие без оценки правильности и не влияет на адаптивный подбор.</p>}{exercise?.adaptive ? <div className="adaptive-runner-setting"><Target size={18}/><span><strong>{difficulty.option_count} картинки</strong><small>Выбрано по домашней практической цели; помощь доступна в любой момент.</small></span></div> : <div className="runner-levels" aria-label="Количество вариантов"><span>Картинок на экране:</span>{([1,2,3] as const).map((level) => { const value = resolveDifficulty(exercise?.engine?.content.difficulty_levels, level); return <button type="button" key={level} className={difficultyLevel === level ? "active" : ""} aria-pressed={difficultyLevel === level} onClick={() => setDifficultyLevel(level)}>{value.option_count}</button>; })}</div>}<button className="primary-button" onClick={() => void beginRound()}>Понятно, начать <ChevronRight size={17}/></button></div> : phase === "technical" ? <div className="sensory-demo technical"><Volume2 size={42}/><span className="kicker">БЕЗ ОЦЕНКИ</span><h2>Звук сейчас недоступен</h2><p>Это задание проверяет понимание услышанного, поэтому без звука результат не считается.</p><button className="primary-button" onClick={recordTechnicalIssue}>Вернуться без оценки</button></div> : <>
          <div className="sound-zone"><button ref={soundButtonRef} className="sound-button" disabled={audioPending} onClick={() => void playWord()} aria-label="Прослушать слово"><Volume2 size={34} strokeWidth={2} /></button><div><span className="kicker">ПОСЛУШАЙ</span><h2>{audioPending ? "Слово загружается…" : audioPlayed ? "Теперь покажи картинку" : "Нажми и послушай"}</h2><div className="wave"><i /><i /><i /><i /><i /><i /><i /></div><div className="speech-rate" aria-label="Скорость речи">{[{v:.65,l:"Медленно"},{v:.78,l:"Обычно"},{v:1,l:"Быстрее"}].map((item)=><button key={item.v} className={speechRate===item.v?"active":""} aria-pressed={speechRate===item.v} onClick={()=>setSpeechRate(item.v)}>{item.l}</button>)}</div></div><button className="replay" disabled={audioPending} onClick={() => void playWord()}><RotateCcw size={17} /> Повторить</button></div>
          {accessibleSupportMode && <p id="accessible-support-note" className="accessible-support-note in-game"><ShieldAlert size={17}/> Варианты озвучиваются. Эта попытка сохраняется без оценки правильности.</p>}
          <h3 className="choose-title">Послушай. Покажи картинку.</h3>
          <div className={`picture-options ${reducedOptions ? "reduced" : ""}`}>
            {visibleOptions.map((index) => { const item = items[index]; const isAnswer = roundData?.target === index; const revealed = phase === "resolved"; const optionNumber = visibleOptions.indexOf(index) + 1; return <button key={item.word} disabled={!audioPlayed || audioPending || phase === "resolved" || (!reducedOptions && wrongChoices.includes(index))} aria-label={revealed || accessibleSupportMode ? item.word : `Вариант ${optionNumber}`} aria-describedby={accessibleSupportMode ? "accessible-support-note" : undefined} onClick={() => choose(index)} className={`${wrongChoices.includes(index) ? "wrong" : ""} ${revealed && isAnswer ? "answer" : ""}`}><SensoryVisual item={item}/>{revealed && <strong>{item.word}</strong>}{revealed && isAnswer && <i><Check size={16}/></i>}</button>; })}
          </div>
          {feedback && <div className={`answer-panel ${phase === "resolved" && roundCorrect ? "good" : "try"}`} role="status" aria-live="polite"><div className="answer-emoji">{phase === "resolved" && roundCorrect ? <Star fill="currentColor"/> : <Sparkles/>}</div><div><strong>{phase === "resolved" ? (roundCorrect ? "Получилось" : "Показываем вместе") : "Можно попробовать ещё"}</strong><span>{feedback}</span></div>{phase === "resolved" && <button className="primary-button" onClick={next}>{round === difficulty.rounds ? "Завершить" : "Дальше"}<ChevronRight size={17}/></button>}</div>}
          <div className="score-dots" role="progressbar" aria-label="Ход задания" aria-valuemin={1} aria-valuemax={difficulty.rounds} aria-valuenow={round} aria-valuetext={`Раунд ${round} из ${difficulty.rounds}`}>{Array.from({length:difficulty.rounds},(_,index)=>index+1).map((value) => <span key={value} className={value < round || (value === round && phase === "resolved") ? "filled" : ""}/>)}</div>
        </>}
        <div className="sensory-stop-actions" aria-label="Остановить упражнение"><button className="small-button" onClick={() => void stopExercise("break")}><Pause size={16}/> Перерыв</button><button className="small-button" onClick={() => void stopExercise("refused")}><CircleX size={16}/> Не хочу</button></div>
      </div>
    </div>
  );
}

const aacCategories = [
  { id: "favorites", label: "Главные", icon: Star }, { id: "help", label: "Помощь", icon: HandHelping },
  { id: "wants", label: "Желания", icon: Heart }, { id: "needs", label: "Потребности", icon: Activity },
  { id: "feelings", label: "Чувства", icon: Smile }, { id: "yes_no", label: "Да / Нет", icon: Check },
  { id: "people", label: "Люди", icon: Users }, { id: "food", label: "Еда", icon: Apple },
  { id: "play", label: "Игры", icon: Gamepad2 }, { id: "places", label: "Места", icon: MapPin }, { id: "actions", label: "Действия", icon: Play }, { id: "household", label: "Быт", icon: House },
] as const;

const aacIconByLabel: Record<string, LucideIcon> = {
  "Помоги": HandHelping, "Больно": HeartPulse, "Перерыв": Pause, "Стоп": CircleX, "Не хочу": CircleX,
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
  const designedSymbols: Record<string, string> = {
    "Вода": "/app-illustrations/aac-water.webp", "Помоги": "/app-illustrations/aac-help.webp", "Стоп": "/app-illustrations/aac-stop.webp", "Перерыв": "/app-illustrations/aac-break.webp",
    "Яблоко": "/app-illustrations/aac-apple.webp", "Банан": "/app-illustrations/aac-banana.webp", "Мишка": "/app-illustrations/aac-teddy.webp", "Поезд": "/app-illustrations/aac-train.webp",
    "Что это?": "/app-illustrations/aac-what-is-this.webp", "Устал": "/app-illustrations/aac-tired.webp", "Страшно": "/app-illustrations/aac-scared.webp", "Больно": "/app-illustrations/aac-pain.webp",
    "Не хочу": "/app-illustrations/aac-dont-want.webp", "Пить": "/app-illustrations/aac-drink.webp", "Есть": "/app-illustrations/aac-eat.webp", "Туалет": "/app-illustrations/aac-toilet.webp",
    "Отдых": "/app-illustrations/aac-rest.webp", "Ещё": "/app-illustrations/aac-more.webp", "Хочу": "/app-illustrations/aac-want.webp", "Я": "/app-illustrations/aac-me.webp",
    "Мама": "/app-illustrations/aac-mother.webp", "Папа": "/app-illustrations/aac-father.webp", "Сок": "/app-illustrations/aac-juice.webp", "Мяч": "/app-illustrations/aac-ball.webp",
    "Кот": "/app-illustrations/aac-cat.webp", "Люблю": "/app-illustrations/aac-love.webp", "Вижу": "/app-illustrations/aac-see.webp", "Да": "/app-illustrations/aac-yes.webp",
    "Нет": "/app-illustrations/aac-no.webp", "Весело": "/app-illustrations/aac-happy.webp", "Грустно": "/app-illustrations/aac-sad.webp", "Домой": "/app-illustrations/aac-home.webp",
    "Привет": "/app-illustrations/aac-hello.webp", "Бабушка": "/app-illustrations/aac-grandmother.webp", "Машинка": "/app-illustrations/aac-toy-car.webp", "Кукла": "/app-illustrations/aac-doll.webp",
    "Иду": "/app-illustrations/aac-go.webp", "Играю": "/app-illustrations/aac-play.webp", "Спокойно": "/app-illustrations/aac-calm.webp", "Школа": "/app-illustrations/aac-school.webp",
    "Площадка": "/app-illustrations/aac-playground.webp", "Где?": "/app-illustrations/aac-where.webp", "На столе": "/app-illustrations/aac-on-table.webp", "В коробке": "/app-illustrations/aac-in-box.webp",
    "Под стулом": "/app-illustrations/aac-under-chair.webp", "Вчера": "/app-illustrations/aac-yesterday.webp", "Играл": "/app-illustrations/aac-played.webp", "Гулял": "/app-illustrations/aac-walked.webp",
    "Хлеб": "/app-illustrations/aac-bread.webp", "Суп": "/app-illustrations/aac-soup.webp", "Каша": "/app-illustrations/aac-porridge.webp", "Чай": "/app-illustrations/aac-tea.webp",
    "Книга": "/app-illustrations/aac-book.webp", "Пазл": "/app-illustrations/aac-puzzle.webp", "Рисовать": "/app-illustrations/aac-draw.webp", "Читать": "/app-illustrations/aac-read.webp",
    "Спать": "/app-illustrations/aac-sleep.webp", "Гулять": "/app-illustrations/aac-walk.webp", "Злюсь": "/app-illustrations/aac-angry.webp", "Жарко": "/app-illustrations/aac-hot.webp",
    "Холодно": "/app-illustrations/aac-cold.webp", "Магазин": "/app-illustrations/aac-shop.webp", "Детский сад": "/app-illustrations/aac-kindergarten.webp",
    "Дедушка": "/app-illustrations/aac-grandfather.webp", "Брат": "/app-illustrations/aac-brother.webp", "Сестра": "/app-illustrations/aac-sister.webp",
  };
  const customPhoto = card.image?.startsWith("data:image/") ? card.image : null;
  const photo = customPhoto || designedSymbols[card.label] || (card.image?.startsWith("/") && card.image !== "/soyle-mark.svg" ? card.image : null);
  const relation = card.label === "На столе" ? "above" : card.label === "В коробке" ? "inside" : card.label === "Под стулом" ? "below" : "";
  const past = ["Вчера", "Играл", "Гулял"].includes(card.label);
  return <span className={`aac-visual aac-${card.category} ${!pictogram && relation ? `relation-${relation}` : ""} ${compact ? "compact" : ""}`} data-label={card.label} aria-hidden="true">{photo ? <Image className="aac-pictogram-image" src={photo} alt="" width={128} height={128} unoptimized/> : pictogram ? <Image className="aac-pictogram-image" src={`/aac-pictograms/${pictogram}.png`} alt="" width={128} height={128}/> : <><Icon strokeWidth={1.75}/>{relation && <i className="aac-relation-dot"/>}{past && <i className="aac-past-mark"/>}</>}</span>;
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
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState({ label: "", speech: "", category: "needs" });
  const [customImage, setCustomImage] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  const [aacNotice, setAacNotice] = useState("");
  const [speechPending, setSpeechPending] = useState(false);
  const [promptLevel, setPromptLevel] = useState<"independent" | "minimal" | "full">("independent");
  const savedRef = useRef(false);
  const speechLifetime = useRef(0);
  useEffect(() => () => { speechLifetime.current += 1; stopCurrentSpeech(); }, [childId]);
  const composition = composeAACMessage(selected, freeMode ? "free" : "guided");
  const sentence = composition.valid ? composition.phrase : selected.map((item) => item.label).join(" + ");
  const loadBoard = useCallback(() => {
    if (!childId) return;
    api<AACCard[]>(`/api/aac/cards/${childId}`).then(setCards).catch((cause) => {
      setCards([]);
      setAacNotice(cause instanceof Error ? `Не удалось загрузить карточки: ${cause.message}` : "Не удалось загрузить карточки");
    });
    api<Array<{ id: number; phrase: string }>>(`/api/aac/history/${childId}`).then(setHistory).catch((cause) => {
      setAacNotice(cause instanceof Error ? `Не удалось загрузить недавние сообщения: ${cause.message}` : "Не удалось загрузить недавние сообщения");
    });
  }, [childId]);
  useEffect(loadBoard, [loadBoard]);
  const normalizedCardQuery = cardQuery.trim().toLocaleLowerCase("ru");
  const scenario = !freeMode && exercise ? exercise.engine?.content : undefined;
  const scenarioLabels = scenario?.labels?.length ? new Set(scenario.labels) : null;
  const selectedLabels = selected.map((card) => card.label);
  const scenarioEvaluation = evaluateAACScenario(scenario, selectedLabels);
  const canAddGuidedCard = (card: AACCard) => freeMode || canAddAACScenarioCard(scenario, selectedLabels, card.label);
  const composerHint = freeMode
    ? selected.length
      ? composition.valid ? "Сообщение готово к озвучиванию" : composition.reason
      : "Выбери одну или несколько карточек ниже"
    : selected.length && !composition.valid
      ? composition.reason
      : scenarioEvaluation.hint;
  const availableCards = scenarioLabels ? cards.filter((card) => scenarioLabels.has(card.label)) : cards;
  const visibleCards = (freeMode ? (category === "favorites" ? availableCards.filter((card) => card.favorite || card.is_core) : availableCards.filter((card) => card.category === category)) : availableCards).filter((card) => !normalizedCardQuery || `${card.label} ${card.speech}`.toLocaleLowerCase("ru").includes(normalizedCardQuery));
  const safetyCards = ["Помоги", "Перерыв", "Стоп", "Не хочу"].flatMap((label) => scenarioLabels?.has(label) ? [] : cards.find((card) => card.label === label) || []);
  const addCard = (card: AACCard) => {
    if (selected.some((item) => item.id === card.id)) {
      setAacNotice(`Карточка «${card.label}» уже добавлена. Сначала убери её из сообщения.`);
      return;
    }
    if (!canAddGuidedCard(card)) {
      setAacNotice(scenarioEvaluation.complete ? scenarioEvaluation.hint : "Эта карточка не продолжает выбранное сообщение. Убери лишнюю карточку или выбери подходящий следующий шаг.");
      return;
    }
    savedRef.current = false;
    setAacNotice("");
    setSelected((items) => [...items, card].slice(-8));
  };
  const toggleFavorite = async (card: AACCard) => {
    if (!childId) return;
    try {
      await api(`/api/aac/cards/${card.id}/favorite?child_id=${childId}`, { method: "PATCH", body: JSON.stringify({ favorite: !card.favorite }) });
      setCards((items) => items.map((item) => item.id === card.id ? { ...item, favorite: !item.favorite } : item));
    } catch (cause) {
      setAacNotice(cause instanceof Error ? `Избранное не изменено: ${cause.message}` : "Избранное не изменено");
    }
  };
  const sayPhrase = async () => {
    if (!selected.length || !childId || speechPending) return;
    if (!freeMode && !scenarioEvaluation.complete) {
      setAacNotice(scenarioEvaluation.hint);
      return;
    }
    setSpeechPending(true);
    const lifetime = ++speechLifetime.current;
    try {
      const composed = await api<{ valid: boolean; phrase: string; reason: string }>("/api/aac/compose", { method: "POST", body: JSON.stringify({ child_id: childId, card_ids: selected.map((item) => item.id), language: selected[0].language || "ru", mode: freeMode ? "free" : "guided" }) });
      if (lifetime !== speechLifetime.current) return;
      if (!composed.valid) { setAacNotice(composed.reason || "Эту комбинацию пока нельзя озвучить как готовую фразу."); return; }
      setAacNotice("");
      const played = await speak(composed.phrase, 0.72, freeMode || soundEnabled, selected[0]?.language || "ru");
      if (lifetime !== speechLifetime.current) return;
      if (!played) { setAacNotice("Не удалось озвучить сообщение. Попробуйте ещё раз. Результат не сохранён."); return; }
      try {
        const saved = await api<{ id: number; phrase: string }>("/api/aac/history", { method: "POST", body: JSON.stringify({ child_id: childId, card_ids: selected.map((item) => item.id), mode: freeMode ? "free" : "guided" }) });
        setHistory((items) => [saved, ...items.filter((item) => item.phrase !== saved.phrase)].slice(0, 12));
      } catch (cause) {
        setAacNotice(cause instanceof Error ? `Сообщение озвучено, но не добавлено в историю: ${cause.message}` : "Сообщение озвучено, но не добавлено в историю");
      }
      if (lifetime !== speechLifetime.current) return;
      if (!freeMode && !savedRef.current && exercise && onComplete) {
        const labels = selected.map((card) => card.label);
        const refused = (labels.includes("Не хочу") || labels.includes("Стоп") || (exercise.target === "answer" && labels.includes("Нет"))) && exercise.target !== "refusal";
        const paused = selected.some((card) => card.label === "Перерыв");
        if (!scenarioEvaluation.complete && !refused && !paused) {
          setAacNotice(scenarioEvaluation.hint);
          return;
        }
        const result = await onComplete(0, composed.phrase, exercise.id, { prompts_used: promptLevel === "independent" ? 0 : 1, prompt_level: promptLevel, attempt_status: refused ? "refused" : paused ? "break" : "participated", independence: promptLevel === "independent" ? 100 : promptLevel === "minimal" ? 60 : 30, communication_initiatives: 0 });
        if (result) savedRef.current = true;
      }
    } catch (cause) {
      if (lifetime === speechLifetime.current) setAacNotice(cause instanceof Error ? cause.message : "Не удалось проверить и озвучить сообщение");
    } finally {
      if (lifetime === speechLifetime.current) setSpeechPending(false);
    }
  };
  const sendQuickMessage = async (card: AACCard) => {
    setSpeechPending(true);
    const lifetime = ++speechLifetime.current;
    setSelected([card]);
    setAacNotice("Озвучиваем сообщение…");
    try {
      const played = await speak(card.speech, 0.72, true, card.language || "ru");
      if (lifetime !== speechLifetime.current) return;
      setAacNotice(!played ? "Не удалось включить звук. Сообщение показано на экране. Отказ и перерыв нужно уважать." : card.label === "Перерыв" ? "Сообщение озвучено. Можно сделать паузу или вернуться на главную." : ["Нет", "Стоп", "Не хочу"].includes(card.label) ? "Сообщение озвучено. Продолжать действие не нужно." : "Сообщение озвучено.");
      if (!freeMode && !savedRef.current && exercise && onComplete && ["Перерыв", "Стоп", "Не хочу"].includes(card.label)) {
        const result = await onComplete(0, card.speech, exercise.id, { attempts_count: 0, correct_answers: 0, prompts_used: 0, attempt_status: card.label === "Перерыв" ? "break" : "refused", communication_initiatives: 0 });
        if (result) savedRef.current = true;
      }
    } catch (cause) {
      if (lifetime === speechLifetime.current) setAacNotice(cause instanceof Error ? cause.message : "Не удалось сохранить перерыв или отказ. Можно вернуться на главную.");
    } finally {
      if (lifetime === speechLifetime.current) setSpeechPending(false);
    }
  };
  const createCustom = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!childId) return;
    if (!customImage) { setAacNotice("Добавьте фотографию или рисунок для новой карточки."); return; }
    try {
      const card = await api<AACCard>("/api/aac/cards", { method: "POST", body: JSON.stringify({ child_id: childId, ...custom, image: customImage }) });
      setCards((items) => [...items, card]); setCustom({ label: "", speech: "", category: "needs" }); setCustomImage(""); setCustomOpen(false); setCategory(card.category); setAacNotice("Карточка сохранена.");
    } catch (cause) {
      setAacNotice(cause instanceof Error ? cause.message : "Не удалось добавить карточку");
    }
  };
  const replayHistory = async (phrase: string) => {
    if (speechPending) return;
    const lifetime = ++speechLifetime.current;
    setSpeechPending(true);
    try {
      const played = await speak(phrase, 0.72, freeMode || soundEnabled);
      if (lifetime === speechLifetime.current) setAacNotice(played ? "Сообщение озвучено." : "Не удалось озвучить сообщение. Попробуйте ещё раз.");
    } finally { if (lifetime === speechLifetime.current) setSpeechPending(false); }
  };
  const activeCategory = aacCategories.find((item) => item.id === category) || aacCategories[0];
  const quickCards = ["Помоги", "Больно", "Стоп", "Перерыв", "Не хочу", "Да"].flatMap((label) => cards.find((card) => card.label === label) || []);
  return <div className="page-enter game-page aac-page redesigned">
    <GameHeader title={freeMode ? "Мои слова" : exercise?.title || "Учебное AAC-задание"} subtitle={freeMode ? "Карточки, сообщения и любимые слова" : "Практика с карточками AAC"} step={freeMode ? "Всегда доступно" : scenarioEvaluation.stepLabel} onBack={onBack}/>
    {freeMode && <section className="aac-quick" aria-label="Быстрые сообщения"><div className="aac-quick-head"><div><span className="kicker">СКАЗАТЬ СЕЙЧАС</span><strong>Важное сообщение - одним нажатием</strong></div><ShieldCheck size={22}/></div><div>{quickCards.map((card) => <button key={card.id} onClick={() => sendQuickMessage(card)}><AACVisual card={card} compact/><span>{card.label}</span></button>)}</div>{aacNotice && <p role="status">{aacNotice}{selected[0]?.label === "Перерыв" && <button onClick={onBack}>Сделать паузу</button>}</p>}</section>}
    {!freeMode && <div className="aac-goal"><div><span className="kicker">ЧТО НУЖНО СДЕЛАТЬ</span><strong>{scenario?.title || exercise?.instruction || "Собери сообщение"}</strong><p>{scenario?.instruction || exercise?.instruction}</p>{scenario?.steps?.length ? <ol className="aac-task-steps">{scenario.steps.map((step) => <li key={step}>{step}</li>)}</ol> : null}</div><Target size={22}/><p>{scenario?.criterion || "Задание завершится после понятного сообщения."}</p>{canManage && <div className="aac-prompt-level" aria-label="Как выполнено"><span>Поддержка взрослого:</span>{([['independent','Самостоятельно'],['minimal','С подсказкой'],['full','Вместе']] as const).map(([value,label]) => <button key={value} className={promptLevel === value ? "active" : ""} aria-pressed={promptLevel === value} onClick={() => setPromptLevel(value)}>{label}</button>)}</div>}</div>}
    <section className="aac-composer aac-composer-top"><div className="aac-composer-head"><div><span className="kicker">{freeMode ? "МОЁ СООБЩЕНИЕ" : "ТВОЙ ОТВЕТ"}</span><strong>{sentence || "Ответ пока не выбран"}</strong><small>{composerHint}</small></div><div className="aac-composer-actions"><button className="clear-button" disabled={!selected.length || speechPending} onClick={() => { setSelected([]); setAacNotice(""); savedRef.current = false; }}>Очистить всё</button><button className="speak-button" disabled={speechPending || !selected.length || !composition.valid || (!freeMode && !scenarioEvaluation.complete)} onClick={sayPhrase}><Volume2 size={21}/>{speechPending ? "Озвучиваем…" : freeMode ? "Озвучить сообщение" : scenarioEvaluation.actionLabel}</button></div></div><div className={`aac-sentence ${selected.length ? "filled" : ""}`}>{selected.length ? selected.map((card, index) => <button key={`${card.id}-${index}`} disabled={speechPending} aria-label={`Убрать карточку ${card.label}`} onClick={() => { savedRef.current = false; setSelected((items) => items.filter((_, itemIndex) => itemIndex !== index)); }}><span className="aac-card-order">{index + 1}</span><AACVisual card={card} compact/><span>{card.label}</span><X size={13}/></button>) : <div className="aac-empty-message"><MessageCircle size={24}/><div><strong>{freeMode ? "Выбери первую карточку" : scenarioEvaluation.hint}</strong><span>{freeMode ? "Короткое сообщение — полноценное сообщение" : "Выбранные карточки появятся здесь"}</span></div></div>}</div>{selected.length > 0 && <p className="aac-remove-hint">Чтобы убрать одну карточку, нажми на неё в строке сообщения.</p>}</section>
    {aacNotice && !freeMode && <div className="aac-notice" role="status"><Volume2 size={18}/><span>{aacNotice}</span>{selected[0]?.label === "Перерыв" && <button className="small-button" onClick={onBack}>Сделать паузу</button>}</div>}
    {!freeMode ? <div className="aac-guided-workspace">
      <section className="aac-board guided"><div className="aac-toolbar"><div><span className="kicker">{scenarioEvaluation.complete ? "ШАГ 1 · ОТВЕТ ВЫБРАН" : "ШАГ 1 · ВЫБЕРИ КАРТОЧКУ"}</span><h3>{scenario?.title || "Карточки для задания"}</h3></div><small>{availableCards.length} {availableCards.length === 1 ? "вариант" : availableCards.length < 5 ? "варианта" : "вариантов"}</small></div>
        <div className="aac-card-grid guided">{visibleCards.map((card) => <div className={`aac-card aac-card-${card.category} ${card.is_core ? "core" : ""}`} key={card.id}><button className="aac-card-main" disabled={speechPending || selected.some((item) => item.id === card.id) || !canAddGuidedCard(card)} onClick={() => addCard(card)}><AACVisual card={card}/><strong>{card.label}</strong><small>{card.speech}</small></button></div>)}</div>
      </section>
      {safetyCards.length > 0 && <section className="aac-guided-safety" aria-label="Важные сообщения"><div><span className="kicker">МОЖНО СКАЗАТЬ В ЛЮБОЙ МОМЕНТ</span><strong>Помощь, перерыв или отказ</strong></div><div>{safetyCards.map((card) => <button key={card.id} onClick={() => sendQuickMessage(card)}><AACVisual card={card} compact/><span>{card.label}</span></button>)}</div></section>}
    </div> : <div className="aac-workspace">
      <aside className="aac-category-panel"><div><span className="kicker">МОИ КАРТОЧКИ</span><h3>{category === "favorites" ? "Главные и любимые" : activeCategory.label}</h3></div><nav className="aac-tabs primary-aac-tabs" aria-label="Основные категории карточек"><button className={category === "favorites" ? "active" : ""} aria-pressed={category === "favorites"} onClick={() => { setCategory("favorites"); setCardQuery(""); }}><Star size={19}/><span>Главные</span><small>{availableCards.filter((card) => card.favorite || card.is_core).length}</small></button><button className={categoriesOpen ? "active" : ""} aria-expanded={categoriesOpen} aria-controls="more-aac-categories" onClick={() => setCategoriesOpen((value) => !value)}><Plus size={19}/><span>Ещё</span><small>{aacCategories.length - 1}</small></button></nav>{categoriesOpen && <nav id="more-aac-categories" className="aac-tabs more-aac-tabs" aria-label="Дополнительные категории">{aacCategories.filter((item) => item.id !== "favorites").map((item) => { const Icon = item.icon; const count = availableCards.filter((card) => card.category === item.id).length; return <button key={item.id} className={category === item.id ? "active" : ""} aria-pressed={category === item.id} onClick={() => { setCategory(item.id); setCardQuery(""); }}><Icon size={18}/><span>{item.label}</span><small>{count}</small></button>; })}</nav>}{history.length > 0 && <div className="aac-history"><span className="kicker">НЕДАВНИЕ</span>{history.slice(0,3).map((item) => <button key={item.id} onClick={() => replayHistory(item.phrase)}><RotateCcw size={14}/><span>{item.phrase}</span></button>)}</div>}</aside>
      <section className="aac-board"><div className="aac-toolbar"><div><span className="kicker">{category === "favorites" ? "БЫСТРЫЙ ДОСТУП" : "КАТЕГОРИЯ"}</span><h3>{category === "favorites" ? "Выбери карточку" : activeCategory.label}</h3></div><div className="aac-tools">{(categoriesOpen || canManage) && <label className="aac-search"><Search size={16}/><input value={cardQuery} onChange={(event) => setCardQuery(event.target.value)} placeholder="Найти слово" aria-label="Найти слово"/></label>}<button className="small-button" onClick={() => document.querySelector<HTMLElement>(".aac-page")?.requestFullscreen?.()}><LayoutDashboard size={15}/> На весь экран</button>{canManage && freeMode && <button className="small-button" onClick={() => setCustomOpen((value) => !value)}><Plus size={15}/> Своя карточка</button>}</div></div>
        {customOpen && <form className="aac-custom-form" onSubmit={createCustom}><label>Название<input value={custom.label} onChange={(e) => setCustom({...custom,label:e.target.value})} placeholder="Например, моя игрушка" required/></label><label>Что сказать<input value={custom.speech} onChange={(e) => setCustom({...custom,speech:e.target.value})} placeholder="Я хочу мою игрушку" required/></label><label>Категория<select value={custom.category} onChange={(e) => setCustom({...custom,category:e.target.value})}>{aacCategories.filter((item) => item.id !== "favorites").map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label className="aac-custom-photo">Картинка<input type="file" accept="image/png,image/jpeg,image/webp" required={!customImage} disabled={imageBusy} onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; setImageBusy(true); try { setCustomImage(await compressPhoto(file)); setAacNotice(""); } catch (cause) { setAacNotice(cause instanceof Error ? cause.message : "Не удалось обработать изображение"); } finally { setImageBusy(false); } }}/>{customImage && <Image src={customImage} alt="Предпросмотр карточки" width={64} height={64} unoptimized/>}</label><button className="primary-button" disabled={imageBusy || !customImage}>{imageBusy ? "Подготавливаем…" : "Сохранить карточку"}</button></form>}
        <div className="aac-card-grid">{visibleCards.map((card) => <div className={`aac-card aac-card-${card.category} ${card.is_core ? "core" : ""}`} key={card.id}><button className="aac-card-main" disabled={selected.some((item) => item.id === card.id)} onClick={() => addCard(card)}><AACVisual card={card}/><strong>{card.label}</strong><small>{card.speech}</small></button><button className={`aac-favorite ${card.favorite ? "active" : ""}`} onClick={() => toggleFavorite(card)} aria-label={card.favorite ? `Убрать ${card.label} из избранного` : `Добавить ${card.label} в избранное`}><Star size={15} fill={card.favorite ? "currentColor" : "none"}/></button></div>)}</div>
        {!visibleCards.length && <div className="aac-empty"><Search size={24}/><strong>Карточки не найдены</strong><span>Измените поиск или выберите другую категорию.</span></div>}
      </section>
    </div>}
  </div>;
}

function ProgressScreen({ childId, dashboard, onStartPractice }: { childId?: number; dashboard: Dashboard | null; onStartPractice: () => void }) {
  const [data, setData] = useState<{ child?: Child; overall: number; total_sessions: number; skill_progress: SkillProgress[] } | null>(null);
  const [progressError, setProgressError] = useState("");
  const [progressReload, setProgressReload] = useState(0);
  const [progressLoading, setProgressLoading] = useState(true);
  useEffect(() => {
    if (!childId) return;
    api<typeof data>(`/api/progress/${childId}`).then((value) => { setData(value); setProgressError(""); }).catch((cause) => {
      setProgressError(cause instanceof Error ? cause.message : "Не удалось загрузить историю практики");
    }).finally(() => setProgressLoading(false));
  }, [childId, progressReload]);
  const skillColors = ["coral", "blue", "mint", "lavender", "coral", "blue"];
  const skills = (data?.skill_progress || dashboard?.skill_progress || []).map((skill, index) => ({ ...skill, color: skillColors[index] }));
  const chartDays = dashboard?.daily || [];
  const daysWithData = chartDays.filter((point) => point.sensory !== null).length;
  const chartCoordinates = (module: ModuleName) => chartDays.flatMap((point, index) => point[module] === null ? [] : [{ x: index * (700 / 6), y: 205 - Number(point[module]) * 1.7 }]);
  const chartPoints = (module: ModuleName) => chartCoordinates(module).map((point) => `${point.x},${point.y}`).join(" ");
  const totalSessions = dashboard?.total_sessions ?? data?.total_sessions ?? 0;
  if (progressLoading && !data && !dashboard) return <div className="page-enter progress-loading-state" role="status"><Timer size={28}/><strong>Загружаем историю практики…</strong></div>;
  if (!progressError && totalSessions === 0) return <div className="page-enter progress-empty-page"><PageTitle eyebrow="ИСТОРИЯ ПРАКТИКИ" title={`Занятия ${data?.child?.name || "ребёнка"}`} subtitle="Здесь появятся наблюдения после первых сохранённых занятий."/><section><span><BarChart3 size={34}/></span><h2>Пока недостаточно наблюдений</h2><p>Начните с одного короткого занятия. Söyle покажет участие и использованную помощь без диагноза и сравнения с другими детьми.</p><button className="primary-button" onClick={onStartPractice}><Play size={19} fill="currentColor"/> Выбрать занятие</button></section></div>;
  return (
    <div className="page-enter stack-xl progress-page">
      {progressError && <div className="game-error" role="alert"><ShieldAlert size={18}/><span>{progressError}</span><button type="button" className="small-button" onClick={() => { setProgressLoading(true); setProgressReload((value) => value + 1); }}>Повторить</button></div>}
      <section className="progress-hero"><div><span className="kicker">ИСТОРИЯ ПРАКТИКИ</span><h1>{`Занятия ${data?.child?.name || "ребёнка"}`}</h1><p>Процент справа означает только охват доступных заданий. Результаты игр, участие и помощь показываются отдельно и не оценивают развитие речи.</p></div><div className="progress-hero-score"><strong>{dashboard?.overall ?? data?.overall ?? 0}%</strong><span>охват заданий попытками</span></div></section>
      <div className="stats-row"><StatCard icon={<TrendingUp/>} value={`${dashboard?.overall ?? data?.overall ?? 0}%`} label="охват доступных заданий" /><StatCard icon={<Timer/>} value={String(dashboard?.total_minutes || 0)} label="минут практики" /><StatCard icon={<Star/>} value={String(dashboard?.stars || 0)} label="звёзд за игры" /><StatCard icon={<Target/>} value={String(dashboard?.total_sessions ?? data?.total_sessions ?? 0)} label="игровых попыток" /></div>
      <div className="progress-grid">
        <section className="chart-card"><div className="card-heading"><div><span className="kicker">ИГРОВЫЕ ПОПЫТКИ</span><h3>Ответы в заданиях на слух за 7 дней</h3></div></div><div className="chart-area"><div className="chart-lines"><i/><i/><i/><i/></div>{daysWithData ? <><svg viewBox="0 0 700 230" preserveAspectRatio="none" aria-label="График ответов в заданиях на слух">{daysWithData >= 3 && <polyline points={chartPoints("sensory")} className="line blue-line"/>}{chartCoordinates("sensory").map((point, index) => <circle key={`sensory-${index}`} cx={point.x} cy={point.y} r="6" className="chart-point sensory-point"/>)}</svg>{daysWithData < 3 && <div className="chart-sparse-note">Пока есть результаты за {daysWithData === 1 ? "один день" : "два дня"}. Это история конкретной игры, а не оценка понимания речи.</div>}</> : <div className="chart-empty">Завершите задание на слух - здесь появится история ответов</div>}<div className="chart-labels">{chartDays.map((point) => <span key={point.date}>{point.label}</span>)}</div></div><div className="legend"><span><i className="blue-dot"/>Доля правильных выборов в игре</span></div></section>
        <section className="skills-card"><span className="kicker">ПРАКТИКА ПО НАПРАВЛЕНИЯМ</span><h3>Игровые ответы и участие</h3>{skills.length ? skills.map((skill) => <div className="skill" key={skill.skill}><div><span>{skill.label}<small>{skill.average_game_score !== null ? `среднее по ${skill.sessions} игровым попыткам` : skill.participations ? "отмечено участие без оценки правильности" : "ещё нет попыток"}</small></span><strong>{skill.average_game_score !== null ? `${skill.average_game_score}% в игре` : `${skill.participations} участий`}</strong></div></div>) : <div className="empty-state">Завершите первое игровое задание - здесь появится история.</div>}<div className="insight-note"><ShieldCheck size={19}/><p>Локальный анализ учитывает последние результаты с повышенным весом свежих ответов, но не оценивает развитие речи и не ставит диагноз.</p></div></section>
      </div>
      <P1ResultsSummary childId={childId}/>
      <section className="achievements"><div className="section-heading"><div><span className="kicker">ДОСТИЖЕНИЯ</span><h2>Значки за практику</h2></div></div><div className="badges"><Badge icon={<Star/>} title="Первая пятёрка" text="5 игровых попыток" unlocked={dashboard?.achievements.first_five}/><Badge icon={<Ear/>} title="Чуткое ушко" text="5 заданий на понимание" unlocked={dashboard?.achievements.good_listener}/><Badge icon={<MessageCircle/>} title="Мастер фраз" text="5 игр с фразами" unlocked={dashboard?.achievements.phrase_master}/><Badge icon={<Trophy/>} title="Неделя практики" text="7 дней с практикой" unlocked={dashboard?.achievements.week_streak}/></div></section>
    </div>
  );
}

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) { return <div className="stat-card"><span>{icon}</span><div><strong>{value}</strong><small>{label}</small></div></div>; }
function Badge({ icon, title, text, unlocked = false }: { icon: React.ReactNode; title: string; text: string; unlocked?: boolean }) { return <div className={`badge-card ${unlocked ? "unlocked" : "locked"}`}><span>{unlocked ? icon : <LockKeyhole/>}</span><div><strong>{title}</strong><small>{unlocked ? "Получено" : text}</small></div></div>; }

function AIParentScreen({ child }: { child?: Child }) {
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
      <div className="ai-page-title"><span className="ai-mark"><Bot size={24}/></span><div><span className="kicker">ЛОКАЛЬНЫЙ ПОМОЩНИК · ПРАВИЛА</span><h1>Спокойно разберём ситуацию</h1><p>Короткие подсказки выбираются внутри Söyle по прозрачным правилам, без внешней AI API. Решение всегда остаётся за вами.</p></div></div>
      <span className="ai-status ready"><i/>Работает локально</span>
    </header>

    <div className="ai-chat-layout">
      <aside className="ai-prompt-panel" aria-label="Готовые вопросы">
        <div><span className="kicker">С ЧЕГО НАЧАТЬ</span><h2>Готовые вопросы</h2><p>Выберите тему - вопрос появится в поле, и его можно изменить перед отправкой.</p></div>
        <div className="ai-quick-questions">{quickQuestions.map((item) => <button type="button" key={item.title} onClick={() => chooseQuestion(item.question)}><span><MessageCircle size={17}/></span><strong>{item.title}</strong><ChevronRight size={16}/></button>)}</div>
        <div className="ai-privacy-note"><ShieldCheck size={18}/><div><strong>Без внешней отправки данных</strong><span>Вопрос обрабатывается локальными правилами приложения и не передаётся поставщику модели.</span></div></div>
        <div className="ai-limits"><strong>Что умеет помощник</strong><ul><li>Объясняет результаты простыми словами</li><li>Предлагает короткие безопасные шаги</li><li>Помогает использовать AAC дома</li></ul><small>Не ставит диагноз и не заменяет специалиста.</small></div>
      </aside>

      <section className="ai-conversation" aria-label="Диалог с локальным помощником Söyle">
        <div className="ai-conversation-head"><div><span className="ai-mini-avatar"><Bot size={18}/></span><span><strong>Локальный помощник</strong><small>Ответы основаны на заранее заданных безопасных правилах</small></span></div>{(answer || submittedQuestion) && <button type="button" className="ai-new-chat" onClick={resetConversation} disabled={loading}><Plus size={16}/>Новый вопрос</button>}</div>

        <div className={`ai-thread ${!answer && !loading ? "empty" : ""}`} aria-live="polite" aria-busy={loading}>
          {!answer && !loading && !submittedQuestion && <div className="ai-welcome"><span><Bot size={28}/></span><h2>Чем помочь сегодня?</h2><p>Опишите одну конкретную ситуацию. Чем проще вопрос, тем понятнее будет ответ.</p><div><ShieldCheck size={16}/> Ответ не является медицинской рекомендацией</div></div>}

          {submittedQuestion && <div className="ai-message user-message"><small>Вы</small><p>{submittedQuestion}</p></div>}

          {loading && <div className="ai-message assistant-message ai-thinking" role="status"><div className="ai-message-meta"><span><Bot size={16}/></span><strong>Локальный помощник</strong></div><div className="ai-thinking-row"><i/><i/><i/><span>Подбираю подходящее правило…</span></div></div>}

          {answer && <article className="ai-message assistant-message ai-answer-card">
            <div className="ai-message-meta"><span><Bot size={16}/></span><div><strong>Локальный помощник</strong><small>Ответ по проверяемым правилам · без внешней API</small></div></div>
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
          <label className="sr-only" htmlFor="ai-parent-question">Вопрос для локального помощника Söyle</label>
          <textarea id="ai-parent-question" ref={questionRef} value={question} onChange={(event) => setQuestion(event.target.value)} minLength={3} maxLength={600} rows={2} placeholder="Опишите ситуацию или задайте вопрос…"/>
          <div className="ai-composer-footer"><span>{question.length}/600 · Не указывайте личные данные</span><button className="primary-button" aria-label="Отправить вопрос" disabled={loading || question.trim().length < 3}><ArrowUp size={19}/><span>Отправить</span></button></div>
        </form>
      </section>
    </div>
  </div>;
}

function ChildMoreScreen({ onOpen }: { onOpen: (screen: Screen) => void }) {
  const items: Array<{ screen: Screen; title: string; text: string; icon: LucideIcon; image: string }> = [
    { screen: "world", title: "Мой мир", text: "Знакомые фотографии и вещи", icon: ImageIcon, image: "/app-illustrations/more-world.webp" },
    { screen: "skills", title: "Навыки", text: "Мои сохранённые шаги", icon: BarChart3, image: "/app-illustrations/more-skills.webp" },
    { screen: "achievements", title: "Достижения", text: "Истории, задания и звёзды", icon: Trophy, image: "/app-illustrations/more-achievements.webp" },
    { screen: "settings", title: "Настройки", text: "Звук и спокойный режим", icon: Settings, image: "/app-illustrations/more-settings.webp" },
  ];
  return <div className="v2-screen v2-child-more page-enter"><header className="v2-page-heading"><Image src="/app-illustrations/more-hero.webp" alt="" fill unoptimized sizes="(max-width: 760px) 100vw, 1190px"/><span className="v2-child-more-heading-copy"><span className="v2-kicker">ТВОИ РАЗДЕЛЫ</span><h1>Ещё</h1><p>Твои фотографии, навыки и достижения — всё в одном месте.</p></span></header><div className="v2-child-more-grid">{items.map((item) => { const Icon = item.icon; return <button type="button" key={item.screen} onClick={() => onOpen(item.screen)}><span className="v2-child-more-icon"><Icon aria-hidden="true"/></span><span className="v2-child-more-copy"><strong>{item.title}</strong><small>{item.text}</small><span className="v2-child-more-arrow"><ChevronRight aria-hidden="true"/></span></span><span className="v2-child-more-art"><Image src={item.image} alt="" fill unoptimized sizes="(max-width: 760px) 115px, 150px"/></span></button>; })}</div></div>;
}

function ParentMoreScreen({ onOpen }: { onOpen: (screen: Screen) => void }) {
  const items: Array<{ screen: Screen; title: string; text: string; icon: LucideIcon }> = [
    { screen: "goals", title: "Цели и занятия", text: "Индивидуальные цели, предпочтения и короткие планы", icon: Target },
    { screen: "ai", title: "Локальный помощник", text: "Безопасные подсказки по прозрачным правилам", icon: Bot },
    { screen: "parent", title: "Профиль ребёнка и данные", text: "Детский вход, согласия, экспорт и удаление", icon: UserRound },
    { screen: "settings", title: "Настройки", text: "Камера, звук, язык и оформление", icon: Settings },
    { screen: "profile", title: "Мой аккаунт", text: "Информация о текущем профиле", icon: CircleUserRound },
  ];
  return <div className="page-enter parent-more-page"><PageTitle eyebrow="ЕЩЁ" title="Управление и поддержка" subtitle="Разделы, которые нужны не каждый день."/><div className="parent-more-grid">{items.map((item) => { const Icon = item.icon; return <button key={item.screen} aria-label={item.title} onClick={() => onOpen(item.screen)}><span><Icon size={25}/></span><div><strong>{item.title}</strong><small>{item.text}</small></div><ChevronRight size={23}/></button>; })}</div></div>;
}

const parentSections = [{id: "overview", label: "Обзор"}, {id: "practice", label: "Практика"}, {id: "specialist", label: "Специалист"}, {id: "materials", label: "Материалы"}, {id: "access", label: "Доступ и данные"}] as const;

function ParentScreen({ child, childProfiles, onSelectChild, onDeleted, dashboard, onConsentChange, onNavigate }: { child?: Child; childProfiles: Child[]; onSelectChild: (id: number) => void; onDeleted: (id: number) => void; dashboard: Dashboard | null; onConsentChange: (consent: ChildConsent) => void; onNavigate: (screen: Screen) => void }) {
  const [section, navigate] = useCabinetSection("parent", parentSections);
  const [student, setStudent] = useState<{ username: string } | null>(null);
  const [studentForm, setStudentForm] = useState({ username: "", pin: "" });
  const [accountMessage, setAccountMessage] = useState("");
  const [consent, setConsent] = useState<ChildConsent>({ child_id: child?.id || 0, privacy_accepted: false, camera_processing: false, ai_processing: false, analytics_processing: false, version: "", updated_at: null });
  const [consentReady, setConsentReady] = useState(false);
  const [consentSaving, setConsentSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [dataMessage, setDataMessage] = useState("");
  useEffect(() => {
    if (!child?.id) return;
    let active = true;
    api<ChildConsent>(`/api/children/${child.id}/consent`).then((value) => { if (active) { setConsent(value); onConsentChange(value); setConsentReady(true); } }).catch((cause) => {
      if (!active) return;
      setDataMessage(cause instanceof Error ? `Не удалось загрузить разрешения: ${cause.message}` : "Не удалось загрузить разрешения");
    });
    api<{ username: string } | null>(`/api/children/${child.id}/student-account`).then((value) => { if (!active) return; setStudent(value); if (value) setStudentForm((current) => ({ ...current, username: value.username })); }).catch((cause) => {
      if (!active) return;
      setAccountMessage(cause instanceof Error ? `Не удалось загрузить детский вход: ${cause.message}` : "Не удалось загрузить детский вход");
    });
    return () => { active = false; };
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
    if (!child || !consentReady || consentSaving) return;
    setConsentSaving(true); setDataMessage("");
    try {
      const value = await api<ChildConsent>(`/api/children/${child.id}/consent`, { method: "PUT", body: JSON.stringify({ privacy_accepted: consent.privacy_accepted, camera_processing: consent.camera_processing, ai_processing: false, analytics_processing: consent.analytics_processing, specialist_sharing: Boolean(consent.specialist_sharing) }) });
      setConsent(value); onConsentChange(value); setDataMessage("Настройки приватности сохранены");
    } catch (cause) { setDataMessage(cause instanceof Error ? cause.message : "Не удалось сохранить настройки"); }
    finally { setConsentSaving(false); }
  };
  const deleteData = async (event: React.FormEvent) => {
    event.preventDefault(); if (!child) return; setDataMessage("");
    try { await api(`/api/children/${child.id}`, { method: "DELETE", body: JSON.stringify({ password: deletePassword }) }); onDeleted(child.id); }
    catch (cause) { setDataMessage(cause instanceof Error ? cause.message : "Не удалось удалить данные"); }
  };
  const age = child ? (() => { const born = new Date(child.birth_date); const now = new Date(); let years = now.getFullYear() - born.getFullYear(); if (now.getMonth() < born.getMonth() || (now.getMonth() === born.getMonth() && now.getDate() < born.getDate())) years -= 1; return Math.max(0, years); })() : 0;
  const sessionLabels: Record<ModuleName, [LucideIcon, string]> = { motor: [Mic2, "Практика перед зеркалом"], sensory: [Ear, "Слушай и находи"], mixed: [MessageCircle, "Собери фразу"] };
  return <div className="page-enter stack-xl parent-page">
    <PageTitle eyebrow="КАБИНЕТ РОДИТЕЛЯ" title={child?.name || "Кабинет родителя"} subtitle="Практика, материалы и поддержка семьи — всё по разделам." />
    <CabinetNavigation cabinet="parent" sections={parentSections} active={section} onNavigate={navigate}/>
    {childProfiles.length > 1 && <label className="cabinet-child-picker">Профиль ребёнка<select value={child?.id || ""} onChange={event => { const url = new URL(window.location.href); url.searchParams.set("child", event.target.value); window.history.replaceState(null, "", url); onSelectChild(Number(event.target.value)); }}>{childProfiles.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
    <div className="cabinet-page" hidden={section !== "materials"}>
    <nav className="v2-parent-cabinet-links" aria-label="Материалы ребёнка"><button onClick={() => onNavigate("world")}><ImageIcon/> Фотографии ребёнка <ChevronRight/></button><button onClick={() => onNavigate("aac")}><MessageCircle/> Карточки AAC <ChevronRight/></button><button onClick={() => onNavigate("progress")}><TrendingUp/> История практики <ChevronRight/></button><button onClick={() => onNavigate("goals")}><Target/> Цели и план <ChevronRight/></button></nav>
    <section className="storybook-preview-entry"><div><span className="kicker">КОМИКС · DRAFT</span><h2>Пикник для мишки</h2><p>12 сцен: выберем игрушку, попросим помощь, устроим пикник. Выборы сохраняются; можно читать частями.</p></div><button className="primary-button" onClick={() => onNavigate("comic-preview")}><BookOpen/> Открыть комикс <ChevronRight/></button></section>
    <section className="storybook-preview-entry"><div><span className="kicker">МАСТЕРСКАЯ ИСТОРИЙ · DRAFT</span><h2>Любимая игрушка</h2><p>Интерактивная книга: найди мишку, попроси помощь и запусти поезд. Шесть цельных иллюстрированных страниц с маленькими играми.</p></div><button className="primary-button" onClick={() => onNavigate("story-preview")}><BookOpen/> Открыть книгу с играми <ChevronRight/></button></section>
    </div>
    <div className="cabinet-page" hidden={section !== "overview"}>
    <section className="parent-cabinet-welcome"><div><span className="kicker">ВСЁ ПОД РУКОЙ</span><h2>С чего начнём сегодня?</h2><p>Продолжите практику или пригласите специалиста, чтобы вместе поддерживать ребёнка.</p></div><div className="cabinet-actions"><button className="primary-button" onClick={() => onNavigate("goals")}>Открыть цели и план <ChevronRight size={18}/></button><button className="secondary-button" onClick={() => navigate("specialist")}>Пригласить специалиста</button></div></section>
    <section className="parent-overview">
      <div className="parent-profile"><div className="avatar large">{child?.name[0] || "Р"}</div><div><span className="kicker">ПРОФИЛЬ РЕБЁНКА</span><h2>{child?.name || "Ребёнок"}, {age} лет</h2><p>{dashboard?.total_sessions || 0} игровых попыток · {dashboard?.total_minutes || 0} минут практики</p></div></div>
      <div className="parent-progress"><div><span>Охват доступных заданий</span><strong>{dashboard?.overall || 0}%</strong></div><div className="parent-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(dashboard?.overall || 0, 100)} aria-label={`Есть попытки по ${dashboard?.overall || 0}% доступных заданий`}><i style={{width:`${Math.min(dashboard?.overall || 0,100)}%`}}/></div><small><Activity size={15}/> {dashboard?.week_sessions || 0} занятий за неделю</small></div>
    </section>
    <div className="stats-row parent-stats"><StatCard icon={<Check/>} value={String(dashboard?.today_sessions || 0)} label="заданий сегодня"/><StatCard icon={<Gamepad2/>} value={String(dashboard?.week_sessions || 0)} label="заданий за неделю"/><StatCard icon={<Timer/>} value={`${dashboard?.week_minutes || 0} мин`} label="практики за неделю"/><StatCard icon={<Bot/>} value="Локально" label="адаптивный анализ"/></div>
    </div>
    <div className="cabinet-page" hidden={section !== "practice"}>
    <div className="cabinet-intro"><h2>Практика в обычной жизни</h2><p>Замечайте конкретные действия ребёнка. Бытовые наблюдения хранятся отдельно от результатов игр.</p><button className="secondary-button" onClick={() => onNavigate("goals")}>Перейти к целям и плану</button></div>
    <section className="admin-card family-support-guide"><div className="admin-card-head"><div><span className="kicker">КАК БЫТЬ РЯДОМ</span><h3>Короткая памятка для занятия</h3><p>Цель - дать ребёнку понятный способ ответить, а не добиться ответа любой ценой.</p></div></div><div><article><span>1</span><div><strong>Подготовьте</strong><p>Проверьте звук, уберите лишние раздражители и предложите выбрать длительность.</p></div></article><article><span>2</span><div><strong>Подождите</strong><p>После инструкции оставьте не меньше пяти спокойных секунд на ответ.</p></div></article><article><span>3</span><div><strong>Помогайте по одному шагу</strong><p>Сначала повторите, затем сократите выбор. Не ведите руку ребёнка без согласия.</p></div></article><article className="stop"><Pause size={18}/><div><strong>Остановитесь сразу</strong><p>«Нет», «не хочу», «перерыв», боль, усталость или заметный дискомфорт - достаточная причина завершить действие без ошибки и уговоров.</p></div></article></div></section>
    <FunctionalSkillMap childId={child?.id}/>
    <HomePracticeLibrary childId={child?.id}/>
    <details className="cabinet-method-note"><summary>Как работает подбор заданий</summary>
      <section className="recommend-card"><div className="recommend-icon"><Bot /></div><span className="kicker">ЛОКАЛЬНЫЙ АНАЛИЗ</span><h2>Подсказки для родителя</h2><p>Алгоритм собирает короткий план по последним ответам и проверенным правилам, не отправляя данные во внешнюю AI API.</p><ul><li><Check size={16}/>Учитывает 8 последних результатов</li><li><Check size={16}/>Не повторяет задания до ротации</li><li><Check size={16}/>Уважает отказ и AAC-ответ</li></ul></section>
    </details>
    </div>
    <div className="cabinet-page" hidden={section !== "overview"}>
    <div className="parent-grid parent-overview-history">
      <section className="sessions-card"><div className="card-heading"><div><span className="kicker">ПОСЛЕДНИЕ ПОПЫТКИ</span><h3>История игровых заданий</h3></div></div>{dashboard?.recent.length ? dashboard.recent.map((item) => { const SessionIcon = sessionLabels[item.module][0]; return <div className="session-row" key={item.id}><span><SessionIcon size={24}/></span><div><strong>{sessionLabels[item.module][1]}</strong><small>{new Date(item.created_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{item.attempts_count ? ` · ${item.correct_answers || 0} из ${item.attempts_count}` : ""}</small></div><b>{item.attempt_status === "technical_error" ? "Техническая ошибка" : item.attempt_status === "participated" ? "Участие отмечено" : item.attempt_status === "refused" ? "Отказ" : item.attempt_status === "break" ? "Перерыв" : `${item.score}% в игре`}</b></div>; }) : <p>Игровых попыток пока нет.</p>}</section>
    </div>
    </div>
    <div className="cabinet-page" hidden={section !== "access"}>
    <div className="cabinet-intro"><h2>Доступ и данные ребёнка</h2><p>Управляйте детским входом, разрешениями и сохранённой историей.</p></div>
    <div className="parent-management-grid">
      <section className="admin-card student-access"><div className="admin-card-head"><div><span className="kicker">ДОСТУП РЕБЁНКА</span><h3>{student ? "Изменить ученический вход" : "Создать вход для ученика"}</h3><p>Отдельный безопасный вход без электронной почты.</p></div><span className="period-pill">Только логин и PIN</span></div><form className="student-access-form" onSubmit={saveStudent}><label>Логин ученика<input value={studentForm.username} onChange={(e) => setStudentForm({...studentForm, username:e.target.value})} placeholder="Например, alikhan" pattern={"[A-Za-z0-9_.\\-]+"} minLength={3} required/></label><label>Новый PIN<input value={studentForm.pin} onChange={(e) => setStudentForm({...studentForm, pin:e.target.value.replace(/\D/g, "")})} placeholder="4-12 цифр" inputMode="numeric" minLength={4} maxLength={12} required/></label><button className="primary-button">Сохранить доступ</button></form>{accountMessage && <div className="usage-note" role="status"><Check size={18}/><p>{accountMessage}</p></div>}</section>
      <section className="admin-card privacy-control"><div className="admin-card-head"><div><span className="kicker">ПРИВАТНОСТЬ И ДАННЫЕ</span><h3>Разрешения семьи</h3><p>Каждое необязательное разрешение включается отдельно и может быть отозвано. Адаптивный анализ работает внутри платформы и не отправляет ответы во внешнюю AI API.</p></div></div><div className="consent-options"><label><input type="checkbox" disabled={!consentReady || consentSaving} checked={consent.privacy_accepted} onChange={(e)=>setConsent(e.target.checked ? {...consent,privacy_accepted:true} : {...consent,privacy_accepted:false,camera_processing:false,ai_processing:false,analytics_processing:false,specialist_sharing:false})}/><span><b>Сохранение программы и результатов</b><small>Нужно для занятий и истории игровых попыток.</small></span></label><label className={!consent.privacy_accepted ? "disabled" : ""}><input type="checkbox" disabled={!consentReady || consentSaving || !consent.privacy_accepted} checked={consent.camera_processing} onChange={(e)=>setConsent({...consent,camera_processing:e.target.checked})}/><span><b>Локальная проверка движения камерой</b><small>Кадры анализируются только в этом браузере для проверки движения. Они не записываются, не отправляются и не используются для распознавания личности.</small></span></label><label className={!consent.privacy_accepted ? "disabled" : ""}><input type="checkbox" disabled={!consentReady || consentSaving || !consent.privacy_accepted} checked={consent.analytics_processing} onChange={(e)=>setConsent({...consent,analytics_processing:e.target.checked})}/><span><b>Описательная история и AAC</b><small>Сохраняет AAC-фразы и участие без клинических выводов.</small></span></label><label className={!consent.privacy_accepted ? "disabled" : ""}><input type="checkbox" disabled={!consentReady || consentSaving || !consent.privacy_accepted} checked={Boolean(consent.specialist_sharing)} onChange={(e)=>setConsent({...consent,specialist_sharing:e.target.checked})}/><span><b>Доступ выбранного специалиста</b><small>Только после отдельного добавления по логину. Отзыв разрешения закрывает все связи со специалистами.</small></span></label></div><div className="privacy-actions"><button className="primary-button" disabled={!consentReady || consentSaving} onClick={saveConsent}>Сохранить разрешения</button>{consent.updated_at && <small className="consent-updated">Изменено {new Date(consent.updated_at).toLocaleString("ru-RU")}</small>}</div></section>
    </div>

    <section className="data-control"><div><ShieldCheck/><span><strong>Данные ребёнка принадлежат семье</strong><small>Экспорт включает профиль, занятия, истории, фотографии «Моего мира», AAC-карточки, избранное и историю практики.</small></span></div><div className="data-actions"><button className="secondary-button" onClick={exportData}>Скачать данные</button><button className="small-button danger-button" onClick={() => setDeleteOpen(!deleteOpen)}>Удалить данные</button></div></section>{deleteOpen && <form className="delete-data-form" onSubmit={deleteData}><div><strong>Удалить профиль и все связанные данные?</strong><p>Действие необратимо. Введите пароль родительского аккаунта для подтверждения.</p></div><input type="password" value={deletePassword} onChange={(e)=>setDeletePassword(e.target.value)} placeholder="Пароль" required/><button className="small-button danger-button">Удалить навсегда</button></form>}{dataMessage && <div className="usage-note"><Check size={18}/><p>{dataMessage}</p></div>}
    </div>
    <div className="cabinet-page" hidden={section !== "specialist"}>{child && <FamilySpecialistAccess key={child.id} childId={child.id} enabled={consentReady && Boolean(consent.specialist_sharing)} onManagePermissions={() => navigate("access")}/>}</div>
    <div className="medical-note"><ShieldCheck size={25}/><div><strong>Söyle - помощник, а не врач</strong><p>Платформа не ставит диагноз и не заменяет занятия с логопедом или консультацию специалиста.</p></div></div>
  </div>;
}

function AdminScreen() {
  type StudentAccount = { id: number; username: string; child_name: string; parent_name: string; is_active: number | boolean };
  type UsageDaily = { date: string; requests: number; input_tokens: number; output_tokens: number; total_tokens: number; estimated_cost_usd: number };
  type UsageEvent = { id: number; actor_id: number; actor_type: "user" | "student"; actor_name: string; actor_username: string; actor_role: Role | "unknown"; child_id: number | null; child_name: string | null; provider: string; model: string; feature: string; input_tokens: number; output_tokens: number; total_tokens: number; estimated_cost_usd: number; created_at: string };
  type UsageData = { period_days: number; requests: number; input_tokens: number; output_tokens: number; total_tokens: number; estimated_cost_usd: number; note: string; breakdown: Array<{ provider: string; model: string; feature: string; requests: number; input_tokens: number; output_tokens: number; cost: number }>; daily: UsageDaily[]; recent: UsageEvent[] };
  type AuditEvent = { id: number; actor_key: string; action: string; object_type: string; object_id: string | null; metadata: Record<string, unknown>; created_at: string };
  type DraftPreview = { valid: boolean; can_publish: boolean; blocker: string | null; errors: string[]; version: DraftExerciseVersion };
  const [contentLoading, setContentLoading] = useState(true);
  const [stats, setStats] = useState({ users: 0, children: 0, sessions: 0, exercises: 0 });
  const [users, setUsers] = useState<User[]>([]);
  const [students, setStudents] = useState<StudentAccount[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [usage, setUsage] = useState<UsageData>({ period_days: 30, requests: 0, input_tokens: 0, output_tokens: 0, total_tokens: 0, estimated_cost_usd: 0, note: "", breakdown: [], daily: [], recent: [] });
  const [usageDays, setUsageDays] = useState<7 | 30 | 90>(30);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState("");
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [drafts, setDrafts] = useState<DraftPreview[]>([]);
  const [homeDrafts, setHomeDrafts] = useState<HomeActivityDraft[]>([]);
  const [reviewWorkspace, setReviewWorkspace] = useState<ContentReviewWorkspaceData | null>(null);
  const [homePreview, setHomePreview] = useState<HomeActivityDraft | null>(null);
  const [tab, setTab] = useState<"users" | "exercises" | "usage" | "audit">("exercises");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ title: "", objective: "", instruction: "", difficulty: 1, stimuli: "" });
  const [formMessage, setFormMessage] = useState("");
  const [adminError, setAdminError] = useState("");
  const [apiHealthy, setApiHealthy] = useState<boolean | null>(null);
  const reviewReturnScrollRef = useRef(0);
  const load = useCallback(async () => {
    setAdminError(""); setContentLoading(true);
    const results = await Promise.allSettled([
      api<typeof stats>("/api/admin/stats"),
      api<User[]>("/api/admin/users"),
      api<StudentAccount[]>("/api/admin/students"),
      api<Exercise[]>("/api/exercises"),
      api<AuditEvent[]>("/api/admin/audit"),
      api<DraftPreview[]>("/api/admin/exercise-drafts"),
      api<HomeActivityDraft[]>("/api/admin/home-activity-drafts"),
      api<{ status: string }>("/api/health"),
    ]);
    if (results[0].status === "fulfilled") setStats(results[0].value);
    if (results[1].status === "fulfilled") setUsers(results[1].value);
    if (results[2].status === "fulfilled") setStudents(results[2].value);
    if (results[3].status === "fulfilled") setExercises(results[3].value);
    if (results[4].status === "fulfilled") setAuditEvents(results[4].value);
    if (results[5].status === "fulfilled") setDrafts(results[5].value);
    if (results[6].status === "fulfilled") setHomeDrafts(results[6].value);
    setApiHealthy(results[7].status === "fulfilled" && results[7].value.status === "ok");
    setContentLoading(false);
    if (results.some((result) => result.status === "rejected")) setAdminError("Часть данных не загрузилась. Проверьте соединение и повторите запрос.");
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
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
  const changeRole = async (id: number, role: Exclude<Role, "student">) => { try { await api(`/api/admin/users/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) }); await load(); } catch (cause) { setAdminError(cause instanceof Error ? cause.message : "Не удалось изменить роль"); } };
  const toggleUser = async (item: User) => { try { await api(`/api/admin/users/${item.id}/active`, { method: "PATCH", body: JSON.stringify({ is_active: !item.is_active }) }); await load(); } catch (cause) { setAdminError(cause instanceof Error ? cause.message : "Не удалось изменить статус"); } };
  const addExercise = async (event: React.FormEvent) => {
    event.preventDefault(); setFormMessage("");
    const stimuli = form.stimuli.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
      const [key = "", label = "", speech = "", visual = ""] = line.split("|").map((part) => part.trim());
      return { key, label, speech, ...(visual.startsWith("/") ? { media_ref: visual } : visual ? { visual_token: visual } : {}) };
    });
    try {
      const preview = await api<DraftPreview>("/api/admin/exercise-drafts", { method: "POST", body: JSON.stringify({
        module: "sensory", mechanic: "auditory_choice", title: form.title, objective: form.objective,
        instruction: form.instruction, difficulty: form.difficulty, skill: "vocabulary", language: "ru",
        response_mode: "single_tap", prompt_policy: { steps: ["repeat_audio", "visual_hint", "reduced_choice", "model_answer"], time_limit: null, max_attempts: 3 },
        completion_rule: { rounds: 5, success: "matching_stimulus_key" }, content: { stimuli, difficulty_levels: [{level:1,option_count:2,rounds:4,max_attempts:3},{level:2,option_count:3,rounds:5,max_attempts:3},{level:3,option_count:4,rounds:5,max_attempts:3}] },
        method_card: {
          target_skill: form.objective,
          skill_group: ["понимание предметов", "словарное понимание"],
          intended_for: ["Дети, которым нужна практика понимания знакомых слов"],
          diagnosis_boundary: "Целевая группа описана через наблюдаемый навык, а не диагноз.",
          prerequisites: ["Может рассмотреть два изображения", "Может ответить касанием или доступным альтернативным способом"],
          stimuli_and_responses: "Структурированные изображения; ответ — одно нажатие после аудиоинструкции.",
          child_instruction: form.instruction,
          adult_guidance: ["Дать не меньше пяти секунд", "Не требовать речевого ответа", "Отмечать использованную подсказку"],
          accepted_responses: ["Самостоятельное нажатие", "Нажатие с отмеченной подсказкой", "Отказ, перерыв или просьба о помощи"],
          difficulty_levels: ["Два варианта", "Три варианта", "Четыре варианта"],
          prompts: ["Повтор аудио", "Смысловая подсказка", "Сокращение выбора", "Модель ответа"],
          ambiguities: ["Однозначность изображений и отвлекающих вариантов требует ручной проверки"],
          stop_conditions: ["Отказ", "Перерыв", "Дискомфорт", "Техническая ошибка"],
          result_registration: ["Разделять самостоятельный ответ, подсказку, отказ, перерыв и техническую ошибку"],
          real_life_transfer: ["Проверить перенос со знакомыми безопасными предметами дома"],
          sources: [],
          evidence_note: "Источники не заявлены; материал требует независимой русскоязычной методической проверки.",
          methodology_review_status: "pending",
        },
      }) });
      setFormMessage(preview.valid ? "Черновик технически корректен. Публикация закрыта до методической проверки, проверки доступности и разрешения выпуска." : `Черновик сохранён, но требует исправлений: ${preview.errors.join("; ")}`);
      setForm({ title: "", objective: "", instruction: "", difficulty: 1, stimuli: "" });
      await load();
    } catch (cause) { setFormMessage(cause instanceof Error ? cause.message : "Не удалось сохранить черновик"); }
  };
  const openReview = async (versionId: number) => {
    setAdminError("");
    reviewReturnScrollRef.current = window.scrollY;
    try { setReviewWorkspace(await api<ContentReviewWorkspaceData>(`/api/admin/exercise-drafts/${versionId}/preview`)); window.scrollTo({ top: 0 }); }
    catch (cause) { setAdminError(cause instanceof Error ? cause.message : "Не удалось открыть проверку"); }
  };
  const closeReviewWorkspace = () => {
    setReviewWorkspace(null);
    window.requestAnimationFrame(() => window.scrollTo({ top: reviewReturnScrollRef.current }));
  };
  const openHomePreview = (item: HomeActivityDraft) => {
    reviewReturnScrollRef.current = window.scrollY;
    setHomePreview(item);
    window.scrollTo({ top: 0 });
  };
  const closeHomePreview = () => {
    setHomePreview(null);
    window.requestAnimationFrame(() => window.scrollTo({ top: reviewReturnScrollRef.current }));
  };
  const reviewContent = async (stage: "technical" | "methodology" | "accessibility" | "publication", decision: "passed" | "approved" | "changes_requested", comment: string) => {
    if (!reviewWorkspace) return;
    const updated = await api<ContentReviewWorkspaceData>(`/api/admin/exercise-drafts/${reviewWorkspace.version.id}/reviews`, { method: "POST", body: JSON.stringify({ stage, decision, comment }) });
    setReviewWorkspace(updated);
    await load();
  };
  const archiveExercise = async (id: number) => { try { await api(`/api/admin/exercises/${id}`, { method: "DELETE" }); await load(); } catch (cause) { setAdminError(cause instanceof Error ? cause.message : "Не удалось архивировать задание"); } };
  const featureLabel = (feature: string) => ({ home_practice_plan: "План занятия", parent_support_answer: "Ответ родителю" }[feature] || feature);
  const actorRoleLabel = (role: UsageEvent["actor_role"]) => ({ parent: "родитель", student: "ученик", admin: "администратор", specialist: "специалист", unknown: "аккаунт удалён" }[role]);
  const formatTokens = (value: number) => value.toLocaleString("ru-RU");
  const formatCost = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 6 }).format(value);
  const maxDailyTokens = Math.max(0, ...usage.daily.map((item) => item.total_tokens));
  if (tab === "exercises" && reviewWorkspace) return <div className="page-enter admin-review-page"><ContentReviewWorkspace data={reviewWorkspace} onClose={closeReviewWorkspace} onSpeak={(text, rate) => speak(text, rate, true)} onReview={reviewContent}/></div>;
  if (tab === "exercises" && homePreview) return <div className="page-enter admin-review-page"><HomeActivityReviewPreview activity={homePreview} onClose={closeHomePreview}/></div>;
  return <div className="page-enter stack-xl admin-page">
    <div className="admin-heading"><PageTitle eyebrow="УПРАВЛЕНИЕ ПЛАТФОРМОЙ" title="Админ-панель" subtitle="Проверка заданий, управление доступом и история решений."/><span className={`system-status ${apiHealthy === false ? "blocked" : ""}`}><i/> {apiHealthy === null ? "Проверяем API" : apiHealthy ? "API доступен" : "API недоступен"}</span></div>
    {adminError && <div className="game-error" role="alert"><ShieldAlert size={18}/><span>{adminError}</span><button className="small-button" onClick={() => void load()}>Повторить</button></div>}
    {tab === "users" && <div className="stats-row admin-stats"><StatCard icon={<Users/>} value={String(stats.users)} label="аккаунтов"/><StatCard icon={<UserRound/>} value={String(stats.children)} label="профилей детей"/><StatCard icon={<Target/>} value={String(stats.sessions)} label="сохранённых попыток"/><StatCard icon={<Gamepad2/>} value={String(stats.exercises)} label="активных заданий"/></div>}
    <div className="admin-tabs" role="tablist" aria-label="Разделы админ-панели"><button type="button" role="tab" aria-selected={tab === "users"} className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}><Users size={17}/>Пользователи</button><button type="button" role="tab" aria-selected={tab === "exercises"} className={tab === "exercises" ? "active" : ""} onClick={() => setTab("exercises")}><Gamepad2 size={17}/>Задания</button><button type="button" role="tab" aria-selected={tab === "usage"} className={tab === "usage" ? "active" : ""} onClick={() => { setTab("usage"); void loadUsage(usageDays); }}><BarChart3 size={17}/>Архив API</button><button type="button" role="tab" aria-selected={tab === "audit"} className={tab === "audit" ? "active" : ""} onClick={() => setTab("audit")}><ShieldCheck size={17}/>Журнал</button></div>
    {tab === "users" && <section className="admin-card"><div className="admin-card-head"><div><span className="kicker">ДОСТУП И РОЛИ</span><h3>Взрослые аккаунты</h3><p>Роль определяет доступ к семейным и административным разделам.</p></div></div><div className="admin-table-wrap"><table className="account-table"><caption className="sr-only">Взрослые аккаунты и их права доступа</caption><thead><tr><th scope="col">Пользователь</th><th scope="col">Роль</th><th scope="col">Статус</th><th scope="col">Действие</th></tr></thead><tbody>{users.map((item) => <tr key={item.id}><td data-label="Пользователь"><b>{item.full_name}</b><small>{item.email}</small></td><td data-label="Роль"><select aria-label={`Роль пользователя ${item.full_name}`} value={item.role} onChange={(e) => changeRole(item.id, e.target.value as Exclude<Role,"student">)}><option value="parent">Родитель</option><option value="specialist">Специалист</option><option value="admin">Администратор</option></select></td><td data-label="Статус"><i className={`status ${item.is_active ? "active" : "blocked"}`}>{item.is_active ? "Активен" : "Отключён"}</i></td><td data-label="Действие"><button type="button" className="small-button" onClick={() => toggleUser(item)}>{item.is_active ? "Отключить" : "Включить"}</button></td></tr>)}</tbody></table></div><div className="student-accounts"><div className="student-accounts-head"><span className="kicker">УЧЕНИЧЕСКИЕ АККАУНТЫ</span><small>{students.length} всего</small></div><div className="student-account-grid">{students.map((item) => <article key={item.id}><span className="student-icon"><Backpack/></span><div><strong>{item.child_name}</strong><small>Логин: {item.username}</small><small>Родитель: {item.parent_name}</small></div><i className="status active">Ученик</i></article>)}</div></div></section>}
    {tab === "exercises" && <section className="admin-card admin-content-panel">
      <div className="admin-card-head"><div><span className="kicker">ВЕРСИОНИРУЕМЫЙ КОНТЕНТ</span><h2>Задания и проверка</h2><p>Черновики, материалы на проверке и доступная библиотека.</p></div><button type="button" className="primary-button" aria-expanded={formOpen} onClick={() => setFormOpen(!formOpen)}>{formOpen ? "Закрыть форму" : "+ Новый черновик"}</button></div>
      {formOpen && <form className="exercise-form exercise-draft-form" onSubmit={addExercise}><label>Название<input placeholder="Например, Предметы на кухне" value={form.title} onChange={(e) => setForm({...form,title:e.target.value})} required/></label><label>Наблюдаемый навык<input placeholder="Сопоставляет услышанное слово с изображением" value={form.objective} onChange={(e) => setForm({...form,objective:e.target.value})} required/></label><label>Инструкция<input placeholder="Послушай и выбери картинку" value={form.instruction} onChange={(e) => setForm({...form,instruction:e.target.value})} required/></label><label>Уровень<select value={form.difficulty} onChange={(e) => setForm({...form,difficulty:Number(e.target.value)})}><option value={1}>1 — начальный</option><option value={2}>2 — средний</option><option value={3}>3 — сложный</option></select></label><label className="draft-stimuli">Стимулы<textarea value={form.stimuli} onChange={(e) => setForm({...form,stimuli:e.target.value})} placeholder={'cup | Чашка | Чашка | /p15/nouns/home/cup.svg\nspoon | Ложка | Ложка | /p15/nouns/home/spoon.svg\nbook | Книга | Книга | /p15/nouns/home/book.svg\nchair | Стул | Стул | /p15/nouns/home/chair.svg'} required/><small>Одна строка: стабильный key | подпись | озвучка | локальный путь. После создания заполненная методическая карточка откроется в рабочем пространстве проверки.</small></label><div className="draft-form-actions"><button className="primary-button">Сохранить черновик</button><span>Создаётся только DRAFT. Автопроверка не является утверждением.</span></div></form>}
      {formMessage && <div className="usage-note" role="status"><ShieldCheck size={18}/><p>{formMessage}</p></div>}
      <AdminContentQueue drafts={drafts} exercises={exercises} homeDrafts={homeDrafts} loading={contentLoading} onReview={id => void openReview(id)} onHomePreview={openHomePreview} onArchive={id => void archiveExercise(id)}/>
    </section>}
    {tab === "usage" && <section className="usage-dashboard" aria-busy={usageLoading}>
      <div className="usage-toolbar">
        <div><span className="kicker">ВНЕШНЯЯ API ОТКЛЮЧЕНА</span><h2>Архив прежних запросов</h2><p>Новые планы и подсказки работают локально. Здесь остаётся только исторический технический журнал.</p></div>
        <div className="usage-periods" aria-label="Период отчёта">{([7, 30, 90] as const).map((days) => <button key={days} className={usageDays === days ? "active" : ""} aria-pressed={usageDays === days} onClick={() => { setUsageDays(days); void loadUsage(days); }}>{days} дней</button>)}</div>
      </div>
      {usageLoading ? <div className="admin-card usage-loading" role="status"><span className="sr-only">Загрузка статистики токенов</span>{[1,2,3,4].map((item) => <i key={item}/>)}</div> : usageError ? <div className="admin-card usage-error" role="alert"><CircleAlert/><div><strong>Не удалось загрузить статистику</strong><p>{usageError}</p></div><button className="secondary-button" onClick={() => void loadUsage(usageDays)}><RotateCcw size={16}/>Повторить</button></div> : <>
        <div className="usage-cards">
          <StatCard icon={<Bot/>} value={formatTokens(usage.requests)} label="старых внешних запросов"/>
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
              <figcaption>Высота столбца - общее число входных и выходных токенов за день.</figcaption>
            </figure> : <div className="usage-empty"><BarChart3/><strong>Внешних запросов нет</strong><p>Локальный анализ не расходует токены и не обращается к поставщику модели.</p></div>}
          </section>
          <section className="admin-card usage-breakdown-card">
            <div className="admin-card-head"><div><span className="kicker">НА ЧТО УШЛИ ТОКЕНЫ</span><h3>По функциям</h3></div></div>
            {usage.breakdown.length ? <div className="usage-table"><div className="usage-row header"><span>Функция и модель</span><span>Запросы</span><span>Токены</span><span>Стоимость</span></div>{usage.breakdown.map((item) => <div className="usage-row" key={`${item.model}-${item.feature}`}><span><b>{featureLabel(item.feature)}</b><small>{item.provider} · {item.model}</small></span><span>{formatTokens(item.requests)}</span><span>{formatTokens(item.input_tokens + item.output_tokens)}</span><span>{formatCost(Number(item.cost || 0))}</span></div>)}</div> : <div className="usage-empty compact"><PackageOpen/><strong>Нет данных для разбивки</strong></div>}
          </section>
        </div>
        <section className="admin-card usage-history-card">
          <div className="admin-card-head"><div><span className="kicker">ИСТОРИЧЕСКИЕ ДАННЫЕ</span><h3>Прежние внешние запросы</h3><p>Показаны последние {usage.recent.length} сохранённых событий за выбранный период.</p></div><button className="small-button" onClick={() => void loadUsage(usageDays)} aria-label="Обновить архив"><RotateCcw size={15}/>Обновить</button></div>
          {usage.recent.length ? <div className="usage-history-wrap"><table className="usage-history-table"><caption className="sr-only">Архив прежних внешних запросов по пользователям и времени</caption><thead><tr><th scope="col">Когда</th><th scope="col">Кто запустил</th><th scope="col">Профиль ребёнка</th><th scope="col">Функция</th><th scope="col">Токены</th><th scope="col">Стоимость</th></tr></thead><tbody>{usage.recent.map((event) => <tr key={event.id}>
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
  const themeName = { peach: "Спокойная", ocean: "Океан", lavender: "Лаванда", contrast: "Высокий контраст" }[settings.theme];
  if (user.role === "student") return <div className="v2-screen v2-child-profile page-enter">
    <header className="v2-child-profile-hero">
      <Image src="/app-illustrations/profile-child-hero.webp" alt="" fill priority unoptimized sizes="(max-width: 760px) 100vw, 75vw"/>
      <div className="v2-child-profile-hero-copy"><span className="v2-kicker">МОЙ КАБИНЕТ</span><h1>Привет, {child?.name || user.full_name.split(" ")[0]}!</h1><p>Твои истории, маленькие победы и любимые вещи — здесь.</p><button type="button" onClick={() => onOpen("achievements")}>Посмотреть достижения <ArrowRight/></button></div>
    </header>
    <section className="v2-child-profile-stats" aria-label="Мои сохранённые результаты">
      <article><span><Star/></span><strong>{dashboard?.stars || 0}</strong><small>звёзд за игры</small></article>
      <article><span><Gamepad2/></span><strong>{dashboard?.total_sessions || 0}</strong><small>сохранённых занятий</small></article>
      <article><span><Clock3/></span><strong>{dashboard?.total_minutes || 0}</strong><small>минут практики</small></article>
    </section>
    <section className="v2-child-profile-destinations"><div><span className="v2-kicker">ЧТО ПОСМОТРЕТЬ</span><h2>Моё пространство</h2></div><div className="v2-child-profile-links"><button type="button" onClick={() => onOpen("stories")}><BookOpen/><span><strong>Истории</strong><small>Читать и выбирать</small></span><ChevronRight/></button><button type="button" onClick={() => onOpen("world")}><ImageIcon/><span><strong>Мой мир</strong><small>Знакомые фотографии</small></span><ChevronRight/></button><button type="button" onClick={() => onOpen("aac")}><MessageCircle/><span><strong>Мои слова</strong><small>Сказать, что нужно</small></span><ChevronRight/></button><button type="button" onClick={() => onOpen("settings")}><Settings/><span><strong>Настройки</strong><small>Звук и оформление</small></span><ChevronRight/></button></div></section>
    <section className="v2-child-profile-account"><div><span className="v2-kicker">МОИ ДАННЫЕ</span><h2>Об аккаунте</h2><p>Имя: <strong>{user.full_name}</strong> · Логин: <strong>{user.username}</strong>{age !== null ? <> · Возраст: <strong>{age} лет</strong></> : null}</p><p>Язык: <strong>{languageName}</strong> · Оформление: <strong>{themeName}</strong></p></div><button type="button" onClick={onLogout}><LogOut/> Выйти из аккаунта</button></section>
  </div>;
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
    {user.role === "parent" && <section className="parent-more-grid profile-quick-links" aria-label="Дополнительные возможности">
      <button onClick={() => onOpen("goals")}><span><Target/></span><div><strong>Цели и занятия</strong><small>Индивидуальные цели и короткие планы</small></div><ChevronRight/></button>
      <button onClick={() => onOpen("ai")}><span><Bot/></span><div><strong>Локальный помощник</strong><small>Подсказки по прозрачным безопасным правилам</small></div><ChevronRight/></button>
      <button onClick={() => onOpen("parent")}><span><ShieldCheck/></span><div><strong>Данные ребёнка</strong><small>Доступ, согласия, экспорт и приватность</small></div><ChevronRight/></button>
      <button onClick={() => onOpen("settings")}><span><Settings/></span><div><strong>Настройки</strong><small>Звук, спокойный режим и оформление</small></div><ChevronRight/></button>
    </section>}
    <button className="profile-logout" onClick={onLogout}><LogOut size={17}/> Выйти из аккаунта</button>
  </div>;
}

function SettingsScreen({ role, settings, saving, onChange, onLogout, onOpenParent }: { role: Role; settings: AppSettings; saving: boolean; onChange: (settings: AppSettings) => void; onLogout: () => void; onOpenParent: () => void }) {
  const themes = [
    { id: "peach", name: "Спокойная", description: "Нейтральный фон и синий акцент", colors: ["#1668c7", "#eaf3ff", "#ffffff"] },
    { id: "ocean", name: "Океан", description: "Приглушённый бирюзовый акцент", colors: ["#2d7180", "#e5f2f4", "#ffffff"] },
    { id: "lavender", name: "Лаванда", description: "Мягкий фиолетовый акцент", colors: ["#6759aa", "#f0eef8", "#ffffff"] },
    { id: "contrast", name: "Контрастная", description: "Чёткие границы и более тёмный текст", colors: ["#164f91", "#dcecff", "#ffffff"] },
  ] as const;
  const languages = [{id:"ru",short:"RU",name:"Русский - проверенная версия"}] as const;
  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => onChange({ ...settings, [key]: value });
  const activeTheme = themes.find((item) => item.id === settings.theme) || themes[0];
  if (role === "student") return <div className="page-enter child-settings-page">
    <PageTitle eyebrow="МОИ НАСТРОЙКИ" title="Как тебе удобнее?" subtitle="Выбери звук, спокойный режим и оформление."/>
    <div className="child-settings-grid">
      <section className="child-settings-section"><div className="settings-section-heading"><span className="kicker">ВО ВРЕМЯ ЗАНЯТИЯ</span><h2>Звук и движение</h2></div><SettingRow icon={<Volume2/>} title="Звуковые подсказки" text="Слушать слова и сообщения" value={settings.sound_enabled} onChange={(value) => update("sound_enabled", value)}/><SettingRow icon={<Pause/>} title="Спокойный режим" text="Без звёзд и лишней анимации" value={settings.calm_mode} onChange={(value) => update("calm_mode", value)}/></section>
      <section className="child-settings-section"><div className="settings-section-heading"><span className="kicker">ОФОРМЛЕНИЕ</span><h2>Цвета и контраст</h2></div><div className="child-theme-options" role="group" aria-label="Оформление экрана">{themes.map((item) => <button type="button" key={item.id} className={settings.theme === item.id ? "active" : ""} aria-pressed={settings.theme === item.id} onClick={() => update("theme", item.id as AppSettings["theme"])}><span className="theme-swatch">{item.colors.map((color) => <i key={color} style={{background:color}}/>)}</span><span><strong>{item.name}</strong><small>{item.id === "contrast" ? "Самые чёткие границы" : item.description}</small></span>{settings.theme === item.id && <Check size={20}/>}</button>)}</div></section>
    </div>
    <div className="child-settings-footer"><span aria-live="polite">{saving ? "Сохраняем…" : "Настройки сохранены"}</span><button type="button" className="profile-logout" onClick={onLogout}><LogOut size={18}/> Выйти</button></div>
  </div>;
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
        <small aria-live="polite">{saving ? <Timer size={15}/> : <CircleCheck size={15}/>} {saving ? "Сохраняем изменения…" : "Все изменения сохранены"}</small>
      </aside>
      <div className="settings-sections">
        <section className="settings-section theme-setting">
          <div className="settings-section-heading"><div><span className="kicker">ОФОРМЛЕНИЕ</span><h3>Цветовая тема</h3><p>Меняется фон, акцентные кнопки и выбранные элементы. Цвета успеха и ошибок остаются привычными.</p></div></div>
          <div className="theme-options" role="group" aria-label="Цветовая тема">{themes.map((item) => <button type="button" key={item.id} className={settings.theme === item.id ? "active" : ""} aria-pressed={settings.theme === item.id} onClick={() => update("theme", item.id as AppSettings["theme"])}><span className="theme-swatch">{item.colors.map((color) => <i key={color} style={{background:color}}/>)}</span><span className="theme-copy"><strong>{item.name}</strong><small>{item.description}</small></span>{settings.theme === item.id && <span className="theme-selected"><Check size={14}/> Выбрано</span>}</button>)}</div>
        </section>
        <section className="settings-section preference-setting">
          <div className="settings-section-heading"><span className="kicker">ЗАНЯТИЯ И ДОСТУПНОСТЬ</span><h3>Комфорт во время практики</h3></div>
          <SettingRow icon={<Volume2/>} title="Звуковые подсказки" text="Голос и мягкие сигналы во время задания" value={settings.sound_enabled} onChange={(value) => update("sound_enabled", value)}/>
          <SettingRow icon={<Camera/>} title="Разрешать запуск камеры" text="Отдельная настройка устройства; родительское согласие всё равно обязательно" value={settings.camera_enabled} onChange={(value) => update("camera_enabled", value)}/>
          <SettingRow icon={<Sparkles/>} title="Спокойный режим" text="Меньше анимации и визуальных эффектов" value={settings.calm_mode} onChange={(value) => update("calm_mode", value)}/>
        </section>
        <section className="settings-section language-setting">
          <div className="settings-section-heading"><span className="kicker">ЯЗЫК И КОНТЕНТ</span><h3>Проверенная версия интерфейса</h3><p>Другие языки появятся после проверки носителями языка и AAC-специалистом.</p></div>
          <div className="language-options">{languages.map((item) => <button type="button" key={item.id} className={settings.language === item.id ? "active" : ""} aria-pressed={settings.language === item.id} onClick={() => update("language", item.id)}><b>{item.short}</b><span>{item.name}</span><Check size={16}/></button>)}</div>
        </section>
        <section className="settings-section account-setting">
          <div className="settings-section-heading"><span className="kicker">АККАУНТ</span><h3>Данные и сеанс</h3></div>
          <div className="setting-row"><div className="setting-icon"><LockKeyhole/></div><div><strong>Данные защищены</strong><span>Видео не сохраняется; результаты находятся в профиле ребёнка</span></div><span className="status active">Защищено</span></div>
          {role === "parent" && <div className="setting-row"><div className="setting-icon"><ShieldCheck/></div><div><strong>Приватность и разрешения</strong><span>Согласие на сохранение, камера, экспорт и удаление данных</span></div><button type="button" className="small-button" onClick={onOpenParent}>Открыть</button></div>}
          <div className="setting-row"><div className="setting-icon danger"><LogOut/></div><div><strong>Выйти из аккаунта</strong><span>На этом устройстве потребуется повторный вход</span></div><button type="button" className="small-button" onClick={onLogout}>Выйти</button></div>
        </section>
      </div>
    </div>
  </div>;
}

function SettingRow({ icon, title, text, value, onChange }: { icon: React.ReactNode; title: string; text: string; value: boolean; onChange: (v: boolean) => void }) {
  return <div className="setting-row"><div className="setting-icon">{icon}</div><div><strong>{title}</strong><span>{text}</span></div><button type="button" className={`toggle ${value ? "on" : ""}`} onClick={() => onChange(!value)} aria-label={`${title}: ${value ? "включено" : "выключено"}`} aria-pressed={value}><i/></button></div>;
}
