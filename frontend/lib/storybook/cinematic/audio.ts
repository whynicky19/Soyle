/** A clip manifest can replace device narration after editorial approval. Every playback is cancellable. */
export async function playNarration(text: string, signal: AbortSignal, clips: Record<string, string> = {}): Promise<void> {
  if (signal.aborted) return;
  const clip = clips[text];
  if (clip) {
    const played = await new Promise<boolean>((resolve) => {
      const audio = new Audio(clip);
      const finish = (ok = true) => { audio.pause(); audio.removeAttribute('src'); signal.removeEventListener('abort', abort); resolve(ok); };
      const abort = () => finish(true);
      signal.addEventListener('abort', abort, { once: true });
      audio.onended = () => finish(); audio.onerror = () => finish(false);
      void audio.play().catch(() => finish(false));
    });
    if (played || signal.aborted) return;
  }
  if (!('speechSynthesis' in window)) return;
  await new Promise<void>((resolve) => {
    const voice = new SpeechSynthesisUtterance(text); voice.lang = 'ru-RU'; voice.rate = .9;
    const finish = () => { clearTimeout(timeout); signal.removeEventListener('abort', abort); resolve(); };
    const abort = () => { speechSynthesis.cancel(); finish(); };
    const timeout = window.setTimeout(abort, Math.max(6000, text.length * 180));
    voice.onend = finish; voice.onerror = finish;
    signal.addEventListener('abort', abort, { once: true });
    speechSynthesis.cancel(); speechSynthesis.speak(voice);
  });
}
