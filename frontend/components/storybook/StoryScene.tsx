"use client";

import Image from "next/image";
import { useRef, type CSSProperties } from "react";
import { useStoryAnimation } from "@/lib/storybook/animation";
import { availableActions, objectLabels, sceneLayers, spriteCells } from "@/lib/storybook/interaction";
import type { StoryAction, StoryDefinition, StoryObject, StoryState } from "@/lib/storybook/types";

export function StorySprite({ sheet, cell, frames, className = "" }: { sheet: string; cell: number; frames?: string[]; className?: string }) {
  return <span aria-hidden="true" data-cell={cell} data-atlas={frames ? "false" : "true"} className={`sb-sprite ${className}`} style={{ backgroundImage: `url("${frames?.[cell] || sheet}")`, backgroundSize: frames ? "contain" : "200% 200%", backgroundPosition: frames ? "center bottom" : `${cell % 2 * 100}% ${Math.floor(cell / 2) * 100}%` }}/>;
}

export function StoryScene({ definition, state, revision, motion, hints, busy, onAction }: { definition: StoryDefinition; state: StoryState; revision: number; motion: boolean; hints: boolean; busy: boolean; onAction: (action: StoryAction) => void }) {
  const scene = definition.scenes[state.scene_index];
  const root = useRef<HTMLDivElement>(null);
  useStoryAnimation(root, revision, motion && !state.paused);
  const available = availableActions(scene, state);
  const layers = sceneLayers(scene, state);
  const inScene = scene.kind !== "aac_request" ? available : [];
  return <div ref={root} className={`sb-stage sb-camera-${scene.camera} sb-light-${scene.lighting} ${motion ? "sb-motion" : "sb-still"} ${state.ready ? "sb-ready" : ""}`} data-scene={scene.id} aria-label={`Сцена: ${scene.title}`} role="group">
    <Image className="sb-room" src={definition.assets.room} alt="Уютная комната Миши: окно слева, ковёр посередине, полка справа" fill priority sizes="(max-width: 760px) 100vw, 1100px" unoptimized/>
    <div className="sb-daylight" aria-hidden="true"/>
    {Object.entries(layers).filter(([, layer]) => layer.visible !== false).map(([key, layer]) => {
      const action = inScene.find((item) => (item.object === "chosen" ? (state.chosen_toy === "teddy" ? "ball" : state.chosen_toy) : item.object) === key);
      const sheet = key === "misha" || key === "mother" ? definition.assets[key] : definition.assets.objects;
      const cell = layer.pose ?? spriteCells[key];
      const position = { left: `${layer.x}%`, top: `${layer.y}%`, width: `${layer.width}%`, height: `${layer.height}%`, zIndex: layer.z ?? 4 } as CSSProperties;
      const highlight = hints && !!action;
      const inner = <><StorySprite sheet={sheet} cell={cell} frames={definition.frames?.[key]}/>{action && <span className={`sb-object-label ${highlight ? "sb-highlight-label" : ""}`}>{objectLabels[key as StoryObject]}</span>}</>;
      return action
        ? <button key={key} data-layer={key} data-object={key} className={`sb-layer sb-interactive sb-${key} ${highlight ? "sb-highlight" : ""}`} style={position} onClick={() => onAction(action)} disabled={busy || state.paused} aria-label={action.label}>{inner}</button>
        : <div key={key} data-layer={key} data-object={key} className={`sb-layer sb-${key} ${state.play === "roll" && state.step === 1 && key === (state.chosen_toy === "teddy" ? "ball" : state.chosen_toy) ? "sb-rolling" : ""}`} style={position}>{inner}</div>;
    })}
    {state.scene_index === 2 && !state.ready && <span className="sb-reach-cue" aria-hidden="true">···</span>}
    {state.scene_index === 1 && state.ready && <span className="sb-found-note">Вот мишка!</span>}
    {state.scene_index === 3 && <span className="sb-sequence-note" aria-live="polite">{state.step === 0 ? "1 · С полки к маме" : state.step === 1 ? "2 · От мамы к Мише" : "Мишка у Миши"}</span>}
    <div className="sb-foreground" aria-hidden="true"/>
  </div>;
}
