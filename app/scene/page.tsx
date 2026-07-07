"use client";

import { Suspense, useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import type { LibraryCharacter } from "@/lib/types";
import MentionTextarea from "@/components/MentionTextarea";

type Step = "characters" | "text" | "preview" | "generate" | "review";

interface SceneDesc {
  index: number;
  time_start: number;
  time_end: number;
  lyric_excerpt: string;
  prompt: string;
  characters_used: string[];
  status: "pending" | "generating" | "done" | "failed";
  imagePath?: string | null;
  error?: string;
}

const STORAGE_KEY = "image_creator_settings";

const DEFAULTS: Record<string, string> = {
  defaultImageProvider: "comfyui",
  defaultImageModel: "flux2_dev_fp8mixed.safetensors",
  defaultTextProvider: "ollama",
  defaultTextModel: "glm-5.2:cloud",
  ollamaUrl: "http://localhost:11434",
  comfyuiUrl: "http://localhost:8188",
};

function loadSettings() {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch { return DEFAULTS; }
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

export default function ScenePage() {
  return (
    <Suspense fallback={<div className="page page-center" style={{ padding: "40px 0" }}><div className="spinner" /></div>}>
      <SceneContent />
    </Suspense>
  );
}

function SceneContent() {
  const [step, setStep] = useState<Step>("characters");
  const [library, setLibrary] = useState<LibraryCharacter[]>([]);
  const [selectedCharIds, setSelectedCharIds] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"single" | "sequence">("sequence");
  const [keyframeCount, setKeyframeCount] = useState(12);
  const [text, setText] = useState("");
  const [scenes, setScenes] = useState<SceneDesc[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [generatingScenes, setGeneratingScenes] = useState(false);
  const [generatingImages, setGeneratingImages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneCount, setDoneCount] = useState(0);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [deleteAfterSave, setDeleteAfterSave] = useState(false);
  const [loadingProject, setLoadingProject] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [aspectRatio, setAspectRatio] = useState("1:1");

  const searchParams = useSearchParams();

  useEffect(() => {
    setSettings(loadSettings());
    fetch("/api/library").then((r) => r.json()).then(setLibrary).catch(() => {});
  }, []);

  useEffect(() => {
    const loadSlug = searchParams.get("load");
    if (!loadSlug) return;
    setLoadingProject(true);
    fetch(`/api/projects/${loadSlug}`)
      .then((r) => {
        if (!r.ok) throw new Error("Project not found");
        return r.json();
      })
      .then((manifest) => {
        setSessionId(manifest.id);
        setText(manifest.text || "");
        setMode(manifest.scenes?.length === 1 ? "single" : "sequence");
        setKeyframeCount(manifest.scenes?.length || 12);
        setScenes(
          (manifest.scenes || []).map((s: SceneDesc) => ({
            ...s,
            status: s.imagePath ? "done" : s.status || "pending",
          })),
        );
        const done = (manifest.scenes || []).filter(
          (s: SceneDesc) => s.status === "done" || s.imagePath,
        ).length;
        setDoneCount(done);
        setStep("review");
      })
      .catch(() => setError("Failed to load project"))
      .finally(() => setLoadingProject(false));
  }, [searchParams]);

  const selectedChars = library.filter((c) => selectedCharIds.has(c.id));

  function toggleChar(id: string) {
    setSelectedCharIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const imageProviderId = settings.defaultImageProvider || "comfyui";
  const imageModel = settings.defaultImageModel || "qwen_image_fp8_e4m3fn.safetensors";
  const textProviderId = settings.defaultTextProvider || "ollama";
  const textModel = settings.defaultTextModel || "glm-5.2:cloud";

  async function handleGenerateSceneDescriptions() {
    if (!text.trim()) return;
    setGeneratingScenes(true);
    setError(null);

    const count = mode === "single" ? 1 : keyframeCount;
    const apiKey = getApiKey(settings, textProviderId);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["x-provider-key"] = apiKey;
    if (textProviderId === "ollama" && settings.ollamaUrl) headers["x-base-url"] = settings.ollamaUrl;
    if (textProviderId === "comfyui" && settings.comfyuiUrl) headers["x-base-url"] = settings.comfyuiUrl;

    // First create a session/project
    try {
      const createRes = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `scene-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          provider: {
            image: { id: imageProviderId, model: imageModel },
            text: { id: textProviderId, model: textModel },
          },
        }),
      });
      if (!createRes.ok) throw new Error("Failed to create session");
      const project = await createRes.json();
      setSessionId(project.id);

      // Upload characters into the project
      for (const char of selectedChars) {
        const fd = new FormData();
        fd.append("label", char.label);
        fd.append("description", char.description || "");
        if (char.imagePath) {
          const imgRes = await fetch(`/api/library/${char.id}/image`);
          if (imgRes.ok) {
            const blob = await imgRes.blob();
            fd.append("file", blob, `${char.id}.png`);
          }
        }
        await fetch(`/api/projects/${project.id}/characters`, { method: "POST", body: fd });
      }

      // Update project with text and settings
      await fetch(`/api/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          durationSeconds: count * 5,
          intervalSeconds: 5,
          provider: {
            image: { id: imageProviderId, model: imageModel },
            text: { id: textProviderId, model: textModel },
          },
        }),
      });

      // Generate scene descriptions
      const genRes = await fetch(`/api/projects/${project.id}/generate-scenes`, {
        method: "POST",
        headers,
      });
      if (!genRes.ok) {
        const errData = await genRes.json().catch(() => ({}));
        throw new Error(errData.error || "Scene generation failed");
      }
      const generatedScenes: SceneDesc[] = await genRes.json();
      setScenes(generatedScenes);
      setStep("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate scenes");
    } finally {
      setGeneratingScenes(false);
    }
  }

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleEditPrompt(index: number, newPrompt: string) {
    setScenes((prev) => {
      const updated = prev.map((s) =>
        s.index === index ? { ...s, prompt: newPrompt } : s
      );
      if (sessionId) {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          fetch(`/api/projects/${sessionId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scenes: updated }),
          }).catch(() => {});
        }, 800);
      }
      return updated;
    });
  }

  const handleGenerateImages = useCallback(async () => {
    if (!sessionId) return;
    setGeneratingImages(true);
    setError(null);
    setStep("generate");
    let done = 0;

    const apiKey = getApiKey(settings, imageProviderId);
    const headers: Record<string, string> = {};
    if (apiKey) headers["x-provider-key"] = apiKey;
    if (imageProviderId === "comfyui" && settings.comfyuiUrl) headers["x-base-url"] = settings.comfyuiUrl;
    if (imageProviderId === "ollama" && settings.ollamaUrl) headers["x-base-url"] = settings.ollamaUrl;

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      if (scene.status === "done") { done++; continue; }

      setScenes((prev) => prev.map((s) =>
        s.index === scene.index ? { ...s, status: "generating" } : s
      ));

      try {
        const res = await fetch(`/api/projects/${sessionId}/scenes/${scene.index}/generate`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ provider: { id: imageProviderId, model: imageModel }, aspectRatio }),
        });
        const result = await res.json();
        if (res.ok && result.status === "done") {
          done++;
          setDoneCount(done);
          setScenes((prev) => prev.map((s) =>
            s.index === scene.index ? { ...s, status: "done", imagePath: result.imagePath, error: undefined } : s
          ));
        } else {
          setScenes((prev) => prev.map((s) =>
            s.index === scene.index ? { ...s, status: "failed", error: result.error || "Failed" } : s
          ));
        }
      } catch {
        setScenes((prev) => prev.map((s) =>
          s.index === scene.index ? { ...s, status: "failed", error: "Network error" } : s
        ));
      }
    }

    setGeneratingImages(false);
    setStep("review");
  }, [sessionId, scenes, settings, imageProviderId, imageModel, aspectRatio]);

  async function handleRegenerateOne(index: number) {
    if (!sessionId) return;
    const apiKey = getApiKey(settings, imageProviderId);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["x-provider-key"] = apiKey;
    if (imageProviderId === "comfyui" && settings.comfyuiUrl) headers["x-base-url"] = settings.comfyuiUrl;
    if (imageProviderId === "ollama" && settings.ollamaUrl) headers["x-base-url"] = settings.ollamaUrl;

    setScenes((prev) => prev.map((s) =>
      s.index === index ? { ...s, status: "generating" } : s
    ));

    try {
      const res = await fetch(`/api/projects/${sessionId}/scenes/${index}/generate`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          provider: { id: imageProviderId, model: imageModel },
          prompt: scenes.find((s) => s.index === index)?.prompt,
          aspectRatio,
        }),
      });
      const result = await res.json();
      setScenes((prev) => prev.map((s) =>
        s.index === index
          ? { ...s, status: result.status === "done" ? "done" : "failed", imagePath: result.imagePath, error: result.error }
          : s
      ));
    } catch {
      setScenes((prev) => prev.map((s) =>
        s.index === index ? { ...s, status: "failed", error: "Failed" } : s
      ));
    }
  }

  async function handleSave() {
    if (!sessionId || !saveName.trim()) return;
    try {
      await fetch(`/api/sessions/${sessionId}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderName: saveName.trim(), deleteAfter: deleteAfterSave }),
      });
      setSaveModalOpen(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <div className="page">
      <h1>Generate Scene</h1>

      {/* Step indicator */}
      <div className="steps">
        {(["characters", "text", "preview", "generate", "review"] as Step[]).map((s, i) => (
          <span key={s} className={`step-dot ${step === s ? "active" : ""} ${
            (["characters", "text", "preview", "generate", "review"] as Step[]).indexOf(step) > i ? "done" : ""
          }`}>
            {i + 1}. {s === "characters" ? "Characters" : s === "text" ? "Story" : s === "preview" ? "Review Prompts" : s === "generate" ? "Generating" : "Results"}
          </span>
        ))}
      </div>

      {loadingProject && (
        <div className="page-center" style={{ padding: "40px 0" }}>
          <div className="spinner" />
          <p className="muted" style={{ marginTop: 12 }}>Loading project...</p>
        </div>
      )}

      <div className="note" style={{ fontSize: 11, padding: "6px 10px", marginBottom: 12 }}>
        <strong>Image:</strong> {imageProviderId} / {imageModel} &nbsp;|&nbsp;
        <strong>Text LLM:</strong> {textProviderId} / {textModel}
      </div>

      {error && (
        <div className="note" style={{ borderLeftColor: "var(--danger)", marginBottom: 16 }}>
          {error}
          <button className="btn btn-sm btn-ghost" style={{ marginLeft: 8 }} onClick={() => setError(null)}>dismiss</button>
        </div>
      )}

      {/* Step 1: Select characters */}
      {step === "characters" && (
        <div className="panel">
          <h2>Select Characters</h2>
          <p className="muted" style={{ marginBottom: 12, fontSize: 12 }}>
            Pick characters from your library to use in this scene. You can also skip this step.
          </p>
          {library.length === 0 ? (
            <p className="muted">No characters in library. <a href="/library">Add some</a> or <a href="/generate-character">generate one</a>.</p>
          ) : (
            <div className="char-grid">
              {library.map((char) => (
                <div
                  key={char.id}
                  className={`char-card selectable ${selectedCharIds.has(char.id) ? "selected" : ""}`}
                  onClick={() => toggleChar(char.id)}
                >
                  {char.imagePath ? (
                    <img src={`/api/library/${char.id}/image`} alt={char.label} className="char-card-img" />
                  ) : (
                    <div className="char-card-img char-card-placeholder">No image</div>
                  )}
                  <div className="char-card-info">
                    <strong>{char.label}</strong>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            <div className="field" style={{ flex: 1, marginBottom: 0, minWidth: 140 }}>
              <label>Mode</label>
              <select value={mode} onChange={(e) => setMode(e.target.value as "single" | "sequence")}>
                <option value="single">Single image</option>
                <option value="sequence">Sequence of keyframes</option>
              </select>
            </div>
            {mode === "sequence" && (
              <div className="field" style={{ flex: 1, marginBottom: 0, minWidth: 140 }}>
                <label>Number of keyframes</label>
                <input type="number" value={keyframeCount} min={2} max={100} onChange={(e) => setKeyframeCount(Number(e.target.value) || 12)} />
              </div>
            )}
            <div className="field" style={{ flex: 1, marginBottom: 0, minWidth: 140 }}>
              <label>Aspect Ratio</label>
              <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)}>
                <option value="1:1">1:1 (Square)</option>
                <option value="16:9">16:9 (Landscape)</option>
                <option value="9:16">9:16 (Portrait)</option>
                <option value="4:3">4:3 (Standard)</option>
                <option value="3:4">3:4 (Tall)</option>
              </select>
            </div>
          </div>

          <button className="btn btn-primary" style={{ width: "100%", marginTop: 16 }} onClick={() => setStep("text")}>
            Next: Enter Story
          </button>
        </div>
      )}

      {/* Step 2: Enter text */}
      {step === "text" && (
        <div className="panel">
          <h2>Enter Your Text</h2>
          <p className="muted" style={{ marginBottom: 12, fontSize: 12 }}>
            Paste your story, lyrics, poem, or scene description. Use <strong>@</strong> to reference characters from your library.
            {selectedChars.length > 0 && (
              <>
                <br />
                <span style={{ color: "var(--ok)" }}>
                  Using {selectedChars.length} character(s): {selectedChars.map((c) => c.label).join(", ")}
                </span>
              </>
            )}
          </p>
          <div className="field">
            <MentionTextarea
              value={text}
              onChange={setText}
              characters={library}
              onMention={(char) => {
                setSelectedCharIds((prev) => {
                  const next = new Set(prev);
                  next.add(char.id);
                  return next;
                });
              }}
              placeholder="Paste your story, lyrics, or poem here... Type @ to insert a character"
              style={{ minHeight: 200 }}
            />
          </div>

          {/* Show selected characters with thumbnails */}
          {selectedChars.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {selectedChars.map((c) => (
                <div key={c.id} className="mention-selected-chip">
                  {c.imagePath && (
                    <img src={`/api/library/${c.id}/image`} alt={c.label} className="mention-chip-img" />
                  )}
                  <span>{c.label}</span>
                  <button
                    className="mention-chip-remove"
                    onClick={() => setSelectedCharIds((prev) => {
                      const next = new Set(prev);
                      next.delete(c.id);
                      return next;
                    })}
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={() => setStep("characters")}>Back</button>
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={handleGenerateSceneDescriptions}
              disabled={generatingScenes || !text.trim()}
            >
              {generatingScenes ? "Generating scene descriptions..." : `Generate ${mode === "single" ? "1" : keyframeCount} scene description(s)`}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Preview & approve scene descriptions */}
      {step === "preview" && (
        <div className="panel">
          <h2>Review Scene Descriptions</h2>
          <p className="muted" style={{ marginBottom: 12, fontSize: 12 }}>
            Review and edit the prompts before generating images. Click &quot;Approve &amp; Generate&quot; when ready.
          </p>

          {scenes.map((scene, i) => (
            <div key={scene.index} className="scene-preview">
              <div className="scene-meta">
                Scene {i + 1} &middot; &ldquo;{scene.lyric_excerpt}&rdquo;
                {scene.characters_used.length > 0 && (
                  <> &middot; {scene.characters_used.map((c) => <span key={c} className="tag">{c}</span>)}</>
                )}
              </div>
              <MentionTextarea
                value={scene.prompt}
                onChange={(val) => handleEditPrompt(scene.index, val)}
                characters={library}
                className="prompt"
              />
            </div>
          ))}

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button className="btn" onClick={() => setStep("text")}>Back</button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleGenerateImages}>
              Approve &amp; Generate Images
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Generating */}
      {step === "generate" && (
        <div className="panel">
          <h2>Generating Images</h2>
          <div className="progress" style={{ marginBottom: 16 }}>
            <div style={{ width: `${scenes.length > 0 ? (doneCount / scenes.length) * 100 : 0}%` }} />
          </div>
          <p className="muted" style={{ textAlign: "center" }}>
            {doneCount} / {scenes.length} images generated &middot; {imageModel}
          </p>

          <div className="scene-grid">
            {scenes.map((scene, i) => (
              <div key={scene.index} className="scene-card-mini">
                {scene.status === "done" && scene.imagePath ? (
                  <img
                    src={`/api/projects/${sessionId}/keyframes/${scene.index}`}
                    alt={`Scene ${i + 1}`}
                    className="scene-card-img"
                    style={{ cursor: "zoom-in" }}
                    onClick={() => setLightboxIndex(scene.index)}
                  />
                ) : (
                  <div className="scene-card-img scene-card-placeholder">
                    {scene.status === "generating" ? <div className="spinner-sm" /> : scene.status === "failed" ? "Failed" : `Scene ${i + 1}`}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 5: Review results */}
      {step === "review" && (
        <div className="panel">
          <h2>Results</h2>
          <p className="muted" style={{ marginBottom: 12, fontSize: 12 }}>
            {doneCount} / {scenes.length} images generated. Click any image to edit its prompt and regenerate.
          </p>

          <div className="scene-grid-review">
            {scenes.map((scene, i) => (
              <div key={scene.index} className="scene-review-card">
                {scene.status === "done" && scene.imagePath ? (
                  <img
                    src={`/api/projects/${sessionId}/keyframes/${scene.index}`}
                    alt={`Scene ${i + 1}`}
                    className="scene-review-img"
                    style={{ cursor: "zoom-in" }}
                    onClick={() => setLightboxIndex(scene.index)}
                  />
                ) : (
                  <div className="scene-review-img scene-card-placeholder">
                    {scene.status === "failed" ? "Failed" : "No image"}
                  </div>
                )}
                <div style={{ padding: 8 }}>
                  <div className="scene-meta" style={{ marginBottom: 4 }}>Scene {i + 1}</div>
                  <textarea
                    className="prompt"
                    style={{ minHeight: 48, fontSize: 11 }}
                    value={scene.prompt}
                    onChange={(e) => handleEditPrompt(scene.index, e.target.value)}
                  />
                  <button className="btn btn-sm" style={{ width: "100%", marginTop: 4 }} onClick={() => handleRegenerateOne(scene.index)}>
                    {scene.status === "generating" ? "Generating..." : "Regenerate"}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button className="btn btn-primary" onClick={() => setSaveModalOpen(true)}>Save to Folder</button>
            <button className="btn" onClick={handleGenerateImages}>Regenerate All</button>
          </div>

          {/* Save modal */}
          {saveModalOpen && (
            <div className="modal-overlay" onClick={() => setSaveModalOpen(false)}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <h2>Save Images</h2>
                <div className="field">
                  <label>Folder name</label>
                  <input type="text" value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="my-scene" />
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <input type="checkbox" checked={deleteAfterSave} onChange={(e) => setDeleteAfterSave(e.target.checked)} style={{ width: "auto" }} />
                  Delete images from this session after saving
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn" onClick={() => setSaveModalOpen(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleSave} disabled={!saveName.trim()}>Save</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && sessionId && (
        <div
          className="modal-overlay"
          onClick={() => setLightboxIndex(null)}
          style={{ cursor: "zoom-out" }}
        >
          <div style={{ position: "relative", maxWidth: "90vw", maxHeight: "90vh" }} onClick={(e) => e.stopPropagation()}>
            <img
              src={`/api/projects/${sessionId}/keyframes/${lightboxIndex}`}
              alt={`Scene ${lightboxIndex + 1}`}
              style={{ maxWidth: "90vw", maxHeight: "85vh", borderRadius: 10, display: "block" }}
            />
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 8 }}>
              <button
                className="btn btn-sm"
                disabled={lightboxIndex <= 0}
                onClick={() => setLightboxIndex((lightboxIndex ?? 1) - 1)}
              >
                Prev
              </button>
              <span style={{ color: "#fff", fontSize: 13, padding: "4px 8px" }}>
                {lightboxIndex + 1} / {scenes.length}
              </span>
              <button
                className="btn btn-sm"
                disabled={lightboxIndex >= scenes.length - 1}
                onClick={() => setLightboxIndex((lightboxIndex ?? 0) + 1)}
              >
                Next
              </button>
              <button
                className="btn btn-sm"
                onClick={() => setLightboxIndex(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
