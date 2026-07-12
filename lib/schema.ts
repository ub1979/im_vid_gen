// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// Schema : Zod validation schemas for all API request bodies
//          (projects, scenes, uploads, reimagine).
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import { z } from "zod";
import { MAX_UPLOAD_BYTES, MAX_PROMPT_LENGTH } from "./security";
// =============================================================================

// =============================================================================
// Project schemas
// =============================================================================
export const providerConfigSchema = z.object({
  image: z.object({ id: z.string(), model: z.string() }),
  text: z.object({ id: z.string(), model: z.string() }),
});

export const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  provider: providerConfigSchema.optional(),
});

export const projectSlugSchema = z.string().regex(/^[a-z0-9-]+$/);

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  durationSeconds: z.number().positive().optional(),
  intervalSeconds: z.number().positive().optional(),
  text: z.string().optional(),
  theme: z.enum(["dark", "light"]).optional(),
  provider: providerConfigSchema.optional(),
});

// =============================================================================
// Scene schemas
// =============================================================================
export const sceneArraySchema = z.array(
  z.object({
    index: z.number().int().min(0),
    time_start: z.number().min(0),
    time_end: z.number().min(0),
    lyric_excerpt: z.string(),
    prompt: z.string(),
    characters_used: z.array(z.string()),
  })
);

// =============================================================================
// Upload schemas
// =============================================================================
export const uploadSchema = z.object({
  size: z.number().max(MAX_UPLOAD_BYTES),
  mime: z.enum(["image/png", "image/jpeg", "image/webp"]),
});

// =============================================================================
// Prompt schema
// =============================================================================
export const promptSchema = z.string().max(MAX_PROMPT_LENGTH);

// =============================================================================
// Reimagine schemas
// =============================================================================
export const reimagineCreateSchema = z.object({
  name: z.string().min(1).max(200),
  provider: providerConfigSchema.optional(),
});

export const reimagineStyleSchema = z.object({
  styleMode: z.enum(["preset", "reference"]),
  stylePreset: z.string().max(200).optional(),
  styleDescription: z.string().max(2000).optional(),
});

export const reimagineCharacterSchema = z.object({
  label: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});

export const reimagineEntryUpdateSchema = z.object({
  reimaginedPrompt: z.string().max(MAX_PROMPT_LENGTH).optional(),
  characters_used: z.array(z.string()).optional(),
});

// =============================================================================
// =============================================================================
