"use client";

import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Backpack,
  BarChart3,
  Bell,
  Bot,
  Camera,
  Check,
  ChevronRight,
  CreditCard,
  Gamepad2,
  Home,
  Languages,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Menu,
  Mic2,
  Parentheses,
  Play,
  RotateCcw,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Timer,
  TrendingUp,
  Trophy,
  Users,
  UserRound,
  Volume2,
  X,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, AACCard, AppSettings, Child, Dashboard, Exercise, getToken, NotificationsData, Role, setToken, User } from "@/lib/api";

type Screen = "home" | "games" | "motor" | "sensory" | "mixed" | "progress" | "parent" | "settings" | "admin" | "specialist";
type ModuleName = "motor" | "sensory" | "mixed";
const defaultSettings: AppSettings = { camera_enabled: true, sound_enabled: true, calm_mode: false, theme: "peach" };

const modules = [
  {
    id: "motor" as const,
    title: "Весёлая артикуляция",
    eyebrow: "Моторный модуль",
    description: "Повторяй движения за примером и зажигай звёзды",
    icon: "/illustrations/module-articulation-fox.png",
    accent: "coral",
    progress: 0,
    time: "5 минут",
  },
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
    description: "Складывай карточки и говори целыми фразами",
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
  return <Image src="/soyle-icon.png" alt="" width={size} height={size} priority />;
}

export function SoyleApp() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      queueMicrotask(() => setAuthLoading(false));
      return;
    }
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 2500);
    api<User>("/api/auth/me", { signal: controller.signal })
      .then((currentUser) => { if (active) setUser(currentUser); })
      .catch(() => { if (active) setToken(null); })
      .finally(() => { window.clearTimeout(timeout); if (active) setAuthLoading(false); });
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, []);

  if (authLoading) return <div className="auth-loading"><div className="brand-mark"><BrandIcon /></div><span>Söyle загружается…</span></div>;
  if (!user) return <AuthScreen onAuthenticated={setUser} />;
  return <AuthenticatedApp user={user} onLogout={() => { setToken(null); setUser(null); }} />;
}

