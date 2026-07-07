"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import type { LibraryCharacter } from "@/lib/types";

const STORAGE_KEY = "image_creator_settings";

const DEFAULTS: Record<string, string> = {
  defaultImageProvider: "comfyui",
  defaultImageModel: "qwen_image_fp8_e4m3fn.safetensors",
  defaultTextProvider: "ollama",
  defaultTextModel: "glm-5.2:cloud",
  ollamaUrl: "http://localhost:11434",
  comfyuiUrl: "http://192.168.0.24:8188",
};

function loadSettings() {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch { return DEFAULTS; }
}

interface DetectedChar {
  label: string;
  description: string;
  selected: boolean;
  saving: boolean;
  saved: boolean;
  generatedImage?: string;
  generatedMime?: string;
}

type ModalMode = null | "upload" | "extract" | "detail";

export default function LibraryPage() {
  const [characters, setCharacters] = useState<LibraryCharacter[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const extractFileRef = useRef<HTMLInputElement>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [settings, setSettings] = useState<Record<string, string>>({});

  // Modal state
  const [modal, setModal] = useState<ModalMode>(null);
  const [detailChar, setDetailChar] = useState<LibraryCharacter | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editDesc, setEditDesc] = useState("");

  // Extract mode state
  const [extractPreview, setExtractPreview] = useState<string | null>(null);
  const [extractFile, setExtractFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [detectedChars, setDetectedChars] = useState<DetectedChar[]>([]);
  const [sourceImageBase64, setSourceImageBase64] = useState<string | null>(null);
  const [sourceMime, setSourceMime] = useState("image/png");
  const [extractError, setExtractError] = useState<string | null>(null);

  useEffect(() => { setSettings(loadSettings()); }, []);

  const textProviderId = settings.defaultTextProvider || "ollama";
  const textModel = settings.defaultTextModel || "glm-5.2:cloud";
  const imageProviderId = settings.defaultImageProvider || "comfyui";
  const imageModel = settings.defaultImageModel || "qwen_image_fp8_e4m3fn.safetensors";

  function apiKey(providerId: string): string {
    const keyMap: Record<string, string> = {
      gemini: settings.geminiKey || "",
      openai: settings.openaiKey || "",
      claude: settings.claudeKey || "",
      qwen: settings.qwenKey || "",
    };
    return keyMap[providerId] || "";
  }

  const loadCharacters = useCallback(async () => {
    try {
      const res = await fetch("/api/library");
      if (res.ok) setCharacters(await res.json());
    } catch {
      setError("Failed to load library");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCharacters(); }, [loadCharacters]);

  // ---- Modal helpers ----

  function closeModal() {
    setModal(null);
    setDetailChar(null);
    setNewLabel("");
    setNewDesc("");
  }

  function openDetail(char: LibraryCharacter) {
    setDetailChar(char);
    setEditLabel(char.label);
    setEditDesc(char.description || "");
    setModal("detail");
  }

  function openExtract() {
    setExtractPreview(null);
    setExtractFile(null);
    setDetectedChars([]);
    setExtractError(null);
    setModal("extract");
  }

  // ---- Add single character ----

  async function handleUpload(files: FileList | File[]) {
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const label = newLabel.trim() || file.name.replace(/\.[^.]+$/, "");
        const fd = new FormData();
        fd.append("file", file);
        fd.append("label", label);
        fd.append("description", newDesc);
        const res = await fetch("/api/library", { method: "POST", body: fd });
        if (!res.ok) {
          setError(await res.text());
          continue;
        }
        const char: LibraryCharacter = await res.json();
        setCharacters((prev) => [...prev, char]);
      }
      setNewLabel("");
      setNewDesc("");
      setModal(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/library/${id}`, { method: "DELETE" });
    setCharacters((prev) => prev.filter((c) => c.id !== id));
    closeModal();
  }

  async function handleUpdateChar() {
    if (!detailChar) return;
    const fd = new FormData();
    fd.append("label", editLabel.trim() || detailChar.label);
    fd.append("description", editDesc);
    const res = await fetch(`/api/library/${detailChar.id}`, { method: "PATCH", body: fd });
    if (res.ok) {
      const updated = await res.json();
      setCharacters((prev) => prev.map((c) => c.id === detailChar.id ? updated : c));
      closeModal();
    }
  }

  // ---- Extract characters from image ----

  function handleExtractFileSelect(file: File) {
    setExtractFile(file);
    setExtractPreview(URL.createObjectURL(file));
    setDetectedChars([]);
    setExtractError(null);
  }

  async function handleAnalyze() {
    if (!extractFile) {
      setExtractError("No file selected. Please upload an image first.");
      return;
    }
    setAnalyzing(true);
    setExtractError(null);
    setDetectedChars([]);

    const fd = new FormData();
    fd.append("file", extractFile);
    fd.append("textProviderId", textProviderId);
    fd.append("textModel", textModel);

    const headers: Record<string, string> = {};
    const key = apiKey(textProviderId);
    if (key) headers["x-provider-key"] = key;
    if (textProviderId === "ollama" && settings.ollamaUrl) headers["x-base-url"] = settings.ollamaUrl;
    if (textProviderId === "comfyui" && settings.comfyuiUrl) headers["x-base-url"] = settings.comfyuiUrl;

    try {
      const res = await fetch("/api/analyze-characters", {
        method: "POST",
        headers,
        body: fd,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Analysis failed");
      }

      const data = await res.json();
      setSourceImageBase64(data.imageBase64);
      setSourceMime(data.mime);
      setDetectedChars(
        (data.characters || []).map((c: { label: string; description: string }) => ({
          ...c,
          selected: true,
          saving: false,
          saved: false,
        })),
      );
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  function toggleChar(index: number) {
    setDetectedChars((prev) =>
      prev.map((c, i) => (i === index ? { ...c, selected: !c.selected } : c)),
    );
  }

  async function handleSaveSelected() {
    if (!sourceImageBase64) return;
    const selected = detectedChars.filter((c) => c.selected && !c.saved);
    if (selected.length === 0) return;
    setExtractError(null);

    for (let i = 0; i < detectedChars.length; i++) {
      const char = detectedChars[i];
      if (!char.selected || char.saved) continue;

      setDetectedChars((prev) =>
        prev.map((c, idx) => (idx === i ? { ...c, saving: true } : c)),
      );

      try {
        const key = apiKey(imageProviderId);
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (key) headers["x-provider-key"] = key;
        if (imageProviderId === "comfyui" && settings.comfyuiUrl) headers["x-base-url"] = settings.comfyuiUrl;
        if (imageProviderId === "ollama" && settings.ollamaUrl) headers["x-base-url"] = settings.ollamaUrl;

        const res = await fetch("/api/generate-character", {
          method: "POST",
          headers,
          body: JSON.stringify({
            label: char.label,
            description: char.description,
            imageProvider: { id: imageProviderId, model: imageModel },
            textProvider: { id: textProviderId, model: textModel },
            sourceImageBase64,
            sourceMime,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Generation failed");
        }

        const data = await res.json();
        setDetectedChars((prev) =>
          prev.map((c, idx) =>
            idx === i
              ? { ...c, saving: false, saved: true, generatedImage: data.imageBase64, generatedMime: data.mime }
              : c,
          ),
        );
        if (data.character) {
          setCharacters((prev) => [...prev, data.character]);
        }
      } catch (err) {
        setExtractError(err instanceof Error ? err.message : "Failed to save character");
        setDetectedChars((prev) =>
          prev.map((c, idx) => (idx === i ? { ...c, saving: false } : c)),
        );
      }
    }
  }

  if (loading) {
    return <div className="page-center" style={{ minHeight: "60vh" }}><div className="spinner" /></div>;
  }

  return (
    <div className="page">
      {/* ---- Header with action buttons ---- */}
      <div className="lib-header">
        <div>
          <h1>Character Library</h1>
          <p className="muted" style={{ fontSize: 13 }}>{characters.length} character{characters.length !== 1 ? "s" : ""}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => setModal("upload")}>+ Add Character</button>
          <button className="btn" onClick={openExtract}>+ Extract from Image</button>
        </div>
      </div>

      {error && (
        <div className="note" style={{ borderLeftColor: "var(--danger)", marginBottom: 16 }}>
          {error}
          <button className="btn btn-sm btn-ghost" style={{ marginLeft: 8 }} onClick={() => setError(null)}>dismiss</button>
        </div>
      )}

      {/* ---- Character Grid (hero) ---- */}
      {characters.length === 0 ? (
        <div className="lib-empty">
          <p style={{ fontSize: 40, marginBottom: 8 }}>+</p>
          <p className="muted">No characters yet</p>
          <p className="muted" style={{ fontSize: 12 }}>
            Click <strong>Add Character</strong> to upload an image, or <strong>Extract from Image</strong> to pull characters from a group shot.
          </p>
        </div>
      ) : (
        <div className="lib-grid">
          {characters.map((char) => (
            <div key={char.id} className="lib-card" onClick={() => openDetail(char)}>
              {char.imagePath ? (
                <img src={`/api/library/${char.id}/image`} alt={char.label} className="lib-card-img" />
              ) : (
                <div className="lib-card-img lib-card-placeholder">No image</div>
              )}
              <div className="lib-card-name">{char.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ---- Upload Modal ---- */}
      {modal === "upload" && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <h2>Add Character</h2>
            <div className="field">
              <label>Name (optional)</label>
              <input type="text" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Defaults to filename" />
            </div>
            <div className="field">
              <label>Description (optional)</label>
              <input type="text" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Short visual description" />
            </div>
            <div
              className="drop"
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? "Uploading..." : "Click to select image"}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              style={{ display: "none" }}
              onChange={(e) => {
                if (e.target.files?.length) { handleUpload(e.target.files); e.target.value = ""; }
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
              <button className="btn" onClick={closeModal}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Detail / Edit Modal ---- */}
      {modal === "detail" && detailChar && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal lib-detail-modal" onClick={(e) => e.stopPropagation()}>
            {detailChar.imagePath && (
              <img
                src={`/api/library/${detailChar.id}/image`}
                alt={detailChar.label}
                className="lib-detail-img"
              />
            )}
            <div className="field" style={{ marginTop: 12 }}>
              <label>Name</label>
              <input type="text" value={editLabel} onChange={(e) => setEditLabel(e.target.value)} />
            </div>
            <div className="field">
              <label>Description</label>
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                style={{ minHeight: 64 }}
                placeholder="Visual description"
              />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
              <button
                className="btn btn-sm"
                style={{ color: "var(--danger)", borderColor: "var(--danger)" }}
                onClick={() => handleDelete(detailChar.id)}
              >
                Delete
              </button>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn" onClick={closeModal}>Cancel</button>
                <button
                  className="btn btn-primary"
                  onClick={handleUpdateChar}
                  disabled={!editLabel.trim()}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---- Extract Modal ---- */}
      {modal === "extract" && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal lib-extract-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Extract Characters from Image</h2>
            <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
              Upload a group image. AI will identify each character and generate individual portraits.
            </p>

            {!extractPreview ? (
              <div className="drop" onClick={() => extractFileRef.current?.click()}>
                Click to select a group image
              </div>
            ) : (
              <div>
                <div style={{ textAlign: "center", marginBottom: 12 }}>
                  <img
                    src={extractPreview}
                    alt="Uploaded"
                    style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 10, border: "1px solid var(--border)" }}
                  />
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                  <button className="btn btn-primary" onClick={handleAnalyze} disabled={analyzing}>
                    {analyzing ? "Analyzing..." : "Detect Characters"}
                  </button>
                  <button className="btn" onClick={() => { setExtractFile(null); setExtractPreview(null); setDetectedChars([]); }}>
                    Change Image
                  </button>
                </div>
              </div>
            )}

            <input
              ref={extractFileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              style={{ display: "none" }}
              onChange={(e) => {
                if (e.target.files?.[0]) handleExtractFileSelect(e.target.files[0]);
                e.target.value = "";
              }}
            />

            {extractError && (
              <div className="note" style={{ borderLeftColor: "var(--danger)", marginTop: 12 }}>
                {extractError}
                <button className="btn btn-sm btn-ghost" style={{ marginLeft: 8 }} onClick={() => setExtractError(null)}>dismiss</button>
              </div>
            )}

            {analyzing && (
              <div style={{ textAlign: "center", padding: 24 }}>
                <div className="spinner" style={{ margin: "0 auto 12px" }} />
                <p className="muted">Analyzing image for characters...</p>
              </div>
            )}

            {detectedChars.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <h3 style={{ fontSize: 14, marginBottom: 8, color: "var(--text)" }}>
                  Found {detectedChars.length} character(s)
                </h3>

                <div className="char-grid">
                  {detectedChars.map((char, i) => (
                    <div
                      key={i}
                      className={`char-card selectable ${char.selected ? "selected" : ""}`}
                      style={{ opacity: char.saving ? 0.6 : 1 }}
                    >
                      <div
                        style={{ cursor: char.saving || char.saved ? "default" : "pointer" }}
                        onClick={() => !char.saving && !char.saved && toggleChar(i)}
                      >
                        {char.generatedImage ? (
                          <img
                            src={`data:${char.generatedMime};base64,${char.generatedImage}`}
                            alt={char.label}
                            className="char-card-img"
                          />
                        ) : (
                          <div className="char-card-img char-card-placeholder" style={{ fontSize: 28 }}>
                            {char.saving ? <div className="spinner-sm" /> : char.selected ? "✓" : "—"}
                          </div>
                        )}
                      </div>
                      <div className="char-card-info">
                        {char.saved ? (
                          <strong>{char.label}</strong>
                        ) : (
                          <input
                            type="text"
                            value={char.label}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setDetectedChars((prev) =>
                              prev.map((c, idx) => idx === i ? { ...c, label: e.target.value } : c)
                            )}
                            disabled={char.saving}
                            style={{ fontWeight: 600, fontSize: 13, padding: "2px 4px", width: "100%" }}
                            placeholder="Character name"
                          />
                        )}
                        {char.saved ? (
                          <span className="muted" style={{ fontSize: 11 }}>
                            {char.description.length > 60 ? char.description.slice(0, 60) + "..." : char.description}
                          </span>
                        ) : (
                          <textarea
                            value={char.description}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setDetectedChars((prev) =>
                              prev.map((c, idx) => idx === i ? { ...c, description: e.target.value } : c)
                            )}
                            disabled={char.saving}
                            style={{ fontSize: 11, padding: "2px 4px", width: "100%", minHeight: 40, resize: "vertical" }}
                            placeholder="Visual description"
                          />
                        )}
                        {char.saved && <span style={{ color: "var(--ok)", fontSize: 11 }}>Saved</span>}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button
                    className="btn btn-primary"
                    onClick={handleSaveSelected}
                    disabled={detectedChars.every((c) => !c.selected || c.saved || c.saving)}
                  >
                    {detectedChars.some((c) => c.saving)
                      ? "Generating..."
                      : `Save ${detectedChars.filter((c) => c.selected && !c.saved).length} Character(s)`}
                  </button>
                  <button className="btn" onClick={() => setDetectedChars((prev) => prev.map((c) => ({ ...c, selected: !c.saved })))}>
                    Select All
                  </button>
                  <button className="btn" onClick={() => setDetectedChars((prev) => prev.map((c) => ({ ...c, selected: false })))}>
                    Deselect All
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button className="btn" onClick={closeModal}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
