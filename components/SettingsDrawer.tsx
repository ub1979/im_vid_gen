"use client";
// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// SettingsDrawer : slide-in settings panel replacing the settings page.
//                  Opens from any page via sidebar gear icon.
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import { useEffect, useState, useCallback } from "react";
import {
  loadSettings,
  saveSettings,
  getApiKey,
  DEFAULTS,
  IMAGE_PROVIDER_OPTIONS,
  TEXT_PROVIDER_OPTIONS,
} from "@/lib/settings";
import type { SettingsState } from "@/lib/settings";
import { PIAPI_VIDEO_CATALOG, findModelDef } from "@/lib/piapi-video-catalog";
// =============================================================================

// =============================================================================
/*
    SettingsDrawerProps : props for the settings drawer component
    open variable : whether the drawer is visible
    onClose variable : callback to close the drawer
*/
// =============================================================================
interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
}

// =============================================================================
/*
    ModelCache : cache of fetched models per provider
    [provider] variable : provider key mapping to model list, loading state, and error
*/
// =============================================================================
interface ModelCache {
  [provider: string]: {
    models: string[];
    loading: boolean;
    error: string | null;
  };
}

// =============================================================================
// Function SettingsDrawer -> props to JSX
// =============================================================================
export default function SettingsDrawer({ open, onClose }: SettingsDrawerProps) {
  /*
      SettingsDrawer : slide-in settings panel with API keys, providers, and generation config
      open variable : whether the drawer is currently visible
      onClose variable : callback to close the drawer
  */

  // =====================================
  // State
  // =====================================
  const [settings, setSettings] = useState<SettingsState>(DEFAULTS);
  const [saved, setSaved] = useState(false);
  const [modelCache, setModelCache] = useState<ModelCache>({});

  // =====================================
  // Load settings when drawer opens
  // =====================================
  useEffect(() => {
    // ==================================
    if (open) {
      setSettings(loadSettings());
      setSaved(false);
    }
  }, [open]);

  // =====================================
  // Close on Escape key
  // =====================================
  useEffect(() => {
    // ==================================
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      // ==================================
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  // =============================================================================
  // Function updates a partial settings object -> Partial<SettingsState> to void
  // =============================================================================
  function update(partial: Partial<SettingsState>) {
    /*
        update : merges partial settings into current state
        partial variable : partial settings object to merge
    */
    setSettings((prev) => ({ ...prev, ...partial }));
    setSaved(false);
  }

  // =============================================================================
  // Function saves current settings to localStorage -> void to void
  // =============================================================================
  function handleSave() {
    /*
        handleSave : persists settings and shows confirmation
    */
    saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  // =============================================================================
  // Function fetches available models for a provider -> string to void
  // =============================================================================
  const fetchModels = useCallback(
    async (provider: string) => {
      /*
          fetchModels : fetches model list from the provider API
          provider variable : provider identifier string
      */
      setModelCache((prev) => ({
        ...prev,
        [provider]: { models: [], loading: true, error: null },
      }));

      const params = new URLSearchParams({ provider });

      // ==================================
      if (provider === "ollama" && settings.ollamaUrl) {
        params.set("baseUrl", settings.ollamaUrl);
      }
      // ==================================
      if (provider === "openai" && settings.openaiBaseUrl) {
        params.set("baseUrl", settings.openaiBaseUrl);
      }
      // ==================================
      if (provider === "comfyui" && settings.comfyuiUrl) {
        params.set("baseUrl", settings.comfyuiUrl);
      }

      const apiKey = getApiKey(settings, provider);

      try {
        const headers: Record<string, string> = {};
        // ==================================
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

  // =============================================================================
  // Function renders a model select with fetch button -> params to JSX
  // =============================================================================
  function renderModelSelect(
    provider: string,
    value: string,
    onChange: (model: string) => void,
    label: string,
  ) {
    /*
        renderModelSelect : renders a model selector with fetch capability
        provider variable : provider identifier for fetching models
        value variable : currently selected model name
        onChange variable : callback when model selection changes
        label variable : display label for the field
    */
    const cache = modelCache[provider];
    const models = cache?.models ?? [];
    const hasModels = models.length > 0;

    return (
      <div className="settings-field">
        <span className="label">{label}</span>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          {/* ==================================
              Model select or text input
              ================================== */}
          {hasModels ? (
            <select
              value={value}
              onChange={(e) => onChange(e.target.value)}
              style={{ flex: 1 }}
            >
              <option value="">-- select model --</option>
              {models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              placeholder="Enter model name or fetch"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              style={{ flex: 1 }}
            />
          )}
          <button
            className="btn btn-sm"
            onClick={() => fetchModels(provider)}
            disabled={cache?.loading}
            style={{ whiteSpace: "nowrap" }}
          >
            {cache?.loading ? "..." : "Fetch"}
          </button>
        </div>
        {/* ==================================
            Error message
            ================================== */}
        {cache?.error && (
          <span style={{ color: "var(--danger)", fontSize: "11px" }}>{cache.error}</span>
        )}
        {/* ==================================
            Model count
            ================================== */}
        {hasModels && !cache?.error && (
          <span style={{ color: "var(--text-2)", fontSize: "11px" }}>
            {models.length} model{models.length !== 1 ? "s" : ""} available
          </span>
        )}
      </div>
    );
  }

  // ==================================
  if (!open) return null;

  // =====================================
  // Render
  // =====================================
  return (
    <div
      className="settings-overlay open"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="settings-drawer">
        {/* =====================================
            Header
            ===================================== */}
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* =====================================
            API Keys
            ===================================== */}
        <div className="settings-section">
          <h3>API Keys</h3>
          <p style={{ color: "var(--text-2)", fontSize: "11px", marginBottom: "10px" }}>
            Stored locally — only sent to the provider you choose.
          </p>

          <div className="settings-field">
            <span className="label">Google / Gemini</span>
            <input
              type="password"
              placeholder="AIza..."
              value={settings.geminiKey}
              onChange={(e) => update({ geminiKey: e.target.value })}
            />
          </div>

          <div className="settings-field">
            <span className="label">OpenAI</span>
            <input
              type="password"
              placeholder="sk-..."
              value={settings.openaiKey}
              onChange={(e) => update({ openaiKey: e.target.value })}
            />
          </div>

          <div className="settings-field">
            <span className="label">Anthropic / Claude</span>
            <input
              type="password"
              placeholder="sk-ant-..."
              value={settings.claudeKey}
              onChange={(e) => update({ claudeKey: e.target.value })}
            />
          </div>

          <div className="settings-field">
            <span className="label">Qwen / DashScope</span>
            <input
              type="password"
              placeholder="sk-..."
              value={settings.qwenKey}
              onChange={(e) => update({ qwenKey: e.target.value })}
            />
          </div>

          <div className="settings-field">
            <span className="label">PiAPI</span>
            <input
              type="password"
              placeholder="pi-..."
              value={settings.piapiKey}
              onChange={(e) => update({ piapiKey: e.target.value })}
            />
            <span style={{ color: "var(--text-2)", fontSize: "11px" }}>
              Cloud video (Kling, Hailuo, Seedance) and image (Flux, Midjourney)
            </span>
          </div>
        </div>

        {/* =====================================
            Endpoints
            ===================================== */}
        <div className="settings-section">
          <h3>Endpoints</h3>

          <div className="settings-field">
            <span className="label">Ollama base URL</span>
            <input
              type="text"
              value={settings.ollamaUrl}
              onChange={(e) => update({ ollamaUrl: e.target.value })}
            />
          </div>

          <div className="settings-field">
            <span className="label">OpenAI-compatible base URL</span>
            <input
              type="text"
              placeholder="https://api.openai.com/v1"
              value={settings.openaiBaseUrl}
              onChange={(e) => update({ openaiBaseUrl: e.target.value })}
            />
          </div>

          <div className="settings-field">
            <span className="label">ComfyUI base URL</span>
            <input
              type="text"
              value={settings.comfyuiUrl}
              onChange={(e) => update({ comfyuiUrl: e.target.value })}
            />
            <span style={{ color: "var(--text-2)", fontSize: "11px" }}>
              SSH tunnel: ssh -L 8188:localhost:8188 user@gpu -N
            </span>
          </div>
        </div>

        {/* =====================================
            Default Image Provider
            ===================================== */}
        <div className="settings-section">
          <h3>Default Image Provider</h3>

          <div className="settings-field">
            <span className="label">Provider</span>
            <select
              value={settings.defaultImageProvider}
              onChange={(e) =>
                update({ defaultImageProvider: e.target.value, defaultImageModel: "" })
              }
            >
              {IMAGE_PROVIDER_OPTIONS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
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

        {/* =====================================
            Default Video Provider
            ===================================== */}
        <div className="settings-section">
          <h3>Default Video Provider</h3>

          <div className="settings-field">
            <span className="label">Provider</span>
            <select
              value={settings.defaultVideoProvider}
              onChange={(e) => {
                const def = findModelDef(e.target.value);
                update({
                  defaultVideoProvider: e.target.value,
                  defaultVideoModel: def?.defaultVariant || "",
                });
              }}
            >
              <optgroup label="Local">
                <option value="comfyui">ComfyUI Wan 2.1 (local GPU)</option>
              </optgroup>
              <optgroup label="PiAPI Cloud">
                {PIAPI_VIDEO_CATALOG.map((m) => (
                  <option key={m.providerId} value={m.providerId}>{m.label}</option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* ==================================
              Video variant and mode selectors
              ================================== */}
          {(() => {
            const def = findModelDef(settings.defaultVideoProvider);
            // ==================================
            if (!def) return null;
            return (
              <>
                {/* ==================================
                    Variant selector
                    ================================== */}
                {def.variants.length > 1 && (
                  <div className="settings-field">
                    <span className="label">Version / Variant</span>
                    <select
                      value={settings.defaultVideoModel}
                      onChange={(e) => update({ defaultVideoModel: e.target.value })}
                    >
                      {def.variants.map((v) => (
                        <option key={v.id} value={v.id}>{v.label}</option>
                      ))}
                    </select>
                  </div>
                )}
                {/* ==================================
                    Mode selector
                    ================================== */}
                {def.modes && (
                  <div className="settings-field">
                    <span className="label">Mode</span>
                    <select
                      value={
                        settings.defaultVideoModel?.includes("pro")
                          ? "pro"
                          : def.defaultMode || "std"
                      }
                      disabled
                    >
                      {def.modes.map((m) => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                    </select>
                    <span style={{ color: "var(--text-2)", fontSize: "11px" }}>
                      Mode is selected per-generation on the Video page
                    </span>
                  </div>
                )}
              </>
            );
          })()}
        </div>

        {/* =====================================
            Default Text LLM
            ===================================== */}
        <div className="settings-section">
          <h3>Default Text LLM</h3>

          <div className="settings-field">
            <span className="label">Provider</span>
            <select
              value={settings.defaultTextProvider}
              onChange={(e) =>
                update({ defaultTextProvider: e.target.value, defaultTextModel: "" })
              }
            >
              {TEXT_PROVIDER_OPTIONS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
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

        {/* =====================================
            Generation
            ===================================== */}
        <div className="settings-section">
          <h3>Generation</h3>

          <div className="settings-field">
            <span className="label">Default target keyframes</span>
            <input
              type="number"
              value={settings.defaultKeyframes}
              min={1}
              onChange={(e) =>
                update({ defaultKeyframes: Number(e.target.value) || 12 })
              }
            />
          </div>

          <div className="settings-field">
            <span className="label">Max images per run (0 = off)</span>
            <input
              type="number"
              value={settings.maxImagesPerRun}
              min={0}
              onChange={(e) =>
                update({ maxImagesPerRun: Number(e.target.value) || 0 })
              }
            />
          </div>
        </div>

        {/* =====================================
            Save
            ===================================== */}
        <div style={{ padding: "4px 0 8px", position: "sticky", bottom: 0, background: "var(--s1)" }}>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            style={{ width: "100%" }}
          >
            {saved ? "Saved!" : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// =============================================================================
