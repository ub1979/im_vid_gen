"use client";

import type { ProviderConfig } from "@/lib/types";
import {
  IMAGE_PROVIDERS,
  TEXT_PROVIDERS,
  getImageProvider,
} from "@/lib/providers/registry";

interface GeneratePanelProps {
  provider: ProviderConfig;
  onProviderChange: (provider: ProviderConfig) => void;
  onGenerateScenes: () => void;
  onGenerateAll: () => void;
  onExport: () => void;
  generatingScenes?: boolean;
  generatingImages?: boolean;
  sceneCount: number;
  doneCount: number;
}

export default function GeneratePanel({
  provider,
  onProviderChange,
  onGenerateScenes,
  onGenerateAll,
  onExport,
  generatingScenes = false,
  generatingImages = false,
  sceneCount,
  doneCount,
}: GeneratePanelProps) {
  const selectedImageProvider = getImageProvider(provider.image.id);
  const capabilities = selectedImageProvider?.capabilities;

  return (
    <>
      <h2>Generate</h2>

      <div className="field">
        <label>Image provider</label>
        <select
          value={provider.image.id}
          onChange={(e) => {
            const p = IMAGE_PROVIDERS.find((ip) => ip.id === e.target.value);
            if (p) {
              onProviderChange({
                ...provider,
                image: { id: p.id, model: p.label },
              });
            }
          }}
        >
          {IMAGE_PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>Text LLM (scenes)</label>
        <select
          value={provider.text.id}
          onChange={(e) => {
            const p = TEXT_PROVIDERS.find((tp) => tp.id === e.target.value);
            if (p) {
              onProviderChange({
                ...provider,
                text: { id: p.id, model: p.model },
              });
            }
          }}
        >
          {TEXT_PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <button
        className="btn btn-primary"
        style={{ width: "100%" }}
        onClick={onGenerateScenes}
        disabled={generatingScenes}
      >
        {generatingScenes ? "Generating scenes..." : "Generate scenes →"}
      </button>

      <button
        className="btn"
        style={{ width: "100%", marginTop: "8px" }}
        onClick={onGenerateAll}
        disabled={generatingImages || sceneCount === 0}
      >
        {generatingImages ? "Generating keyframes..." : "Generate all keyframes"}
      </button>

      {capabilities?.supports_reference_edit && (
        <div className="note" style={{ marginTop: "14px" }}>
          Provider supports reference-image editing. Character reference images
          will be passed per scene to keep characters consistent.
        </div>
      )}

      {capabilities && !capabilities.supports_reference_edit && (
        <div className="note" style={{ marginTop: "14px" }}>
          This provider uses text-to-image only. Character consistency relies on
          prompt descriptions.
        </div>
      )}

      {sceneCount > 0 && (
        <div style={{ marginTop: "12px" }}>
          <div className="muted" style={{ fontSize: "11px", marginBottom: "4px" }}>
            {doneCount} / {sceneCount} keyframes generated
          </div>
          <div className="progress">
            <div
              style={{
                width: `${(doneCount / sceneCount) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      <h2 style={{ marginTop: "18px" }}>Export</h2>
      <button
        className="btn btn-sm"
        style={{ width: "100%", marginBottom: "6px" }}
        onClick={onExport}
        disabled={doneCount === 0}
      >
        Download all keyframe images
      </button>
      <button
        className="btn btn-sm"
        style={{ width: "100%" }}
        disabled={sceneCount === 0}
        onClick={() => {
          const data = JSON.stringify(
            { scenes: "export not yet implemented" },
            null,
            2,
          );
          const blob = new Blob([data], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "prompts.json";
          a.click();
          URL.revokeObjectURL(url);
        }}
      >
        Export prompts (JSON)
      </button>
    </>
  );
}
