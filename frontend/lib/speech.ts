import { API_URL, getCsrfToken } from "./api";

export type SpeechLanguage = "ru" | "kk" | "en";
export type SpeechMode = "normal" | "slow";
const idleState = { isSpeaking: false, isLoading: false };
let speechState = idleState;
const listeners = new Set<() => void>();
export const getSpeechState = () => speechState;
export const getServerSpeechState = () => idleState;
export function subscribeSpeech(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function setSpeechState(isSpeaking: boolean, isLoading: boolean) {
  speechState = { isSpeaking, isLoading }; listeners.forEach(listener => listener());
}
let lastSpeech: { text: string; rate: number; language: SpeechLanguage } | null = null;
export function repeatSpeech() { return lastSpeech ? speak(lastSpeech.text, lastSpeech.rate, true, lastSpeech.language) : Promise.resolve(false); }
// Reuse the same media element: iOS grants playback permission to the element.
let reusableAudio: HTMLAudioElement | null = null;
const silentWav = "/audio/tts-unlock.wav";
function prepareAudio() {
  reusableAudio ??= new Audio();
  reusableAudio.src = silentWav;
  // Called synchronously in the button gesture, before fetching the audio.
  try { void reusableAudio.play().catch(() => {}); } catch { /* Retry on the next gesture. */ }
  return reusableAudio;
}

let currentSpeechAudio: HTMLAudioElement | null = null;
let currentSpeechUrl = "";
let speechOwner: "exercise" | "pet" = "exercise";
let speechController: AbortController | null = null;
let currentSpeechCompletion: ((played: boolean) => void) | null = null;


export function stopCurrentSpeech() {
  const completion = currentSpeechCompletion;
  currentSpeechCompletion = null;
  speechController?.abort();
  speechController = null;
  if (currentSpeechAudio) {
    currentSpeechAudio.pause();
    currentSpeechAudio.currentTime = 0;
  }
  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  completion?.(false);
  if (currentSpeechUrl) URL.revokeObjectURL(currentSpeechUrl);
  currentSpeechAudio = null;
  currentSpeechUrl = "";
  setSpeechState(false, false);
}

function speakWithBrowserVoice(text: string, rate: number, language: "ru" | "kk" | "en", controller: AbortController): Promise<boolean> {
  if (controller.signal.aborted) return Promise.resolve(false);
  if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
    if (speechController === controller) { speechController = null; setSpeechState(false, false); }
    return Promise.resolve(false);
  }
  const locale = { ru: "ru-RU", kk: "kk-KZ", en: "en-US" }[language];
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = locale;
  utterance.rate = rate < .75 ? .85 : 1;
  utterance.pitch = 1;
  utterance.volume = 0.92;
  const voices = window.speechSynthesis.getVoices().filter(voice => voice.localService);
  utterance.voice = voices.find((voice) => voice.lang.toLowerCase() === locale.toLowerCase())
    || voices.find((voice) => voice.lang.toLowerCase().startsWith(language))
    || null;
  if (!utterance.voice) {
    if (speechController === controller) { speechController = null; setSpeechState(false, false); }
    return Promise.resolve(false);
  }
  setSpeechState(true, false);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (played: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      controller.signal.removeEventListener("abort", abort);
      utterance.onend = null;
      utterance.onerror = null;
      if (currentSpeechCompletion === finish) currentSpeechCompletion = null;
      if (speechController === controller) { speechController = null; setSpeechState(false, false); }
      resolve(played);
    };
    const abort = () => finish(false);
    const watchdog = setTimeout(() => { finish(false); window.speechSynthesis.cancel(); }, 30000);
    controller.signal.addEventListener("abort", abort, { once: true });
    currentSpeechCompletion = finish;
    utterance.onend = () => finish(true);
    utterance.onerror = () => finish(false);
    try {
      window.speechSynthesis.speak(utterance);
    } catch {
      finish(false);
    }
  });
}

