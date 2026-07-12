// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// Types : shared interfaces for image providers, text LLMs, and generation
//         requests/results used across all provider implementations
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import type { CharacterRef } from "@/lib/types";
// =============================================================================

// =============================================================================
/*
    ImageProviderCapabilities : describes what an image provider can do
*/
// =============================================================================
export interface ImageProviderCapabilities {
  supports_reference_edit: boolean;
  max_reference_images: number;
  supports_text_to_image: boolean;
}

// =============================================================================
/*
    ImageProvider : adapter interface for generating images
*/
// =============================================================================
export interface ImageProvider {
  id: string;
  capabilities: ImageProviderCapabilities;
  generate(req: ImageGenRequest): Promise<ImageGenResult>;
}

// =============================================================================
/*
    ImageGenRequest : input payload for image generation
*/
// =============================================================================
export interface ImageGenRequest {
  prompt: string;
  referenceImages?: Buffer[];
  charactersUsed: CharacterRef[];
  apiKey?: string;
  baseUrl?: string;
  model: string;
  aspectRatio?: string;
}

// =============================================================================
/*
    ImageGenResult : output from an image generation call
*/
// =============================================================================
export interface ImageGenResult {
  image: Buffer;
  mime: string;
  mode: "reference_edit" | "text_to_image";
}

// =============================================================================
/*
    TextGenWithImagesRequest : text generation request that includes images
*/
// =============================================================================
export interface TextGenWithImagesRequest extends TextGenRequest {
  images: { data: Buffer; mimeType: string }[];
}

// =============================================================================
/*
    TextLLM : adapter interface for text language models
*/
// =============================================================================
export interface TextLLM {
  id: string;
  segment(req: SegmentRequest): Promise<Scene[]>;
  generateText?(req: TextGenRequest): Promise<string>;
  generateTextWithImages?(req: TextGenWithImagesRequest): Promise<string>;
}

// =============================================================================
/*
    TextGenRequest : input payload for text generation
*/
// =============================================================================
export interface TextGenRequest {
  systemPrompt: string;
  userPrompt: string;
  apiKey?: string;
  baseUrl?: string;
  model: string;
}

// =============================================================================
/*
    SegmentRequest : input for segmenting text into timed scenes
*/
// =============================================================================
export interface SegmentRequest {
  text: string;
  characters: { label: string; description?: string; hasImage?: boolean }[];
  sceneCount: number;
  intervalSeconds: number;
  apiKey?: string;
  baseUrl?: string;
  model: string;
  imageProviderId?: string;
}

// =============================================================================
/*
    Scene : a single scene output from segmentation
*/
// =============================================================================
export interface Scene {
  index: number;
  time_start: number;
  time_end: number;
  lyric_excerpt: string;
  prompt: string;
  characters_used: string[];
}

// =============================================================================
// =============================================================================
