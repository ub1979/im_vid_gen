// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// Registry : central lookup for all image and text providers.
//            Maps provider IDs to adapter instances and UI descriptors.
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import type { ImageProvider, ImageProviderCapabilities, TextLLM } from "./types";
import { geminiImageProvider, geminiTextLLM } from "./gemini";
import { openaiImageProvider, openaiTextLLM } from "./openai";
import { qwenImageProvider } from "./qwen";
import { ollamaImageProvider, ollamaTextLLM } from "./ollama";
import { comfyuiImageProvider } from "./comfyui";
import { piapiImageProvider } from "./piapi";
import { claudeTextLLM } from "./claude";
// =============================================================================

// =============================================================================
/*
    ProviderDescriptor : UI-facing metadata for a provider
*/
// =============================================================================
export interface ProviderDescriptor {
  id: string;
  label: string;
  capabilities: ImageProviderCapabilities;
}

// =============================================================================
// Image provider map
// =============================================================================
const imageProviderMap: Record<string, ImageProvider> = {
  gemini: geminiImageProvider,
  openai: openaiImageProvider,
  qwen: qwenImageProvider,
  ollama: ollamaImageProvider,
  comfyui: comfyuiImageProvider,
  piapi: piapiImageProvider,
};

// =============================================================================
// Image provider descriptors for UI
// =============================================================================
export const IMAGE_PROVIDERS: ProviderDescriptor[] = [
  {
    id: "gemini",
    label: "Gemini - Nano Banana 2",
    capabilities: geminiImageProvider.capabilities,
  },
  {
    id: "openai",
    label: "OpenAI - gpt-image-1",
    capabilities: openaiImageProvider.capabilities,
  },
  {
    id: "qwen",
    label: "Qwen image editor",
    capabilities: qwenImageProvider.capabilities,
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    capabilities: ollamaImageProvider.capabilities,
  },
  {
    id: "comfyui",
    label: "ComfyUI (local GPU)",
    capabilities: comfyuiImageProvider.capabilities,
  },
  {
    id: "piapi",
    label: "PiAPI (Cloud)",
    capabilities: piapiImageProvider.capabilities,
  },
];

// =============================================================================
// Text LLM provider map
// =============================================================================
const textLLMMap: Record<string, TextLLM> = {
  gemini: geminiTextLLM,
  openai: openaiTextLLM,
  ollama: ollamaTextLLM,
  claude: claudeTextLLM,
};

// =============================================================================
// Text provider descriptors for UI
// =============================================================================
export const TEXT_PROVIDERS = [
  { id: "gemini", label: "Gemini", model: "gemini-2.5-flash" },
  { id: "claude", label: "Claude", model: "claude-sonnet-4-20250514" },
  { id: "openai", label: "OpenAI", model: "gpt-4o-mini" },
  { id: "ollama", label: "Ollama (local)", model: "llama3" },
];

// =============================================================================
// Function looks up an image provider adapter by ID -> string to ImageProvider
// =============================================================================
export function getImageProviderAdapter(id: string): ImageProvider {
  /*
      getImageProviderAdapter : returns the image provider for the given ID
      id variable : provider identifier string
  */
  const provider = imageProviderMap[id];
  // ==================================
  if (!provider) throw new Error(`Unknown image provider: ${id}`);
  // ==================================
  return provider;
}

// =============================================================================
// Function looks up a text LLM adapter by ID -> string to TextLLM
// =============================================================================
export function getTextLLMAdapter(id: string): TextLLM {
  /*
      getTextLLMAdapter : returns the text LLM for the given ID
      id variable : LLM identifier string
  */
  const llm = textLLMMap[id];
  // ==================================
  if (!llm) throw new Error(`Unknown text LLM: ${id}`);
  // ==================================
  return llm;
}

// =============================================================================
// Function looks up a provider descriptor by ID -> string to ProviderDescriptor | undefined
// =============================================================================
export function getImageProviderDescriptor(id: string): ProviderDescriptor | undefined {
  /*
      getImageProviderDescriptor : finds the UI descriptor for an image provider
      id variable : provider identifier string
  */
  return IMAGE_PROVIDERS.find((p) => p.id === id);
}

// =============================================================================
// Alias for backward compatibility
// =============================================================================
export const getImageProvider = getImageProviderDescriptor;

// =============================================================================
// =============================================================================
