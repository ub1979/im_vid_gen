import type { Scene } from "./providers/types";

export type SceneStatus = "pending" | "generating" | "done" | "failed";

export interface CharacterRef {
  id: string;
  label: string;
  description?: string;
  visualDescription?: string;
  imagePath?: string;
}

export interface SceneEntry extends Scene {
  status: SceneStatus;
  imagePath?: string | null;
  error?: string;
  mode?: "reference_edit" | "text_to_image";
  generation?: GenerationMeta;
}

export interface ProviderConfig {
  image: { id: string; model: string };
  text: { id: string; model: string };
}

export interface GenerationMeta {
  imageProvider?: string;
  imageModel?: string;
  textProvider?: string;
  textModel?: string;
  generatedAt?: string;
}

export interface LibraryCharacter {
  id: string;
  label: string;
  description: string;
  imagePath?: string;
  createdAt: string;
  generation?: GenerationMeta;
}

export interface ProjectManifest {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  durationSeconds: number;
  intervalSeconds: number;
  text: string;
  characters: CharacterRef[];
  provider: ProviderConfig;
  theme: "dark" | "light";
  scenes: SceneEntry[];
}

// ---- Reimagine / Style Transfer ----

export type StyleMode = "preset" | "reference";

export interface ReimagineCharacter {
  id: string;
  label: string;
  description: string;
  sourceImageIds: string[];
  referenceImagePath?: string;
}

export type ReimagineStatus = "pending" | "generating" | "done" | "failed";

export interface ReimagineEntry {
  index: number;
  sourceImageId: string;
  prompt: string;
  reimaginedPrompt: string;
  characters_used: string[];
  status: ReimagineStatus;
  outputImagePath?: string | null;
  error?: string;
}

export interface ReimagineManifest {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  styleMode: StyleMode;
  stylePreset?: string;
  styleRefImagePath?: string;
  styleDescription?: string;
  characters: ReimagineCharacter[];
  entries: ReimagineEntry[];
  provider: ProviderConfig;
}
