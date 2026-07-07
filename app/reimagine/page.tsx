"use client";

import { useState, useEffect, useCallback } from "react";
import type { ReimagineCharacter, ReimagineEntry } from "@/lib/types";

type Step = "upload" | "style" | "characters" | "generate" | "results";

const STEPS: { key: Step; label: string }[] = [
  { key: "upload", label: "Upload" },
  { key: "style", label: "Style" },
  { key: "characters", label: "Characters" },
  { key: "generate", label: "Generate" },
  { key: "results", label: "Results" },
];

const STYLE_PRESETS = [
  { id: "3d-pixar", label: "3D Pixar", icon: "🎬" },
  { id: "anime", label: "Anime", icon: "🌸" },
  { id: "watercolor", label: "Watercolor", icon: "🎨" },
  { id: "oil-painting", label: "Oil Painting", icon: "🖼" },
  { id: "comic-book", label: "Comic Book", icon: "💥" },
  { id: "photorealistic", label: "Photorealistic", icon: "📷" },
  { id: "claymation", label: "Claymation", icon: "🧸" },
  { id: "sketch", label: "Pencil Sketch", icon: "✏" },
];

const STORAGE_KEY = "image_creator_settings";
const PROMPT_HISTORY_KEY = "reimagine_prompt_history";
const MAX_PROMPT_HISTORY = 10;

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
  } catch {
    return DEFAULTS;
  }
}

function getApiKey(settings: Record<string, string>, providerId: string): string {
  const keyMap: Record<string, string> = {
    gemini: settings.geminiKey || "",
    openai: settings.openaiKey || "",
    claude: settings.claudeKey || "",
    qwen: settings.qwenKey || "",
  };
  return keyMap[providerId] || "";
}

function loadPromptHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PROMPT_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePromptToHistory(prompt: string) {
  if (!prompt.trim()) return;
  const history = loadPromptHistory().filter((p) => p !== prompt.trim());
  history.unshift(prompt.trim());
  if (history.length > MAX_PROMPT_HISTORY) history.length = MAX_PROMPT_HISTORY;
  localStorage.setItem(PROMPT_HISTORY_KEY, JSON.stringify(history));
}

