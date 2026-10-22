/** A clip manifest can replace device narration after editorial approval. Every playback is cancellable. */
export async function playNarration(text: string, signal: AbortSignal, clips: Record<string, string> = {}): Promise<void> {
  if (signal.aborted) return;
  const clip = clips[text];
  if (clip) {
    const played = await new Promise<boolean>((resolve) => {
      const audio = new Audio(clip);
      let settled = false;
      const finish = (ok = true) => { if (settled) return; settled = true; clearTimeout(timeout); audio.pause(); audio.removeAttribute('src'); signal.removeEventListener('abort', abort); resolve(ok); };
      const abort = () => finish(true);
      const timeout = window.setTimeout(() => finish(false), Math.max(6000, text.length * 180));
      signal.addEventListener('abort', abort, { once: true });
      audio.onended = () => finish(); audio.onerror = () => finish(false);
      void audio.play().catch(() => finish(false));
    });
    if (played || signal.aborted) return;
  }
  if (!('speechSynthesis' in window)) throw new Error('Озвучка недоступна');
  await new Promise<void>((resolve, reject) => {
    const voice = new SpeechSynthesisUtterance(text); voice.lang = 'ru-RU'; voice.rate = .9;
    let settled = false;
    const finish = (ok: boolean) => { if (settled) return; settled = true; clearTimeout(timeout); signal.removeEventListener('abort', abort); if (ok) resolve(); else reject(new Error('Не удалось завершить озвучку')); };
    const abort = () => { speechSynthesis.cancel(); finish(true); };
    const timeout = window.setTimeout(() => { speechSynthesis.cancel(); finish(false); }, Math.max(6000, text.length * 180));
    voice.onend = () => finish(true); voice.onerror = () => finish(false);
    signal.addEventListener('abort', abort, { once: true });
    try { speechSynthesis.cancel(); speechSynthesis.speak(voice); } catch { finish(false); }
  });
}
