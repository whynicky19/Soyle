"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { getServerSpeechState, getSpeechState, repeatSpeech, speak, stopCurrentSpeech, subscribeSpeech, type SpeechLanguage, type SpeechMode } from "@/lib/speech";

/** All hooks and legacy buttons share one player; a new utterance stops the previous one. */
export function useSpeech(initialMode: SpeechMode = "normal") {
  const [mode, setMode] = useState<SpeechMode>(initialMode);
  const state = useSyncExternalStore(subscribeSpeech, getSpeechState, getServerSpeechState);
  const say = useCallback((text: string, language: SpeechLanguage = "ru") => speak(text, mode === "slow" ? .65 : .78, true, language), [mode]);
  return { speak: say, stop: stopCurrentSpeech, repeat: repeatSpeech, ...state, mode, setMode };
}
