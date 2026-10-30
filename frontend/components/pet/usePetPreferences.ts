"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { defaultPetPreferences, type PetPreferences } from "@/lib/pet";

export function usePetPreferences(childId?: number) {
  const [state, setState] = useState<{childId?: number; value: PetPreferences; ready: boolean; saving: boolean; error: string}>({ value: defaultPetPreferences, ready: false, saving: false, error: "" });
  const generation = useRef(0);
  const queue = useRef(Promise.resolve());
  const version = useRef(0);
  useEffect(() => {
    const epoch = ++generation.current;
    if (!childId) return;
    void api<PetPreferences>(`/api/children/${childId}/pet-settings`).then(value => {
      if (generation.current === epoch) setState({ childId, value, ready: true, saving: false, error: "" });
    }).catch(() => {
      if (generation.current === epoch) setState({ childId, value: defaultPetPreferences, ready: false, saving: false, error: "Не удалось загрузить настройки питомца. Обнови страницу после восстановления связи." });
    });
    return () => { generation.current = epoch + 1; };
  }, [childId]);
  const change = useCallback((value: PetPreferences) => {
    if (!childId) return;
    const epoch = generation.current;
    const revision = ++version.current;
    setState(current => ({ ...current, value, saving: true, error: "" }));
    queue.current = queue.current.then(async () => {
      try {
        const saved = await api<PetPreferences>(`/api/children/${childId}/pet-settings`, { method: "PUT", body: JSON.stringify(value) });
        if (generation.current === epoch && revision === version.current) setState({ childId, value: saved, ready: true, saving: false, error: "" });
      } catch {
        if (generation.current !== epoch || revision !== version.current) return;
        // Reconcile after an uncertain write; do not claim unsaved settings are persistent.
        const saved = await api<PetPreferences>(`/api/children/${childId}/pet-settings`).catch(() => null);
        if (generation.current === epoch && revision === version.current) setState(current => ({ ...current, value: saved || current.value, saving: false, error: "Не удалось сохранить настройки питомца. Попробуй ещё раз." }));
      }
    });
  }, [childId]);
  return { ...state, ready: state.ready && state.childId === childId, change };
}
