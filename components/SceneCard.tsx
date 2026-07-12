"use client";
// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// SceneCard : individual scene display with prompt editing and regeneration
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import { formatTime } from "@/lib/format";
import type { SceneEntry } from "@/lib/types";
// =============================================================================

// =============================================================================
/*
    SceneCardProps : props for the scene card component
*/
// =============================================================================
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

// =============================================================================
// Constants
// =============================================================================
const STATUS_MAP: Record<
  string,
  { className: string; label: string }
> = {
  done: { className: "status ok", label: "✓ generated" },
  generating: { className: "status pending", label: "generating…" },
  pending: { className: "status pending", label: "queued" },
  failed: { className: "status fail", label: "✗ failed — retry" },
};

// =============================================================================
// Function renders a single scene card -> props to JSX
// =============================================================================
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
  /*
      SceneCard : displays scene image, metadata, prompt, and actions
      scene variable : scene data entry
      sceneNumber variable : display number for the scene
      projectSlug variable : current project identifier
      onRegenerate variable : callback to regenerate this scene
      onPromptChange variable : callback when prompt text changes
      onSelect variable : callback when scene is selected
      selected variable : whether this scene is currently selected
      providerSupportsRefEdit variable : whether provider supports reference editing
  */
  const statusInfo = STATUS_MAP[scene.status] ?? STATUS_MAP.pending;
  const timeRange = `${formatTime(scene.time_start)}–${formatTime(scene.time_end)}`;

  const imageSrc = scene.imagePath
    ? `/api/projects/${projectSlug}/scenes/${scene.index}/image`
    : undefined;

  // =====================================
  // Render
  // =====================================
  return (
    <div className="scene">
      {/* ==================================
          Scene image or placeholder
          ================================== */}
      {imageSrc ? (
        <img className="scene-img" src={imageSrc} alt={`Scene ${sceneNumber}`} />
      ) : (
        <div
          className="scene-img"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-2)",
            fontSize: "12px",
          }}
        >
          Scene {sceneNumber}
        </div>
      )}

      <div>
        {/* ==================================
            Scene metadata
            ================================== */}
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

        {/* ==================================
            Prompt editor
            ================================== */}
        <textarea
          className="prompt"
          value={scene.prompt}
          onChange={(e) => onPromptChange(scene.index, e.target.value)}
        />

        {/* ==================================
            Generation progress
            ================================== */}
        {scene.status === "generating" && (
          <div className="progress">
            <div style={{ width: "60%" }} />
          </div>
        )}

        {/* ==================================
            Error display
            ================================== */}
        {scene.error && (
          <div
            className="note"
            style={{ borderLeftColor: "var(--danger)", marginTop: "6px" }}
          >
            {scene.error}
          </div>
        )}

        {/* ==================================
            Reference edit note
            ================================== */}
        {scene.mode === "text_to_image" && providerSupportsRefEdit && (
          <div className="note">
            This scene used text-to-image mode, but the selected provider
            supports reference-image editing for better character consistency.
          </div>
        )}

        {/* ==================================
            Action buttons
            ================================== */}
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

// =============================================================================
// =============================================================================
