"use client";
import type { usePetPreferences } from "./usePetPreferences";
import { ChildSettingToggle } from '../ChildSettingToggle';
export function PetSettings({ preferences }: { preferences: ReturnType<typeof usePetPreferences> }) {
  const { value, ready, saving, error, change } = preferences;
  return <section className="child-settings-section pet-settings" aria-labelledby="pet-settings-title">
    <h2 id="pet-settings-title">Мой питомец</h2>
    <ChildSettingToggle title="Показывать питомца" value={value.visible} disabled={!ready} onChange={visible => change({...value,visible})}/>
    <ChildSettingToggle title="Голос питомца" description="Говорит, когда задание молчит" value={value.voice} disabled={!ready || !value.visible} onChange={voice => change({...value,voice})}/>
    <div className="pet-motion-setting"><label htmlFor="pet-motion">Движения питомца</label><select id="pet-motion" value={value.motion} disabled={!ready} onChange={event => change({ ...value, motion: event.target.value as typeof value.motion })}><option value="full">Обычные</option><option value="reduced">Спокойные</option><option value="off">Без движения</option></select></div>
    <p className="child-save-status" role="status">{error || (saving ? "Сохраняем…" : ready ? "Сохранено" : "Загружаем…")}</p>
  </section>;
}
