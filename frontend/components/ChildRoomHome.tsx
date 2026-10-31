"use client";
import { t, useLocale, getLocale, languageOf } from "@/lib/i18n";

import Image from 'next/image';
import { ArrowRight, CircleX, Play, Volume2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type {Child, Dashboard, Exercise, LearningSession} from '@/lib/api';
import { speak, stopCurrentSpeech } from '@/lib/speech';
import { ExercisePet, usePetMessage } from './pet/ExercisePet';

type Destination = 'stories' | 'games' | 'aac' | 'achievements' | 'profile' | 'settings' | 'learn' | 'my-world' | 'success';
type Props = {child?: Child; dashboard: Dashboard | null; exercises: Exercise[]; currentSession: LearningSession | null;
  busy: boolean; error: string; canSave: boolean; soundEnabled: boolean; onStart: () => void; onResume: () => void;
  onNavigate: (screen: Destination) => void; onExercise: (exercise: Exercise) => void};
export function ChildRoomHome({dashboard,exercises,currentSession,busy,error,canSave,soundEnabled,onStart,onResume,onNavigate}: Props) {
  useLocale();
  const [message,setMessage] = useState('');
  const [speaking,setSpeaking] = useState(false);
  const roomRef = useRef<HTMLElement>(null);
  const petMessage = usePetMessage();
  useEffect(() => () => stopCurrentSpeech(), []);
  const canStartPlan = (dashboard?.recommended_exercises || []).some(item => exercises.some(e => e.id === item.id));
  const actionLabel = currentSession ? t("common.continue") : t("child.start");
  function start() {if (currentSession && canSave) onResume();else if (canSave && canStartPlan) onStart();else onNavigate('learn');}
  async function greet() {
    if (speaking) return;
    setSpeaking(true);
    try {if (!await speak(petMessage,.7,soundEnabled,languageOf(getLocale()),"pet")) setMessage(soundEnabled?'Звук не включился. Попробуй ещё.':'Звук можно включить в настройках.');}
    finally {setSpeaking(false);}
  }
  return <div className="child-room-home">
    <section ref={roomRef} className="child-room" aria-label="Моя комната">
      <Image className="room-background room-wide" src="/child-room/room-detail.webp" alt="" fill priority unoptimized sizes="(max-width: 760px) 0px, (max-width: 1050px) 100vw, calc(100vw - 276px)"/>
      <header className="room-header"><div className="room-welcome room-guide"><div className="room-welcome-copy"><h1 aria-live="polite">{petMessage}</h1><p>Готов(а) говорить, играть и узнавать новое?</p><button className="room-guide-audio" type="button" disabled={speaking} aria-label="Послушать пингвина" onClick={() => void greet()}><Volume2 size={24}/><span>{speaking?'Слушаем…':t("game.listen")}</span></button></div><div className="room-home-pet"><ExercisePet/></div></div></header>
      <figure className="room-mobile-art"><Image src="/child-room/room-detail.webp" alt={t("child.room")} width={1536} height={1024} priority unoptimized sizes="(max-width: 760px) 100vw, 0px"/></figure>
      <div className="room-start"><button type="button" className="room-start-button" disabled={busy} onClick={start}><Play fill="currentColor" size={30}/><span>{busy ? t("child.wait") : actionLabel}</span><ArrowRight size={26}/></button></div>
      <nav className="room-doors" aria-label={t("child.chooseActivity")}>{[
        {key:'stories',title:t("nav.stories"),destination:'stories'},
        {key:'games',title:t("nav.lessons"),destination:'games'},
        {key:'words',title:t("nav.words"),destination:'aac'},
      ].map(item => <div key={item.key} className={`room-door-wrap room-door-${item.key}`}><button type="button" className="room-door" onClick={() => onNavigate(item.destination as Destination)}><Image src={`/child-room/${item.key}.webp`} alt="" width={148} height={148} sizes="(max-width: 760px) 80px, 140px"/><span><strong>{item.title}</strong></span></button></div>)}</nav>
    </section>
    {!canSave && <p className="room-notice" role="status">{t("child.askSave")}</p>}
    {error && <p className="room-notice" role="alert">{error}</p>}
    {message && <p className="room-message" role="status">{message}<button type="button" onClick={() => setMessage('')} aria-label={t("child.closeMessage")}><CircleX size={22}/></button></p>}
  </div>;
}
