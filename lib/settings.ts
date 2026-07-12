// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// Settings : centralized localStorage settings for the entire app.
//            Eliminates duplicated STORAGE_KEY / DEFAULTS / loadSettings
//            that was copy-pasted across 5+ pages.
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
// =============================================================================

// =============================================================================
// Constants
// =============================================================================
const STORAGE_KEY = "image_creator_settings";

export interface SettingsState {
  geminiKey: string;
  openaiKey: string;
  claudeKey: string;
  qwenKey: string;
  piapiKey: string;
  ollamaUrl: string;
  openaiBaseUrl: string;
  comfyuiUrl: string;
  defaultImageProvider: string;
  defaultImageModel: string;
  defaultTextProvider: string;
  defaultTextModel: string;
  defaultVideoProvider: string;
  defaultVideoModel: string;
  defaultKeyframes: number;
  maxImagesPerRun: number;
}

export const DEFAULTS: SettingsState = {
  geminiKey: "",
  openaiKey: "",
  claudeKey: "",
  qwenKey: "",
  piapiKey: "",
  ollamaUrl: "http://localhost:11434",
  openaiBaseUrl: "",
  comfyuiUrl: "http://localhost:8188",
  defaultImageProvider: "comfyui",
  defaultImageModel: "flux2_dev_fp8mixed.safetensors",
  defaultTextProvider: "ollama",
  defaultTextModel: "glm-5.2:cloud",
  defaultVideoProvider: "comfyui",
  defaultVideoModel: "wan-2.1",
  defaultKeyframes: 12,
  maxImagesPerRun: 0,
};

// =============================================================================
// Function loads settings from localStorage -> void to SettingsState
// =============================================================================
export function loadSettings(): SettingsState {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

// =============================================================================
// Function saves settings to localStorage -> SettingsState to void
// =============================================================================
export function saveSettings(s: SettingsState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

// =============================================================================
// Function resolves the API key for a given provider -> string to string
// =============================================================================
export function getApiKey(settings: SettingsState, providerId: string): string {
  const keyMap: Record<string, string> = {
    gemini: settings.geminiKey,
    openai: settings.openaiKey,
    claude: settings.claudeKey,
    qwen: settings.qwenKey,
    piapi: settings.piapiKey,
  };
  return keyMap[providerId] || "";
}

// =============================================================================
// Function builds request headers with auth and base URL -> object to Record
// =============================================================================
export function buildHeaders(
  settings: SettingsState,
  providerId: string,
  extra?: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  const key = getApiKey(settings, providerId);
  if (key) headers["x-provider-key"] = key;

  if (providerId === "ollama" && settings.ollamaUrl) {
    headers["x-base-url"] = settings.ollamaUrl;
  }
  if (providerId === "comfyui" && settings.comfyuiUrl) {
    headers["x-base-url"] = settings.comfyuiUrl;
  }
  if (providerId === "openai" && settings.openaiBaseUrl) {
    headers["x-base-url"] = settings.openaiBaseUrl;
  }
  return headers;
}

// =============================================================================
// Provider option lists (used by settings drawer and pages)
// =============================================================================
export const IMAGE_PROVIDER_OPTIONS = [
  { id: "gemini", label: "Gemini" },
  { id: "openai", label: "OpenAI" },
  { id: "qwen", label: "Qwen" },
  { id: "ollama", label: "Ollama (local)" },
  { id: "comfyui", label: "ComfyUI (local GPU)" },
  { id: "piapi", label: "PiAPI (Cloud)" },
];

export const TEXT_PROVIDER_OPTIONS = [
  { id: "gemini", label: "Gemini" },
  { id: "claude", label: "Claude" },
  { id: "openai", label: "OpenAI" },
  { id: "ollama", label: "Ollama (local)" },
];

// =============================================================================
// =============================================================================