function AuthenticatedApp({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [screen, setScreen] = useState<Screen>(() => user.role === "admin" ? "admin" : user.role === "specialist" ? "specialist" : "home");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [children, setChildren] = useState<Child[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [notifications, setNotifications] = useState<NotificationsData>({ unread: 0, items: [] });
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [reward, setReward] = useState<{ stars: number; nonce: number } | null>(null);
  const gameStartedAtRef = useRef(0);
  const [childrenLoading, setChildrenLoading] = useState(true);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.dataset.calm = settings.calm_mode ? "true" : "false";
  }, [settings]);
  useEffect(() => { api<Child[]>("/api/children").then(setChildren).catch(() => setChildren([])).finally(() => setChildrenLoading(false)); }, []);
  useEffect(() => {
    api<Exercise[]>("/api/exercises").then(setExercises).catch(() => setExercises([]));
    api<AppSettings>("/api/settings").then(setSettings).catch(() => setSettings(defaultSettings));
  }, []);
  const loadNotifications = useCallback(() => {
    if (user.role === "parent") api<NotificationsData>("/api/notifications").then(setNotifications).catch(() => setNotifications({ unread: 0, items: [] }));
  }, [user.role]);
  useEffect(loadNotifications, [loadNotifications]);

  const navigation: { id: Screen; label: string; icon: typeof Home }[] = user.role === "admin"
    ? [{ id: "admin", label: "Админ-панель", icon: LayoutDashboard }, { id: "settings", label: "Настройки", icon: Settings }]
    : user.role === "specialist"
      ? [{ id: "specialist", label: "Кабинет специалиста", icon: Users }, { id: "progress", label: "Прогресс детей", icon: BarChart3 }, { id: "settings", label: "Настройки", icon: Settings }]
      : [
          { id: "home", label: "Главная", icon: Home },
          { id: "games", label: "Занятия", icon: Gamepad2 },
          { id: "progress", label: "Прогресс", icon: BarChart3 },
          ...(user.role === "parent" ? [{ id: "parent" as Screen, label: "Для родителей", icon: UserRound }] : []),
          { id: "settings", label: "Настройки", icon: Settings },
        ];

  const child = children[0];

  const refreshDashboard = useCallback(() => {
    if (child?.id) api<Dashboard>(`/api/dashboard/${child.id}`).then(setDashboard).catch(() => setDashboard(null));
  }, [child]);
  useEffect(refreshDashboard, [refreshDashboard]);

  const saveSession = async (exerciseId: number, module: ModuleName, score: number, details: Record<string, unknown>) => {
    if (!child || !exerciseId) return;
    const startedAt = gameStartedAtRef.current || Date.now();
    const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    const result = await api<{ awarded_stars: number }>("/api/sessions", { method: "POST", body: JSON.stringify({ child_id: child.id, exercise_id: exerciseId, module, score, duration_seconds: durationSeconds, details }) }).catch(() => null);
    if (result) {
      setReward({ stars: result.awarded_stars, nonce: Date.now() });
      window.setTimeout(() => setReward(null), 2200);
      gameStartedAtRef.current = Date.now();
      refreshDashboard();
      loadNotifications();
    }
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
  if (user.role === "parent" && !children.length) return <ChildOnboarding user={user} onCreated={(newChild) => setChildren([newChild])} onLogout={onLogout} />;

  const openScreen = (next: Screen) => {
    if (["motor", "sensory", "mixed"].includes(next)) {
      gameStartedAtRef.current = Date.now();
      setSelectedExercise(exercises.find((item) => item.module === next) || null);
    }
    setScreen(next);
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openExercise = (exercise: Exercise) => {
    setSelectedExercise(exercise);
    gameStartedAtRef.current = Date.now();
    setScreen(exercise.module);
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="brand" onClick={() => openScreen("home")} role="button" tabIndex={0}>
          <div className="brand-mark"><BrandIcon /></div>
          <div><strong>Söyle</strong><span>растём вместе</span></div>
        </div>
        <button className="sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Закрыть меню"><X /></button>
        <nav>
          {navigation.map((item) => {
            const active = screen === item.id || (item.id === "games" && ["motor", "sensory", "mixed"].includes(screen));
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
          <div className="avatar">{user.full_name[0]}</div>
          <div><strong>{user.full_name}</strong><span>{roleLabel(user.role)}</span></div>
          <button className="logout-mini" onClick={onLogout} aria-label="Выйти"><LogOut size={17} /></button>
        </div>
      </aside>

      {sidebarOpen && <button className="overlay" onClick={() => setSidebarOpen(false)} aria-label="Закрыть меню" />}

      <main className="main">
        <header className="topbar">
          <button className="menu-button" onClick={() => setSidebarOpen(true)} aria-label="Открыть меню"><Menu /></button>
          <div className="mobile-logo"><BrandIcon size={22} /> Söyle</div>
          <div className="top-actions">
            <button className="language"><Languages size={17} /> RU</button>
            <div className="stars"><Star size={18} fill="currentColor" /> {dashboard?.stars || 0}</div>
            {user.role === "parent" && <div className="notification-wrap"><button className="notification-button" onClick={() => setNotificationsOpen((value) => !value)} aria-label="Уведомления"><Bell size={19}/>{notifications.unread > 0 && <i>{notifications.unread}</i>}</button>{notificationsOpen && <div className="notification-panel"><div className="notification-head"><div><span className="kicker">УВЕДОМЛЕНИЯ</span><strong>Практика после модулей</strong></div>{notifications.unread > 0 && <button onClick={markAllNotificationsRead}>Прочитать все</button>}</div><div className="notification-list">{notifications.items.length ? notifications.items.map((item) => <button key={item.id} className={item.is_read ? "read" : "unread"} onClick={() => markNotificationRead(item.id)}><span className="notification-symbol"><Trophy size={18}/></span><div><strong>{item.title}</strong><p>{item.message}</p><small>{new Date(item.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</small></div>{!item.is_read && <i/>}</button>) : <div className="notification-empty"><Bell size={24}/><strong>Пока всё спокойно</strong><span>После завершения модуля здесь появится домашняя тренировка.</span></div>}</div></div>}</div>}
            <div className="avatar small">{user.full_name[0]}</div>
          </div>
        </header>

        <div className="page">
          {screen === "home" && <HomeScreen onOpen={openScreen} child={child} dashboard={dashboard} />}
          {screen === "games" && <GamesScreen onOpen={openScreen} onExercise={openExercise} dashboard={dashboard} exercises={exercises} />}
          {screen === "motor" && <MotorGame exercises={exercises.filter((item) => item.module === "motor")} initialExercise={selectedExercise} cameraEnabled={settings.camera_enabled} onBack={() => openScreen("games")} onComplete={(score, exerciseId) => saveSession(exerciseId, "motor", score, { source: "face-landmarker" })} />}
          {screen === "sensory" && <SensoryGame exercise={selectedExercise?.module === "sensory" ? selectedExercise : exercises.find((item) => item.module === "sensory")} soundEnabled={settings.sound_enabled} onBack={() => openScreen("games")} onComplete={(score, exerciseId) => saveSession(exerciseId, "sensory", score, { rounds: 5 })} />}
          {screen === "mixed" && <PhraseGame key={selectedExercise?.id || "mixed"} childId={child?.id} canManage={user.role === "parent"} exercise={selectedExercise?.module === "mixed" ? selectedExercise : exercises.find((item) => item.module === "mixed")} soundEnabled={settings.sound_enabled} onBack={() => openScreen("games")} onComplete={(score, phrase, exerciseId) => saveSession(exerciseId, "mixed", score, { phrase })} />}
          {screen === "progress" && <ProgressScreen childId={child?.id} dashboard={dashboard} />}
          {screen === "parent" && <ParentScreen child={child} dashboard={dashboard} />}
          {screen === "admin" && <AdminScreen />}
          {screen === "specialist" && <SpecialistScreen />}
          {screen === "settings" && <SettingsScreen settings={settings} onChange={changeSettings} onLogout={onLogout} />}
        </div>
      </main>
      {reward && <RewardCelebration key={reward.nonce} stars={reward.stars} />}
    </div>
  );
}

function RewardCelebration({ stars }: { stars: number }) {
  return <div className="reward-layer" role="status" aria-live="polite"><div className="reward-card"><div className="reward-star">★</div><strong>+{stars} {stars === 1 ? "звезда" : stars < 5 ? "звезды" : "звёзд"}</strong><span>Результат сохранён</span></div>{[0,1,2,3,4,5,6,7].map((item) => <i key={item} style={{ "--reward-index": item } as React.CSSProperties}>★</i>)}</div>;
}

function ChildOnboarding({ user, onCreated, onLogout }: { user: User; onCreated: (child: Child) => void; onLogout: () => void }) {
  const [name, setName] = useState(""); const [birthDate, setBirthDate] = useState(""); const [module, setModule] = useState<ModuleName>("mixed"); const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setError(""); try { const child = await api<Child>("/api/children", { method: "POST", body: JSON.stringify({ name, birth_date: birthDate, primary_module: module, avatar_color: "#f07d68" }) }); onCreated(child); } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось создать профиль"); } };
  return <div className="onboarding-page"><div className="onboarding-card"><div className="brand"><div className="brand-mark"><BrandIcon /></div><div><strong>Söyle</strong><span>первичная настройка</span></div></div><span className="kicker">ДОБРО ПОЖАЛОВАТЬ, {user.full_name.toUpperCase()}</span><h1>Создадим профиль ребёнка</h1><p>Это поможет сохранять результаты и подбирать персональные задания.</p><form onSubmit={submit}><label>Имя ребёнка<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Алихан" required minLength={2}/></label><label>Дата рождения<input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} required/></label><label>Основное направление<select value={module} onChange={(e) => setModule(e.target.value as ModuleName)}><option value="motor">Моторный модуль</option><option value="sensory">Сенсорный модуль</option><option value="mixed">Смешанный модуль</option></select></label>{error && <div className="auth-error">{error}</div>}<button className="primary-button">Создать профиль <ChevronRight size={18}/></button></form><button className="auth-switch" onClick={onLogout}>Выйти из аккаунта</button></div></div>;
}

function roleLabel(role: Role) {
  return { admin: "Администратор", parent: "Родитель", specialist: "Специалист", student: "Ученик" }[role];
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "register" | "student">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(""); setLoading(true);
    try {
      const endpoint = mode === "student" ? "student-login" : mode === "login" ? "login" : "register";
      const payload = mode === "student" ? { username, pin: password } : mode === "login" ? { username, password } : { username, password, full_name: name };
      const result = await api<{ access_token: string; user: User }>(`/api/auth/${endpoint}`, {
        method: "POST", body: JSON.stringify(payload),
      });
      setToken(result.access_token); onAuthenticated(result.user);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Ошибка авторизации"); }
    finally { setLoading(false); }
  };

  const heading = mode === "student" ? "Вход для ученика" : mode === "login" ? "Войти в Söyle" : "Создать аккаунт родителя";
  return <div className="auth-page"><div className="auth-visual"><div className="auth-brand"><div className="brand-mark"><BrandIcon /></div><strong>Söyle</strong></div><div className="auth-copy"><span className="pill"><Sparkles size={15}/> Безопасное пространство развития</span><h1>Каждый голос<br/><em>заслуживает быть услышанным</em></h1><p>Игровые занятия, компьютерное зрение и понятная динамика прогресса — в одной платформе.</p></div><div className="auth-orbs"><i><Image src={modules[0].icon} alt="" width={64} height={64}/></i><i><Image src={modules[1].icon} alt="" width={64} height={64}/></i><i><Image src={modules[2].icon} alt="" width={64} height={64}/></i></div></div><div className="auth-form-wrap"><form className="auth-card" onSubmit={submit}><span className="kicker">ДОБРО ПОЖАЛОВАТЬ</span><h2>{heading}</h2><p>{mode === "student" ? "Введи логин и PIN, которые создал родитель" : mode === "login" ? "Продолжите занятия и посмотрите прогресс" : "Будет создан безопасный аккаунт родителя"}</p>{mode === "register" && <label>Ваше имя<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Айгерим Садыкова" required minLength={2}/></label>}<label>{mode === "student" ? "Логин ученика" : "Логин"}<input type="text" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder={mode === "student" ? "логин от родителя" : "латинскими буквами"} required minLength={3}/></label><label>{mode === "student" ? "PIN-код" : "Пароль"}<input type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} inputMode={mode === "student" ? "numeric" : undefined} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === "register" ? 8 : mode === "student" ? 4 : 6}/></label>{error && <div className="auth-error">{error}</div>}<button className="primary-button auth-submit" disabled={loading}>{loading ? "Подождите…" : mode === "register" ? "Создать аккаунт родителя" : "Войти"}<ChevronRight size={18}/></button>{mode === "student" ? <button type="button" className="auth-switch" onClick={() => { setMode("login"); setUsername(""); setPassword(""); }}>Вход для взрослых</button> : <><button type="button" className="auth-switch" onClick={() => { setMode(mode === "login" ? "register" : "login"); setUsername(""); setPassword(""); }}>{mode === "login" ? "Нет аккаунта? Зарегистрироваться" : "Уже есть аккаунт? Войти"}</button><button type="button" className="student-login-button" onClick={() => { setMode("student"); setUsername(""); setPassword(""); }}><Backpack size={16}/> Войти как ученик</button></>}</form></div></div>;
}

function HomeScreen({ onOpen, child, dashboard }: { onOpen: (screen: Screen) => void; child?: Child; dashboard: Dashboard | null }) {
  const today = new Date();
  const month = today.toLocaleDateString("ru-RU", { month: "short" }).replace(".", "").toUpperCase();
  return (
    <div className="stack-xl page-enter">
      <section className="hero">
        <div className="hero-copy">
          <div className="pill"><Sparkles size={15} /> Добрый день, {child?.name || "друг"}!</div>
          <h1>Учимся говорить<br /><em>через игру</em></h1>
          <p>Сегодня тебя ждут короткие весёлые задания. Начнём с улыбки?</p>
          <button className="primary-button" onClick={() => onOpen("motor")}><Play size={18} fill="currentColor" /> Начать занятие</button>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="mascot">
            <Image src="/illustrations/mascot-parrot-headphones.png" alt="" width={599} height={900} priority />
          </div>
          <div className="hero-badge"><Trophy size={22} /><span><b>{dashboard?.today_sessions || 0} заданий</b><small>выполнено сегодня</small></span></div>
        </div>
      </section>

      <section>
        <div className="section-heading"><div><span className="kicker">МОЙ ПЛАН</span><h2>Куда отправимся сегодня?</h2></div><button className="text-button" onClick={() => onOpen("games")}>Все занятия <ChevronRight size={17} /></button></div>
        <div className="module-grid">
          {modules.map((module, index) => <ModuleCard key={module.id} module={{...module, progress: dashboard?.module_completion[module.id] || 0}} completed={dashboard?.module_completed[module.id] || 0} total={dashboard?.active_exercises[module.id] || 0} onClick={() => onOpen(module.id)} index={index + 1} />)}
        </div>
      </section>

      <section className="today-row">
        <div className="today-card">
          <div className="calendar-tile"><span>{month}</span><strong>{today.getDate()}</strong></div>
          <div><span className="kicker">СЕГОДНЯ</span><h3>Ты уже позанимался {dashboard?.today_minutes || 0} минут</h3><p>За неделю: {dashboard?.week_sessions || 0} занятий и {dashboard?.week_minutes || 0} минут практики.</p></div>
          <div className="goal-ring"><span>{Math.min(dashboard?.today_sessions || 0, 3)}/3</span></div>
        </div>
        <div className="privacy-card"><ShieldCheck size={26} /><div><strong>Безопасно для ребёнка</strong><span>Видео с камеры никуда не отправляется и не сохраняется</span></div></div>
      </section>
    </div>
  );
}

function ModuleCard({ module, onClick, index, completed, total }: { module: typeof modules[number]; onClick: () => void; index: number; completed?: number; total?: number }) {
  return (
    <button className={`module-card ${module.accent}`} onClick={onClick}>
      <div className="module-top"><span className="module-number">0{index}</span><span className="module-time">{module.time}</span></div>
      <div className="module-icon"><Image src={module.icon} alt="" width={62} height={62}/></div>
      <span className="module-eyebrow">{module.eyebrow}</span>
      <h3>{module.title}</h3>
      <p>{module.description}</p>
      <div className="module-progress"><span style={{ width: `${module.progress}%` }} /></div>
      <div className="module-bottom"><small>Пройдено {module.progress}%{total ? ` · ${Math.min(completed || 0, total)} из ${total}` : ""}</small><span className="round-arrow"><ChevronRight size={18} /></span></div>
    </button>
  );
}

const courseUnits = [
  { id: "intro", number: "ВВОДНЫЙ КУРС", title: "Я могу сообщить о важном", description: "Помощь, желания и основные потребности", color: "coral", targets: ["help", "desire", "need"] },
  { id: "food", number: "МОДУЛЬ 1", title: "Еда и продукты", description: "Просим еду, выбираем продукты и говорим о предпочтениях", color: "mint", targets: ["food", "request", "preference"] },
  { id: "home", number: "МОДУЛЬ 2", title: "Дом и семья", description: "Близкие люди, животные и предметы вокруг", color: "blue", targets: ["family", "observation", "animals"] },
  { id: "play", number: "МОДУЛЬ 3", title: "Игрушки и признаки", description: "Играем, выбираем и сравниваем предметы", color: "lavender", targets: ["toys", "qualities"] },
  { id: "actions", number: "МОДУЛЬ 4", title: "Действия и мой день", description: "Глаголы, короткие инструкции и распорядок", color: "coral", targets: ["actions", "commands", "routine"] },
  { id: "feelings", number: "МОДУЛЬ 5", title: "Чувства и состояние", description: "Учимся сообщать о самочувствии и эмоциях", color: "mint", targets: ["feelings"] },
  { id: "motor", number: "МОДУЛЬ 6", title: "Артикуляционная гимнастика", description: "Последовательная практика движений губ и языка", color: "blue", targets: ["smile", "tube", "open", "teeth", "cheeks", "sequence"] },
] as const;

function GamesScreen({ onOpen, onExercise, dashboard, exercises }: { onOpen: (screen: Screen) => void; onExercise: (exercise: Exercise) => void; dashboard: Dashboard | null; exercises: Exercise[] }) {
  return (
    <div className="page-enter stack-xl">
      <PageTitle eyebrow="ИГРОВАЯ КОМНАТА" title="Выбери приключение" subtitle="Каждая игра развивает отдельный навык. Занимайся понемногу, но регулярно." />
      <LearningPath exercises={exercises} completedIds={dashboard?.completed_exercise_ids || []} onExercise={onExercise} />
      <div className="section-heading"><div><span className="kicker">СВОБОДНАЯ ПРАКТИКА</span><h2>Тренировка по направлениям</h2></div></div>
      <div className="module-grid large">{modules.map((m, i) => <ModuleCard key={m.id} module={{...m, progress: dashboard?.module_completion[m.id] || 0}} completed={dashboard?.module_completed[m.id] || 0} total={dashboard?.active_exercises[m.id] || 0} index={i + 1} onClick={() => onOpen(m.id)} />)}</div>
      <ExerciseLibrary items={exercises} onExercise={onExercise} />
      <div className="tip-banner"><div className="tip-icon"><Sparkles/></div><div><strong>Подсказка для взрослых</strong><p>Одного занятия по 5–10 минут достаточно. Заканчивайте игру, пока ребёнку ещё интересно.</p></div></div>
    </div>
  );
}

function LearningPath({ exercises, completedIds, onExercise }: { exercises: Exercise[]; completedIds: number[]; onExercise: (exercise: Exercise) => void }) {
  const completed = new Set(completedIds);
  const lessonsFor = (targets: readonly string[]) => targets.map((target) => exercises.find((item) => item.target === target)).filter((item): item is Exercise => Boolean(item));
  return <section className="learning-path"><div className="path-heading"><div><span className="kicker">ПОШАГОВЫЙ КУРС</span><h2>Путь к самостоятельному общению</h2><p>Начните с жизненно важных фраз, затем двигайтесь по знакомым темам.</p></div><div className="path-total"><strong>{completedIds.length}</strong><span>уроков пройдено</span></div></div><div className="course-units">{courseUnits.map((unit, unitIndex) => {
    const lessons = unit.targets.map((target) => exercises.find((item) => item.target === target)).filter((item): item is Exercise => Boolean(item));
    const unitComplete = lessons.length > 0 && lessons.every((lesson) => completed.has(lesson.id));
    const unitUnlocked = unitIndex === 0 || courseUnits.slice(0, unitIndex).every((previousUnit) => {
      const previousLessons = lessonsFor(previousUnit.targets);
      return previousLessons.length > 0 && previousLessons.every((lesson) => completed.has(lesson.id));
    });
    return <article className={`course-unit ${unit.color} ${unitUnlocked ? "unlocked" : "locked"}`} key={unit.id}><div className="unit-summary"><span>{unit.number}</span><h3>{unit.title}</h3><p>{unit.description}</p><div className="unit-progress"><i style={{width:`${lessons.length ? Math.round(lessons.filter((lesson) => completed.has(lesson.id)).length / lessons.length * 100) : 0}%`}}/></div><small>{lessons.filter((lesson) => completed.has(lesson.id)).length} из {lessons.length} уроков</small></div><div className="lesson-steps">{lessons.map((lesson, index) => {
      const done = completed.has(lesson.id);
      const unlocked = unitUnlocked && (index === 0 || lessons.slice(0, index).every((previousLesson) => completed.has(previousLesson.id)));
      return <button key={lesson.id} disabled={!unlocked} className={`${done ? "done" : ""} ${unlocked ? "available" : ""}`} onClick={() => onExercise(lesson)}><span>{done ? <Check size={21}/> : unlocked ? index + 1 : <LockKeyhole size={18}/>}</span><div><strong>{lesson.title}</strong><small>{done ? "Урок пройден — можно повторить" : lesson.instruction}</small></div><ChevronRight size={18}/></button>;
    })}</div>{unitComplete && <div className="unit-complete"><Trophy size={18}/> Модуль завершён</div>}</article>;
  })}</div></section>;
}

function ExerciseLibrary({ items, onExercise }: { items: Exercise[]; onExercise: (exercise: Exercise) => void }) {
  const [filter, setFilter] = useState<"all" | ModuleName>("all");
  const filtered = filter === "all" ? items : items.filter((item) => item.module === filter);
  const labels = { motor: "Артикуляция", sensory: "Понимание", mixed: "Фразы" };
  return <section className="exercise-library"><div className="section-heading"><div><span className="kicker">БИБЛИОТЕКА</span><h2>Все задания</h2></div><div className="filter-tabs">{(["all","motor","sensory","mixed"] as const).map((value) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value === "all" ? "Все" : labels[value]}</button>)}</div></div><div className="exercise-grid">{filtered.map((exercise) => { const moduleInfo = modules.find((item) => item.id === exercise.module)!; return <button key={exercise.id} className={`exercise-card ${exercise.module}`} onClick={() => onExercise(exercise)}><span className="exercise-emoji"><Image src={moduleInfo.icon} alt="" width={48} height={48}/></span><div><small>{labels[exercise.module]} · уровень {exercise.difficulty}</small><strong>{exercise.title}</strong><p>{exercise.instruction}</p></div><ChevronRight size={18}/></button>; })}</div></section>;
}

function PageTitle({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return <div className="page-title"><span className="kicker">{eyebrow}</span><h1>{title}</h1><p>{subtitle}</p></div>;
}

function GameHeader({ title, subtitle, step, onBack }: { title: string; subtitle: string; step: string; onBack: () => void }) {
  return (
    <div className="game-header">
      <button className="back-button" onClick={onBack}><ArrowLeft size={20} /></button>
      <div><span>{subtitle}</span><h2>{title}</h2></div>
      <div className="step-pill">{step}</div>
    </div>
  );
}

const motorExercises = [
  { id: "smile", symbol: "◡", title: "Сделай широкую улыбку", text: "Улыбнись широко и удерживай движение." },
  { id: "tube", symbol: "○", title: "Сложи губы трубочкой", text: "Вытяни губы вперёд, будто хочешь задуть свечу." },
  { id: "open", symbol: "О", title: "Открой окошко", text: "Плавно открой рот и удерживай челюсть спокойно." },
  { id: "teeth", symbol: "▤", title: "Покажи заборчик", text: "Сомкни зубы и покажи их в спокойной улыбке." },
  { id: "cheeks", symbol: "◉", title: "Надуй воздушный шар", text: "Надуй обе щёки и удерживай воздух несколько секунд." },
  { id: "sequence", symbol: "◡ → ○", title: "Улыбка — трубочка", text: "Сначала широко улыбнись, затем сложи губы трубочкой." },
] as const;
type MotorExercise = typeof motorExercises[number]["id"];

function MotorGame({ exercises, initialExercise, cameraEnabled, onBack, onComplete }: { exercises: Exercise[]; initialExercise: Exercise | null; cameraEnabled: boolean; onBack: () => void; onComplete: (score: number, exerciseId: number) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const requestRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<{ detectForVideo: (video: HTMLVideoElement, now: number) => { faceLandmarks?: Array<Array<{ x: number; y: number }>> }; close: () => void } | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const lastTimestampRef = useRef(0);
  const processingRef = useRef(false);
  const consecutiveErrorsRef = useRef(0);
  const analysisStoppedRef = useRef(true);
  const [cameraState, setCameraState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const initialIndex = Math.max(0, motorExercises.findIndex((item) => item.id === initialExercise?.target));
  const [exerciseIndex, setExerciseIndex] = useState(initialIndex);
  const [accuracy, setAccuracy] = useState(0);
  const exerciseRef = useRef<MotorExercise>(motorExercises[initialIndex].id);
  const accuracyRef = useRef(0);
  const rewardedRef = useRef(false);
  const completed = accuracy >= 78;
  const exercise = motorExercises[exerciseIndex];

  const stopCamera = useCallback(() => {
    analysisStoppedRef.current = true;
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
    requestRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    landmarkerRef.current?.close();
    landmarkerRef.current = null;
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  function analyze() {
    const video = videoRef.current;
    const detector = landmarkerRef.current;
    const scheduleNext = () => { if (!analysisStoppedRef.current) requestRef.current = requestAnimationFrame(analyze); };
    if (!video || !detector || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight || processingRef.current || video.currentTime === lastVideoTimeRef.current) {
      scheduleNext();
      return;
    }
    processingRef.current = true;
    lastVideoTimeRef.current = video.currentTime;
    try {
      const originalInfo = console.info;
      const originalWarn = console.warn;
      const originalError = console.error;
      console.info = () => undefined;
      console.warn = () => undefined;
      console.error = () => undefined;
      let result;
      const timestamp = Math.max(performance.now(), lastTimestampRef.current + 1);
      lastTimestampRef.current = timestamp;
      try { result = detector.detectForVideo(video, timestamp); }
      finally { console.info = originalInfo; console.warn = originalWarn; console.error = originalError; }
      consecutiveErrorsRef.current = 0;
      const points = result.faceLandmarks?.[0];
      if (points) {
        const distance = (a: number, b: number) => Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y);
        const faceWidth = Math.max(distance(234, 454), 0.01);
        const mouthWidth = distance(61, 291) / faceWidth;
        const mouthOpen = distance(13, 14) / faceWidth;
        const scores: Record<MotorExercise, number> = {
          smile: (mouthWidth - 0.29) * 520 - mouthOpen * 80,
          tube: (0.34 - mouthWidth) * 420 + mouthOpen * 300,
          open: (mouthOpen - 0.035) * 980,
          teeth: (mouthWidth - 0.28) * 500 + (0.075 - mouthOpen) * 200,
          cheeks: (0.39 - mouthWidth) * 300 + (0.07 - mouthOpen) * 180 + 55,
          sequence: Math.max((mouthWidth - 0.29) * 500, (0.34 - mouthWidth) * 410 + mouthOpen * 280),
        };
        const raw = scores[exerciseRef.current];
        const next = Math.max(0, Math.min(100, Math.round(raw)));
        const smoothed = Math.round(accuracyRef.current * 0.76 + next * 0.24);
        accuracyRef.current = smoothed;
        setAccuracy(smoothed);
        if (smoothed >= 78 && !rewardedRef.current) {
          rewardedRef.current = true;
          const completedExerciseId = exercises.find((item) => item.target === exerciseRef.current)?.id;
          if (completedExerciseId) onComplete(smoothed, completedExerciseId);
        }
      }
    } catch {
      consecutiveErrorsRef.current += 1;
      if (consecutiveErrorsRef.current >= 2) {
        setCameraState("error");
        stopCamera();
      }
    } finally { processingRef.current = false; }
    scheduleNext();
  }

  const startCamera = async () => {
    if (!cameraEnabled) return;
    setCameraState("loading");
    setAccuracy(0);
    stopCamera();
    analysisStoppedRef.current = false;
    lastVideoTimeRef.current = -1;
    lastTimestampRef.current = 0;
    consecutiveErrorsRef.current = 0;
    try {
      const [{ FaceLandmarker, FilesetResolver }, stream] = await Promise.all([
        import("@mediapipe/tasks-vision"),
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 720, height: 540 }, audio: false }),
      ]);
      streamRef.current = stream;
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
      landmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: "/mediapipe/models/face_landmarker.task", delegate: "CPU" },
        runningMode: "VIDEO",
        numFaces: 1,
      });
      setCameraState("ready");
      requestRef.current = requestAnimationFrame(analyze);
    } catch {
      stopCamera();
      setCameraState("error");
    }
  };

  const changeExercise = () => {
    const nextIndex = (exerciseIndex + 1) % motorExercises.length;
    exerciseRef.current = motorExercises[nextIndex].id;
    accuracyRef.current = 0;
    setExerciseIndex(nextIndex);
    setAccuracy(0);
    rewardedRef.current = false;
  };

  return (
    <div className="page-enter game-page">
      <GameHeader title="Повтори движение" subtitle="Весёлая артикуляция" step={`${exerciseIndex + 1} из ${motorExercises.length}`} onBack={onBack} />
      <div className="game-layout">
        <div className="camera-panel">
          <video ref={videoRef} playsInline muted className={cameraState === "ready" ? "visible" : ""} />
          {cameraState !== "ready" && <div className="camera-placeholder"><div className="face-guide">☺</div><h3>{!cameraEnabled ? "Камера отключена в настройках" : cameraState === "loading" ? "Включаем волшебное зеркало…" : cameraState === "error" ? "Камеру не удалось запустить" : "Посмотри в волшебное зеркало"}</h3><p>{cameraEnabled ? "Анализ работает на устройстве. Видео не отправляется и не сохраняется." : "Включите камеру в настройках, чтобы использовать распознавание движения."}</p><button className="primary-button" onClick={startCamera} disabled={cameraState === "loading" || !cameraEnabled}><Camera size={19} /> {cameraState === "error" ? "Попробовать ещё раз" : "Включить камеру"}</button></div>}
          {cameraState === "ready" && <><div className="face-frame" /><div className="camera-label"><span className="live-dot" /> ИИ видит движение</div></>}
        </div>
        <div className="instruction-panel">
          <span className="kicker">ТВОЁ ЗАДАНИЕ</span>
          <div className={`mouth-demo ${exercise.id}`}>{exercise.symbol}</div>
          <h2>{exercise.title}</h2>
          <p>{exercise.text}</p>
          <div className="accuracy-block"><div><span>Точность движения</span><strong>{accuracy}%</strong></div><div className="accuracy-track"><span style={{ width: `${accuracy}%` }} /></div></div>
          {completed ? <div className="success-box"><Check size={20} /><div><strong>Получилось!</strong><span>Ты зажёг 3 новые звезды</span></div></div> : cameraState === "ready" && <div className="coach-note"><Sparkles size={18} /> {accuracy > 50 ? "Ещё чуть-чуть, держи движение!" : "Смотри на пример и повторяй"}</div>}
          <button className="secondary-button wide" onClick={changeExercise}>{completed ? "Следующее движение" : "Другое движение"}<ChevronRight size={18} /></button>
        </div>
      </div>
    </div>
  );
}

const sensoryItems = [
  { word: "Мяч", image: "/illustrations/ball.png", hint: "Он круглый, с ним играют" },
  { word: "Кот", image: "/illustrations/cat.png", hint: "Он пушистый и говорит мяу" },
  { word: "Яблоко", image: "/illustrations/apple.png", hint: "Красный сладкий фрукт" },
];

let activeAudio: HTMLAudioElement | null = null;
function speechAsset(text: string) {
  const fixed: Record<string, string> = {
    "Мяч": "word-ball", "Кот": "word-cat", "Яблоко": "word-apple",
    "Верно! Отличная работа.": "feedback-correct",
    "Попробуй ещё. Это мяч.": "feedback-retry-ball",
    "Попробуй ещё. Это кот.": "feedback-retry-cat",
    "Попробуй ещё. Это яблоко.": "feedback-retry-apple",
  };
  if (fixed[text]) return fixed[text];
  const subjects = ["Я", "Мама", "Папа"];
  const verbs = ["хочу", "вижу", "люблю"];
  const objects = ["сок", "мяч", "яблоко"];
  const parts = text.split(" ");
  if (parts.length === 3) {
    const indexes = [subjects.indexOf(parts[0]), verbs.indexOf(parts[1]), objects.indexOf(parts[2])];
    if (indexes.every((index) => index >= 0)) return `phrase-${indexes.join("-")}`;
  }
  return null;
}
function speak(text: string, rate = 0.78, enabled = true) {
  if (!enabled || activeAudio) return;
  const asset = speechAsset(text);
  if (!asset) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ru-RU";
    utterance.rate = Math.max(0.65, Math.min(1, rate));
    utterance.volume = 0.78;
    window.speechSynthesis.speak(utterance);
    return;
  }
  const audio = new Audio(`/audio/${asset}.mp3`);
  audio.volume = 0.82;
  audio.playbackRate = Math.max(0.65, Math.min(1.15, rate / 0.78));
  audio.onended = () => { activeAudio = null; };
  audio.onerror = () => { activeAudio = null; };
  activeAudio = audio;
  audio.play().catch(() => { activeAudio = null; });
}

function SensoryGame({ exercise, soundEnabled, onBack, onComplete }: { exercise?: Exercise; soundEnabled: boolean; onBack: () => void; onComplete: (score: number, exerciseId: number) => void }) {
  const [targetIndex, setTargetIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [round, setRound] = useState(1);
  const correct = picked === targetIndex;
  const choose = (index: number) => {
    if (picked !== null) return;
    setPicked(index);
    if (index === targetIndex) { setScore((v) => v + 1); speak("Верно! Отличная работа.", 0.9, soundEnabled); }
    else speak(`Попробуй ещё. Это ${sensoryItems[index].word.toLowerCase()}.`, 0.75, soundEnabled);
  };
  const next = () => { if (round === 5) { if (exercise) onComplete(score * 20, exercise.id); setRound(1); setScore(0); } else setRound((v) => v + 1); setTargetIndex((targetIndex + 1) % sensoryItems.length); setPicked(null); };
  return (
    <div className="page-enter game-page">
      <GameHeader title="Слушай и находи" subtitle="Понимаем слова" step={`${round} из 5`} onBack={onBack} />
      <div className="listen-card">
        <div className="sound-zone"><button className="sound-button" disabled={!soundEnabled} onClick={() => speak(sensoryItems[targetIndex].word, 0.78, soundEnabled)}><Volume2 size={34} fill="currentColor" /></button><div><span className="kicker">ПОСЛУШАЙ СЛОВО</span><h2>{soundEnabled ? "Нажми и послушай" : "Звук отключён в настройках"}</h2><div className="wave"><i /><i /><i /><i /><i /><i /><i /></div></div><button className="replay" disabled={!soundEnabled} onClick={() => speak(sensoryItems[targetIndex].word, 0.55, soundEnabled)}><RotateCcw size={17} /> Медленнее</button></div>
        <h3 className="choose-title">А теперь выбери картинку</h3>
        <div className="picture-options">
          {sensoryItems.map((item, index) => <button key={item.word} onClick={() => choose(index)} className={`${picked === index ? (index === targetIndex ? "correct" : "wrong") : ""} ${picked !== null && index === targetIndex ? "answer" : ""}`}><span><Image src={item.image} alt={item.word} width={112} height={112}/></span><strong>{item.word}</strong>{picked !== null && index === targetIndex && <i><Check size={16} /></i>}</button>)}
        </div>
        {picked !== null && <div className={`answer-panel ${correct ? "good" : "try"}`}><div className="answer-emoji">{correct ? <Star fill="currentColor"/> : <Sparkles/>}</div><div><strong>{correct ? "Верно! Ты услышал слово" : "Ничего, учимся вместе"}</strong><span>{correct ? sensoryItems[targetIndex].hint : `Правильный ответ — ${sensoryItems[targetIndex].word}`}</span></div><button className="primary-button" onClick={next}>{round === 5 ? "Завершить" : "Дальше"}<ChevronRight size={17} /></button></div>}
        <div className="score-dots">{[1,2,3,4,5].map((value) => <span key={value} className={value <= score ? "filled" : ""} />)}</div>
      </div>
    </div>
  );
}

const aacCategories = [
  { id: "favorites", label: "Избранное" }, { id: "help", label: "Помощь" },
  { id: "wants", label: "Желания" }, { id: "needs", label: "Потребности" },
  { id: "people", label: "Люди" }, { id: "food", label: "Еда" },
  { id: "play", label: "Игры" }, { id: "actions", label: "Действия" },
] as const;

function PhraseGame({ childId, canManage, exercise, soundEnabled, onBack, onComplete }: { childId?: number; canManage: boolean; exercise?: Exercise; soundEnabled: boolean; onBack: () => void; onComplete: (score: number, phrase: string, exerciseId: number) => void }) {
  const [cards, setCards] = useState<AACCard[]>([]);
  const [selected, setSelected] = useState<AACCard[]>([]);
  const [category, setCategory] = useState<string>(() => exercise?.target === "help" ? "help" : exercise?.target === "need" ? "needs" : exercise?.target === "desire" ? "wants" : "favorites");
  const [history, setHistory] = useState<Array<{ id: number; phrase: string }>>([]);
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState({ label: "", speech: "", category: "needs" });
  const savedRef = useRef(false);
  const sentence = selected.map((item) => item.speech).join(" ").replace(/\s+/g, " ").trim();
  const loadBoard = useCallback(() => {
    if (!childId) return;
    api<AACCard[]>(`/api/aac/cards/${childId}`).then(setCards).catch(() => setCards([]));
    api<Array<{ id: number; phrase: string }>>(`/api/aac/history/${childId}`).then(setHistory).catch(() => setHistory([]));
  }, [childId]);
  useEffect(loadBoard, [loadBoard]);
  const visibleCards = category === "favorites" ? cards.filter((card) => card.favorite || card.is_core) : cards.filter((card) => card.category === category);
  const addCard = (card: AACCard) => { savedRef.current = false; setSelected((items) => card.is_core ? [card] : [...items, card].slice(-6)); };
  const toggleFavorite = async (card: AACCard) => {
    if (!childId) return;
    await api(`/api/aac/cards/${card.id}/favorite?child_id=${childId}`, { method: "PATCH", body: JSON.stringify({ favorite: !card.favorite }) });
    setCards((items) => items.map((item) => item.id === card.id ? { ...item, favorite: !item.favorite } : item));
  };
  const sayPhrase = async () => {
    if (!sentence || !childId) return;
    speak(sentence, 0.72, soundEnabled);
    const saved = await api<{ id: number; phrase: string }>("/api/aac/history", { method: "POST", body: JSON.stringify({ child_id: childId, phrase: sentence, card_ids: selected.map((item) => item.id) }) }).catch(() => null);
    if (saved) setHistory((items) => [saved, ...items.filter((item) => item.phrase !== saved.phrase)].slice(0, 12));
    if (!savedRef.current && exercise) {
      savedRef.current = true;
      const score = selected.length >= 2 ? 100 : 80;
      onComplete(score, sentence, exercise.id);
    }
  };
  const createCustom = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!childId) return;
    const card = await api<AACCard>("/api/aac/cards", { method: "POST", body: JSON.stringify({ child_id: childId, ...custom, image: "/soyle-icon.png" }) }).catch(() => null);
    if (card) { setCards((items) => [...items, card]); setCustom({ label: "", speech: "", category: "needs" }); setCustomOpen(false); setCategory(card.category); }
  };
  const replayHistory = (phrase: string) => {
    speak(phrase, 0.72, soundEnabled);
  };
  return <div className="page-enter game-page aac-page">
    <GameHeader title={exercise?.title || "Доска общения"} subtitle="AAC — говорю с помощью карточек" step={`${selected.length} карточек`} onBack={onBack}/>
    <div className="aac-goal"><div><span className="kicker">ЦЕЛЬ УРОКА</span><strong>{exercise?.instruction || "Собери сообщение из карточек и озвучь его"}</strong></div><ShieldCheck size={22}/><p>Можно использовать одну карточку или собрать целую фразу. Любая понятная просьба — успешная коммуникация.</p></div>
    <div className="aac-workspace">
      <section className="aac-board"><div className="aac-toolbar"><div className="aac-tabs">{aacCategories.map((item) => <button key={item.id} className={category === item.id ? "active" : ""} onClick={() => setCategory(item.id)}>{item.label}</button>)}</div>{canManage && <button className="small-button" onClick={() => setCustomOpen((value) => !value)}>+ Своя карточка</button>}</div>
        {customOpen && <form className="aac-custom-form" onSubmit={createCustom}><input value={custom.label} onChange={(e) => setCustom({...custom,label:e.target.value})} placeholder="Короткая подпись" required/><input value={custom.speech} onChange={(e) => setCustom({...custom,speech:e.target.value})} placeholder="Что должна сказать карточка" required/><select value={custom.category} onChange={(e) => setCustom({...custom,category:e.target.value})}>{aacCategories.filter((item) => item.id !== "favorites").map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><button className="primary-button">Добавить</button></form>}
        <div className="aac-card-grid">{visibleCards.map((card) => <div className={`aac-card ${card.is_core ? "core" : ""}`} key={card.id}><button className="aac-card-main" onClick={() => addCard(card)}><span><Image src={card.image} alt="" width={76} height={76}/></span><strong>{card.label}</strong><small>{card.speech}</small></button><button className={`aac-favorite ${card.favorite ? "active" : ""}`} onClick={() => toggleFavorite(card)} aria-label="Добавить в избранное"><Star size={16} fill={card.favorite ? "currentColor" : "none"}/></button></div>)}</div>
        {!visibleCards.length && <div className="aac-empty">В этой категории пока нет карточек. Родитель может добавить свою.</div>}
      </section>
      <aside className="aac-composer"><span className="kicker">МОЁ СООБЩЕНИЕ</span><div className={`aac-sentence ${selected.length ? "filled" : ""}`}>{selected.length ? selected.map((card, index) => <button key={`${card.id}-${index}`} onClick={() => { savedRef.current = false; setSelected((items) => items.filter((_, itemIndex) => itemIndex !== index)); }}><Image src={card.image} alt="" width={42} height={42}/><span>{card.label}</span><X size={13}/></button>) : <p>Нажимай на карточки слева — они появятся здесь</p>}</div><div className="aac-phrase-text">{sentence || "Твоя фраза появится здесь"}</div><button className="speak-button" disabled={!selected.length} onClick={sayPhrase}><Volume2 size={22}/>{soundEnabled ? "Сказать вслух" : "Сохранить сообщение"}</button><button className="clear-button" onClick={() => { setSelected([]); savedRef.current = false; }}>Очистить</button>{history.length > 0 && <div className="aac-history"><span className="kicker">НЕДАВНИЕ ФРАЗЫ</span>{history.slice(0,4).map((item) => <button key={item.id} onClick={() => replayHistory(item.phrase)}><RotateCcw size={14}/>{item.phrase}</button>)}</div>}</aside>
    </div>
  </div>;
}

function ProgressScreen({ childId, dashboard }: { childId?: number; dashboard: Dashboard | null }) {
  const [data, setData] = useState<{ child?: Child; overall: number; total_sessions: number; skills: Array<{ label: string; value: number; module: ModuleName }> } | null>(null);
  useEffect(() => { if (childId) api<typeof data>(`/api/progress/${childId}`).then(setData).catch(() => undefined); }, [childId]);
  const colors: Record<ModuleName, string> = { motor: "coral", sensory: "blue", mixed: "mint" };
  const skills = data?.skills.map((skill) => ({ ...skill, color: colors[skill.module] })) || [{ label: "Артикуляция", value: 0, color: "coral" }, { label: "Понимание речи", value: 0, color: "blue" }, { label: "Построение фраз", value: 0, color: "mint" }];
  const chartPoints = (module: ModuleName) => (dashboard?.daily || []).map((point, index) => point[module] === null ? null : `${index * (700 / 6)},${210 - Number(point[module]) * 1.8}`).filter(Boolean).join(" ");
  const delta = dashboard?.progress_delta || 0;
  const weakest = skills.reduce((current, item) => item.value < current.value ? item : current, skills[0]);
  return (
    <div className="page-enter stack-xl">
      <PageTitle eyebrow="МАЛЕНЬКИЕ ШАГИ — БОЛЬШОЙ РЕЗУЛЬТАТ" title={`Прогресс ${data?.child?.name || "ребёнка"}`} subtitle="Данные обновляются после каждого завершённого занятия." />
      <div className="stats-row"><StatCard icon={<TrendingUp/>} value={`${dashboard?.overall ?? data?.overall ?? 0}%`} label="общий прогресс" /><StatCard icon={<Timer/>} value={String(dashboard?.total_minutes || 0)} label="минут занятий" /><StatCard icon={<Star/>} value={String(dashboard?.stars || 0)} label="звезды собрано" /><StatCard icon={<Target/>} value={String(dashboard?.total_sessions ?? data?.total_sessions ?? 0)} label="занятий пройдено" /></div>
      <div className="progress-grid">
        <section className="chart-card"><div className="card-heading"><div><span className="kicker">ДИНАМИКА</span><h3>Результаты за 7 дней</h3></div><span className={delta >= 0 ? "positive" : "negative"}>{delta > 0 ? "+" : ""}{delta}%</span></div><div className="chart-area"><div className="chart-lines"><i/><i/><i/><i/></div>{dashboard?.daily.some((point) => point.motor !== null || point.sensory !== null || point.mixed !== null) ? <svg viewBox="0 0 700 230" preserveAspectRatio="none" aria-label="График фактических результатов"><polyline points={chartPoints("motor")} className="line coral-line"/><polyline points={chartPoints("sensory")} className="line blue-line"/><polyline points={chartPoints("mixed")} className="line mint-line"/></svg> : <div className="chart-empty">Завершите занятие — здесь появится динамика</div>}<div className="chart-labels">{dashboard?.daily.map((point) => <span key={point.date}>{point.label}</span>)}</div></div><div className="legend"><span><i className="coral-dot"/>Артикуляция</span><span><i className="blue-dot"/>Понимание</span><span><i className="mint-dot"/>Фразы</span></div></section>
        <section className="skills-card"><span className="kicker">ТЕКУЩИЙ УРОВЕНЬ</span><h3>Развитие навыков</h3>{skills.map((skill) => <div className="skill" key={skill.label}><div><span>{skill.label}</span><strong>{skill.value}%</strong></div><div className="skill-track"><i className={skill.color} style={{ width: `${skill.value}%` }}/></div></div>)}<div className="specialist-note"><Sparkles size={19}/><p><strong>Фокус недели:</strong> {dashboard?.total_sessions ? `навык «${weakest.label.toLowerCase()}» сейчас имеет самый низкий средний результат — ${weakest.value}%.` : "завершите первое занятие, чтобы определить направление работы."}</p></div></section>
      </div>
      <section className="achievements"><div className="section-heading"><div><span className="kicker">ДОСТИЖЕНИЯ</span><h2>Значки за реальные результаты</h2></div></div><div className="badges"><Badge icon={<Star/>} title="Первая пятёрка" text="5 занятий" unlocked={dashboard?.achievements.first_five}/><Badge image="/illustrations/module-listening.png" title="Чуткое ушко" text="5 сенсорных занятий" unlocked={dashboard?.achievements.good_listener}/><Badge image="/illustrations/module-phrases.png" title="Мастер фраз" text="5 собранных фраз" unlocked={dashboard?.achievements.phrase_master}/><Badge icon={<Trophy/>} title="Неделя силы" text="7 дней подряд" unlocked={dashboard?.achievements.week_streak}/></div></section>
    </div>
  );
}

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) { return <div className="stat-card"><span>{icon}</span><div><strong>{value}</strong><small>{label}</small></div></div>; }
function Badge({ icon, image, title, text, unlocked = false }: { icon?: React.ReactNode; image?: string; title: string; text: string; unlocked?: boolean }) { return <div className={`badge-card ${unlocked ? "unlocked" : "locked"}`}><span>{unlocked ? (image ? <Image src={image} alt="" width={42} height={42}/> : icon) : <LockKeyhole/>}</span><div><strong>{title}</strong><small>{unlocked ? "Получено" : text}</small></div></div>; }

function ParentScreen({ child, dashboard }: { child?: Child; dashboard: Dashboard | null }) {
  const [recommendation, setRecommendation] = useState<{ summary: string; plan: string[] } | null>(null);
  const [student, setStudent] = useState<{ username: string } | null>(null);
  const [studentForm, setStudentForm] = useState({ username: "", pin: "" });
  const [accountMessage, setAccountMessage] = useState("");
  useEffect(() => {
    if (!child?.id) return;
    api<{ summary: string; plan: string[] }>(`/api/ai/recommendations/${child.id}`).then(setRecommendation).catch(() => undefined);
    api<{ username: string } | null>(`/api/children/${child.id}/student-account`).then((value) => { setStudent(value); if (value) setStudentForm((current) => ({ ...current, username: value.username })); }).catch(() => undefined);
  }, [child?.id]);
  const saveStudent = async (event: React.FormEvent) => {
    event.preventDefault(); setAccountMessage("");
    if (!child) return;
    try {
      const result = await api<{ username: string }>(`/api/children/${child.id}/student-account`, { method: "POST", body: JSON.stringify(studentForm) });
      setStudent(result); setStudentForm((current) => ({ ...current, pin: "" })); setAccountMessage("Логин и PIN сохранены");
    } catch (cause) { setAccountMessage(cause instanceof Error ? cause.message : "Не удалось сохранить"); }
  };
  const age = child ? (() => { const born = new Date(child.birth_date); const now = new Date(); let years = now.getFullYear() - born.getFullYear(); if (now.getMonth() < born.getMonth() || (now.getMonth() === born.getMonth() && now.getDate() < born.getDate())) years -= 1; return Math.max(0, years); })() : 0;
  const sessionLabels = { motor: ["/illustrations/module-articulation-fox.png", "Весёлая артикуляция"], sensory: ["/illustrations/module-listening.png", "Слушай и находи"], mixed: ["/illustrations/module-phrases.png", "Собери фразу"] } as const;
  return <div className="page-enter stack-xl">
    <PageTitle eyebrow="КАБИНЕТ РОДИТЕЛЯ" title={`Вместе поддерживаем ${child?.name || "ребёнка"}`} subtitle="Реальные результаты занятий, персональные рекомендации и управление доступом ребёнка." />
    <div className="parent-hero"><div className="parent-profile"><div className="avatar large">{child?.name[0] || "Р"}</div><div><span>ПРОФИЛЬ РЕБЁНКА</span><h2>{child?.name || "Ребёнок"}, {age} лет</h2><p>{dashboard?.total_sessions || 0} занятий · {dashboard?.total_minutes || 0} минут</p></div></div><div className="overall"><div className="large-ring"><strong>{dashboard?.overall || 0}%</strong><span>общий прогресс</span></div><div><b>{dashboard?.streak_days || 0} дн.</b><span>текущая серия</span></div></div></div>
    <div className="parent-grid">
      <section className="recommend-card"><div className="recommend-icon"><Sparkles /></div><span className="kicker">РЕКОМЕНДАЦИЯ НА НЕДЕЛЮ</span><h2>План сформирован по результатам занятий</h2><p>{recommendation?.summary || "Завершите первое занятие, чтобы получить рекомендацию."}</p><ul>{recommendation?.plan.map((item) => <li key={item}><Check size={16}/>{item}</li>)}</ul></section>
      <section className="sessions-card"><div className="card-heading"><div><span className="kicker">ПОСЛЕДНИЕ ЗАНЯТИЯ</span><h3>История активности</h3></div></div>{dashboard?.recent.length ? dashboard.recent.map((item) => <div className="session-row" key={item.id}><span><Image src={sessionLabels[item.module][0]} alt="" width={42} height={42}/></span><div><strong>{sessionLabels[item.module][1]}</strong><small>{new Date(item.created_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</small></div><b>{item.score}%</b></div>) : <p>Занятий пока нет.</p>}</section>
    </div>
    <section className="admin-card student-access"><div className="admin-card-head"><div><span className="kicker">ДОСТУП РЕБЁНКА</span><h3>{student ? "Изменить ученический вход" : "Создать вход для ученика"}</h3></div><span className="period-pill">Без электронной почты</span></div><p>Ребёнок входит отдельно по простому логину и цифровому PIN. Роли администратора и специалиста назначаются только в админ-панели.</p><form className="exercise-form" onSubmit={saveStudent}><input value={studentForm.username} onChange={(e) => setStudentForm({...studentForm, username:e.target.value})} placeholder="Логин ученика" pattern="[A-Za-z0-9_.-]+" minLength={3} required/><input value={studentForm.pin} onChange={(e) => setStudentForm({...studentForm, pin:e.target.value.replace(/\D/g, "")})} placeholder="Новый PIN (4–12 цифр)" inputMode="numeric" minLength={4} maxLength={12} required/><button className="primary-button">Сохранить доступ</button></form>{accountMessage && <div className="usage-note"><Check size={18}/><p>{accountMessage}</p></div>}</section>
    <div className="medical-note"><ShieldCheck size={25}/><div><strong>Söyle — помощник, а не врач</strong><p>Платформа не ставит диагноз и не заменяет занятия с логопедом или консультацию специалиста.</p></div></div>
  </div>;
}

function LegacyAdminScreen() {
  type StudentAccount = { id: number; username: string; child_name: string; parent_name: string; is_active: number | boolean };
  type UsageData = { requests: number; input_tokens: number; output_tokens: number; total_tokens: number; estimated_cost_usd: number; note: string; breakdown: Array<{ provider: string; model: string; feature: string; requests: number; input_tokens: number; output_tokens: number; cost: number }> };
  const [stats, setStats] = useState({ users: 0, children: 0, sessions: 0, exercises: 0 });
  const [users, setUsers] = useState<User[]>([]);
  const [students, setStudents] = useState<StudentAccount[]>([]);
  const [usage, setUsage] = useState<UsageData>({ requests: 0, input_tokens: 0, output_tokens: 0, total_tokens: 0, estimated_cost_usd: 0, note: "", breakdown: [] });
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [tab, setTab] = useState<"users" | "exercises" | "usage">("users");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ module: "motor", title: "", instruction: "", difficulty: 1, target: "custom", icon: "/illustrations/module-articulation-fox.png", is_active: true });
  const load = useCallback(() => { api<typeof stats>("/api/admin/stats").then(setStats); api<User[]>("/api/admin/users").then(setUsers); api<StudentAccount[]>("/api/admin/students").then(setStudents); api<UsageData>("/api/admin/usage").then(setUsage); api<Exercise[]>("/api/exercises").then(setExercises); }, []);
  useEffect(load, [load]);
  const changeRole = async (id: number, role: Role) => { await api(`/api/admin/users/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) }); load(); };
  const toggleUser = async (item: User) => { await api(`/api/admin/users/${item.id}/active`, { method: "PATCH", body: JSON.stringify({ is_active: !item.is_active }) }); load(); };
  const addExercise = async (event: React.FormEvent) => { event.preventDefault(); const payload = { ...form, icon: moduleImages[form.module as ModuleName] }; await api("/api/admin/exercises", { method: "POST", body: JSON.stringify(payload) }); setFormOpen(false); setForm({ module: "motor", title: "", instruction: "", difficulty: 1, target: "custom", icon: "/illustrations/module-articulation-fox.png", is_active: true }); load(); };
  const archiveExercise = async (id: number) => { await api(`/api/admin/exercises/${id}`, { method: "DELETE" }); load(); };
  return <div className="page-enter stack-xl"><PageTitle eyebrow="УПРАВЛЕНИЕ ПЛАТФОРМОЙ" title="Админ-панель" subtitle="Пользователи, роли, контент и ключевые показатели Söyle."/><div className="stats-row"><StatCard icon={<Users/>} value={String(stats.users)} label="пользователей"/><StatCard icon={<UserRound/>} value={String(stats.children)} label="профилей детей"/><StatCard icon={<Target/>} value={String(stats.sessions)} label="занятий пройдено"/><StatCard icon={<Gamepad2/>} value={String(stats.exercises)} label="активных заданий"/></div><div className="admin-tabs"><button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}><Users size={17}/>Пользователи</button><button className={tab === "exercises" ? "active" : ""} onClick={() => setTab("exercises")}><Gamepad2 size={17}/>Задания</button></div>{tab === "users" ? <section className="admin-card"><div className="admin-card-head"><div><span className="kicker">ДОСТУП И РОЛИ</span><h3>Пользователи</h3></div></div><div className="data-table"><div className="table-row header"><span>Пользователь</span><span>Роль</span><span>Статус</span><span>Действие</span></div>{users.map((item) => <div className="table-row" key={item.id}><span><b>{item.full_name}</b><small>{item.email}</small></span><span><select value={item.role} onChange={(e) => changeRole(item.id, e.target.value as Role)}><option value="parent">Родитель</option><option value="specialist">Специалист</option><option value="admin">Администратор</option></select></span><span><i className={`status ${item.is_active ? "active" : "blocked"}`}>{item.is_active ? "Активен" : "Отключён"}</i></span><span><button className="small-button" onClick={() => toggleUser(item)}>{item.is_active ? "Отключить" : "Включить"}</button></span></div>)}</div></section> : <section className="admin-card"><div className="admin-card-head"><div><span className="kicker">КОНТЕНТ</span><h3>Библиотека заданий</h3></div><button className="primary-button" onClick={() => setFormOpen(!formOpen)}>+ Добавить</button></div>{formOpen && <form className="exercise-form" onSubmit={addExercise}><select value={form.module} onChange={(e) => setForm({...form,module:e.target.value})}><option value="motor">Моторный</option><option value="sensory">Сенсорный</option><option value="mixed">Смешанный</option></select><input placeholder="Название" value={form.title} onChange={(e) => setForm({...form,title:e.target.value})} required/><input placeholder="Инструкция" value={form.instruction} onChange={(e) => setForm({...form,instruction:e.target.value})} required/><button className="primary-button">Сохранить</button></form>}<div className="admin-exercises">{exercises.map((item) => <div key={item.id}><span><Image src={moduleImages[item.module]} alt="" width={42} height={42}/></span><div><strong>{item.title}</strong><small>{item.module} · уровень {item.difficulty}</small></div><button onClick={() => archiveExercise(item.id)}>В архив</button></div>)}</div></section>}</div>;
}

function AdminScreen() {
  type StudentAccount = { id: number; username: string; child_name: string; parent_name: string; is_active: number | boolean };
  type UsageData = { requests: number; input_tokens: number; output_tokens: number; total_tokens: number; estimated_cost_usd: number; note: string; breakdown: Array<{ provider: string; model: string; feature: string; requests: number; input_tokens: number; output_tokens: number; cost: number }> };
  const [stats, setStats] = useState({ users: 0, children: 0, sessions: 0, exercises: 0 });
  const [users, setUsers] = useState<User[]>([]);
  const [students, setStudents] = useState<StudentAccount[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [usage, setUsage] = useState<UsageData>({ requests: 0, input_tokens: 0, output_tokens: 0, total_tokens: 0, estimated_cost_usd: 0, note: "", breakdown: [] });
  const [tab, setTab] = useState<"users" | "exercises" | "usage">("users");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ module: "motor", title: "", instruction: "", difficulty: 1, target: "custom", icon: "/illustrations/module-articulation-fox.png", is_active: true });
  const load = useCallback(() => {
    api<typeof stats>("/api/admin/stats").then(setStats);
    api<User[]>("/api/admin/users").then(setUsers);
    api<StudentAccount[]>("/api/admin/students").then(setStudents);
    api<Exercise[]>("/api/exercises").then(setExercises);
    api<UsageData>("/api/admin/usage").then(setUsage);
  }, []);
  useEffect(load, [load]);
  const changeRole = async (id: number, role: Exclude<Role, "student">) => { await api(`/api/admin/users/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) }); load(); };
  const toggleUser = async (item: User) => { await api(`/api/admin/users/${item.id}/active`, { method: "PATCH", body: JSON.stringify({ is_active: !item.is_active }) }); load(); };
  const addExercise = async (event: React.FormEvent) => { event.preventDefault(); const payload = { ...form, icon: moduleImages[form.module as ModuleName] }; await api("/api/admin/exercises", { method: "POST", body: JSON.stringify(payload) }); setFormOpen(false); setForm({ module: "motor", title: "", instruction: "", difficulty: 1, target: "custom", icon: "/illustrations/module-articulation-fox.png", is_active: true }); load(); };
  const archiveExercise = async (id: number) => { await api(`/api/admin/exercises/${id}`, { method: "DELETE" }); load(); };
  return <div className="page-enter stack-xl">
    <PageTitle eyebrow="УПРАВЛЕНИЕ ПЛАТФОРМОЙ" title="Админ-панель" subtitle="Пользователи, контент и прозрачный учёт использования ИИ."/>
    <div className="stats-row"><StatCard icon={<Users/>} value={String(stats.users)} label="аккаунтов"/><StatCard icon={<UserRound/>} value={String(stats.children)} label="профилей детей"/><StatCard icon={<Target/>} value={String(stats.sessions)} label="занятий пройдено"/><StatCard icon={<Gamepad2/>} value={String(stats.exercises)} label="активных заданий"/></div>
    <div className="admin-tabs"><button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}><Users size={17}/>Пользователи</button><button className={tab === "exercises" ? "active" : ""} onClick={() => setTab("exercises")}><Gamepad2 size={17}/>Задания</button><button className={tab === "usage" ? "active" : ""} onClick={() => setTab("usage")}><BarChart3 size={17}/>Расходы ИИ</button></div>
    {tab === "users" && <section className="admin-card"><div className="admin-card-head"><div><span className="kicker">ДОСТУП И РОЛИ</span><h3>Взрослые аккаунты</h3></div></div><div className="data-table"><div className="table-row header"><span>Пользователь</span><span>Роль</span><span>Статус</span><span>Действие</span></div>{users.map((item) => <div className="table-row" key={item.id}><span><b>{item.full_name}</b><small>{item.email}</small></span><span><select value={item.role} onChange={(e) => changeRole(item.id, e.target.value as Exclude<Role,"student">)}><option value="parent">Родитель</option><option value="specialist">Специалист</option><option value="admin">Администратор</option></select></span><span><i className={`status ${item.is_active ? "active" : "blocked"}`}>{item.is_active ? "Активен" : "Отключён"}</i></span><span><button className="small-button" onClick={() => toggleUser(item)}>{item.is_active ? "Отключить" : "Включить"}</button></span></div>)}</div><div className="student-accounts"><span className="kicker">УЧЕНИЧЕСКИЕ АККАУНТЫ</span>{students.map((item) => <div key={item.id}><span className="student-icon"><Backpack/></span><div><strong>{item.child_name}</strong><small>Логин: {item.username} · родитель: {item.parent_name}</small></div><i className="status active">Ученик</i></div>)}</div></section>}
    {tab === "exercises" && <section className="admin-card"><div className="admin-card-head"><div><span className="kicker">КОНТЕНТ</span><h3>Библиотека заданий</h3></div><button className="primary-button" onClick={() => setFormOpen(!formOpen)}>+ Добавить</button></div>{formOpen && <form className="exercise-form" onSubmit={addExercise}><select value={form.module} onChange={(e) => setForm({...form,module:e.target.value})}><option value="motor">Моторный</option><option value="sensory">Сенсорный</option><option value="mixed">Смешанный</option></select><input placeholder="Название" value={form.title} onChange={(e) => setForm({...form,title:e.target.value})} required/><input placeholder="Инструкция" value={form.instruction} onChange={(e) => setForm({...form,instruction:e.target.value})} required/><button className="primary-button">Сохранить</button></form>}<div className="admin-exercises">{exercises.map((item) => <div key={item.id}><span><Image src={moduleImages[item.module]} alt="" width={42} height={42}/></span><div><strong>{item.title}</strong><small>{item.module} · уровень {item.difficulty}</small></div><button onClick={() => archiveExercise(item.id)}>В архив</button></div>)}</div></section>}
    {tab === "usage" && <section className="usage-dashboard"><div className="usage-cards"><StatCard icon={<Bot/>} value={String(usage.requests)} label="AI-запросов"/><StatCard icon={<ArrowUp/>} value={usage.input_tokens.toLocaleString("ru-RU")} label="входных токенов"/><StatCard icon={<ArrowDown/>} value={usage.output_tokens.toLocaleString("ru-RU")} label="выходных токенов"/><StatCard icon={<CreditCard/>} value={`$${usage.estimated_cost_usd.toFixed(4)}`} label="расчётная стоимость"/></div><div className="admin-card"><div className="admin-card-head"><div><span className="kicker">РАЗБИВКА ПО ФУНКЦИЯМ</span><h3>На что расходуются ресурсы</h3></div><span className="period-pill">Последние 30 дней</span></div><div className="usage-table"><div className="usage-row header"><span>Функция и модель</span><span>Запросы</span><span>Токены</span><span>Стоимость</span></div>{usage.breakdown.map((item) => <div className="usage-row" key={`${item.model}-${item.feature}`}><span><b>{item.feature}</b><small>{item.provider} · {item.model}</small></span><span>{item.requests}</span><span>{(item.input_tokens + item.output_tokens).toLocaleString("ru-RU")}</span><span>${Number(item.cost || 0).toFixed(4)}</span></div>)}</div><div className="usage-note"><Sparkles size={19}/><p>{usage.note}</p></div></div></section>}
  </div>;
}

