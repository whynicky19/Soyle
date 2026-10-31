"use client";
import { t, useLocale } from "@/lib/i18n";

import type { usePetPreferences } from "./usePetPreferences";
import { ChildSettingToggle } from '../ChildSettingToggle';
export function PetSettings({ preferences }: { preferences: ReturnType<typeof usePetPreferences> }) {
  useLocale();
  const { value, ready, saving, error, change } = preferences;
  return <section className="child-settings-section pet-settings" aria-labelledby="pet-settings-title">
    <h2 id="pet-settings-title">{t("pet.settings")}</h2>
    <ChildSettingToggle title={t("pet.show")} value={value.visible} disabled={!ready} onChange={visible => change({...value,visible})}/>
    <ChildSettingToggle title={t("pet.voice")} description={t("pet.voiceHelp")} value={value.voice} disabled={!ready || !value.visible} onChange={voice => change({...value,voice})}/>
    <div className="pet-motion-setting"><label htmlFor="pet-motion">{t("pet.motion")}</label><select id="pet-motion" value={value.motion} disabled={!ready} onChange={event => change({ ...value, motion: event.target.value as typeof value.motion })}><option value="full">{t("pet.full")}</option><option value="reduced">{t("pet.reduced")}</option><option value="off">{t("pet.off")}</option></select></div>
    <p>{t("pet.motionHelp")}</p>
    <p className="child-save-status" role="status">{error || (saving ? t("common.saving") : ready ? t("common.savedShort") : t("common.loadingMore"))}</p>
  </section>;
}
