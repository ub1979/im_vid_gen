"use client";
// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// SceneList : renders list of scene cards with selection and batch controls
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import SceneCard from "./SceneCard";
import type { SceneEntry } from "@/lib/types";
// =============================================================================

// =============================================================================
/*
    SceneListProps : props for the scene list component
*/
// =============================================================================
interface SceneListProps {
  scenes: SceneEntry[];
  projectSlug: string;
  selectedIndices: Set<number>;
  providerSupportsRefEdit: boolean;
  onRegenerate: (index: number) => void;
  onPromptChange: (index: number, prompt: string) => void;
  onSelect: (index: number) => void;
  onSelectAll: () => void;
  onGenerateSelected: () => void;
  interval: number;
}

// =============================================================================
// Function renders scene list with selection controls -> props to JSX
// =============================================================================
export default function SceneList({
  scenes,
  projectSlug,
  selectedIndices,
  providerSupportsRefEdit,
  onRegenerate,
  onPromptChange,
  onSelect,
  onSelectAll,
  onGenerateSelected,
  interval,
}: SceneListProps) {
  /*
      SceneList : displays scene cards with batch selection and regeneration
      scenes variable : array of scene entries
      projectSlug variable : current project identifier
      selectedIndices variable : set of selected scene indices
      providerSupportsRefEdit variable : whether provider supports reference editing
      onRegenerate variable : callback to regenerate a scene
      onPromptChange variable : callback when a scene prompt changes
      onSelect variable : callback when a scene is selected
      onSelectAll variable : callback to select/deselect all scenes
      onGenerateSelected variable : callback to regenerate selected scenes
      interval variable : scene interval in seconds
  */
  const doneCount = scenes.filter((s) => s.status === "done").length;

  // =====================================
  // Render
  // =====================================
  return (
    <>
      <h2>
        Scenes &amp; Keyframes
        {/* ==================================
            Scene count summary
            ================================== */}
        {scenes.length > 0 && (
          <span
            className="muted"
            style={{
              fontWeight: 400,
              textTransform: "none",
              letterSpacing: 0,
            }}
          >
            {" "}
            — {doneCount} of {scenes.length} scenes (every {interval}s)
          </span>
        )}
      </h2>

      {/* ==================================
          Progress bar
          ================================== */}
      {scenes.length > 0 && (
        <div className="progress" style={{ marginBottom: "12px" }}>
          <div
            style={{
              width: `${scenes.length > 0 ? (doneCount / scenes.length) * 100 : 0}%`,
            }}
          />
        </div>
      )}

      {/* ==================================
          Empty state
          ================================== */}
      {scenes.length === 0 && (
        <div
          className="muted"
          style={{ textAlign: "center", padding: "40px 0" }}
        >
          No scenes yet. Add text and click &ldquo;Generate Scenes&rdquo; to
          get started.
        </div>
      )}

      {/* =====================================
          Scene cards
          ===================================== */}
      {scenes.map((scene) => (
        <SceneCard
          key={scene.index}
          scene={scene}
          sceneNumber={scene.index + 1}
          projectSlug={projectSlug}
          onRegenerate={onRegenerate}
          onPromptChange={onPromptChange}
          onSelect={onSelect}
          selected={selectedIndices.has(scene.index)}
          providerSupportsRefEdit={providerSupportsRefEdit}
        />
      ))}

      {/* ==================================
          Batch selection controls
          ================================== */}
      {scenes.length > 0 && (
        <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
          <button className="btn btn-sm" onClick={onSelectAll}>
            {selectedIndices.size === scenes.length
              ? "Deselect all"
              : "Select all"}
          </button>
          {selectedIndices.size > 0 && (
            <button className="btn btn-sm" onClick={onGenerateSelected}>
              Regenerate selected ({selectedIndices.size})
            </button>
          )}
        </div>
      )}
    </>
  );
}

// =============================================================================
// =============================================================================