export async function speak(text: string, rate = 0.78, enabled = true, language: "ru" | "kk" | "en" = "ru", owner: "exercise" | "pet" = "exercise"): Promise<boolean> {
  if (!enabled || typeof window === "undefined") return false;
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return false;
  stopCurrentSpeech();
  const preparedAudio = prepareAudio();
  lastSpeech = { text: cleaned, rate, language };
  setSpeechState(false, true);
  speechOwner = owner;
  const controller = new AbortController();
  speechController = controller;
  let requestTimedOut = false;
  const requestTimeout = setTimeout(() => { requestTimedOut = true; controller.abort(); }, 12000);
  try {
    const response = await fetch(`${API_URL}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
      credentials: "include",
      body: JSON.stringify({ text: cleaned, rate, language, mode: rate < .75 ? "slow" : "normal" }),
      signal: controller.signal,
    });
    if (!response.ok) {
      clearTimeout(requestTimeout);
      if (response.status === 401 || response.status === 403) return false;
      return await speakWithBrowserVoice(cleaned, rate, language, controller);
    }
    const blob = await response.blob();
    clearTimeout(requestTimeout);
    if (controller.signal.aborted || speechController !== controller) return false;
    const objectUrl = URL.createObjectURL(blob);
    currentSpeechUrl = objectUrl;
    const audio = preparedAudio;
    audio.src = objectUrl;
    currentSpeechAudio = audio;
    audio.volume = 0.92;
    // Azure applies speed in SSML; never slow it a second time.
    audio.playbackRate = response.headers?.get("X-Soyle-TTS") === "azure" ? 1 : (rate < .75 ? .85 : 1);
    audio.preservesPitch = true;
    return await new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (played: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        controller.signal.removeEventListener("abort", abort);
        audio.pause();
        audio.onended = null;
        audio.onerror = null;
        if (currentSpeechCompletion === finish) currentSpeechCompletion = null;
        if (currentSpeechAudio === audio) currentSpeechAudio = null;
        if (currentSpeechUrl === objectUrl) currentSpeechUrl = "";
        if (speechController === controller) { speechController = null; setSpeechState(false, false); }
        URL.revokeObjectURL(objectUrl);
        resolve(played);
      };
      const abort = () => finish(false);
      const watchdog = setTimeout(() => finish(false), 30000);
      controller.signal.addEventListener("abort", abort, { once: true });
      currentSpeechCompletion = finish;
      audio.onended = () => finish(true);
      audio.onerror = () => finish(false);
      setSpeechState(true, false);
      try { audio.play().catch(() => finish(false)); } catch { finish(false); }
    });
  } catch {
    clearTimeout(requestTimeout);
    if (requestTimedOut && speechController === controller) {
      // A timed out request may use the local voice; an explicit stop never may.
      const fallback = new AbortController();
      speechController = fallback;
      return await speakWithBrowserVoice(cleaned, rate, language, fallback);
    }
    if (controller.signal.aborted || speechController !== controller) return false;
    if (currentSpeechUrl) URL.revokeObjectURL(currentSpeechUrl);
    currentSpeechUrl = "";
    currentSpeechAudio = null;
    return await speakWithBrowserVoice(cleaned, rate, language, controller);
  } finally {
    clearTimeout(requestTimeout);
    if (speechController === controller) { speechController = null; setSpeechState(false, false); }
  }
}

// Exercise speech always preempts the pet. Pet speech never preempts or queues behind it.
export function speakPet(text: string): Promise<boolean> {
  if (typeof window === "undefined" || speechController || currentSpeechAudio || window.speechSynthesis?.speaking || window.speechSynthesis?.pending) return Promise.resolve(false);
  return speak(text, 0.78, true, "ru", "pet");
}
export function stopPetSpeech() {
  if (speechOwner === "pet") stopCurrentSpeech();
}

export async function playSpeechClip(url: string): Promise<boolean> {
  stopCurrentSpeech();
  const audio = prepareAudio();
  currentSpeechAudio = audio;
  speechOwner = "exercise";
  const controller = new AbortController();
  speechController = controller;
  audio.src = url;
  audio.playbackRate = 1;
  setSpeechState(true, false);
  return new Promise(resolve => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      audio.onended = null; audio.onerror = null; audio.pause();
      controller.signal.removeEventListener("abort", abort);
      if (speechController === controller) { speechController = null; currentSpeechAudio = null; setSpeechState(false, false); }
      if (currentSpeechCompletion === finish) currentSpeechCompletion = null;
      resolve(ok);
    };
    const abort = () => finish(false);
    const timer = setTimeout(() => finish(false), 60_000);
    currentSpeechCompletion = finish;
    controller.signal.addEventListener("abort", abort, { once: true });
    audio.onended = () => finish(true); audio.onerror = () => finish(false);
    try { void audio.play().catch(() => finish(false)); } catch { finish(false); }
  });
}
