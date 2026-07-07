import type { ImageProvider, ImageProviderCapabilities, TextLLM } from "./types";
import { geminiImageProvider, geminiTextLLM } from "./gemini";
import { openaiImageProvider, openaiTextLLM } from "./openai";
import { qwenImageProvider } from "./qwen";
import { ollamaImageProvider, ollamaTextLLM } from "./ollama";
import { comfyuiImageProvider } from "./comfyui";
import { claudeTextLLM } from "./claude";

// ---- Descriptor type (for UI display) ----

export interface ProviderDescriptor {
  id: string;
  label: string;
  capabilities: ImageProviderCapabilities;
}

// ---- Image providers ----

const imageProviderMap: Record<string, ImageProvider> = {
  gemini: geminiImageProvider,
  openai: openaiImageProvider,
  qwen: qwenImageProvider,
  ollama: ollamaImageProvider,
  comfyui: comfyuiImageProvider,
};

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
    label: "ComfyUI (Qwen-Image)",
    capabilities: comfyuiImageProvider.capabilities,
  },
];

// ---- Text LLM providers ----

const textLLMMap: Record<string, TextLLM> = {
  gemini: geminiTextLLM,
  openai: openaiTextLLM,
  ollama: ollamaTextLLM,
  claude: claudeTextLLM,
};

export const TEXT_PROVIDERS = [
  { id: "gemini", label: "Gemini", model: "gemini-2.5-flash" },
  { id: "claude", label: "Claude", model: "claude-sonnet-4-20250514" },
  { id: "openai", label: "OpenAI", model: "gpt-4o-mini" },
  { id: "ollama", label: "Ollama (local)", model: "llama3" },
];

// ---- Lookup functions ----

export function getImageProviderAdapter(id: string): ImageProvider {
  const provider = imageProviderMap[id];
  if (!provider) throw new Error(`Unknown image provider: ${id}`);
  return provider;
}

export function getTextLLMAdapter(id: string): TextLLM {
  const llm = textLLMMap[id];
  if (!llm) throw new Error(`Unknown text LLM: ${id}`);
  return llm;
}

export function getImageProviderDescriptor(id: string): ProviderDescriptor | undefined {
  return IMAGE_PROVIDERS.find((p) => p.id === id);
}

export const getImageProvider = getImageProviderDescriptor;
