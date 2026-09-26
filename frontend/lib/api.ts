export type Role = "admin" | "parent" | "specialist" | "student";
export type SkillName = "articulation" | "vocabulary" | "speech_comprehension" | "word_repetition" | "phrase_building" | "communication";

export type SkillProgress = {
  skill: SkillName;
  label: string;
  value: number;
  recent_change: number | null;
  sessions: number;
  completed_exercises: number;
  total_exercises: number;
  recommended_practice: string;
};

export type User = {
  id: number;
  username: string;
  email?: string;
  full_name: string;
  role: Role;
  is_active: number | boolean;
  created_at: string;
  child_id?: number;
};

export type Dashboard = {
  child: Child;
  total_sessions: number;
  total_minutes: number;
  today_sessions: number;
  today_minutes: number;
  week_sessions: number;
  week_minutes: number;
  streak_days: number;
  stars: number;
  overall: number;
  module_progress: Record<"motor" | "sensory" | "mixed", number>;
  module_accuracy: Record<"motor" | "sensory" | "mixed", number>;
  module_completion: Record<"motor" | "sensory" | "mixed", number>;
  module_completed: Record<"motor" | "sensory" | "mixed", number>;
  completed_exercise_ids: number[];
  module_sessions: Record<"motor" | "sensory" | "mixed", number>;
  active_exercises: Record<"motor" | "sensory" | "mixed", number>;
  skill_progress: SkillProgress[];
  weakest_skill: SkillProgress | null;
  recommended_exercise: Exercise | null;
  progress_delta: number;
  daily: Array<{ date: string; label: string; motor: number | null; sensory: number | null; mixed: number | null }>;
  achievements: { first_five: boolean; good_listener: boolean; phrase_master: boolean; week_streak: boolean };
  recent: Array<{ id: number; module: "motor" | "sensory" | "mixed"; score: number; duration_seconds: number; created_at: string }>;
};

export type AppSettings = {
  camera_enabled: boolean;
  sound_enabled: boolean;
  calm_mode: boolean;
  theme: "peach" | "ocean" | "lavender" | "contrast";
};

export type Child = {
  id: number;
  parent_id: number;
  name: string;
  birth_date: string;
  primary_module: "motor" | "sensory" | "mixed";
  avatar_color: string;
  parent_name?: string;
};

export type Exercise = {
  id: number;
  module: "motor" | "sensory" | "mixed";
  title: string;
  instruction: string;
  difficulty: number;
  target: string;
  icon: string;
  skill: SkillName | null;
  is_active: number | boolean;
};

export type LearningSession = {
  id: number;
  child_id: number;
  status: "in_progress" | "completed";
  current_index: number;
  started_at: string;
  completed_at?: string | null;
  exercises: Exercise[];
  results?: Array<{ exercise_id: number; score: number; duration_seconds: number; created_at: string }>;
};

export type AACCard = {
  id: number;
  child_id: number | null;
  label: string;
  speech: string;
  category: "help" | "wants" | "needs" | "feelings" | "yes_no" | "people" | "food" | "play" | "places" | "actions";
  image: string;
  is_core: number | boolean;
  favorite: number | boolean;
};

export type NotificationItem = {
  id: number;
  child_id: number;
  title: string;
  message: string;
  metadata: { unit_id: string; unit_label: string; unit_title: string; practice: string };
  is_read: boolean;
  created_at: string;
};

export type NotificationsData = { unread: number; items: NotificationItem[] };

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8010";

export function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("soyle-token");
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem("soyle-token", token);
  else localStorage.removeItem("soyle-token");
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let response: Response;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);
  if (options.signal) options.signal.addEventListener("abort", () => controller.abort(), { once: true });
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers, signal: controller.signal });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw new Error("Сервер Söyle отвечает слишком долго. Попробуйте ещё раз через несколько секунд.");
    throw new Error("Сервер Söyle временно недоступен. Проверьте подключение и попробуйте ещё раз.");
  } finally {
    window.clearTimeout(timeout);
  }
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || "Не удалось выполнить запрос");
  return data as T;
}
