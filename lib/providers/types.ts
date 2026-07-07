import type { CharacterRef } from "@/lib/types";

export interface ImageProviderCapabilities {
  supports_reference_edit: boolean;
  max_reference_images: number;
  supports_text_to_image: boolean;
}

export interface ImageProvider {
  id: string;
  capabilities: ImageProviderCapabilities;
  generate(req: ImageGenRequest): Promise<ImageGenResult>;
}

export interface ImageGenRequest {
  prompt: string;
  referenceImages?: Buffer[];
  charactersUsed: CharacterRef[];
  apiKey?: string;
  baseUrl?: string;
  model: string;
  aspectRatio?: string;
}

export interface ImageGenResult {
  image: Buffer;
  mime: string;
  mode: "reference_edit" | "text_to_image";
}

export interface TextGenWithImagesRequest extends TextGenRequest {
  images: { data: Buffer; mimeType: string }[];
}

export interface TextLLM {
  id: string;
  segment(req: SegmentRequest): Promise<Scene[]>;
  generateText?(req: TextGenRequest): Promise<string>;
  generateTextWithImages?(req: TextGenWithImagesRequest): Promise<string>;
}

export interface TextGenRequest {
  systemPrompt: string;
  userPrompt: string;
  apiKey?: string;
  baseUrl?: string;
  model: string;
}

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

export interface Scene {
  index: number;
  time_start: number;
  time_end: number;
  lyric_excerpt: string;
  prompt: string;
  characters_used: string[];
}
