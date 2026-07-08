"use client";

import { useEffect, useState, useCallback } from "react";

interface SettingsState {
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

interface ModelCache {
  [provider: string]: {
    models: string[];
    loading: boolean;
    error: string | null;
  };
}

const STORAGE_KEY = "image_creator_settings";

const DEFAULTS: SettingsState = {
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

const IMAGE_PROVIDER_OPTIONS = [
  { id: "gemini", label: "Gemini" },
  { id: "openai", label: "OpenAI" },
  { id: "qwen", label: "Qwen" },
  { id: "ollama", label: "Ollama (local)" },
  { id: "comfyui", label: "ComfyUI (local GPU)" },
  { id: "piapi", label: "PiAPI (Cloud)" },
];

const VIDEO_PROVIDER_OPTIONS = [
  { id: "comfyui", label: "ComfyUI Wan 2.1 (local GPU)" },
  { id: "piapi-kling", label: "PiAPI - Kling" },
  { id: "piapi-hailuo", label: "PiAPI - Hailuo (Minimax)" },
  { id: "piapi-seedance", label: "PiAPI - Seedance 2.0" },
];

const TEXT_PROVIDER_OPTIONS = [
  { id: "gemini", label: "Gemini" },
  { id: "claude", label: "Claude" },
  { id: "openai", label: "OpenAI" },
  { id: "ollama", label: "Ollama (local)" },
];

function loadSettings(): SettingsState {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

function saveSettings(s: SettingsState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsState>(DEFAULTS);
  const [saved, setSaved] = useState(false);
  const [modelCache, setModelCache] = useState<ModelCache>({});

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  function update(partial: Partial<SettingsState>) {
    setSettings((prev) => ({ ...prev, ...partial }));
    setSaved(false);
  }

  function handleSave() {
    saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const fetchModels = useCallback(
    async (provider: string) => {
      setModelCache((prev) => ({
        ...prev,
        [provider]: { models: [], loading: true, error: null },
      }));

      const params = new URLSearchParams({ provider });

      if (provider === "ollama" && settings.ollamaUrl) {
        params.set("baseUrl", settings.ollamaUrl);
      }
      if (provider === "openai" && settings.openaiBaseUrl) {
        params.set("baseUrl", settings.openaiBaseUrl);
      }
      if (provider === "comfyui" && settings.comfyuiUrl) {
        params.set("baseUrl", settings.comfyuiUrl);
      }

      const keyMap: Record<string, string> = {
        gemini: settings.geminiKey,
        openai: settings.openaiKey,
        claude: settings.claudeKey,
        qwen: settings.qwenKey,
        piapi: settings.piapiKey,
      };
      const apiKey = keyMap[provider] ?? "";

      try {
        const headers: Record<string, string> = {};
        if (apiKey) headers["x-provider-key"] = apiKey;
        const resp = await fetch(`/api/providers/models?${params}`, { headers });
        const data = await resp.json();
        setModelCache((prev) => ({
          ...prev,
          [provider]: {
            models: data.models ?? [],
            loading: false,
            error: data.ok ? null : data.message,
          },
        }));
      } catch {
        setModelCache((prev) => ({
          ...prev,
          [provider]: {
            models: [],
            loading: false,
            error: "Failed to fetch models",
          },
        }));
      }
    },
    [settings],
  );

  const modelsFor = (provider: string) => modelCache[provider];

  function renderModelSelect(
    provider: string,
    value: string,
    onChange: (model: string) => void,
    label: string,
  ) {
    const cache = modelsFor(provider);
    const models = cache?.models ?? [];
    const hasModels = models.length > 0;

    return (
      <div className="field" style={{ marginTop: "8px" }}>
        <label>{label}</label>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {hasModels ? (
            <select
              value={value}
              onChange={(e) => onChange(e.target.value)}
              style={{ flex: 1 }}
            >
              <option value="">-- select model --</option>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              placeholder="Enter model name or fetch models"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              style={{ flex: 1 }}
            />
          )}
          <button
            className="btn"
            onClick={() => fetchModels(provider)}
            disabled={cache?.loading}
            style={{ whiteSpace: "nowrap" }}
          >
            {cache?.loading ? "..." : "Fetch"}
          </button>
        </div>
        {cache?.error && (
          <span style={{ color: "var(--fail)", fontSize: "12px" }}>
            {cache.error}
          </span>
        )}
        {hasModels && !cache?.error && (
          <span
            className="muted"
            style={{ fontSize: "12px" }}
          >
            {models.length} model{models.length !== 1 ? "s" : ""} available
          </span>
        )}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "680px", margin: "24px auto", padding: "0 16px" }}>
      <div className="panel" style={{ marginBottom: "16px" }}>
        <h2>API Keys (Bring Your Own)</h2>
        <p
          className="muted"
          style={{ marginTop: 0, marginBottom: "12px", fontSize: "12px" }}
        >
          Keys are stored locally in your browser and only sent to the provider
          you choose. They never leave your machine except to that provider.
        </p>

        <div className="field">
          <label>Google / Gemini API key</label>
          <input
            type="password"
            placeholder="AIza..."
            value={settings.geminiKey}
            onChange={(e) => update({ geminiKey: e.target.value })}
          />
        </div>

        <div className="field">
          <label>OpenAI API key</label>
          <input
            type="password"
            placeholder="sk-..."
            value={settings.openaiKey}
            onChange={(e) => update({ openaiKey: e.target.value })}
          />
        </div>

        <div className="field">
          <label>Anthropic / Claude API key</label>
          <input
            type="password"
            placeholder="sk-ant-..."
            value={settings.claudeKey}
            onChange={(e) => update({ claudeKey: e.target.value })}
          />
        </div>

        <div className="field">
          <label>Qwen / DashScope API key</label>
          <input
            type="password"
            placeholder="sk-..."
            value={settings.qwenKey}
            onChange={(e) => update({ qwenKey: e.target.value })}
          />
        </div>

        <div className="field">
          <label>PiAPI API key</label>
          <input
            type="password"
            placeholder="pi-..."
            value={settings.piapiKey}
            onChange={(e) => update({ piapiKey: e.target.value })}
          />
          <span className="muted" style={{ fontSize: "12px" }}>
            For cloud video (Kling, Hailuo, Seedance) and image (Flux, Midjourney) generation
          </span>
        </div>

        <div className="note">
          For Ollama, no key needed — just set the base URL below.
        </div>
      </div>

      <div className="panel" style={{ marginBottom: "16px" }}>
        <h2>Endpoints (optional overrides)</h2>

        <div className="field">
          <label>Ollama base URL</label>
          <input
            type="text"
            value={settings.ollamaUrl}
            onChange={(e) => update({ ollamaUrl: e.target.value })}
          />
        </div>

        <div className="field">
          <label>OpenAI-compatible base URL (optional)</label>
          <input
            type="text"
            placeholder="https://api.openai.com/v1"
            value={settings.openaiBaseUrl}
            onChange={(e) => update({ openaiBaseUrl: e.target.value })}
          />
        </div>

        <div className="field">
          <label>ComfyUI base URL</label>
          <input
            type="text"
            value={settings.comfyuiUrl}
            onChange={(e) => update({ comfyuiUrl: e.target.value })}
          />
          <span className="muted" style={{ fontSize: "12px" }}>
            Use SSH tunnel: ssh -L 8188:localhost:8188 user@gpu-machine -N
          </span>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: "16px" }}>
        <h2>Default Image Provider</h2>

        <div className="field">
          <label>Provider</label>
          <select
            value={settings.defaultImageProvider}
            onChange={(e) =>
              update({ defaultImageProvider: e.target.value, defaultImageModel: "" })
            }
          >
            {IMAGE_PROVIDER_OPTIONS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {renderModelSelect(
          settings.defaultImageProvider,
          settings.defaultImageModel,
          (m) => update({ defaultImageModel: m }),
          "Image model",
        )}
      </div>

      <div className="panel" style={{ marginBottom: "16px" }}>
        <h2>Default Video Provider</h2>

        <div className="field">
          <label>Provider</label>
          <select
            value={settings.defaultVideoProvider}
            onChange={(e) =>
              update({ defaultVideoProvider: e.target.value, defaultVideoModel: "" })
            }
          >
            {VIDEO_PROVIDER_OPTIONS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Video model / version</label>
          <input
            type="text"
            placeholder="e.g. wan-2.1, 2.6, v2.3"
            value={settings.defaultVideoModel}
            onChange={(e) => update({ defaultVideoModel: e.target.value })}
          />
          <span className="muted" style={{ fontSize: "12px" }}>
            ComfyUI: wan-2.1 &middot; Kling: 2.6, 2.5 &middot; Hailuo: v2.3, v2.3-fast
          </span>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: "16px" }}>
        <h2>Default Text LLM</h2>

        <div className="field">
          <label>Provider</label>
          <select
            value={settings.defaultTextProvider}
            onChange={(e) =>
              update({ defaultTextProvider: e.target.value, defaultTextModel: "" })
            }
          >
            {TEXT_PROVIDER_OPTIONS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {renderModelSelect(
          settings.defaultTextProvider,
          settings.defaultTextModel,
          (m) => update({ defaultTextModel: m }),
          "Text model",
        )}
      </div>

      <div className="panel">
        <h2>Generation Limits</h2>

        <div className="field">
          <label>Default target keyframes</label>
          <input
            type="number"
            value={settings.defaultKeyframes}
            min={1}
            onChange={(e) =>
              update({ defaultKeyframes: Number(e.target.value) || 12 })
            }
          />
        </div>

        <div className="field">
          <label>Max images per run (safety, 0 = off)</label>
          <input
            type="number"
            value={settings.maxImagesPerRun}
            min={0}
            onChange={(e) =>
              update({ maxImagesPerRun: Number(e.target.value) || 0 })
            }
          />
        </div>

        <div style={{ marginTop: "12px" }}>
          <button className="btn btn-primary" onClick={handleSave}>
            {saved ? "Saved!" : "Save settings"}
          </button>
        </div>
      </div>
    </div>
  );
}
