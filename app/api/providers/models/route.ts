// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// providers/models route : fetches available models from the specified AI
//                          provider. Supports Ollama, OpenAI, Claude,
//                          Gemini, Qwen, ComfyUI, and PiAPI. Resolves
//                          API keys from settings or environment.
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
// =============================================================================

// =============================================================================
// Interfaces
// =============================================================================
interface ModelResult {
  ok: boolean;
  models: string[];
  message: string;
  source?: string;
}

// =============================================================================
// Function reads an environment variable by name -> name to string
// =============================================================================
function envKey(name: string): string {
  /*
      envKey : returns the value of an env var or empty string
      name variable : environment variable name to look up
  */
  return process.env[name] ?? "";
}

// =============================================================================
// Function reads Gemini OAuth token from disk -> void to string | null
// =============================================================================
async function readGeminiOAuthToken(): Promise<string | null> {
  /*
      readGeminiOAuthToken : reads ~/.gemini/oauth_creds.json for access_token
  */
  try {
    const credsPath = join(homedir(), ".gemini", "oauth_creds.json");
    const raw = await readFile(credsPath, "utf-8");
    const creds = JSON.parse(raw);
    return creds.access_token ?? null;
  } catch {
    return null;
  }
}

// =============================================================================
// Function resolves API key from explicit value or environment -> provider, explicit to { key, source }
// =============================================================================
function resolveApiKey(
  provider: string,
  explicit: string,
): { key: string; source: string } {
  /*
      resolveApiKey : checks explicit key first, then env vars for the provider
      provider variable : provider id (gemini, openai, claude, qwen)
      explicit variable : explicitly provided API key from settings
  */
  // ==================================
  if (explicit) return { key: explicit, source: "settings" };

  // =====================================
  // Map providers to their environment variable names
  // =====================================
  const envMap: Record<string, string[]> = {
    gemini: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    openai: ["OPENAI_API_KEY"],
    claude: ["ANTHROPIC_API_KEY"],
    qwen: ["DASHSCOPE_API_KEY"],
  };

  for (const varName of envMap[provider] ?? []) {
    const val = envKey(varName);
    // ==================================
    if (val) return { key: val, source: `env:${varName}` };
  }

  return { key: "", source: "none" };
}

// =============================================================================
// Function fetches model list from Ollama -> baseUrl to ModelResult
// =============================================================================
async function fetchOllamaModels(baseUrl: string): Promise<ModelResult> {
  /*
      fetchOllamaModels : queries Ollama /api/tags endpoint for installed models
      baseUrl variable : Ollama server base URL (default localhost:11434)
  */
  try {
    const resp = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    // ==================================
    if (!resp.ok) {
      return { ok: false, models: [], message: `Ollama returned ${resp.status}` };
    }
    const data = await resp.json();
    const models: string[] = (data.models ?? []).map(
      (m: { name: string }) => m.name,
    );
    // ==================================
    if (models.length === 0) {
      return {
        ok: false,
        models: [],
        message: "No models installed. Run: ollama pull <model>",
      };
    }
    return { ok: true, models, message: `Found ${models.length} models` };
  } catch (err) {
    // ==================================
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return { ok: false, models: [], message: "Connection timed out" };
    }
    return {
      ok: false,
      models: [],
      message: "Cannot connect to Ollama. Is it running?",
    };
  }
}

