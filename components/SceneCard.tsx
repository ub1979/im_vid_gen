"use client";

import { formatTime } from "@/lib/format";
import type { SceneEntry } from "@/lib/types";

interface SceneCardProps {
  scene: SceneEntry;
  sceneNumber: number;
  projectSlug: string;
  onRegenerate: (index: number) => void;
  onPromptChange: (index: number, prompt: string) => void;
  onSelect: (index: number) => void;
  selected: boolean;
  providerSupportsRefEdit?: boolean;
}

const STATUS_MAP: Record<
  string,
  { className: string; label: string }
> = {
  done: { className: "status ok", label: "✓ generated" },
  generating: { className: "status pending", label: "generating…" },
  pending: { className: "status pending", label: "queued" },
  failed: { className: "status fail", label: "✗ failed — retry" },
};

export default function SceneCard({
  scene,
  sceneNumber,
  projectSlug,
  onRegenerate,
  onPromptChange,
  onSelect,
  selected,
  providerSupportsRefEdit = false,
}: SceneCardProps) {
  const statusInfo = STATUS_MAP[scene.status] ?? STATUS_MAP.pending;
  const timeRange = `${formatTime(scene.time_start)}–${formatTime(scene.time_end)}`;

  const imageSrc = scene.imagePath
    ? `/api/projects/${projectSlug}/scenes/${scene.index}/image`
    : undefined;

  return (
    <div className="scene">
      {imageSrc ? (
        <img className="scene-img" src={imageSrc} alt={`Scene ${sceneNumber}`} />
      ) : (
        <div
          className="scene-img"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-dim)",
            fontSize: "12px",
          }}
        >
          Scene {sceneNumber}
        </div>
      )}

      <div>
        <div className="scene-meta">
          <label style={{ display: "inline", marginBottom: 0 }}>
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onSelect(scene.index)}
              style={{ width: "auto", marginRight: "6px" }}
            />
          </label>
          Scene {sceneNumber} &middot; {timeRange} &middot;{" "}
          &ldquo;{scene.lyric_excerpt}&rdquo; &middot;{" "}
          {scene.characters_used.map((c) => (
            <span key={c} className="tag">
              {c}
            </span>
          ))}{" "}
          <span className={statusInfo.className}>{statusInfo.label}</span>
        </div>

        <textarea
          className="prompt"
          value={scene.prompt}
          onChange={(e) => onPromptChange(scene.index, e.target.value)}
        />

        {scene.status === "generating" && (
          <div className="progress">
            <div style={{ width: "60%" }} />
          </div>
        )}

        {scene.error && (
          <div
            className="note"
            style={{ borderLeftColor: "var(--danger)", marginTop: "6px" }}
          >
            {scene.error}
          </div>
        )}

        {scene.mode === "text_to_image" && providerSupportsRefEdit && (
          <div className="note">
            This scene used text-to-image mode, but the selected provider
            supports reference-image editing for better character consistency.
          </div>
        )}

        <div className="scene-actions">
          <button
            className={`btn btn-sm${scene.status === "failed" ? " btn-primary" : ""}`}
            onClick={() => onRegenerate(scene.index)}
          >
            {scene.status === "failed" ? "Retry" : "Regenerate"}
          </button>
        </div>
      </div>
    </div>
  );
}
