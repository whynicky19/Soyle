export type Role = "admin" | "parent" | "student" | "specialist";
export type SkillName = "articulation" | "vocabulary" | "speech_comprehension" | "word_repetition" | "phrase_building" | "communication";

export type SkillProgress = {
  skill: SkillName;
  label: string;
  value: number | null;
  average_game_score: number | null;
  measurement: "game_result" | "participation";
  recent_change: number | null;
  sessions: number;
  participations: number;
  completed_exercises: number;
  total_exercises: number;
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
  week_activity: Array<{ date: string; label: string; active: boolean; sessions: number; today: boolean }>;
  streak_days: number;
  stars: number;
  overall: number;
  module_progress: Record<"motor" | "sensory" | "mixed", number>;
  module_accuracy: Record<"motor" | "sensory" | "mixed", number | null>;
  module_completion: Record<"motor" | "sensory" | "mixed", number>;
  module_completed: Record<"motor" | "sensory" | "mixed", number>;
  completed_exercise_ids: number[];
  module_sessions: Record<"motor" | "sensory" | "mixed", number>;
  active_exercises: Record<"motor" | "sensory" | "mixed", number>;
  skill_progress: SkillProgress[];
  weakest_skill: SkillProgress | null;
  recommended_exercise: Exercise | null;
  recommended_exercises: Exercise[];
  progress_delta: number | null;
  daily: Array<{ date: string; label: string; motor: number | null; sensory: number | null; mixed: number | null }>;
  achievements: { first_five: boolean; good_listener: boolean; phrase_master: boolean; week_streak: boolean };
  recent: Array<{ id: number; module: "motor" | "sensory" | "mixed"; score: number; duration_seconds: number; attempts_count?: number | null; correct_answers?: number | null; prompts_used?: number; attempt_status?: "completed" | "participated" | "refused" | "break" | "technical_error"; created_at: string }>;
};

export type AppSettings = {
  camera_enabled: boolean;
  sound_enabled: boolean;
  calm_mode: boolean;
  theme: "peach" | "ocean" | "lavender" | "contrast";
  language: "ru" | "en" | "kk";
};

export type ChildConsent = {
  child_id: number;
  privacy_accepted: boolean;
  camera_processing: boolean;
  ai_processing: boolean;
  analytics_processing: boolean;
  specialist_sharing?: boolean;
  version: string;
  updated_at: string | null;
  consented_by_user_id?: number | null;
  privacy_accepted_at?: string | null;
  camera_processing_at?: string | null;
  ai_processing_at?: string | null;
  analytics_processing_at?: string | null;
};

export type AIPlan = {
  title: string;
  reason: string;
  parent_tip: string;
  estimated_minutes: 3 | 5 | 10;
  exercises: Exercise[];
  generated_by: "local_rules";
  model: string | null;
  needs_ai_consent: boolean;
  disclaimer: string;
  provider_error?: string;
  provider_message?: string;
};

export type AIAnswer = {
  answer: string;
  suggested_actions: string[];
  needs_professional_help: boolean;
  safety_note: string;
  generated_by: "local_rules";
  model: string | null;
  disclaimer: string;
  provider_error?: string;
  provider_message?: string;
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
  engine?: {
    version_id: number;
    version: number;
    mechanic: "auditory_choice" | "action_choice" | "tap_instruction" | "guided_aac";
    language: "ru";
    objective: string;
    response_mode: "single_tap" | "tap_sequence" | "aac_card_sequence";
    prompt_policy: Record<string, unknown>;
    completion_rule: Record<string, unknown>;
    content: {
      stimuli?: Array<{
        key: string;
        label: string;
        speech: string;
        hint?: string;
        media_ref?: string;
        exemplars?: string[];
        visual_token?: string;
      }>;
      exemplar_policy?: "matched_set";
    bank_key?: string;
    round_choices?: number[];
    default_rounds?: number;
    max_rounds?: number;
      difficulty_levels?: Array<{ level: 1 | 2 | 3; option_count: 2 | 3 | 4; rounds: number; max_attempts: number }>;
      scenarios?: Array<{
        key: string;
        instruction: string;
        speech: string;
        objects: Array<{ key: string; label: string; role: "movable" | "target"; media_ref: string }>;
        success: { object_key: string; target_key: string };
        result?: { media_ref?: string; relation: "give" | "in" | "on"; speech: string };
      }>;
      scenario_key?: string;
      title?: string;
      labels?: string[];
      instruction?: string;
      steps?: string[];
      criterion?: string;
      empty_hint?: string;
      incomplete_hint?: string;
      success_hint?: string;
      action_label?: string;
      completion?: { type: "contains_any"; accepted_labels: string[] };
      accepted_sequences?: string[][];
    };
    review_status: "approved";
    publication_status: "published";
    review_gate: {
      approved: boolean;
      demo_only: boolean;
      technical_status: string;
      methodology_status: string;
      accessibility_status: string;
      release_status: string;
    };
  };
  adaptive?: {
    plan_item_id: number;
    goal_id: number;
    goal_version: number;
    goal_title: string;
    exercise_version_id: number;
    difficulty_params: AdaptiveDifficultyParams;
    assignment_reason: AdaptiveAssignmentReason;
  } | null;
};