// =============================================================================
// Function fetches models from OpenAI-compatible API -> baseUrl, apiKey, label to ModelResult
// =============================================================================
async function fetchOpenAICompatModels(
  baseUrl: string,
  apiKey: string,
  label: string,
): Promise<ModelResult> {
  /*
      fetchOpenAICompatModels : queries /v1/models on any OpenAI-compatible server
      baseUrl variable : API server base URL
      apiKey variable : Bearer token for authentication
      label variable : display name for error messages (e.g. "OpenAI")
  */
  try {
    // =====================================
    // Ensure URL ends with /v1
    // =====================================
    let url = baseUrl.replace(/\/+$/, "");
    // ==================================
    if (!url.endsWith("/v1")) url += "/v1";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    // ==================================
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    const resp = await fetch(`${url}/models`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    // ==================================
    if (!resp.ok) {
      return {
        ok: false,
        models: [],
        message: `${label} returned ${resp.status}`,
      };
    }
    const data = await resp.json();
    const models: string[] = (data.data ?? []).map(
      (m: { id: string }) => m.id,
    );
    return {
      ok: models.length > 0,
      models,
      message: models.length ? `Found ${models.length} models` : "No models",
    };
  } catch {
    return {
      ok: false,
      models: [],
      message: `Cannot connect to ${label}`,
    };
  }
}

// =============================================================================
// Function fetches models from Anthropic API -> apiKey to ModelResult
// =============================================================================
async function fetchAnthropicModels(apiKey: string): Promise<ModelResult> {
  /*
      fetchAnthropicModels : queries Anthropic /v1/models endpoint
      apiKey variable : Anthropic API key
  */
  // ==================================
  if (!apiKey) {
    return {
      ok: false,
      models: [],
      message: "No API key found. Set ANTHROPIC_API_KEY or enter key in settings.",
    };
  }
  try {
    const resp = await fetch("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      signal: AbortSignal.timeout(5000),
    });
    // ==================================
    if (!resp.ok) {
      return {
        ok: false,
        models: [],
        message: `Anthropic returned ${resp.status}`,
      };
    }
    const data = await resp.json();
    const models: string[] = (data.data ?? []).map(
      (m: { id: string }) => m.id,
    );
    return {
      ok: models.length > 0,
      models,
      message: models.length
        ? `Found ${models.length} models from Anthropic API`
        : "No models returned",
    };
  } catch {
    return {
      ok: false,
      models: [],
      message: "Cannot connect to Anthropic API",
    };
  }
}

// =============================================================================
// Function fetches models from Gemini API -> apiKey to ModelResult
// =============================================================================
async function fetchGeminiModels(apiKey: string): Promise<ModelResult> {
  /*
      fetchGeminiModels : queries Gemini API for available models, falls back to OAuth
      apiKey variable : Gemini API key (if empty, tries OAuth token)
  */
  // ==================================
  if (!apiKey) {
    // =====================================
    // Fall back to Gemini CLI OAuth token
    // =====================================
    const oauthToken = await readGeminiOAuthToken();
    // ==================================
    if (oauthToken) {
      return fetchGeminiModelsWithOAuth(oauthToken);
    }
    return {
      ok: false,
      models: [],
      message: "No API key found. Set GEMINI_API_KEY or enter key in settings.",
    };
  }
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      { signal: AbortSignal.timeout(5000) },
    );
    // ==================================
    if (!resp.ok) {
      let detail = "";
      try {
        const err = await resp.json();
        detail = err?.error?.message ?? "";
      } catch { /* ignore */ }
      return {
        ok: false,
        models: [],
        message: detail || `Gemini returned ${resp.status}`,
      };
    }
    const data = await resp.json();
    // =====================================
    // Filter to gemini-prefixed models only
    // =====================================
    const models: string[] = (data.models ?? [])
      .map((m: { name: string }) => m.name.replace("models/", ""))
      .filter((name: string) => name.startsWith("gemini"));
    return {
      ok: models.length > 0,
      models,
      message: models.length
        ? `Found ${models.length} models from Gemini API`
        : "No models returned",
    };
  } catch {
    return {
      ok: false,
      models: [],
      message: "Cannot connect to Gemini API",
    };
  }
}