function SpecialistScreen() {
  const [children, setChildren] = useState<Child[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [recommendation, setRecommendation] = useState<{ summary: string; confidence: number; plan: string[] } | null>(null);
  useEffect(() => { api<Child[]>("/api/children").then((items) => { setChildren(items); if (items[0]) setSelected(items[0].id); }); }, []);
  useEffect(() => { if (selected) api<typeof recommendation>(`/api/ai/recommendations/${selected}`).then(setRecommendation); }, [selected]);
  return <div className="page-enter stack-xl"><PageTitle eyebrow="КАБИНЕТ СПЕЦИАЛИСТА" title="Наблюдение и рекомендации" subtitle="Выберите ребёнка, чтобы увидеть динамику и персональный план."/><div className="specialist-layout"><section className="children-list"><span className="kicker">МОИ ПОДОПЕЧНЫЕ</span>{children.map((child) => <button key={child.id} className={selected === child.id ? "active" : ""} onClick={() => setSelected(child.id)}><div className="avatar" style={{background:child.avatar_color}}>{child.name[0]}</div><div><strong>{child.name}</strong><small>{child.parent_name || "Родитель"}</small></div><ChevronRight size={17}/></button>)}</section><section className="ai-panel"><div className="ai-heading"><div className="recommend-icon"><Sparkles/></div><div><span className="kicker">AI-АНАЛИЗ</span><h2>Рекомендация на неделю</h2></div><span className="confidence">{recommendation?.confidence || 0}% уверенности</span></div><p>{recommendation?.summary || "Анализируем историю занятий…"}</p><div className="plan-list">{recommendation?.plan.map((item, index) => <div key={item}><span>{index + 1}</span><strong>{item}</strong></div>)}</div><div className="medical-note"><ShieldCheck size={21}/><p>Рекомендация помогает специалисту принимать решение, но не заменяет профессиональную оценку.</p></div></section></div></div>;
}

function SettingsScreen({ settings, onChange, onLogout }: { settings: AppSettings; onChange: (settings: AppSettings) => void; onLogout: () => void }) {
  const themes = [{id:"peach",name:"Персиковая",colors:["#f07d68","#4eab91","#f7f5ef"]},{id:"ocean",name:"Океан",colors:["#397fa8","#5fb7ad","#edf6f7"]},{id:"lavender",name:"Лаванда",colors:["#8b74c8","#d18ca6","#f5f1fa"]},{id:"contrast",name:"Контрастная",colors:["#315f55","#e18445","#fffdf5"]}];
  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => onChange({ ...settings, [key]: value });
  return <div className="page-enter settings-page"><PageTitle eyebrow="НАСТРОЙКИ" title="Комфортный режим" subtitle="Настройте занятия под потребности ребёнка. Изменения сохраняются в аккаунте."/><div className="settings-card"><div className="theme-setting"><span className="kicker">ЦВЕТОВАЯ ТЕМА</span><h3>Выберите оформление</h3><div className="theme-options">{themes.map((item) => <button key={item.id} className={settings.theme === item.id ? "active" : ""} onClick={() => update("theme", item.id as AppSettings["theme"])}><span>{item.colors.map((color) => <i key={color} style={{background:color}}/>)}</span><strong>{item.name}</strong>{settings.theme === item.id && <Check size={16}/>}</button>)}</div></div><SettingRow icon={<Camera/>} title="Камера для артикуляции" text="Обрабатывается локально, запись не сохраняется" value={settings.camera_enabled} onChange={(value) => update("camera_enabled", value)}/><SettingRow icon={<Volume2/>} title="Звуковые подсказки" text="Голос и мягкие сигналы успеха" value={settings.sound_enabled} onChange={(value) => update("sound_enabled", value)}/><SettingRow icon={<Sparkles/>} title="Спокойный режим" text="Меньше анимации и визуальных эффектов" value={settings.calm_mode} onChange={(value) => update("calm_mode", value)}/><div className="setting-row"><div className="setting-icon"><LockKeyhole/></div><div><strong>Данные и приватность</strong><span>Видео не сохраняется; результаты хранятся в профиле ребёнка</span></div><span className="status active">Защищено</span></div><div className="setting-row"><div className="setting-icon danger"><LogOut/></div><div><strong>Выйти из аккаунта</strong><span>На этом устройстве потребуется повторный вход</span></div><button className="small-button" onClick={onLogout}>Выйти</button></div></div></div>;
}

function SettingRow({ icon, title, text, value, onChange }: { icon: React.ReactNode; title: string; text: string; value: boolean; onChange: (v: boolean) => void }) {
  return <div className="setting-row"><div className="setting-icon">{icon}</div><div><strong>{title}</strong><span>{text}</span></div><button className={`toggle ${value ? "on" : ""}`} onClick={() => onChange(!value)} aria-label={title}><i/></button></div>;
}
