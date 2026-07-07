"use client";

import { useRef, useState, useCallback } from "react";
import type { CharacterRef } from "@/lib/types";

interface CharacterPanelProps {
  characters: CharacterRef[];
  projectSlug: string;
  onCharactersChange: (characters: CharacterRef[]) => void;
}

export default function CharacterPanel({
  characters,
  projectSlug,
  onCharactersChange,
}: CharacterPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
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

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  function handleLabelChange(id: string, label: string) {
    onCharactersChange(
      characters.map((c) => (c.id === id ? { ...c, label } : c)),
    );
  }

  function handleDescriptionChange(id: string, description: string) {
    onCharactersChange(
      characters.map((c) => (c.id === id ? { ...c, description } : c)),
    );
  }

  function handleRemove(id: string) {
    onCharactersChange(characters.filter((c) => c.id !== id));
  }

  function addTextOnlyCharacter() {
    const newChar: CharacterRef = {
      id: `char-${Date.now()}`,
      label: "New character",
      description: "",
    };
    onCharactersChange([...characters, newChar]);
  }

  return (
    <>
      <h2>Characters</h2>

      {characters.map((char) => (
        <div key={char.id} className="char-row">
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
                background: "var(--surface-2)",
                color: "var(--text-dim)",
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

      {error && (
        <div className="note" style={{ borderLeftColor: "var(--danger)", marginTop: "8px" }}>
          {error}
        </div>
      )}
    </>
  );
}
