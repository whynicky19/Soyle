export type StoryObject = "teddy" | "train" | "ball" | "basket" | "misha" | "mother" | "chosen";
export type StoryAction = { key: string; label: string; object: StoryObject; speech?: string; reaction: string };
export type StorySceneDefinition = {
  id: string; title: string; kind: "choose_object" | "tap_object" | "aac_request" | "give_object" | "simple_sequence" | "watch";
  narration: string; instruction: string; hint: string; completion: string;
  background: string; camera: string; lighting: string; misha_pose: number; actions: StoryAction[];
  assisted_reaction: string; transition: string;
  layers: Record<string, LayerPlacement>; layer_reactions: Array<{ when: Record<string, string | number | boolean>; layers: Record<string, Partial<LayerPlacement>> }>; decorative_motion: string[];
};
export type StoryDefinition = {
  key: string; version: number; schema_version: number; status: "DRAFT" | "PUBLISHED"; review_status: string;
  title: string; subtitle: string; summary: string; age_note: string; review_note: string;
  assets: Record<"room" | "misha" | "mother" | "objects", string>;
  frames?: Record<string, string[]>;
  scenes: StorySceneDefinition[];
};
export type StoryState = {
  scene_index: number; step: number; ready: boolean; chosen_toy: "ball" | "train" | "teddy";
  request: string | null; play: "hug" | "roll" | "rest" | null; completed: boolean; paused: boolean;
  feedback: string; assisted_scenes: string[]; skipped_scenes: string[]; hinted_scenes: string[]; last_event_id: string | null;
};
export type StorySnapshot = { definition: StoryDefinition; state: StoryState; revision: number; preview: boolean };
export type LayerPlacement = { x: number; y: number; width: number; height: number; pose?: number; visible?: boolean; z?: number };
