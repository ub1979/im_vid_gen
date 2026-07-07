import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

interface ModelResult {
  ok: boolean;
  models: string[];
  message: string;
  source?: string;
}

function envKey(name: string): string {
  return process.env[name] ?? "";
}

async function readGeminiOAuthToken(): Promise<string | null> {
  try {
    const credsPath = join(homedir(), ".gemini", "oauth_creds.json");
    const raw = await readFile(credsPath, "utf-8");
    const creds = JSON.parse(raw);
    return creds.access_token ?? null;
  } catch {
    return null;
  }
}

function resolveApiKey(
  provider: string,
  explicit: string,
): { key: string; source: string } {
  if (explicit) return { key: explicit, source: "settings" };

  const envMap: Record<string, string[]> = {
    gemini: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    openai: ["OPENAI_API_KEY"],
    claude: ["ANTHROPIC_API_KEY"],
    qwen: ["DASHSCOPE_API_KEY"],
  };

  for (const varName of envMap[provider] ?? []) {
    const val = envKey(varName);
    if (val) return { key: val, source: `env:${varName}` };
  }

  return { key: "", source: "none" };
}

async function fetchOllamaModels(baseUrl: string): Promise<ModelResult> {
  try {
    const resp = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) {
      return { ok: false, models: [], message: `Ollama returned ${resp.status}` };
    }
    const data = await resp.json();
    const models: string[] = (data.models ?? []).map(
      (m: { name: string }) => m.name,
    );
    if (models.length === 0) {
      return {
        ok: false,
        models: [],
        message: "No models installed. Run: ollama pull <model>",
      };
    }
    return { ok: true, models, message: `Found ${models.length} models` };
  } catch (err) {
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

async function fetchOpenAICompatModels(
  baseUrl: string,
  apiKey: string,
  label: string,
): Promise<ModelResult> {
  try {
    let url = baseUrl.replace(/\/+$/, "");
    if (!url.endsWith("/v1")) url += "/v1";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    const resp = await fetch(`${url}/models`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
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

async function fetchAnthropicModels(apiKey: string): Promise<ModelResult> {
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

async function fetchGeminiModels(apiKey: string): Promise<ModelResult> {
  if (!apiKey) {
    const oauthToken = await readGeminiOAuthToken();
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

async function fetchGeminiModelsWithOAuth(token: string): Promise<ModelResult> {
  try {
    const resp = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models",
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!resp.ok) {
      return {
        ok: false,
        models: [],
        message: "Gemini CLI OAuth token lacks API scope. Enter an API key instead.",
        source: "gemini-cli (insufficient scope)",
      };
    }
    const data = await resp.json();
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

const QWEN_IMAGE_MODELS = [
  "wanx-v1",
  "wanx2.1-t2i-turbo",
  "wanx2.1-t2i-plus",
];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const provider = url.searchParams.get("provider");
  const explicitKey = request.headers.get("x-provider-key") ?? "";
  const baseUrl = url.searchParams.get("baseUrl") ?? "";

  if (!provider) {
    return NextResponse.json(
      { error: "provider query param required" },
      { status: 400 },
    );
  }

  const { key: apiKey, source } = resolveApiKey(provider, explicitKey);

  let result: ModelResult;

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

  if (source !== "none" && source !== "settings") {
    result.source = result.source ?? source;
  }

  return NextResponse.json(result);
}
