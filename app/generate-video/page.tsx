"use client";

import { useState, useEffect, useRef } from "react";
import type { LibraryCharacter } from "@/lib/types";
import MentionTextarea from "@/components/MentionTextarea";

const STORAGE_KEY = "image_creator_settings";

const DEFAULTS: Record<string, string> = {
  defaultImageProvider: "comfyui",
  defaultImageModel: "flux2_dev_fp8mixed.safetensors",
  defaultTextProvider: "ollama",
  defaultTextModel: "glm-5.2:cloud",
  defaultVideoProvider: "comfyui",
  defaultVideoModel: "wan-2.1",
  ollamaUrl: "http://localhost:11434",
  comfyuiUrl: "http://localhost:8188",
  piapiKey: "",
};

function loadSettings() {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch { return DEFAULTS; }
}

const VIDEO_PROVIDERS = [
  { id: "comfyui", label: "ComfyUI Wan 2.1 (local GPU)" },
  { id: "piapi-kling", label: "PiAPI - Kling" },
  { id: "piapi-hailuo", label: "PiAPI - Hailuo (Minimax)" },
  { id: "piapi-seedance", label: "PiAPI - Seedance 2.0" },
];

interface ProjectScene {
  index: number;
  prompt: string;
  imagePath?: string | null;
  status: string;
}

interface Project {
  id: string;
  name: string;
  scenes: ProjectScene[];
}

type ImageSourceType = "project" | "library" | "upload";
type FrameImageSource =
  | { type: "project"; projectId: string; sceneIndex: number }
  | { type: "library"; characterId: string }
  | { type: "base64"; data: string }
  | null;

interface FrameSelection {
  sourceType: ImageSourceType;
  projectId: string;
  sceneIndex: number;
  charId: string;
  uploadPreview: string | null;
  uploadBase64: string | null;
}

const emptyFrame = (): FrameSelection => ({
  sourceType: "project",
  projectId: "",
  sceneIndex: 0,
  charId: "",
  uploadPreview: null,
  uploadBase64: null,
});

