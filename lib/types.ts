// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// Types : shared TypeScript interfaces and type definitions for the
//         entire image_creator application.
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import type { Scene } from "./providers/types";
// =============================================================================

// =============================================================================
// Scene status type
// =============================================================================
export type SceneStatus = "pending" | "generating" | "done" | "failed";

// =============================================================================
/*
    CharacterRef : a character reference used within a project
*/
// =============================================================================
export interface CharacterRef {
  id: string;
  label: string;
  description?: string;
  visualDescription?: string;
  imagePath?: string;
}

// =============================================================================
/*
    SceneEntry : a single scene in a project timeline, extends Scene from providers
*/
// =============================================================================
export interface SceneEntry extends Scene {
  status: SceneStatus;
  imagePath?: string | null;
  error?: string;
  mode?: "reference_edit" | "text_to_image";
  generation?: GenerationMeta;
}

// =============================================================================
/*
    ProviderConfig : image and text provider selection for a project
*/
// =============================================================================
export interface ProviderConfig {
  image: { id: string; model: string };
  text: { id: string; model: string };
}

// =============================================================================
/*
    GenerationMeta : metadata about how an image was generated
*/
// =============================================================================
export interface GenerationMeta {
  imageProvider?: string;
  imageModel?: string;
  textProvider?: string;
  textModel?: string;
  generatedAt?: string;
}

// =============================================================================
/*
    LibraryCharacter : a character stored in the global library
*/
// =============================================================================
export interface LibraryCharacter {
  id: string;
  label: string;
  description: string;
  imagePath?: string;
  createdAt: string;
  generation?: GenerationMeta;
}

// =============================================================================
/*
    ProjectManifest : the complete manifest for a scene generation project
*/
// =============================================================================
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

// =============================================================================
// Reimagine / Style Transfer types
// =============================================================================
export type StyleMode = "preset" | "reference";

// =============================================================================
/*
    ReimagineCharacter : a character used in a reimagine/style-transfer project
*/
// =============================================================================
export interface ReimagineCharacter {
  id: string;
  label: string;
  description: string;
  sourceImageIds: string[];
  referenceImagePath?: string;
}

// =============================================================================
// Reimagine status type
// =============================================================================
export type ReimagineStatus = "pending" | "generating" | "done" | "failed";

// =============================================================================
/*
    ReimagineEntry : a single entry in a reimagine project
*/
// =============================================================================
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

// =============================================================================
/*
    ReimagineManifest : the complete manifest for a reimagine project
*/
// =============================================================================
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

// =============================================================================
// =============================================================================