export default function ReimaginePage() {
  const [step, setStep] = useState<Step>("upload");
  const [slug, setSlug] = useState<string | null>(null);
  const [entries, setEntries] = useState<ReimagineEntry[]>([]);
  const [characters, setCharacters] = useState<ReimagineCharacter[]>([]);
  const [styleMode, setStyleMode] = useState<"preset" | "reference">("preset");
  const [stylePreset, setStylePreset] = useState<string>("3d-pixar");
  const [styleRefFile, setStyleRefFile] = useState<File | null>(null);
  const [styleRefUrl, setStyleRefUrl] = useState<string | null>(null);
  const [customStyleNote, setCustomStyleNote] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [libraryChars, setLibraryChars] = useState<{ id: string; label: string; imagePath?: string }[]>([]);
  const [showLibPicker, setShowLibPicker] = useState(false);
  const [editingCharId, setEditingCharId] = useState<string | null>(null);
  const [editCharLabel, setEditCharLabel] = useState("");
  const [editCharDesc, setEditCharDesc] = useState("");
  const [savingToLib, setSavingToLib] = useState<Set<string>>(new Set());
  const [savedToLib, setSavedToLib] = useState<Set<string>>(new Set());
  const [editingPromptIdx, setEditingPromptIdx] = useState<number | null>(null);
  const [editPromptText, setEditPromptText] = useState("");
  const [savedFolders, setSavedFolders] = useState<string[]>([]);
  const [promptHistory, setPromptHistory] = useState<string[]>([]);
  const [existingProjects, setExistingProjects] = useState<{ id: string; name: string; updatedAt: string; entries: { status: string }[]; stylePreset?: string; styleMode?: string }[]>([]);
  const [loadingProject, setLoadingProject] = useState(false);
  const [selectedForRegen, setSelectedForRegen] = useState<Set<number>>(new Set());
  const [merging, setMerging] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  useEffect(() => {
    setSettings(loadSettings());
    setPromptHistory(loadPromptHistory());
    fetch("/api/library").then((r) => r.ok ? r.json() : []).then(setLibraryChars).catch(() => {});
    fetch("/api/reimagine").then((r) => r.ok ? r.json() : []).then(setExistingProjects).catch(() => {});
  }, []);

  const textProviderId = settings.defaultTextProvider || "ollama";
  const textModel = settings.defaultTextModel || "glm-5.2:cloud";
  const imageProviderId = settings.defaultImageProvider || "comfyui";
  const imageModel = settings.defaultImageModel || "qwen_image_fp8_e4m3fn.safetensors";

  function apiHeaders(): Record<string, string> {
    const h: Record<string, string> = {};
    const key = getApiKey(settings, textProviderId);
    if (key) h["x-provider-key"] = key;
    if (textProviderId === "ollama" && settings.ollamaUrl) h["x-base-url"] = settings.ollamaUrl;
    if (textProviderId === "comfyui" && settings.comfyuiUrl) h["x-base-url"] = settings.comfyuiUrl;
    return h;
  }

  function imgApiHeaders(): Record<string, string> {
    const h: Record<string, string> = {};
    const key = getApiKey(settings, imageProviderId);
    if (key) h["x-provider-key"] = key;
    if (imageProviderId === "comfyui" && settings.comfyuiUrl) {
      h["x-base-url"] = settings.comfyuiUrl;
    }
    if (imageProviderId === "ollama" && settings.ollamaUrl) {
      h["x-base-url"] = settings.ollamaUrl;
    }
    return h;
  }

  // ---- Load existing project ----

  async function handleLoadProject(projectId: string) {
    setLoadingProject(true);
    setError(null);
    try {
      const res = await fetch(`/api/reimagine/${projectId}`);
      if (!res.ok) throw new Error("Failed to load project");
      const manifest = await res.json();
      setSlug(manifest.id);
      setEntries(manifest.entries || []);
      setCharacters(manifest.characters || []);
      setStyleMode(manifest.styleMode || "preset");
      setStylePreset(manifest.stylePreset || "3d-pixar");
      setCustomStyleNote(manifest.styleDescription || "");
      if (manifest.styleRefImagePath) {
        setStyleRefUrl(`/api/reimagine/${manifest.id}/style-ref`);
      }
      setStep("upload");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load project");
    } finally {
      setLoadingProject(false);
    }
  }

  async function handleRenameProject(projectId: string) {
    if (!renameValue.trim()) return;
    try {
      const res = await fetch(`/api/reimagine/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      if (!res.ok) throw new Error("Rename failed");
      setExistingProjects((prev) =>
        prev.map((p) => (p.id === projectId ? { ...p, name: renameValue.trim() } : p)),
      );
      setRenamingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rename failed");
    }
  }

  async function handleDeleteProject(projectId: string) {
    setError(null);
    try {
      const res = await fetch(`/api/reimagine/${projectId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setExistingProjects((prev) => prev.filter((p) => p.id !== projectId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function handleMergeProject(sourceId: string) {
    if (!slug) return;
    setMerging(true);
    setError(null);
    try {
      const res = await fetch(`/api/reimagine/${slug}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceSlug: sourceId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Merge failed");
      }
      const updated = await res.json();
      setEntries(updated.entries || []);
      setCharacters(updated.characters || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Merge failed");
    } finally {
      setMerging(false);
    }
  }

  // ---- Upload handlers ----

  async function ensureProject(): Promise<string> {
    if (slug) return slug;
    const res = await fetch("/api/reimagine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `reimagine-${Date.now()}`,
        provider: {
          image: { id: imageProviderId, model: imageModel },
          text: { id: textProviderId, model: textModel },
        },
      }),
    });
    if (!res.ok) throw new Error("Failed to create project");
    const manifest = await res.json();
    setSlug(manifest.id);
    return manifest.id;
  }

  async function handleFileUpload(files: FileList | File[]) {
    setError(null);
    setUploading(true);
    try {
      const projectSlug = await ensureProject();
      const fd = new FormData();
      for (const file of files) {
        fd.append("files", file);
      }
      const res = await fetch(`/api/reimagine/${projectSlug}/sources`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Upload failed");
      }
      const newEntries: ReimagineEntry[] = await res.json();
      setEntries(newEntries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files);
    }
  }

  // ---- Character editing ----

  function openEditChar(char: ReimagineCharacter) {
    setEditingCharId(char.id);
    setEditCharLabel(char.label);
    setEditCharDesc(char.description);
  }

  async function saveCharEdits() {
    if (!editingCharId || !slug) return;
    const updated = characters.map((c) =>
      c.id === editingCharId ? { ...c, label: editCharLabel, description: editCharDesc } : c,
    );
    setCharacters(updated);
    setEditingCharId(null);
    try {
      await fetch(`/api/reimagine/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characters: updated }),
      });
    } catch { /* best effort */ }
  }

  async function saveCharToLibrary(char: ReimagineCharacter) {
    if (!slug || !char.sourceImageIds[0]) return;
    setSavingToLib((prev) => new Set(prev).add(char.id));
    try {
      const imgRes = await fetch(`/api/reimagine/${slug}/sources/${char.sourceImageIds[0]}`);
      if (!imgRes.ok) throw new Error("Failed to load image");
      const blob = await imgRes.blob();
      const fd = new FormData();
      fd.append("file", blob, `${char.id}.png`);
      fd.append("label", char.label);
      fd.append("description", char.description);
      const res = await fetch("/api/library", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Failed to save to library");
      setSavedToLib((prev) => new Set(prev).add(char.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save to library");
    } finally {
      setSavingToLib((prev) => { const s = new Set(prev); s.delete(char.id); return s; });
    }
  }

  // ---- Style ref upload ----

  async function handleLibraryStyleRef(charId: string) {
    if (!slug) return;
    setError(null);
    setShowLibPicker(false);
    try {
      const imgRes = await fetch(`/api/library/${charId}/image`);
      if (!imgRes.ok) throw new Error("Failed to load library image");
      const blob = await imgRes.blob();
      const file = new File([blob], `${charId}.png`, { type: "image/png" });
      await handleStyleRefUpload(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to use library image");
    }
  }

  async function handleStyleRefUpload(file: File) {
    if (!slug) return;
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`/api/reimagine/${slug}/style-ref`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Style upload failed");
      }
      setStyleRefFile(file);
      setStyleRefUrl(URL.createObjectURL(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Style upload failed");
    }
  }

  // ---- Save style to project ----

  async function saveStyleConfig() {
    if (!slug) return;
    const body: Record<string, string> = { styleMode };
    if (styleMode === "preset") {
      body.stylePreset = stylePreset;
    }
    if (customStyleNote) {
      body.styleDescription = customStyleNote;
      savePromptToHistory(customStyleNote);
      setPromptHistory(loadPromptHistory());
    }
    await fetch(`/api/reimagine/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  // ---- Analyze ----

  async function handleAnalyze() {
    if (!slug) return;
    setAnalyzing(true);
    setError(null);
    try {
      await saveStyleConfig();
      const res = await fetch(`/api/reimagine/${slug}/analyze`, {
        method: "POST",
        headers: apiHeaders(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Analysis failed");
      }
      const result = await res.json();
      setCharacters(result.characters || []);
      setEntries(result.entries || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  // ---- Generate ----

  const handleGenerate = useCallback(async () => {
    if (!slug) return;
    setGenerating(true);
    setError(null);
    setStep("generate");
    let done = 0;
    setDoneCount(0);

    for (let i = 0; i < entries.length; i++) {
      setEntries((prev) =>
        prev.map((e, idx) => (idx === i ? { ...e, status: "generating" as const } : e)),
      );

      try {
        const res = await fetch(`/api/reimagine/${slug}/generate/${i}`, {
          method: "POST",
          headers: imgApiHeaders(),
        });
        const result = await res.json();
        if (res.ok && result.status === "done") {
          done++;
          setDoneCount(done);
          setEntries((prev) =>
            prev.map((e, idx) =>
              idx === i
                ? { ...e, status: "done" as const, outputImagePath: result.outputImagePath, error: undefined }
                : e,
            ),
          );
        } else {
          setEntries((prev) =>
            prev.map((e, idx) =>
              idx === i ? { ...e, status: "failed" as const, error: result.error || "Failed" } : e,
            ),
          );
        }
      } catch {
        setEntries((prev) =>
          prev.map((e, idx) =>
            idx === i ? { ...e, status: "failed" as const, error: "Network error" } : e,
          ),
        );
      }
    }

    setGenerating(false);
    setStep("results");
  }, [slug, entries, settings, imageProviderId]);

  function openEditPrompt(index: number) {
    const entry = entries[index];
    setEditingPromptIdx(index);
    setEditPromptText(entry.reimaginedPrompt || entry.prompt);
  }

  async function saveEntryPrompt(index: number) {
    if (!slug) return;
    const updated = entries.map((e, idx) =>
      idx === index ? { ...e, reimaginedPrompt: editPromptText } : e,
    );
    setEntries(updated);
    setEditingPromptIdx(null);
    try {
      await fetch(`/api/reimagine/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: updated }),
      });
    } catch { /* best effort */ }
  }

  async function handleRegenerateOne(index: number) {
    if (!slug) return;
    setEntries((prev) =>
      prev.map((e, idx) => (idx === index ? { ...e, status: "generating" as const } : e)),
    );

    try {
      const res = await fetch(`/api/reimagine/${slug}/generate/${index}`, {
        method: "POST",
        headers: imgApiHeaders(),
      });
      const result = await res.json();
      if (!res.ok) {
        setEntries((prev) =>
          prev.map((e, idx) =>
            idx === index ? { ...e, status: "failed" as const, error: result.error || `HTTP ${res.status}` } : e,
          ),
        );
        return;
      }
      setEntries((prev) =>
        prev.map((e, idx) =>
          idx === index
            ? {
                ...e,
                status: result.status === "done" ? ("done" as const) : ("failed" as const),
                outputImagePath: result.outputImagePath,
                error: result.error,
              }
            : e,
        ),
      );
    } catch {
      setEntries((prev) =>
        prev.map((e, idx) =>
          idx === index ? { ...e, status: "failed" as const, error: "Network error" } : e,
        ),
      );
    }
  }

  function toggleSelectForRegen(index: number) {
    setSelectedForRegen((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  }

  async function assignCharToIndices(charLabel: string, indices: number[]) {
    if (!slug) return;
    const idxSet = new Set(indices);
    const updated = entries.map((e, idx) => {
      if (!idxSet.has(idx)) return e;
      const used = new Set(e.characters_used);
      used.add(charLabel);
      return { ...e, characters_used: Array.from(used) };
    });
    setEntries(updated);
    try {
      await fetch(`/api/reimagine/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: updated }),
      });
    } catch { /* best effort */ }
  }

  async function removeCharFromIndices(charLabel: string, indices: number[]) {
    if (!slug) return;
    const idxSet = new Set(indices);
    const updated = entries.map((e, idx) => {
      if (!idxSet.has(idx)) return e;
      return { ...e, characters_used: e.characters_used.filter((c) => c !== charLabel) };
    });
    setEntries(updated);
    try {
      await fetch(`/api/reimagine/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: updated }),
      });
    } catch { /* best effort */ }
  }

  function handleAssignChar(charLabel: string) {
    assignCharToIndices(charLabel, Array.from(selectedForRegen));
  }

  function handleRemoveChar(charLabel: string) {
    removeCharFromIndices(charLabel, Array.from(selectedForRegen));
  }

  async function handleRegenerateSelected() {
    if (!slug || selectedForRegen.size === 0) return;
    const indices = Array.from(selectedForRegen).sort((a, b) => a - b);
    setSelectedForRegen(new Set());
    for (const i of indices) {
      await handleRegenerateOne(i);
    }
  }

  // ---- Save ----

  async function loadSavedFolders() {
    try {
      const res = await fetch("/api/saved");
      if (res.ok) setSavedFolders(await res.json());
    } catch { /* ignore */ }
  }

  async function handleSave() {
    if (!slug || !saveName.trim()) return;
    try {
      await fetch(`/api/reimagine/${slug}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderName: saveName.trim() }),
      });
      setSaveModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  function handleNewSession() {
    setSlug(null);
    setEntries([]);
    setCharacters([]);
    setStyleMode("preset");
    setStylePreset("3d-pixar");
    setStyleRefFile(null);
    setStyleRefUrl(null);
    setCustomStyleNote("");
    setDoneCount(0);
    setError(null);
    setSaveModalOpen(false);
    setSaveName("");
    setEditingCharId(null);
    setEditingPromptIdx(null);
    setSavingToLib(new Set());
    setSavedToLib(new Set());
    setStep("upload");
    fetch("/api/reimagine").then((r) => r.ok ? r.json() : []).then(setExistingProjects).catch(() => {});
  }

  // ---- Render ----

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <div className="page">
      <h1>Style Transfer</h1>
      <p className="muted" style={{ marginBottom: 4 }}>
        Upload images and reimagine them in a new style
      </p>

      {/* Step indicator */}
      <div className="steps">
        {STEPS.map((s, i) => (
          <span
            key={s.key}
            className={`step-dot ${step === s.key ? "active" : ""} ${stepIndex > i ? "done" : ""}`}
            style={{ cursor: stepIndex >= i && !generating ? "pointer" : "default" }}
            onClick={() => { if (stepIndex >= i && !generating) setStep(s.key); }}
          >
            {i + 1}. {s.label}
          </span>
        ))}
      </div>

      {error && (
        <div className="note" style={{ borderLeftColor: "var(--danger)", marginBottom: 16 }}>
          {error}
          <button
            className="btn btn-sm btn-ghost"
            style={{ marginLeft: 8 }}
            onClick={() => setError(null)}
          >
            dismiss
          </button>
        </div>
      )}

      {/* ---- Step 1: Upload ---- */}
      {step === "upload" && (
        <div className="panel">
          {slug ? (
            <div style={{ marginBottom: 8 }}>
              {renamingId === slug ? (
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                  <input
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { handleRenameProject(slug); } if (e.key === "Escape") setRenamingId(null); }}
                    style={{ fontSize: 14, padding: "4px 8px", flex: 1 }}
                    autoFocus
                  />
                  <button className="btn btn-sm btn-primary" onClick={() => handleRenameProject(slug)}>Save</button>
                  <button className="btn btn-sm" onClick={() => setRenamingId(null)}>Cancel</button>
                </div>
              ) : (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h2 style={{ margin: 0 }}>{existingProjects.find((p) => p.id === slug)?.name || slug}</h2>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button className="btn btn-sm" onClick={() => { setRenamingId(slug); setRenameValue(existingProjects.find((p) => p.id === slug)?.name || slug); }}>Rename</button>
                    <button className="btn btn-sm" onClick={handleNewSession}>Close Project</button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <h2>Upload Source Images</h2>
          )}
          <p className="muted" style={{ marginBottom: 12, fontSize: 12 }}>
            {slug ? "Add more images, merge other projects, or continue to style selection" : "Upload the images you want to reimagine in a new style (handmade drawings, sketches, photos, etc.)"}
          </p>

          <div
            className="drop"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.multiple = true;
              input.accept = "image/png,image/jpeg,image/webp";
              input.onchange = () => {
                if (input.files && input.files.length > 0) handleFileUpload(input.files);
              };
              input.click();
            }}
          >
            {uploading ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <div className="spinner-sm" /> Uploading...
              </div>
            ) : (
              <>Drop images here or click to select</>
            )}
          </div>

          {entries.length > 0 && (
            <>
              <p className="muted" style={{ marginTop: 12, fontSize: 12 }}>
                {entries.length} image(s) uploaded
              </p>
              <div className="source-grid" style={{ marginTop: 8 }}>
                {entries.map((entry) => (
                  <div key={entry.sourceImageId} className="source-thumb">
                    <img
                      src={`/api/reimagine/${slug}/sources/${entry.sourceImageId}`}
                      alt={`Source ${entry.index + 1}`}
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            {slug && entries.some((e) => e.status === "done") && (
              <button
                className="btn"
                style={{ flex: 1 }}
                onClick={() => setStep("results")}
              >
                View Results
              </button>
            )}
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              disabled={entries.length === 0}
              onClick={() => setStep("style")}
            >
              Next: Choose Style
            </button>
          </div>

          {existingProjects.length > 0 && (
            <div style={{ marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
              <h3 style={{ fontSize: 14, marginBottom: 8, color: "var(--text)" }}>
                {slug ? "Merge or Manage Projects" : "Load Existing Project"}
              </h3>
              {slug && (
                <p className="muted" style={{ fontSize: 11, marginBottom: 8 }}>
                  Merge copies source images into the current project. Re-analyze after merging for unified characters.
                </p>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {existingProjects
                  .filter((p) => p.id !== slug)
                  .map((p) => {
                  const total = p.entries.length;
                  const done = p.entries.filter((e) => e.status === "done").length;
                  const style = p.stylePreset || (p.styleMode === "reference" ? "Reference" : "---");
                  return (
                    <div key={p.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {renamingId === p.id ? (
                        <div style={{ display: "flex", gap: 4, alignItems: "center", padding: "6px 0" }}>
                          <input
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleRenameProject(p.id); if (e.key === "Escape") setRenamingId(null); }}
                            style={{ fontSize: 12, padding: "4px 8px", flex: 1 }}
                            autoFocus
                          />
                          <button className="btn btn-sm btn-primary" onClick={() => handleRenameProject(p.id)}>Save</button>
                          <button className="btn btn-sm" onClick={() => setRenamingId(null)}>Cancel</button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 4 }}>
                          <button
                            className="btn"
                            style={{ flex: 1, textAlign: "left", padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                            onClick={() => slug ? handleMergeProject(p.id) : handleLoadProject(p.id)}
                            disabled={loadingProject || merging}
                          >
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                              <div className="muted" style={{ fontSize: 11 }}>
                                {total} images · {done}/{total} done · {style}
                              </div>
                            </div>
                            <span style={{ fontSize: 11, flexShrink: 0, color: slug ? "var(--accent)" : "var(--text-dim)" }}>
                              {slug ? (merging ? "Merging..." : "Merge") : new Date(p.updatedAt).toLocaleDateString()}
                            </span>
                          </button>
                          <button
                            className="btn btn-sm"
                            style={{ alignSelf: "center", flexShrink: 0 }}
                            onClick={() => { setRenamingId(p.id); setRenameValue(p.name); }}
                          >
                            Rename
                          </button>
                          <button
                            className="btn btn-sm"
                            style={{ alignSelf: "center", color: "var(--danger)", flexShrink: 0 }}
                            onClick={() => { if (confirm(`Delete "${p.name}"?`)) handleDeleteProject(p.id); }}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---- Step 2: Style ---- */}
      {step === "style" && (
        <div className="panel">
          <h2>Choose Target Style</h2>

          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            <button
              className={`btn ${styleMode === "preset" ? "btn-primary" : ""}`}
              onClick={() => setStyleMode("preset")}
            >
              Preset Style
            </button>
            <button
              className={`btn ${styleMode === "reference" ? "btn-primary" : ""}`}
              onClick={() => setStyleMode("reference")}
            >
              Reference Image
            </button>
          </div>

          {styleMode === "preset" && (
            <div className="style-grid">
              {STYLE_PRESETS.map((preset) => (
                <div
                  key={preset.id}
                  className={`style-card ${stylePreset === preset.id ? "selected" : ""}`}
                  onClick={() => setStylePreset(preset.id)}
                >
                  <div style={{ fontSize: 28, marginBottom: 6 }}>{preset.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{preset.label}</div>
                </div>
              ))}
            </div>
          )}

          {styleMode === "reference" && (
            <div>
              {styleRefUrl ? (
                <div style={{ textAlign: "center", marginBottom: 12 }}>
                  <img
                    src={styleRefUrl}
                    alt="Style reference"
                    style={{ maxWidth: 300, maxHeight: 300, borderRadius: 10, border: "1px solid var(--border)" }}
                  />
                  <p className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                    {styleRefFile?.name}
                  </p>
                  <button className="btn btn-sm" onClick={() => { setStyleRefFile(null); setStyleRefUrl(null); }}>
                    Remove
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <div
                    className="drop"
                    style={{ flex: 1, minWidth: 200 }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (e.dataTransfer.files[0]) handleStyleRefUpload(e.dataTransfer.files[0]);
                    }}
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = "image/png,image/jpeg,image/webp";
                      input.onchange = () => {
                        if (input.files?.[0]) handleStyleRefUpload(input.files[0]);
                      };
                      input.click();
                    }}
                  >
                    Upload a style reference image
                  </div>
                  {libraryChars.length > 0 && (
                    <button className="btn" style={{ alignSelf: "center" }} onClick={() => setShowLibPicker(true)}>
                      Pick from Library
                    </button>
                  )}
                </div>
              )}

              {showLibPicker && (
                <div className="modal-overlay" onClick={() => setShowLibPicker(false)}>
                  <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
                    <h2>Pick Style Reference from Library</h2>
                    <div className="lib-grid" style={{ maxHeight: 400, overflowY: "auto" }}>
                      {libraryChars.filter((c) => c.imagePath).map((char) => (
                        <div
                          key={char.id}
                          className="lib-card"
                          onClick={() => handleLibraryStyleRef(char.id)}
                        >
                          <img src={`/api/library/${char.id}/image`} alt={char.label} className="lib-card-img" />
                          <div className="lib-card-name">{char.label}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                      <button className="btn" onClick={() => setShowLibPicker(false)}>Cancel</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="field" style={{ marginTop: 16 }}>
            <label>Additional style instructions (optional)</label>
            <textarea
              value={customStyleNote}
              onChange={(e) => setCustomStyleNote(e.target.value)}
              placeholder="e.g., warm colors, soft lighting, whimsical mood..."
              className="prompt"
            />
            {promptHistory.length > 0 && (
              <div style={{ marginTop: 6 }}>
                <span className="muted" style={{ fontSize: 11 }}>Recent: </span>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                  {promptHistory.map((p, i) => (
                    <button
                      key={i}
                      className="btn btn-sm"
                      style={{ fontSize: 10, padding: "2px 8px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      onClick={() => setCustomStyleNote(p)}
                      title={p}
                    >
                      {p.length > 30 ? p.slice(0, 30) + "..." : p}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button className="btn" onClick={() => setStep("upload")}>
              Back
            </button>
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              disabled={styleMode === "reference" && !styleRefFile}
              onClick={() => setStep("characters")}
            >
              Next: Analyze Characters
            </button>
          </div>
        </div>
      )}

      {/* ---- Step 3: Characters ---- */}
      {step === "characters" && (
        <div className="panel">
          <h2>Character Identification</h2>
          <p className="muted" style={{ marginBottom: 12, fontSize: 12 }}>
            AI will analyze your images to identify scenes and recurring characters. This ensures characters stay consistent across all reimagined images.
          </p>

          {!analyzing && characters.length === 0 && entries.every((e) => !e.prompt) && (
            <div style={{ textAlign: "center", padding: 20 }}>
              <button
                className="btn btn-primary"
                onClick={handleAnalyze}
                style={{ padding: "12px 32px", fontSize: 14 }}
              >
                Analyze Images
              </button>
              <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                This may take a moment for large batches
              </p>
            </div>
          )}

          {analyzing && (
            <div style={{ textAlign: "center", padding: 40 }}>
              <div className="spinner" style={{ margin: "0 auto 12px" }} />
              <p className="muted">Analyzing {entries.length} images...</p>
            </div>
          )}

          {!analyzing && characters.length > 0 && (
            <>
              <h3 style={{ fontSize: 14, marginBottom: 8, color: "var(--text)" }}>
                Detected Characters ({characters.length})
              </h3>
              <div className="char-grid" style={{ marginBottom: 16 }}>
                {characters.map((char) => (
                  <div key={char.id} className="char-card">
                    {char.referenceImagePath ? (
                      <img
                        src={`/api/reimagine/${slug}/sources/${char.sourceImageIds[0]}`}
                        alt={char.label}
                        className="char-card-img"
                      />
                    ) : (
                      <div className="char-card-img char-card-placeholder">No ref</div>
                    )}
                    <div className="char-card-info">
                      <strong>{char.label}</strong>
                      <span className="muted" style={{ fontSize: 11 }}>
                        {char.description.length > 60 ? char.description.slice(0, 60) + "..." : char.description}
                      </span>
                    </div>
                    <div style={{ padding: "4px 8px 8px", display: "flex", gap: 4 }}>
                      <button className="btn btn-sm" style={{ flex: 1 }} onClick={() => openEditChar(char)}>
                        Edit
                      </button>
                      <button
                        className="btn btn-sm"
                        style={{ flex: 1 }}
                        onClick={() => saveCharToLibrary(char)}
                        disabled={savingToLib.has(char.id) || savedToLib.has(char.id)}
                      >
                        {savedToLib.has(char.id) ? "Saved" : savingToLib.has(char.id) ? "Saving..." : "To Library"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Edit character modal */}
              {editingCharId && (
                <div className="modal-overlay" onClick={() => setEditingCharId(null)}>
                  <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
                    <h2>Edit Character</h2>
                    <div className="field">
                      <label>Name</label>
                      <input type="text" value={editCharLabel} onChange={(e) => setEditCharLabel(e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Description</label>
                      <textarea
                        value={editCharDesc}
                        onChange={(e) => setEditCharDesc(e.target.value)}
                        style={{ minHeight: 100 }}
                      />
                    </div>
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button className="btn" onClick={() => setEditingCharId(null)}>Cancel</button>
                      <button className="btn btn-primary" onClick={saveCharEdits}>Save</button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {!analyzing && entries.some((e) => e.prompt) && (
            <>
              <h3 style={{ fontSize: 14, marginBottom: 8, color: "var(--text)" }}>
                Scene Descriptions ({entries.length})
              </h3>
              <div style={{ maxHeight: 300, overflowY: "auto" }}>
                {entries.map((entry, i) => (
                  <div key={entry.sourceImageId} className="scene-preview" style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "start" }}>
                      <img
                        src={`/api/reimagine/${slug}/sources/${entry.sourceImageId}`}
                        alt={`Source ${i + 1}`}
                        style={{ width: 60, height: 60, borderRadius: 6, objectFit: "cover", flexShrink: 0 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="scene-meta">Image {i + 1}</div>
                        <p style={{ fontSize: 12, margin: 0, color: "var(--text-dim)" }}>
                          {entry.prompt.slice(0, 120)}...
                        </p>
                        {entry.characters_used.length > 0 && (
                          <div style={{ marginTop: 4 }}>
                            {entry.characters_used.map((c) => (
                              <span key={c} className="tag">{c}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button className="btn" onClick={() => setStep("style")}>
              Back
            </button>
            {characters.length === 0 && entries.every((e) => !e.prompt) && (
              <button
                className="btn"
                style={{ flex: 1 }}
                onClick={async () => {
                  await saveStyleConfig();
                  setStep("generate");
                  // Auto-trigger generate without analysis
                }}
              >
                Skip (no character consistency)
              </button>
            )}
            {entries.some((e) => e.prompt) && (
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={handleGenerate}
              >
                Generate All ({entries.length} images)
              </button>
            )}
          </div>
        </div>
      )}

      {/* ---- Step 4: Generating ---- */}
      {step === "generate" && (
        <div className="panel">
          <h2>Generating Reimagined Images</h2>
          <div className="progress" style={{ marginBottom: 16 }}>
            <div style={{ width: `${entries.length > 0 ? (doneCount / entries.length) * 100 : 0}%` }} />
          </div>
          <p className="muted" style={{ textAlign: "center" }}>
            {doneCount} / {entries.length} images generated
          </p>

          <div className="reimagine-grid" style={{ marginTop: 16 }}>
            {entries.map((entry, i) => (
              <div key={entry.sourceImageId} className="reimagine-pair">
                <div className="reimagine-pair-images">
                  <img
                    src={`/api/reimagine/${slug}/sources/${entry.sourceImageId}`}
                    alt={`Source ${i + 1}`}
                    className="reimagine-pair-img"
                  />
                  {entry.status === "done" && entry.outputImagePath ? (
                    <img
                      src={`/api/reimagine/${slug}/outputs/${i}`}
                      alt={`Output ${i + 1}`}
                      className="reimagine-pair-img"
                    />
                  ) : (
                    <div className="reimagine-pair-img" style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: "var(--surface)", color: "var(--text-dim)", fontSize: 12,
                    }}>
                      {entry.status === "generating" ? (
                        <div className="spinner-sm" />
                      ) : entry.status === "failed" ? (
                        <span style={{ color: "var(--danger)" }}>Failed</span>
                      ) : (
                        `#${i + 1}`
                      )}
                    </div>
                  )}
                </div>
                {entry.error && (
                  <div style={{ padding: "4px 8px", fontSize: 11, color: "var(--danger)" }}>
                    {entry.error}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- Step 5: Results ---- */}
      {step === "results" && (
        <div className="panel">
          <h2>Results</h2>
          <p className="muted" style={{ marginBottom: 12, fontSize: 12 }}>
            {entries.filter((e) => e.status === "done").length} / {entries.length} images reimagined
          </p>

          <div className="reimagine-grid">
            {entries.map((entry, i) => (
              <div key={entry.sourceImageId} className="reimagine-pair" style={{ position: "relative" }}>
                <label style={{
                  position: "absolute", top: 6, left: 6, zIndex: 2,
                  display: "flex", alignItems: "center", gap: 4,
                  background: "rgba(0,0,0,0.5)", borderRadius: 4, padding: "2px 6px",
                  cursor: "pointer", fontSize: 11, color: "#fff",
                }}>
                  <input
                    type="checkbox"
                    checked={selectedForRegen.has(i)}
                    onChange={() => toggleSelectForRegen(i)}
                  />
                  #{i + 1}
                </label>
                <div style={{
                  position: "absolute", top: 6, right: 6, zIndex: 2,
                  display: "flex", gap: 2, flexWrap: "wrap", justifyContent: "flex-end",
                }}>
                  {entry.characters_used.map((c) => (
                    <span
                      key={c}
                      className="tag"
                      style={{ fontSize: 9, padding: "1px 4px", cursor: "pointer" }}
                      onClick={(e) => { e.stopPropagation(); removeCharFromIndices(c, [i]); }}
                      title={`Remove ${c}`}
                    >{c} x</span>
                  ))}
                  {characters.length > 0 && (
                    <select
                      style={{ fontSize: 9, padding: "1px 2px", background: "rgba(0,0,0,0.5)", color: "#fff", border: "1px solid var(--border)", borderRadius: 3, cursor: "pointer" }}
                      value=""
                      onChange={(e) => { if (e.target.value) assignCharToIndices(e.target.value, [i]); }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <option value="">+ char</option>
                      {characters.filter((c) => !entry.characters_used.includes(c.label)).map((c) => (
                        <option key={c.id} value={c.label}>{c.label}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="reimagine-pair-images">
                  <img
                    src={`/api/reimagine/${slug}/sources/${entry.sourceImageId}`}
                    alt={`Source ${i + 1}`}
                    className="reimagine-pair-img"
                  />
                  {entry.status === "done" && entry.outputImagePath ? (
                    <img
                      src={`/api/reimagine/${slug}/outputs/${i}`}
                      alt={`Output ${i + 1}`}
                      className="reimagine-pair-img"
                    />
                  ) : (
                    <div className="reimagine-pair-img" style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: "var(--surface)", color: "var(--text-dim)",
                    }}>
                      {entry.status === "failed" ? (
                        <span style={{ color: "var(--danger)", fontSize: 12 }}>Failed</span>
                      ) : (
                        "---"
                      )}
                    </div>
                  )}
                </div>
                <div style={{ padding: 8 }}>
                  {editingPromptIdx === i ? (
                    <div style={{ marginBottom: 6 }}>
                      <textarea
                        className="prompt"
                        value={editPromptText}
                        onChange={(e) => setEditPromptText(e.target.value)}
                        style={{ fontSize: 11, minHeight: 80, width: "100%", marginBottom: 6 }}
                      />
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="btn btn-sm" onClick={() => setEditingPromptIdx(null)}>Cancel</button>
                        <button className="btn btn-sm btn-primary" style={{ flex: 1 }} onClick={() => saveEntryPrompt(i)}>Save Prompt</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="btn btn-sm"
                      style={{ width: "100%", marginBottom: 4, fontSize: 11, color: "var(--text-dim)" }}
                      onClick={() => openEditPrompt(i)}
                    >
                      Edit Prompt
                    </button>
                  )}
                  <button
                    className="btn btn-sm"
                    style={{ width: "100%" }}
                    onClick={() => handleRegenerateOne(i)}
                    disabled={entry.status === "generating"}
                  >
                    {entry.status === "generating" ? "Generating..." : "Regenerate"}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {selectedForRegen.size > 0 && characters.length > 0 && (
            <div style={{ marginTop: 12, padding: 10, border: "1px solid var(--border)", borderRadius: 8 }}>
              <div style={{ fontSize: 12, marginBottom: 6, color: "var(--text-dim)" }}>
                Assign character to {selectedForRegen.size} selected image(s):
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {characters.map((c) => (
                  <button
                    key={c.id}
                    className="btn btn-sm"
                    onClick={() => handleAssignChar(c.label)}
                    title={`Assign "${c.label}" to selected images`}
                  >
                    + {c.label}
                  </button>
                ))}
              </div>
              {(() => {
                const selectedChars = new Set(
                  Array.from(selectedForRegen).flatMap((idx) => entries[idx]?.characters_used || [])
                );
                return selectedChars.size > 0 ? (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>Remove from selected:</div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {Array.from(selectedChars).map((label) => (
                        <button
                          key={label}
                          className="btn btn-sm"
                          style={{ color: "var(--danger)" }}
                          onClick={() => handleRemoveChar(label)}
                        >
                          - {label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null;
              })()}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            <button className="btn" onClick={() => setStep("style")}>
              Change Style
            </button>
            <button className="btn" onClick={() => setStep("characters")}>
              Edit Characters
            </button>
            {selectedForRegen.size > 0 && (
              <button className="btn btn-primary" onClick={handleRegenerateSelected}>
                Regenerate Selected ({selectedForRegen.size})
              </button>
            )}
            <button className="btn" onClick={handleGenerate}>
              Regenerate All
            </button>
            <button className="btn btn-primary" onClick={() => { loadSavedFolders(); setSaveModalOpen(true); }}>
              Save to Folder
            </button>
            <button className="btn" onClick={handleNewSession}>
              New Session
            </button>
          </div>

          {saveModalOpen && (
            <div className="modal-overlay" onClick={() => setSaveModalOpen(false)}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <h2>Save Images</h2>
                {savedFolders.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 6, display: "block" }}>Existing folders</label>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {savedFolders.map((f) => (
                        <button
                          key={f}
                          className={`btn btn-sm ${saveName === f ? "btn-primary" : ""}`}
                          onClick={() => setSaveName(f)}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="field">
                  <label>Folder name</label>
                  <input
                    type="text"
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    placeholder="my-reimagined-images"
                  />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn" onClick={() => setSaveModalOpen(false)}>
                    Cancel
                  </button>
                  <button className="btn btn-primary" onClick={handleSave} disabled={!saveName.trim()}>
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