export type AdaptiveDifficultyParams = {
  difficulty_level: 1 | 2 | 3;
  option_count: 2 | 3 | 4 | null;
  round_count: number;
  instruction_step_count: 1;
  action_count: 1;
};

export type AdaptiveAssignmentReason = {
  codes: string[];
  messages: string[];
  evidence: {
    recorded_sessions: number;
    attempts: number;
    accuracy: number | null;
    weighted_accuracy: number | null;
    weighted_independence_rate: number | null;
    recency_weights: number[];
    independent_completions: number;
    prompts_used: number;
    refusals: number;
    breaks: number;
    technical_errors: number;
    assignment_count_before: number;
    last_assigned_at: string | null;
    parent_observations: {
      count: number;
      latest_result: string | null;
      latest_prompt_level: string | null;
      independent: number;
      with_help: number;
      refusals: number;
      breaks: number;
    };
  };
};

export type AdaptivePlanItem = {
  id: number;
  plan_id: number;
  goal_id: number;
  goal_version: number;
  exercise_id: number;
  exercise_version_id: number;
  exercise_version: number;
  exercise_title: string;
  instruction: string;
  module: "sensory" | "mixed";
  target: string;
  skill: SkillName | null;
  position: number;
  difficulty_params: AdaptiveDifficultyParams;
  assignment_reason: AdaptiveAssignmentReason;
  recommendation_id: number | null;
};

export type SpecialistAdvice = {
  id: number;
  specialist_name: string;
  comment: string;
  created_at: string;
  exercise_id: number | null;
  exercise_title: string | null;
  goal_id: number | null;
  goal_title: string | null;
  is_current: boolean;
  exercise_available: boolean;
  goal_available: boolean;
  ready_for_plan: boolean;
  suitable_goals: Array<{ id: number; title: string }>;
  family_decision: "pending" | "accepted" | "declined" | "needs_help";
  family_note: string;
  completed_at: string | null;
  attempt_count: number;
  latest_attempt: { attempt_status: string; created_at: string; attempts_count: number | null; correct_answers: number | null; prompt_level: string | null } | null;
};

export type AdaptivePlan = {
  id: number;
  child_id: number;
  status: "prepared" | "started";
  rules_version: string;
  target_minutes: 3 | 5 | 10;
  summary: string;
  notices: Array<{ goal_id: number | null; goal_title: string | null; message: string }>;
  thresholds: Record<string, number>;
  created_at: string;
  started_at?: string | null;
  items: AdaptivePlanItem[];
};

export type PracticeGoalTemplate = {
  id: number;
  template_key: string;
  version: number;
  available_exercise_count: number;
  title: string;
  skill_category: string;
  observable_behavior: string;
  baseline_prompt: string;
  target_outcome: string;
  accepted_responses: string[];
  default_help_level: "independent" | "minimal" | "full";
  matching_targets: string[];
  matching_mechanics: string[];
  status: "available";
};

export type PracticeGoalObservation = {
  id: number;
  goal_id: number;
  child_id: number;
  goal_version: number;
  result_type: "not_observed" | "independent" | "with_help" | "refused" | "break" | "technical_error";
  prompt_level: "independent" | "minimal" | "full" | null;
  note: string;
  source: "parent_real_life_observation";
  observed_at: string;
};

