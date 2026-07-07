"use client";

import SceneCard from "./SceneCard";
import type { SceneEntry } from "@/lib/types";

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
  const doneCount = scenes.filter((s) => s.status === "done").length;

  return (
    <>
      <h2>
        Scenes &amp; Keyframes
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

      {scenes.length > 0 && (
        <div className="progress" style={{ marginBottom: "12px" }}>
          <div
            style={{
              width: `${scenes.length > 0 ? (doneCount / scenes.length) * 100 : 0}%`,
            }}
          />
        </div>
      )}

      {scenes.length === 0 && (
        <div
          className="muted"
          style={{ textAlign: "center", padding: "40px 0" }}
        >
          No scenes yet. Add text and click &ldquo;Generate Scenes&rdquo; to
          get started.
        </div>
      )}

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
