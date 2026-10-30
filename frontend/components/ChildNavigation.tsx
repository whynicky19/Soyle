"use client";
import Image from 'next/image';
import { ArrowLeft, ArrowRight, Gamepad2, Home, ImageIcon, Settings, Trophy, UserRound } from 'lucide-react';
import { StarVault } from './StarReward';

export type ChildDestination = 'home' | 'learn' | 'my-world' | 'success' | 'stories' | 'games' | 'world' | 'aac' | 'profile' | 'settings';
export const childNavigation = [
  { id: 'home', label: 'Главная', icon: Home },
  { id: 'learn', label: 'Играть и учиться', icon: Gamepad2 },
  { id: 'my-world', label: 'Мой мир', icon: ImageIcon },
  { id: 'success', label: 'Мои успехи', icon: Trophy },
] as const;
export function childSection(screen: string) {
  if (['learn','stories','games','session','exercise-complete','motor','sensory','mixed'].includes(screen)) return 'learn';
  if (['my-world','world','aac'].includes(screen)) return 'my-world';
  if (['success','skills','achievements','progress'].includes(screen)) return 'success';
  return screen;
}
export function ChildSidebarExtras({name, stars, onOpen}: {name: string; stars: number; onOpen: (screen: ChildDestination) => void}) {
  return <div className="child-sidebar-extras">
    <StarVault total={stars} onOpen={() => onOpen('success')}/>
    <div className="child-sidebar-personal">
      <button className="child-profile-entry" onClick={() => onOpen('profile')} aria-label="Мой профиль"><span className="child-profile-initial" aria-hidden="true">{name[0] || <UserRound/>}</span><span><strong>{name}</strong><small>Мой профиль</small></span></button>
      <button className="child-settings-entry" onClick={() => onOpen('settings')}><Settings/><span>Настройки</span></button>
    </div>
  </div>;
}
export function ChildMobileNavigation({screen, onOpen, inert}: {inert?: boolean; screen: string; onOpen: (screen: ChildDestination) => void}) {
  return <nav inert={inert} className="child-bottom-nav" aria-label="Разделы">{childNavigation.map(({id,label,icon: Icon}) => <button key={id} onClick={() => onOpen(id)} aria-current={childSection(screen) === id ? 'page' : undefined}><Icon aria-hidden="true"/><span>{label}</span></button>)}</nav>;
}
export function ChildSectionTrail({screen,onOpen}: {screen:string;onOpen:(screen:ChildDestination)=>void}) {
  const group = childSection(screen);
  if (group !== 'learn' && group !== 'my-world') return null;
  if (screen === group || ['games','session','exercise-complete','motor','sensory','mixed'].includes(screen)) return null;
  return <div className="child-section-trail"><button onClick={() => onOpen(group)}><ArrowLeft size={20}/>{group === 'learn' ? 'Играть и учиться' : 'Мой мир'}</button><span aria-hidden="true">/</span><strong>{({stories:'Истории',games:'Занятия',world:'Мои фотографии',aac:'Мои слова'} as Record<string,string>)[screen]}</strong></div>;
}
export function ChildHub({kind,onOpen}: {kind:'learn'|'my-world';onOpen:(screen:ChildDestination)=>void}) {
  const learning = kind === 'learn';
  const entries = learning ? [
    {id:'games',title:'Занятия',text:'Слушай, выбирай, пробуй',image:'/child-room/games.webp',tone:'mint'},
    {id:'stories',title:'Истории',text:'Слушай и помогай героям',image:'/child-room/stories.webp',tone:'peach'},
  ] : [
    {id:'aac',title:'Мои слова',text:'Скажи, что тебе нужно',image:'/child-room/words.webp',tone:'mint'},
    {id:'world',title:'Мои фотографии',text:'Люди и вещи, которые ты знаешь',image:'/app-illustrations/aac-mother.webp',tone:'peach'},
  ];
  return <section className="child-hub page-enter"><header className="child-page-heading"><h1>{learning?'Играть и учиться':'Мой мир'}</h1><p>{learning?'Что выберем?':'То, что важно тебе'}</p></header><div className="child-hub-options">{entries.map(entry => <button key={entry.id} className={`child-hub-option ${entry.tone}`} onClick={() => onOpen(entry.id as ChildDestination)}><Image src={entry.image} alt="" width={200} height={200}/><span><strong>{entry.title}</strong><small>{entry.text}</small></span><ArrowRight aria-hidden="true"/></button>)}</div></section>;
}
