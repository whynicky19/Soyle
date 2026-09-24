export type Role = "admin" | "parent" | "specialist" | "student";

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
  module_sessions: Record<"motor" | "sensory" | "mixed", number>;
  active_exercises: Record<"motor" | "sensory" | "mixed", number>;
  progress_delta: number;
  daily: Array<{ date: string; label: string; motor: number | null; sensory: number | null; mixed: number | null }>;
  achievements: { first_five: boolean; good_listener: boolean; phrase_master: boolean; week_streak: boolean };
  recent: Array<{ id: number; module: "motor" | "sensory" | "mixed"; score: number; duration_seconds: number; created_at: string }>;
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
  is_active: number | boolean;
};

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
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new Error("Сервер Söyle недоступен. Запустите проект командой ./start.sh");
  }
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || "Не удалось выполнить запрос");
  return data as T;
}
