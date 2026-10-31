"use client";
import { t, useLocale } from "@/lib/i18n";

import Image from 'next/image';
import { ArrowLeft, ArrowRight, Gamepad2, Home, ImageIcon, Settings, Trophy, UserRound } from 'lucide-react';
import { StarVault } from './StarReward';

export type ChildDestination = 'home' | 'learn' | 'my-world' | 'success' | 'stories' | 'games' | 'world' | 'aac' | 'profile' | 'settings';
export const childNavigation = [
  { id: 'home', get label() { return t('nav.home'); }, icon: Home },
  { id: 'learn', get label() { return t('nav.learn'); }, icon: Gamepad2 },
  { id: 'my-world', get label() { return t('nav.world'); }, icon: ImageIcon },
  { id: 'success', get label() { return t('nav.success'); }, icon: Trophy },
] as const;
export function childSection(screen: string) {
  if (['learn','stories','games','session','exercise-complete','motor','sensory','mixed'].includes(screen)) return 'learn';
  if (['my-world','world','aac'].includes(screen)) return 'my-world';
  if (['success','skills','achievements','progress'].includes(screen)) return 'success';
  return screen;
}
export function ChildSidebarExtras({name, stars, onOpen}: {name: string; stars: number; onOpen: (screen: ChildDestination) => void}) {
  useLocale();
  return <div className="child-sidebar-extras">
    <StarVault total={stars} onOpen={() => onOpen('success')}/>
    <div className="child-sidebar-personal">
      <button className="child-profile-entry" onClick={() => onOpen('profile')} aria-label={t("nav.myProfile")}><span className="child-profile-initial" aria-hidden="true">{name[0] || <UserRound/>}</span><span><strong>{name}</strong><small>{t("nav.myProfile")}</small></span></button>
      <button className="child-settings-entry" onClick={() => onOpen('settings')}><Settings/><span>{t("nav.settings")}</span></button>
    </div>
  </div>;
}
export function ChildMobileNavigation({screen, onOpen, inert}: {inert?: boolean; screen: string; onOpen: (screen: ChildDestination) => void}) {
  useLocale();
  return <nav inert={inert} className="child-bottom-nav" aria-label={t("nav.sections")}>{childNavigation.map(({id,label,icon: Icon}) => <button key={id} onClick={() => onOpen(id)} aria-current={childSection(screen) === id ? 'page' : undefined}><Icon aria-hidden="true"/><span>{label}</span></button>)}</nav>;
}
export function ChildSectionTrail({screen,onOpen}: {screen:string;onOpen:(screen:ChildDestination)=>void}) {
  useLocale();
  const group = childSection(screen);
  if (group !== 'learn' && group !== 'my-world') return null;
  if (screen === group || ['games','session','exercise-complete','motor','sensory','mixed'].includes(screen)) return null;
  return <div className="child-section-trail"><button onClick={() => onOpen(group)}><ArrowLeft size={20}/>{group === 'learn' ? t("nav.learn") : t("nav.world")}</button><span aria-hidden="true">/</span><strong>{({stories:t("nav.stories"),games:t("nav.lessons"),world:t("nav.photos"),aac:t("nav.words")} as Record<string,string>)[screen]}</strong></div>;
}
export function ChildHub({kind,onOpen}: {kind:'learn'|'my-world';onOpen:(screen:ChildDestination)=>void}) {
  useLocale();
  const learning = kind === 'learn';
  const entries = learning ? [
    {id:'games',title:t("nav.lessons"),text:t("child.listenChoose"),image:'/child-room/games.webp',tone:'mint'},
    {id:'stories',title:t("nav.stories"),text:t("child.heroes"),image:'/child-room/stories.webp',tone:'peach'},
  ] : [
    {id:'aac',title:t("nav.words"),text:t("child.sayNeeds"),image:'/child-room/words.webp',tone:'mint'},
    {id:'world',title:t("nav.photos"),text:t("child.familiar"),image:'/app-illustrations/aac-mother.webp',tone:'peach'},
  ];
  return <section className="child-hub page-enter"><header className="child-page-heading"><h1>{learning?t("nav.learn"):t("nav.world")}</h1><p>{learning?t("child.choose"):t("child.important")}</p></header><div className="child-hub-options">{entries.map(entry => <button key={entry.id} className={`child-hub-option ${entry.tone}`} onClick={() => onOpen(entry.id as ChildDestination)}><Image src={entry.image} alt="" width={200} height={200}/><span><strong>{entry.title}</strong><small>{entry.text}</small></span><ArrowRight aria-hidden="true"/></button>)}</div></section>;
}