export type PracticeGoal = {
  id: number;
  child_id: number;
  template_key: string;
  version: number;
  title: string;
  skill_category: string;
  observable_behavior: string;
  baseline: string;
  target_outcome: string;
  accepted_responses: string[];
  help_level: "independent" | "minimal" | "full";
  status: "active" | "paused" | "completed";
  source: "parent_home_practice";
  linked_exercises: Array<{ id: number; title: string; target: string; mechanic: string; exercise_version_id: number; exercise_version: number }>;
  observations: PracticeGoalObservation[];
  history: Array<{ id: number; goal_version: number; event_type: string; created_at: string }>;
  updated_at: string;
};

export type LearningSession = {
  id: number;
  child_id: number;
  status: "in_progress" | "paused" | "completed";
  current_index: number;
  target_minutes: 3 | 5 | 10;
  started_at: string;
  completed_at?: string | null;
  adaptive_plan_id?: number | null;
  exercises: Exercise[];
  results?: Array<{ exercise_id: number; score: number; duration_seconds: number; attempt_status?: "completed" | "participated" | "refused" | "break" | "technical_error"; created_at: string }>;
};

export type AACCard = {
  id: number;
  child_id: number | null;
  label: string;
  speech: string;
  category: "help" | "wants" | "needs" | "feelings" | "yes_no" | "people" | "food" | "play" | "places" | "actions" | "household";
  image: string;
  lemma?: string | null;
  grammatical_role?: "subject" | "action" | "object" | "ready_message";
  language?: "ru" | "kk" | "en";
  pictogram?: string | null;
  is_core: number | boolean;
  favorite: number | boolean;
};

export type WorldPhoto = {
  id: number;
  name: string;
  category: "people" | "toys" | "food" | "places";
  image_data: string;
  created_at: string;
};

export type Story = {
  engine?: "interactive_book";
  key: string;
  title: string;
  summary: string;
  cover: string;
  category: string;
  scene_count: number;
  scene_index: number;
  completed_at: string | null;
  scenes: Array<{
    image: string;
    alt: string;
    text: string;
    prompt: string;
    hint: string;
    choices: Array<{ key: string; label: string; image: string }>;
  }>;
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

// In production, keep API cookies first-party even inside mobile in-app browsers.
// Next.js forwards /api requests to the configured backend.
export const API_URL = process.env.NODE_ENV === "production" ? "" : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010");
let csrfTokenMemory = "";

export function clearLegacyAuth() {
  if (typeof window !== "undefined") localStorage.removeItem("soyle-token");
}

export function getCsrfToken() {
  if (csrfTokenMemory) return csrfTokenMemory;
  if (typeof document === "undefined") return "";
  const value = document.cookie.split("; ").find((item) => item.startsWith("soyle_csrf=") || item.startsWith("__Host-soyle_csrf="));
  return value ? decodeURIComponent(value.split("=", 2)[1] || "") : "";
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) headers.set("Content-Type", "application/json");
  if (["POST", "PUT", "PATCH", "DELETE"].includes((options.method || "GET").toUpperCase())) {
    const csrfToken = getCsrfToken();
    if (csrfToken) headers.set("X-CSRF-Token", csrfToken);
  }
  let response: Response;
  const controller = new AbortController();
  const timeoutMs = path === "/api/tts" ? 45_000 : 8_000;
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  if (options.signal) options.signal.addEventListener("abort", () => controller.abort(), { once: true });
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers, credentials: "include", signal: controller.signal });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") {
      throw new Error(path === "/api/tts" ? "Озвучивание не успело подготовиться. Попробуйте ещё раз." : "Сервер Söyle отвечает слишком долго. Попробуйте ещё раз через несколько секунд.");
    }
    throw new Error("Сервер Söyle временно недоступен. Проверьте подключение и попробуйте ещё раз.");
  } finally {
    window.clearTimeout(timeout);
  }
  if (response.status === 204) {
    if (path === "/api/auth/logout") csrfTokenMemory = "";
    return undefined as T;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.detail || "Не удалось выполнить запрос", response.status);
  if (data && typeof data === "object" && "csrf_token" in data && typeof data.csrf_token === "string" && data.csrf_token) {
    csrfTokenMemory = data.csrf_token;
  }
  return data as T;
}