// =============================================================================
// Function fetches Gemini models using OAuth token -> token to ModelResult
// =============================================================================
async function fetchGeminiModelsWithOAuth(token: string): Promise<ModelResult> {
  /*
      fetchGeminiModelsWithOAuth : queries Gemini API using Gemini CLI OAuth bearer token
      token variable : OAuth access token from ~/.gemini/oauth_creds.json
  */
  try {
    const resp = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models",
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      },
    );
    // ==================================
    if (!resp.ok) {
      return {
        ok: false,
        models: [],
        message: "Gemini CLI OAuth token lacks API scope. Enter an API key instead.",
        source: "gemini-cli (insufficient scope)",
      };
    }
    const data = await resp.json();
    // =====================================
    // Filter to gemini-prefixed models only
    // =====================================
    const models: string[] = (data.models ?? [])
      .map((m: { name: string }) => m.name.replace("models/", ""))
      .filter((name: string) => name.startsWith("gemini"));
    return {
      ok: models.length > 0,
      models,
      message: `Found ${models.length} models via Gemini CLI OAuth`,
      source: "gemini-cli",
    };
  } catch {
    return {
      ok: false,
      models: [],
      message: "Gemini CLI OAuth failed. Enter an API key instead.",
    };
  }
}

// =============================================================================
// Constants
// =============================================================================
const QWEN_IMAGE_MODELS = [
  "wanx-v1",
  "wanx2.1-t2i-turbo",
  "wanx2.1-t2i-plus",
];

// =============================================================================
// Function handles GET to list models for a provider -> Request to NextResponse
// =============================================================================
export async function GET(request: Request) {
  /*
      GET : returns available models for the specified provider
      request variable : incoming HTTP request with provider query param and optional headers
  */
  const url = new URL(request.url);
  const provider = url.searchParams.get("provider");
  const explicitKey = request.headers.get("x-provider-key") ?? "";
  const baseUrl = url.searchParams.get("baseUrl") ?? "";

  // ==================================
  if (!provider) {
    return NextResponse.json(
      { error: "provider query param required" },
      { status: 400 },
    );
  }

  // =====================================
  // Resolve API key from settings or environment
  // =====================================
  const { key: apiKey, source } = resolveApiKey(provider, explicitKey);

  let result: ModelResult;

  // =====================================
  // Dispatch to provider-specific fetch function
  // =====================================
  switch (provider) {
    case "ollama":
      result = await fetchOllamaModels(baseUrl || "http://localhost:11434");
      break;

    case "openai":
      result = await fetchOpenAICompatModels(
        baseUrl || "https://api.openai.com",
        apiKey,
        "OpenAI",
      );
      break;

    case "claude":
      result = await fetchAnthropicModels(apiKey);
      break;

    case "gemini":
      result = await fetchGeminiModels(apiKey);
      break;

    case "qwen":
      result = {
        ok: true,
        models: QWEN_IMAGE_MODELS,
        message: "Qwen image models",
      };
      break;

    case "comfyui":
      try {
        const comfyBase = baseUrl || "http://localhost:8188";
        const { fetchComfyUIModels } = await import("@/lib/providers/comfyui");
        const models = await fetchComfyUIModels(comfyBase);
        result = {
          ok: models.length > 0,
          models,
          message: models.length > 0 ? "ComfyUI checkpoints" : "No checkpoints found. Is ComfyUI running?",
        };
      } catch {
        result = {
          ok: false,
          models: [],
          message: "Cannot connect to ComfyUI. Check the URL and ensure ComfyUI is running.",
        };
      }
      break;

    case "piapi":
      {
        const { fetchPiAPIImageModels } = await import("@/lib/providers/piapi");
        const models = fetchPiAPIImageModels();
        result = {
          ok: true,
          models,
          message: "PiAPI image models",
        };
      }
      break;

    default:
      result = {
        ok: false,
        models: [],
        message: `Unknown provider: ${provider}`,
      };
  }

  // =====================================
  // Attach key source metadata if resolved from env
  // =====================================
  if (source !== "none" && source !== "settings") {
    result.source = result.source ?? source;
  }

  return NextResponse.json(result);
}

// =============================================================================
// =============================================================================