export default function GenerateVideoPage() {
  const [settings, setSettings] = useState<Record<string, string>>(DEFAULTS);
  const [projects, setProjects] = useState<Project[]>([]);
  const [library, setLibrary] = useState<LibraryCharacter[]>([]);

  const [firstFrame, setFirstFrame] = useState<FrameSelection>(emptyFrame());
  const [lastFrame, setLastFrame] = useState<FrameSelection>(emptyFrame());
  const [useLastFrame, setUseLastFrame] = useState(false);
  const firstFileRef = useRef<HTMLInputElement>(null);
  const lastFileRef = useRef<HTMLInputElement>(null);

  const [videoProvider, setVideoProvider] = useState("comfyui");
  const [videoModel, setVideoModel] = useState("");
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [videoLength, setVideoLength] = useState(81);
  const [steps, setSteps] = useState(30);
  const [fps, setFps] = useState(16);
  const [duration, setDuration] = useState(5);

  const [mentionedChars, setMentionedChars] = useState<Set<string>>(new Set());

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    videoUrl: string;
    enhancedPrompt?: string;
    generation: Record<string, string | number>;
  } | null>(null);

  useEffect(() => {
    const s = loadSettings();
    setSettings(s);
    setVideoProvider(s.defaultVideoProvider || "comfyui");
    setVideoModel(s.defaultVideoModel || "");
    fetch("/api/projects").then(r => r.json()).then((p: Project[]) => {
      setProjects(p);
      const firstProj = p[0]?.id || "";
      setFirstFrame(f => ({ ...f, projectId: firstProj }));
      setLastFrame(f => ({ ...f, projectId: firstProj }));
    }).catch(() => {});
    fetch("/api/library").then(r => r.json()).then((chars: LibraryCharacter[]) => {
      setLibrary(chars);
      const firstChar = chars[0]?.id || "";
      setFirstFrame(f => ({ ...f, charId: firstChar }));
      setLastFrame(f => ({ ...f, charId: firstChar }));
    }).catch(() => {});
  }, []);

  const isPiAPI = videoProvider.startsWith("piapi");
  const textProviderId = settings.defaultTextProvider || "ollama";
  const textModelName = settings.defaultTextModel || "";

  function apiKeyFor(providerId: string): string {
    const map: Record<string, string> = {
      gemini: settings.geminiKey || "",
      openai: settings.openaiKey || "",
      claude: settings.claudeKey || "",
      qwen: settings.qwenKey || "",
      piapi: settings.piapiKey || "",
    };
    return map[providerId] || "";
  }

  function getDoneScenes(projectId: string): ProjectScene[] {
    const proj = projects.find(p => p.id === projectId);
    return (proj?.scenes || []).filter(s => s.status === "done" && s.imagePath);
  }

  function getPreviewUrl(frame: FrameSelection): string | null {
    if (frame.sourceType === "project" && frame.projectId) {
      const scenes = getDoneScenes(frame.projectId);
      const scene = scenes.find(s => s.index === frame.sceneIndex);
      if (scene) return `/api/projects/${frame.projectId}/keyframes/${scene.index}`;
    }
    if (frame.sourceType === "library" && frame.charId) {
      const char = library.find(c => c.id === frame.charId);
      if (char?.imagePath) return `/api/library/${frame.charId}/image`;
    }
    if (frame.sourceType === "upload" && frame.uploadPreview) {
      return frame.uploadPreview;
    }
    return null;
  }

  function buildSource(frame: FrameSelection): FrameImageSource {
    if (frame.sourceType === "project" && frame.projectId) {
      return { type: "project", projectId: frame.projectId, sceneIndex: frame.sceneIndex };
    }
    if (frame.sourceType === "library" && frame.charId) {
      return { type: "library", characterId: frame.charId };
    }
    if (frame.sourceType === "upload" && frame.uploadBase64) {
      return { type: "base64", data: frame.uploadBase64 };
    }
    return null;
  }

  function handleFileSelect(file: File, which: "first" | "last") {
    const url = URL.createObjectURL(file);
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = (reader.result as string).split(",")[1];
      const update = { uploadPreview: url, uploadBase64: b64 };
      if (which === "first") setFirstFrame(f => ({ ...f, ...update }));
      else setLastFrame(f => ({ ...f, ...update }));
    };
    reader.readAsDataURL(file);
  }

  async function handleGenerate() {
    if (!prompt.trim()) { setError("Enter a prompt"); return; }
    if (isPiAPI && !settings.piapiKey) { setError("PiAPI API key required. Set it in Settings."); return; }

    const firstSrc = buildSource(firstFrame);
    const lastSrc = useLastFrame ? buildSource(lastFrame) : null;
    if (!firstSrc && !lastSrc) { setError("Select at least one frame image"); return; }

    setGenerating(true);
    setError(null);
    setResult(null);

    const textProviderId = settings.defaultTextProvider || "ollama";
    const textModel = settings.defaultTextModel || "";

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (settings.comfyuiUrl) headers["x-base-url"] = settings.comfyuiUrl;
    if (isPiAPI && settings.piapiKey) headers["x-provider-key"] = settings.piapiKey;
    if (textProviderId === "ollama" && settings.ollamaUrl) headers["x-text-base-url"] = settings.ollamaUrl;
    const textKey = apiKeyFor(textProviderId);
    if (textKey) headers["x-text-provider-key"] = textKey;

    try {
      const res = await fetch("/api/generate-video", {
        method: "POST",
        headers,
        body: JSON.stringify({
          prompt: prompt.trim(),
          firstFrameSource: firstSrc,
          lastFrameSource: lastSrc,
          aspectRatio,
          videoProvider,
          videoModel,
          textProviderId,
          textModel,
          characters: library
            .filter(c => mentionedChars.has(c.id))
            .map(c => ({ label: c.label, description: c.description || "" })),
          ...(isPiAPI ? { duration } : { length: videoLength, steps, fps }),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server returned ${res.status}`);
      }

      const data = await res.json();
      setResult({ videoUrl: data.videoPath, enhancedPrompt: data.enhancedPrompt, generation: data.generation });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Video generation failed");
    } finally {
      setGenerating(false);
    }
  }

  const firstPreview = getPreviewUrl(firstFrame);
  const lastPreview = useLastFrame ? getPreviewUrl(lastFrame) : null;
  const durationSeconds = isPiAPI ? duration : Number(((videoLength - 1) / fps).toFixed(1));
  const providerLabel = VIDEO_PROVIDERS.find(p => p.id === videoProvider)?.label || videoProvider;

  function renderFramePicker(
    label: string,
    frame: FrameSelection,
    setFrame: React.Dispatch<React.SetStateAction<FrameSelection>>,
    fileRef: React.RefObject<HTMLInputElement | null>,
    preview: string | null,
  ) {
    const scenes = getDoneScenes(frame.projectId);
    return (
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>{label}</h3>

        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          {(["project", "library", "upload"] as ImageSourceType[]).map(t => (
            <button key={t} className={`btn btn-sm ${frame.sourceType === t ? "btn-primary" : ""}`}
              onClick={() => setFrame(f => ({ ...f, sourceType: t }))}>
              {t === "project" ? "Scene" : t === "library" ? "Library" : "Upload"}
            </button>
          ))}
        </div>

        {frame.sourceType === "project" && (
          <>
            <div className="field" style={{ marginBottom: 6 }}>
              <select value={frame.projectId} onChange={e => setFrame(f => ({ ...f, projectId: e.target.value, sceneIndex: 0 }))} style={{ fontSize: 12 }} suppressHydrationWarning>
                {projects.length === 0 && <option value="">Loading projects...</option>}
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            {scenes.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: 6 }}>
                {scenes.map(s => (
                  <div key={s.index} onClick={() => setFrame(f => ({ ...f, sceneIndex: s.index }))}
                    style={{
                      cursor: "pointer", borderRadius: 6, overflow: "hidden",
                      border: frame.sceneIndex === s.index ? "2px solid var(--accent)" : "2px solid var(--border)",
                      aspectRatio: "1",
                    }}>
                    <img src={`/api/projects/${frame.projectId}/keyframes/${s.index}`} alt={`Scene ${s.index + 1}`}
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted" style={{ fontSize: 11 }}>No generated scenes in this project.</p>
            )}
          </>
        )}

        {frame.sourceType === "library" && (
          library.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: 6 }}>
              {library.map(c => (
                <div key={c.id} onClick={() => setFrame(f => ({ ...f, charId: c.id }))}
                  style={{
                    cursor: "pointer", borderRadius: 6, overflow: "hidden",
                    border: frame.charId === c.id ? "2px solid var(--accent)" : "2px solid var(--border)",
                    aspectRatio: "1", position: "relative",
                  }}>
                  {c.imagePath ? (
                    <img src={`/api/library/${c.id}/image`} alt={c.label}
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--surface-2)", fontSize: 10 }}>
                      {c.label}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="muted" style={{ fontSize: 11 }}>No characters in library.</p>
          )
        )}

        {frame.sourceType === "upload" && (
          <>
            {!frame.uploadPreview ? (
              <div className="drop" style={{ padding: "16px 8px", fontSize: 12 }}
                onClick={() => fileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); if (e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files[0], label.includes("First") ? "first" : "last"); }}>
                Drop image or click
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <img src={frame.uploadPreview} alt="Upload" style={{ height: 60, borderRadius: 6 }} />
                <button className="btn btn-sm" onClick={() => setFrame(f => ({ ...f, uploadPreview: null, uploadBase64: null }))}>Remove</button>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }}
              onChange={e => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0], label.includes("First") ? "first" : "last"); e.target.value = ""; }} />
          </>
        )}

        {preview && (
          <div style={{ marginTop: 8, textAlign: "center" }}>
            <img src={preview} alt="Selected" style={{ maxHeight: 120, borderRadius: 6, border: "2px solid var(--accent)" }} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page">
      <h1>Generate Video</h1>
      <p className="muted" style={{ marginBottom: 12 }}>
        Create videos from images. Select first frame, last frame, or both.
      </p>

      <div className="note" style={{ fontSize: 11, padding: "6px 10px", marginBottom: 12 }}>
        <strong>Video:</strong> {providerLabel}
        {videoModel && <> &middot; {videoModel}</>}
        &nbsp;|&nbsp;
        <strong>Text LLM:</strong> {textProviderId} / {textModelName || "default"}
        &nbsp;|&nbsp;
        <strong>Output:</strong> {aspectRatio} &middot; ~{durationSeconds}s
        {useLastFrame && " (first + last frame)"}
      </div>

      {error && (
        <div className="note" style={{ borderLeftColor: "var(--danger)", marginBottom: 16 }}>
          {error}
          <button className="btn btn-sm btn-ghost" style={{ marginLeft: 8 }} onClick={() => setError(null)}>dismiss</button>
        </div>
      )}

      <div className="gen-layout">
        <div className="panel">
          {renderFramePicker("First Frame", firstFrame, setFirstFrame, firstFileRef, firstPreview)}

          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, cursor: "pointer" }}>
            <input type="checkbox" checked={useLastFrame} onChange={e => setUseLastFrame(e.target.checked)} style={{ width: "auto" }} />
            <span style={{ fontSize: 13 }}>Also set last frame</span>
          </label>

          {useLastFrame && renderFramePicker("Last Frame", lastFrame, setLastFrame, lastFileRef, lastPreview)}

          <hr style={{ margin: "12px 0", borderColor: "var(--border)" }} />

          <div className="field">
            <label>Video Provider</label>
            <select value={videoProvider} onChange={e => setVideoProvider(e.target.value)}>
              {VIDEO_PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>

          <div className="field">
            <label>Prompt</label>
            <MentionTextarea
              value={prompt}
              onChange={setPrompt}
              characters={library}
              onMention={c => setMentionedChars(prev => new Set(prev).add(c.id))}
              style={{ minHeight: 80 }}
              placeholder="Describe the motion and action... Type @ to reference a character"
            />
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div className="field" style={{ flex: 1, minWidth: 120 }}>
              <label>Aspect Ratio</label>
              <select value={aspectRatio} onChange={e => setAspectRatio(e.target.value)}>
                <option value="16:9">16:9 (Landscape)</option>
                <option value="9:16">9:16 (Portrait)</option>
                <option value="1:1">1:1 (Square)</option>
                <option value="4:3">4:3 (Standard)</option>
              </select>
            </div>
          </div>

          {!isPiAPI && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div className="field" style={{ flex: 1, minWidth: 100 }}>
                <label>Frames</label>
                <select value={videoLength} onChange={e => setVideoLength(Number(e.target.value))}>
                  <option value={33}>33 (~2s)</option>
                  <option value={49}>49 (~3s)</option>
                  <option value={65}>65 (~4s)</option>
                  <option value={81}>81 (~5s)</option>
                  <option value={97}>97 (~6s)</option>
                  <option value={121}>121 (~7.5s)</option>
                </select>
              </div>
              <div className="field" style={{ flex: 1, minWidth: 80 }}>
                <label>Steps</label>
                <input type="number" value={steps} min={10} max={60} onChange={e => setSteps(Number(e.target.value) || 30)} />
              </div>
              <div className="field" style={{ flex: 1, minWidth: 80 }}>
                <label>FPS</label>
                <input type="number" value={fps} min={12} max={60} onChange={e => setFps(Number(e.target.value) || 25)} />
              </div>
            </div>
          )}

          {isPiAPI && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div className="field" style={{ flex: 1, minWidth: 100 }}>
                <label>Duration</label>
                <select value={duration} onChange={e => setDuration(Number(e.target.value))}>
                  <option value={5}>5 seconds</option>
                  <option value={10}>10 seconds</option>
                </select>
              </div>
              <div className="field" style={{ flex: 1, minWidth: 120 }}>
                <label>Model Version</label>
                <input type="text" value={videoModel} onChange={e => setVideoModel(e.target.value)}
                  placeholder={videoProvider === "piapi-kling" ? "2.6" : videoProvider === "piapi-hailuo" ? "v2.3" : ""} />
              </div>
            </div>
          )}

          {isPiAPI && !settings.piapiKey && (
            <div className="note" style={{ borderLeftColor: "var(--danger)", fontSize: 12, marginBottom: 8 }}>
              PiAPI API key not set. Go to <a href="/settings">Settings</a> to add it.
            </div>
          )}

          <button className="btn btn-primary" style={{ width: "100%", marginTop: 8 }}
            onClick={handleGenerate}
            disabled={generating || !prompt.trim() || (!firstPreview && !lastPreview) || (isPiAPI && !settings.piapiKey)}>
            {generating ? "Generating Video..." : "Generate Video"}
          </button>
        </div>

        <div className="panel">
          <h2>Result</h2>
          {generating && (
            <div className="page-center" style={{ padding: "60px 0" }}>
              <div className="spinner" />
              <p className="muted" style={{ marginTop: 12 }}>Generating video with {providerLabel}...</p>
              <p className="muted" style={{ fontSize: 11, marginTop: 4 }}>This may take several minutes</p>
            </div>
          )}
          {result && (
            <div>
              <video src={result.videoUrl} controls autoPlay loop
                style={{ width: "100%", borderRadius: 10, marginBottom: 12 }} />
              <div className="note" style={{ fontSize: 11, padding: "6px 10px" }}>
                <strong>Generated with:</strong> {result.generation.provider || "comfyui"} / {result.generation.model || "LTX 2.3"}
                {result.generation.textProvider && <><br /><strong>Prompt LLM:</strong> {result.generation.textProvider} / {result.generation.textModel}</>}
                <br />
                Frames: {result.generation.frameMode || "first"}
                {result.generation.length && <> &middot; {result.generation.length} frames</>}
                {result.generation.duration && <> &middot; {result.generation.duration}s</>}
                {result.generation.steps && <> &middot; {result.generation.steps} steps</>}
                {" "}&middot; {result.generation.aspectRatio || "16:9"}
              </div>
              {result.enhancedPrompt && result.enhancedPrompt !== prompt && (
                <details style={{ marginTop: 8 }}>
                  <summary className="muted" style={{ fontSize: 12, cursor: "pointer" }}>Enhanced prompt</summary>
                  <p style={{ fontSize: 12, marginTop: 6, color: "var(--text-dim)" }}>{result.enhancedPrompt}</p>
                </details>
              )}
              <a href={result.videoUrl} download className="btn"
                style={{ display: "block", textAlign: "center", marginTop: 8 }}>
                Download Video
              </a>
            </div>
          )}
          {!generating && !result && (
            <div className="page-center" style={{ padding: "60px 0" }}>
              <p className="muted">Generated video will appear here</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
