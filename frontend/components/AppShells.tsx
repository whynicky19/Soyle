"use client";

import { ArrowLeft, CircleX, Pause, Volume2, VolumeX } from "lucide-react";
import type { ReactNode } from "react";

type ShellProps = { children: ReactNode };

export function ChildShell({ children }: ShellProps) {
  return <div className="app-shell student-mode child-shell soyle-parent-v2 soyle-unified">{children}</div>;
}

export function ParentShell({ children }: ShellProps) {
  return <div className="app-shell parent-mode parent-shell soyle-parent-v2 soyle-unified">{children}</div>;
}

export function AdminShell({ children }: ShellProps) {
  return <div className="app-shell admin-mode admin-shell soyle-parent-v2 soyle-unified">{children}</div>;
}

export function ExerciseFocusShell({
  title,
  progress,
  soundEnabled,
  stopping = false,
  onBack,
  onToggleSound,
  onBreak,
  onRefuse,
  children,
}: {
  title: string;
  progress: string;
  soundEnabled: boolean;
  stopping?: boolean;
  onBack: () => void;
  onToggleSound: () => void;
  onBreak: () => void;
  onRefuse: () => void;
  children: ReactNode;
}) {
  return (
    <div className="exercise-focus-shell student-mode">
      <header className="exercise-focus-header">
        <button type="button" className="focus-back" onClick={onBack} aria-label="Вернуться к занятиям">
          <ArrowLeft size={23}/><span>Назад</span>
        </button>
        <div className="focus-heading">
          <span>{progress}</span>
          <strong>{title}</strong>
        </div>
        <button type="button" className="focus-sound" onClick={onToggleSound} aria-pressed={soundEnabled} aria-label={soundEnabled ? "Выключить звук" : "Включить звук"}>
          {soundEnabled ? <Volume2 size={23}/> : <VolumeX size={23}/>}<span>{soundEnabled ? "Звук" : "Без звука"}</span>
        </button>
        <div className="focus-safety-actions" aria-label="Можно остановиться в любой момент">
          <button type="button" disabled={stopping} onClick={onBreak}><Pause size={20}/><span>Перерыв</span></button>
          <button type="button" disabled={stopping} onClick={onRefuse}><CircleX size={20}/><span>Не хочу</span></button>
        </div>
      </header>
      <main className="exercise-focus-main" aria-busy={stopping}>{children}</main>
    </div>
  );
}
