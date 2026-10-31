import { playSpeechClip, speak, stopCurrentSpeech } from "../../speech";

/** Reviewed recordings and TTS use the same player as exercises and the pet. */
export async function playNarration(text: string, signal: AbortSignal, clips: Record<string, string> = {}): Promise<void> {
  if (signal.aborted) return;
  const abort = () => stopCurrentSpeech();
  signal.addEventListener("abort", abort, { once: true });
  try {
    const played = clips[text] ? await playSpeechClip(clips[text]) : await speak(text, .78, true, "ru");
    if (!played && !signal.aborted) throw new Error("Не удалось завершить озвучку: озвучка недоступна");
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
