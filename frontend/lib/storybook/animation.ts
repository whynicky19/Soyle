import { useLayoutEffect, useRef, type RefObject } from "react";

type Frame = { x: number; y: number; width: number; height: number; cell?: string };

/** FLIP animates actual independent layers; the room image never impersonates a character. */
export function useStoryAnimation(root: RefObject<HTMLDivElement | null>, revision: number, enabled: boolean) {
  const previous = useRef<Map<string, Frame>>(new Map());
  const active = useRef<Animation[]>([]);
  useLayoutEffect(() => {
    active.current.forEach((animation) => animation.cancel());
    active.current = [];
    const layers = root.current?.querySelectorAll<HTMLElement>("[data-layer]") || [];
    const next = new Map<string, Frame>();
    layers.forEach((element) => {
      const key = element.dataset.layer!;
      const bounds = element.getBoundingClientRect();
      const before = previous.current.get(key);
      const cell = element.querySelector<HTMLElement>("[data-cell]")?.dataset.cell;
      next.set(key, { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, cell });
      if (!enabled) return;
      if (before && before.width && bounds.width) {
        const moved = Math.abs(before.x - bounds.x) + Math.abs(before.y - bounds.y) > 2;
        if (moved) active.current.push(element.animate([
          { transformOrigin: "top left", transform: `translate(${before.x - bounds.x}px, ${before.y - bounds.y}px) scale(${before.width / bounds.width}, ${before.height / bounds.height})` },
          { transformOrigin: "top left", transform: "translate(0,0) scale(1)" },
        ], { duration: key === "teddy" ? 1100 : 850, easing: "cubic-bezier(.22,.7,.25,1)" }));
        if (before.cell !== cell) active.current.push(element.animate([{ opacity: .45 }, { opacity: 1 }], { duration: 420, easing: "ease-out" }));
      } else {
        active.current.push(element.animate([{ opacity: 0, transform: key === "mother" ? "translateX(-100px)" : "translateX(16px)" }, { opacity: 1, transform: "translateX(0)" }], { duration: 700, easing: "ease-out" }));
      }
    });
    previous.current = next;
    return () => { active.current.forEach((animation) => animation.cancel()); };
  }, [root, revision, enabled]);
}
