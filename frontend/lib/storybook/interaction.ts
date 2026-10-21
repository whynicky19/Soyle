import type { LayerPlacement, StoryAction, StoryObject, StorySceneDefinition, StoryState } from "./types";

/** Interaction availability comes from content + persisted state, never from a timer. */
export function availableActions(scene: StorySceneDefinition, state: StoryState): StoryAction[] {
  if (state.completed || state.paused || state.ready) return [];
  if (scene.kind === "give_object") return scene.actions.filter((action) => action.key === (state.step === 0 ? "take_teddy" : "give_misha"));
  if (scene.kind === "simple_sequence") return scene.actions.filter((action) => state.step === 0 ? action.key !== "settle" : action.key === "settle");
  return scene.actions;
}

export function canContinue(scene: StorySceneDefinition, state: StoryState): boolean {
  return !state.paused && !state.completed && (state.ready || scene.kind === "watch");
}

export const objectLabels: Record<StoryObject, string> = { teddy: "Мишка", train: "Поезд", ball: "Мяч", basket: "Корзина", misha: "Миша", mother: "Мама", chosen: "Игрушка" };
export const spriteCells: Record<string, number> = { teddy: 0, train: 1, ball: 2, basket: 3 };

/** Merge authored layers with state-triggered reactions; rendering does not know the plot. */
export function sceneLayers(scene: StorySceneDefinition, state: StoryState): Record<string, LayerPlacement> {
  const layers = Object.fromEntries(Object.entries(scene.layers).map(([key, value]) => [key, { ...value }]));
  for (const reaction of scene.layer_reactions) {
    if (!Object.entries(reaction.when).every(([key, value]) => state[key as keyof StoryState] === value)) continue;
    for (const [name, placement] of Object.entries(reaction.layers)) {
      const key = name === "chosen" ? (state.chosen_toy === "teddy" ? "ball" : state.chosen_toy) : name;
      if (layers[key]) Object.assign(layers[key], placement);
    }
  }
  return layers;
}
