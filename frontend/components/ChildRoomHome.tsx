"use client";

import Image from 'next/image';
import { ArrowRight, CircleX, Play, Settings, Volume2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type {Child, Dashboard, Exercise, LearningSession} from '@/lib/api';
import { speak, stopCurrentSpeech } from '@/lib/speech';
import { StarVault } from './StarReward';

type Destination = 'stories' | 'games' | 'aac' | 'achievements' | 'profile' | 'settings';
type Props = {child?: Child; dashboard: Dashboard | null; exercises: Exercise[]; currentSession: LearningSession | null;
  busy: boolean; error: string; canSave: boolean; soundEnabled: boolean; onStart: () => void; onResume: () => void;
  onNavigate: (screen: Destination) => void; onExercise: (exercise: Exercise) => void};

export function ChildRoomHome({child,dashboard,exercises,currentSession,busy,error,canSave,soundEnabled,onStart,onResume,onNavigate,onExercise}: Props) {
  const [message,setMessage] = useState('');
  const [speaking,setSpeaking] = useState(false);
  const roomRef = useRef<HTMLElement>(null);
  const todayRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const today = todayRef.current;
    if (!today) return;
    const update = () => roomRef.current?.style.setProperty('--room-today-height', `${today.offsetHeight}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(today);
    return () => observer.disconnect();
  }, []);
  useEffect(() => () => stopCurrentSpeech(), []);
  const next = currentSession?.exercises[currentSession.current_index] || (dashboard?.recommended_exercises || []).find(item => exercises.some(e => e.id === item.id));
  const canStartPlan = (dashboard?.recommended_exercises || []).some(item => exercises.some(e => e.id === item.id));
  const actionLabel = currentSession ? 'Продолжить занятие' : !canSave || !canStartPlan ? 'Выбрать занятие' : 'Начать занятие';
  function start() {if (currentSession && canSave) onResume();else if (canSave && canStartPlan) onStart();else onNavigate('games');}
  async function greet() {
    if (speaking) return;
    setSpeaking(true);
    try {if (!await speak(`Привет, ${child?.name || 'друг'}! Выбери истории, занятия или мои слова.`,.8,soundEnabled)) setMessage('Не удалось включить звук. Все кнопки доступны на экране.');}
    finally {setSpeaking(false);}
  }
  return <div className="child-room-home">
    <section ref={roomRef} className="child-room" aria-label="Моя комната">
      <Image className="room-background room-wide" src="/child-room/room-detail.webp" alt="" fill priority unoptimized sizes="(max-width: 760px) 0px, (max-width: 1050px) 100vw, calc(100vw - 276px)"/>
      <header className="room-header"><div className="room-welcome"><h1>Привет, {child?.name || 'друг'}!</h1><p>Готов(а) говорить, играть<br/>и узнавать новое?</p><button className="room-greeting-audio" type="button" disabled={speaking || !soundEnabled} aria-label="Послушать приветствие" onClick={() => void greet()}><Volume2 size={21}/></button></div>
        <div className="room-account"><StarVault total={dashboard?.stars || 0} onOpen={() => onNavigate('achievements')}/><button type="button" className="room-settings" aria-label="Настройки" onClick={() => onNavigate('settings')}><Settings size={23}/></button><button type="button" className="room-profile" aria-label="Открыть профиль" onClick={() => onNavigate('profile')}>{child?.name?.[0] || 'Я'}</button></div>
      </header>
      <figure className="room-mobile-art"><Image src="/child-room/room-detail.webp" alt="Мальчик и мишка приветствуют тебя в комнате для игр" width={1536} height={1024} priority unoptimized sizes="(max-width: 760px) 100vw, 0px"/></figure>
      <div className="room-start"><button type="button" className="room-start-button" disabled={busy || (Boolean(currentSession) && !canSave)} onClick={start}><Play fill="currentColor" size={30}/><span>{busy ? 'Подождём немного…' : actionLabel}</span><ArrowRight size={26}/></button>{currentSession && <p>Шаг {Math.min(currentSession.current_index + 1,currentSession.exercises.length)} из {currentSession.exercises.length}</p>}</div>
      <nav className="room-doors" aria-label="Выбери, чем заняться">{[
        {key:'stories',title:'Истории',description:'Читать и выбирать'},
        {key:'games',title:'Занятия',description:'Играть и узнавать'},
        {key:'words',title:'Мои слова',description:'Сказать, что нужно'},
      ].map(item => <div key={item.key} className={`room-door-wrap room-door-${item.key}`}><button type="button" className="room-door" onClick={() => onNavigate(item.key === 'words' ? 'aac' : item.key as 'stories' | 'games')}><Image src={`/child-room/${item.key}.webp`} alt="" width={148} height={148} sizes="(max-width: 760px) 80px, 140px"/><span><strong>{item.title}</strong><small>{item.description}</small></span></button></div>)}</nav>
      <section ref={todayRef} className="room-today" aria-label="Сегодня можно попробовать"><h2>Сегодня попробуем:</h2><div><button type="button" disabled={busy || (Boolean(currentSession) && !canSave)} onClick={() => currentSession ? onResume() : next ? onExercise(next) : onNavigate('games')}><Image src="/child-room/games.webp" alt="" width={68} height={68}/><span><strong>{next?.title || 'Выбрать занятие'}</strong><small>{next ? 'Короткая практика' : 'Открыть библиотеку'}</small></span><ArrowRight size={20}/></button><button type="button" onClick={() => onNavigate('stories')}><Image src="/child-room/stories.webp" alt="" width={68} height={68}/><span><strong>Выбрать историю</strong><small>Читать и выбирать</small></span><ArrowRight size={20}/></button></div></section>
    </section>
    {!canSave && <p className="room-notice" role="status">Попроси взрослого включить сохранение. Пока можно посмотреть задания и использовать «Мои слова».</p>}
    {error && <p className="room-notice" role="alert">{error}</p>}
    {message && <p className="room-message" role="status">{message}<button type="button" onClick={() => setMessage('')} aria-label="Закрыть сообщение"><CircleX size={22}/></button></p>}

  </div>;
}
