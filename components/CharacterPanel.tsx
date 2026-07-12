"use client";
// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// CharacterPanel : manages character list with upload, drag-drop, edit, remove
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import { useRef, useState, useCallback } from "react";
import type { CharacterRef } from "@/lib/types";
// =============================================================================

// =============================================================================
/*
    CharacterPanelProps : props for the character panel component
*/
// =============================================================================
interface CharacterPanelProps {
  characters: CharacterRef[];
  projectSlug: string;
  onCharactersChange: (characters: CharacterRef[]) => void;
}

// =============================================================================
// Function renders character panel with upload and management -> props to JSX
// =============================================================================
export default function CharacterPanel({
  characters,
  projectSlug,
  onCharactersChange,
}: CharacterPanelProps) {
  /*
      CharacterPanel : character management panel with drag-drop upload
      characters variable : array of character references
      projectSlug variable : current project identifier
      onCharactersChange variable : callback when characters array changes
  */
  // =====================================
  // State & refs
  // =====================================
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // =============================================================================
  // Function uploads files as characters -> FileList to void
  // =============================================================================
  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      /*
          handleFiles : uploads image files and creates character entries
          files variable : list of files to upload
      */
      setError(null);
      setUploading(true);
      try {
        for (const file of Array.from(files)) {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("label", file.name.replace(/\.[^.]+$/, ""));

          const res = await fetch(
            `/api/projects/${projectSlug}/characters`,
            { method: "POST", body: formData },
          );

          // ==================================
          if (!res.ok) {
            const msg = await res.text().catch(() => "Upload failed");
            setError(msg);
            continue;
          }

          const character: CharacterRef = await res.json();
          onCharactersChange([...characters, character]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [characters, onCharactersChange, projectSlug],
  );

  // =============================================================================
  // Function handles file drop event -> DragEvent to void
  // =============================================================================
  function handleDrop(e: React.DragEvent) {
    /*
        handleDrop : processes dropped files for upload
        e variable : drag event from the drop zone
    */
    e.preventDefault();
    setDragOver(false);
    // ==================================
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }

  // =============================================================================
  // Function handles drag over event -> DragEvent to void
  // =============================================================================
  function handleDragOver(e: React.DragEvent) {
    /*
        handleDragOver : prevents default and sets drag-over state
        e variable : drag event
    */
    e.preventDefault();
    setDragOver(true);
  }

  // =============================================================================
  // Function handles drag leave event -> void to void
  // =============================================================================
  function handleDragLeave() {
    /*
        handleDragLeave : clears drag-over state
    */
    setDragOver(false);
  }

  // =============================================================================
  // Function updates character label -> string, string to void
  // =============================================================================
  function handleLabelChange(id: string, label: string) {
    /*
        handleLabelChange : updates the label of a character by id
        id variable : character id to update
        label variable : new label value
    */
    onCharactersChange(
      characters.map((c) => (c.id === id ? { ...c, label } : c)),
    );
  }

  // =============================================================================
  // Function updates character description -> string, string to void
  // =============================================================================
  function handleDescriptionChange(id: string, description: string) {
    /*
        handleDescriptionChange : updates the description of a character by id
        id variable : character id to update
        description variable : new description value
    */
    onCharactersChange(
      characters.map((c) => (c.id === id ? { ...c, description } : c)),
    );
  }

  // =============================================================================
  // Function removes a character from the list -> string to void
  // =============================================================================
  function handleRemove(id: string) {
    /*
        handleRemove : filters out a character by id
        id variable : character id to remove
    */
    onCharactersChange(characters.filter((c) => c.id !== id));
  }

  // =============================================================================
  // Function adds a text-only character -> void to void
  // =============================================================================
  function addTextOnlyCharacter() {
    /*
        addTextOnlyCharacter : creates a new character with no image
    */
    const newChar: CharacterRef = {
      id: `char-${Date.now()}`,
      label: "New character",
      description: "",
    };
    onCharactersChange([...characters, newChar]);
  }

  // =====================================
  // Render
  // =====================================
  return (
    <>
      <h2>Characters</h2>

      {characters.map((char) => (
        <div key={char.id} className="char-row">
          {/* ==================================
              Character thumbnail
              ================================== */}
          {char.imagePath ? (
            <img
              className="char-thumb"
              src={`/api/projects/${projectSlug}/characters/${char.id}/image`}
              alt={char.label}
            />
          ) : (
            <div
              className="char-thumb"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--s2)",
                color: "var(--text-2)",
                fontSize: "11px",
              }}
            >
              text
            </div>
          )}
          <div className="char-fields">
            <input
              type="text"
              value={char.label}
              onChange={(e) => handleLabelChange(char.id, e.target.value)}
              placeholder="Character name"
            />
            <input
              type="text"
              value={char.description ?? ""}
              onChange={(e) =>
                handleDescriptionChange(char.id, e.target.value)
              }
              placeholder="short description (optional)"
            />
          </div>
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => handleRemove(char.id)}
            title="Remove character"
            style={{ flexShrink: 0, color: "var(--danger)" }}
          >
            x
          </button>
        </div>
      ))}

      {/* =====================================
          Drop zone for file upload
          ===================================== */}
      <div
        className="drop"
        style={{
          borderColor: dragOver ? "var(--accent)" : undefined,
          color: dragOver ? "var(--text)" : undefined,
        }}
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {uploading ? "Uploading..." : "+ Add character image (drag & drop or click)"}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          // ==================================
          if (e.target.files && e.target.files.length > 0) {
            handleFiles(e.target.files);
            e.target.value = "";
          }
        }}
      />

      <button
        className="btn btn-sm btn-ghost"
        style={{ width: "100%", marginTop: "8px" }}
        onClick={addTextOnlyCharacter}
      >
        + Add text-only character
      </button>

      {/* ==================================
          Error display
          ================================== */}
      {error && (
        <div className="note" style={{ borderLeftColor: "var(--danger)", marginTop: "8px" }}>
          {error}
        </div>
      )}
    </>
  );
}

// =============================================================================
// =============================================================================
