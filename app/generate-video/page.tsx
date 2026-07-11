"use client";

import { useState, useEffect, useRef } from "react";
import type { LibraryCharacter } from "@/lib/types";
import { PIAPI_VIDEO_CATALOG, findModelDef } from "@/lib/piapi-video-catalog";
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

interface VideoMeta {
  videoId: string;
  createdAt: string;
  prompt: string;
  enhancedPrompt: string | null;
  firstFrameSource: FrameImageSource;
  lastFrameSource: FrameImageSource;
  generation: Record<string, string | number>;
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
  const [videoVariant, setVideoVariant] = useState("");
  const [videoMode, setVideoMode] = useState("");
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [videoLength, setVideoLength] = useState(81);
  const [steps, setSteps] = useState(30);
  const [fps, setFps] = useState(16);
  const [duration, setDuration] = useState(5);

  const [mentionedChars, setMentionedChars] = useState<Set<string>>(new Set());

  const [enhancing, setEnhancing] = useState(false);
  const [enhancedPrompt, setEnhancedPrompt] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    videoUrl: string;
    generation: Record<string, string | number>;
  } | null>(null);
  const [videoHistory, setVideoHistory] = useState<VideoMeta[]>([]);
  const [extractingFrame, setExtractingFrame] = useState(false);

  useEffect(() => {
    const s = loadSettings();
    setSettings(s);
    const provider = s.defaultVideoProvider || "comfyui";
    setVideoProvider(provider);
    const def = findModelDef(provider);
    if (def) {
      setVideoVariant(def.defaultVariant);
      setVideoMode(def.defaultMode || "");
      if (def.durations.length > 0) setDuration(def.defaultDuration);
    }
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
    fetch("/api/generate-video?list=true").then(r => r.json()).then(d => {
      setVideoHistory(d.videos || []);
    }).catch(() => {});
  }, []);

  const isPiAPI = videoProvider.startsWith("piapi");
  const modelDef = isPiAPI ? findModelDef(videoProvider) : null;
  const textProviderId = settings.defaultTextProvider || "ollama";
  const textModelName = settings.defaultTextModel || "";

  function refreshHistory() {
    fetch("/api/generate-video?list=true").then(r => r.json()).then(d => {
      setVideoHistory(d.videos || []);
    }).catch(() => {});
  }

  function sourceToFrame(src: FrameImageSource): FrameSelection {
    if (!src) return emptyFrame();
    if (src.type === "project") {
      return { ...emptyFrame(), sourceType: "project", projectId: src.projectId, sceneIndex: src.sceneIndex };
    }
    if (src.type === "library") {
      return { ...emptyFrame(), sourceType: "library", charId: src.characterId };
    }
    return emptyFrame();
  }

  function loadFromHistory(meta: VideoMeta) {
    setPrompt(meta.prompt);
    setEnhancedPrompt(meta.enhancedPrompt || null);

    const provider = String(meta.generation.provider || "comfyui");
    setVideoProvider(provider);
    const def = findModelDef(provider);
    if (def) {
      setVideoVariant(String(meta.generation.variant || def.defaultVariant));
      setVideoMode(String(meta.generation.mode || def.defaultMode || ""));
      setDuration(Number(meta.generation.duration) || def.defaultDuration);
    }

    setAspectRatio(String(meta.generation.aspectRatio || "16:9"));
    if (meta.generation.length) setVideoLength(Number(meta.generation.length));
    if (meta.generation.steps) setSteps(Number(meta.generation.steps));
    if (meta.generation.fps) setFps(Number(meta.generation.fps));

    setFirstFrame(sourceToFrame(meta.firstFrameSource));
    if (meta.lastFrameSource) {
      setUseLastFrame(true);
      setLastFrame(sourceToFrame(meta.lastFrameSource));
    } else {
      setUseLastFrame(false);
    }

    const projId = meta.firstFrameSource?.type === "project" ? meta.firstFrameSource.projectId
      : meta.lastFrameSource?.type === "project" ? (meta.lastFrameSource as { projectId: string }).projectId : null;
    const videoUrl = projId
      ? `/api/generate-video?id=${meta.videoId}&project=${projId}`
      : `/api/generate-video?id=${meta.videoId}`;
    setResult({ videoUrl, generation: meta.generation });
    setError(null);
  }

  async function useVideoLastFrame(videoUrl: string) {
    setExtractingFrame(true);
    try {
      const params = new URL(videoUrl, window.location.origin).searchParams;
      const id = params.get("id");
      const project = params.get("project");
      if (!id) throw new Error("No video id");

      const doUpscale = isPiAPI && !!settings.piapiKey;
      const frameUrl = `/api/video-frame?id=${id}&frame=last${project ? `&project=${project}` : ""}${doUpscale ? "&upscale=true" : ""}`;
      const headers: Record<string, string> = {};
      if (doUpscale) headers["x-provider-key"] = settings.piapiKey;

      const res = await fetch(frameUrl, { headers });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to extract frame");
      }

      const blob = await res.blob();
      const reader = new FileReader();
      const b64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const preview = URL.createObjectURL(blob);
      setFirstFrame({ sourceType: "upload", projectId: "", sceneIndex: 0, charId: "", uploadPreview: preview, uploadBase64: b64 });
      setEnhancedPrompt(null);
      setResult(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Frame extraction failed");
    } finally {
      setExtractingFrame(false);
    }
  }

  function handleProviderChange(newProvider: string) {
    setVideoProvider(newProvider);
    const def = findModelDef(newProvider);
    if (def) {
      setVideoVariant(def.defaultVariant);
      setVideoMode(def.defaultMode || "");
      if (def.durations.length > 0) setDuration(def.defaultDuration);
    }
  }

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

  function getTextHeaders(): Record<string, string> {
    const tpId = settings.defaultTextProvider || "ollama";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (tpId === "ollama" && settings.ollamaUrl) headers["x-text-base-url"] = settings.ollamaUrl;
    const textKey = apiKeyFor(tpId);
    if (textKey) headers["x-text-provider-key"] = textKey;
    return headers;
  }

  function getFrameMode(): "first" | "last" | "both" {
    const hasFirst = !!getPreviewUrl(firstFrame);
    const hasLast = useLastFrame && !!getPreviewUrl(lastFrame);
    return hasFirst && hasLast ? "both" : hasFirst ? "first" : "last";
  }

  async function handleEnhance() {
    if (!prompt.trim()) { setError("Enter a prompt first"); return; }
    const tpId = settings.defaultTextProvider || "ollama";
    const tModel = settings.defaultTextModel || "";
    if (!tpId || !tModel) { setError("Set a Text LLM in Settings first"); return; }

    setEnhancing(true);
    setError(null);

    try {
      const res = await fetch("/api/enhance-video-prompt", {
        method: "POST",
        headers: getTextHeaders(),
        body: JSON.stringify({
          prompt: prompt.trim(),
          textProviderId: tpId,
          textModel: tModel,
          frameMode: getFrameMode(),
          characters: library
            .filter(c => mentionedChars.has(c.id))
            .map(c => ({ label: c.label, description: c.description || "" })),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server returned ${res.status}`);
      }

      const data = await res.json();
      setEnhancedPrompt(data.enhanced);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Prompt enhancement failed");
    } finally {
      setEnhancing(false);
    }
  }

  async function handleGenerate() {
    const finalPrompt = enhancedPrompt || prompt.trim();
    if (!finalPrompt) { setError("Enter a prompt"); return; }
    if (isPiAPI && !settings.piapiKey) { setError("PiAPI API key required. Set it in Settings."); return; }

    const firstSrc = buildSource(firstFrame);
    const lastSrc = useLastFrame ? buildSource(lastFrame) : null;
    if (!firstSrc && !lastSrc) { setError("Select at least one frame image"); return; }

    setGenerating(true);
    setError(null);
    setResult(null);

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (settings.comfyuiUrl) headers["x-base-url"] = settings.comfyuiUrl;
    if (isPiAPI && settings.piapiKey) headers["x-provider-key"] = settings.piapiKey;

    try {
      const res = await fetch("/api/generate-video", {
        method: "POST",
        headers,
        body: JSON.stringify({
          prompt: finalPrompt,
          rawPrompt: enhancedPrompt ? prompt.trim() : undefined,
          firstFrameSource: firstSrc,
          lastFrameSource: lastSrc,
          aspectRatio,
          videoProvider,
          videoModel: videoVariant,
          videoMode: videoMode || undefined,
          ...(isPiAPI ? { duration } : { length: videoLength, steps, fps }),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server returned ${res.status}`);
      }

      const data = await res.json();
      setResult({ videoUrl: data.videoPath, generation: data.generation });
      refreshHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Video generation failed");
    } finally {
      setGenerating(false);
    }
  }

  const firstPreview = getPreviewUrl(firstFrame);
  const lastPreview = useLastFrame ? getPreviewUrl(lastFrame) : null;
  const durationSeconds = isPiAPI ? duration : Number(((videoLength - 1) / fps).toFixed(1));
  const providerLabel = videoProvider === "comfyui"
    ? "ComfyUI Wan 2.1 (local GPU)"
    : modelDef ? `PiAPI — ${modelDef.label}` : videoProvider;
  const variantLabel = modelDef?.variants.find(v => v.id === videoVariant)?.label || videoVariant;

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
        {variantLabel && <> &middot; {variantLabel}</>}
        {videoMode && modelDef?.modes && <> &middot; {modelDef.modes.find(m => m.id === videoMode)?.label}</>}
        &nbsp;|&nbsp;
        <strong>Text LLM:</strong> {textProviderId} / {textModelName || "default"}
        &nbsp;|&nbsp;
        <strong>Output:</strong> {aspectRatio}
        {(durationSeconds > 0) && <> &middot; ~{durationSeconds}s</>}
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
            <input type="checkbox" checked={useLastFrame} onChange={e => {
              setUseLastFrame(e.target.checked);
              if (e.target.checked) setLastFrame({ ...firstFrame });
            }} style={{ width: "auto" }} />
            <span style={{ fontSize: 13 }}>Also set last frame</span>
          </label>

          {useLastFrame && renderFramePicker("Last Frame", lastFrame, setLastFrame, lastFileRef, lastPreview)}

          <hr style={{ margin: "12px 0", borderColor: "var(--border)" }} />

          <div className="field">
            <label>Video Provider</label>
            <select value={videoProvider} onChange={e => handleProviderChange(e.target.value)}>
              <optgroup label="Local">
                <option value="comfyui">ComfyUI Wan 2.1 (local GPU)</option>
              </optgroup>
              <optgroup label="PiAPI Cloud">
                {PIAPI_VIDEO_CATALOG.map(m => (
                  <option key={m.providerId} value={m.providerId}>{m.label}</option>
                ))}
              </optgroup>
            </select>
          </div>

          <div className="field">
            <label>Prompt</label>
            <MentionTextarea
              value={prompt}
              onChange={v => { setPrompt(v); setEnhancedPrompt(null); }}
              characters={library}
              onMention={c => setMentionedChars(prev => new Set(prev).add(c.id))}
              style={{ minHeight: 80 }}
              placeholder="Describe the motion and action... Type @ to reference a character"
            />
          </div>

          <button className="btn" style={{ width: "100%", marginBottom: 8 }}
            onClick={handleEnhance}
            disabled={enhancing || !prompt.trim() || generating}>
            {enhancing ? "Enhancing with LLM..." : "Enhance Prompt with LLM"}
          </button>

          {enhancedPrompt && (
            <div className="field" style={{ marginBottom: 8 }}>
              <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Enhanced Prompt (editable)</span>
                <button className="btn btn-sm btn-ghost" onClick={() => setEnhancedPrompt(null)}>discard</button>
              </label>
              <textarea
                value={enhancedPrompt}
                onChange={e => setEnhancedPrompt(e.target.value)}
                style={{ minHeight: 100, fontSize: 12, lineHeight: 1.5 }}
              />
            </div>
          )}

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

          {isPiAPI && modelDef && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {modelDef.variants.length > 1 && (
                <div className="field" style={{ flex: 1, minWidth: 120 }}>
                  <label>Version</label>
                  <select value={videoVariant} onChange={e => setVideoVariant(e.target.value)}>
                    {modelDef.variants.map(v => (
                      <option key={v.id} value={v.id}>{v.label}</option>
                    ))}
                  </select>
                </div>
              )}
              {modelDef.modes && (
                <div className="field" style={{ flex: 1, minWidth: 100 }}>
                  <label>Mode</label>
                  <select value={videoMode} onChange={e => setVideoMode(e.target.value)}>
                    {modelDef.modes.map(m => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                </div>
              )}
              {modelDef.durations.length > 0 && (
                <div className="field" style={{ flex: 1, minWidth: 100 }}>
                  <label>Duration</label>
                  <select value={duration} onChange={e => setDuration(Number(e.target.value))}>
                    {modelDef.durations.map(d => (
                      <option key={d} value={d}>{d} seconds</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {isPiAPI && !settings.piapiKey && (
            <div className="note" style={{ borderLeftColor: "var(--danger)", fontSize: 12, marginBottom: 8 }}>
              PiAPI API key not set. Go to <a href="/settings">Settings</a> to add it.
            </div>
          )}

          <button className="btn btn-primary" style={{ width: "100%", marginTop: 8 }}
            onClick={handleGenerate}
            disabled={generating || enhancing || !prompt.trim() || (!firstPreview && !lastPreview) || (isPiAPI && !settings.piapiKey)}>
            {generating ? "Generating Video..." : enhancedPrompt ? "Generate Video (enhanced)" : "Generate Video (raw prompt)"}
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
              {enhancedPrompt && (
                <details style={{ marginTop: 8 }}>
                  <summary className="muted" style={{ fontSize: 12, cursor: "pointer" }}>Prompt used</summary>
                  <p style={{ fontSize: 12, marginTop: 6, color: "var(--text-dim)" }}>{enhancedPrompt}</p>
                </details>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <a href={result.videoUrl} download className="btn" style={{ flex: 1, textAlign: "center" }}>
                  Download
                </a>
                <button className="btn btn-primary" style={{ flex: 1 }}
                  onClick={() => useVideoLastFrame(result.videoUrl)}
                  disabled={extractingFrame}>
                  {extractingFrame
                    ? (isPiAPI && settings.piapiKey ? "Extracting & upscaling..." : "Extracting...")
                    : (isPiAPI && settings.piapiKey ? "Last frame → upscale → next" : "Last frame → next first frame")}
                </button>
              </div>
            </div>
          )}
          {!generating && !result && (
            <div className="page-center" style={{ padding: "60px 0" }}>
              <p className="muted">Generated video will appear here</p>
            </div>
          )}
        </div>
      </div>

      {videoHistory.length > 0 && (
        <div className="panel" style={{ marginTop: 16 }}>
          <h2>Video History</h2>
          <p className="muted" style={{ fontSize: 11, marginTop: 0, marginBottom: 12 }}>
            Click a video to reload its settings. {videoHistory.length} video{videoHistory.length !== 1 ? "s" : ""} generated.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
            {videoHistory.map(v => {
              const fs = v.firstFrameSource;
              const ls = v.lastFrameSource;
              const firstLabel = fs?.type === "project" ? `Scene ${(fs.sceneIndex ?? 0) + 1}` : fs?.type === "library" ? "Library" : fs?.type === "base64" ? "Upload" : "—";
              const lastLabel = ls?.type === "project" ? `Scene ${(ls.sceneIndex ?? 0) + 1}` : ls?.type === "library" ? "Library" : ls ? "Upload" : "—";
              const vidProjId = fs?.type === "project" ? fs.projectId : ls?.type === "project" ? (ls as { projectId: string }).projectId : null;
              const projName = vidProjId ? projects.find(p => p.id === vidProjId)?.name || vidProjId : null;
              const vidSrc = vidProjId
                ? `/api/generate-video?id=${v.videoId}&project=${vidProjId}`
                : `/api/generate-video?id=${v.videoId}`;
              const date = new Date(v.createdAt);
              const timeStr = date.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

              return (
                <div key={v.videoId}
                  onClick={() => loadFromHistory(v)}
                  style={{
                    cursor: "pointer", borderRadius: 8, overflow: "hidden",
                    border: "1px solid var(--border)", background: "var(--surface-2)",
                    transition: "border-color 0.15s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--accent)")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
                >
                  <video
                    src={vidSrc}
                    muted
                    preload="metadata"
                    style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", display: "block" }}
                    onMouseEnter={e => (e.currentTarget as HTMLVideoElement).play()}
                    onMouseLeave={e => { const el = e.currentTarget as HTMLVideoElement; el.pause(); el.currentTime = 0; }}
                  />
                  <div style={{ padding: "8px 10px", fontSize: 11, lineHeight: 1.5 }}>
                    <div style={{ fontWeight: 600, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {v.prompt.slice(0, 80)}{v.prompt.length > 80 ? "..." : ""}
                    </div>
                    <div className="muted">
                      {v.generation.provider} / {v.generation.model}
                      {" · "}{v.generation.aspectRatio} · {v.generation.duration || v.generation.length}
                      {v.generation.duration ? "s" : " frames"}
                    </div>
                    <div className="muted">
                      First: {firstLabel} · Last: {lastLabel}
                      {projName && <> · <em>{projName}</em></>}
                    </div>
                    <div className="muted" style={{ fontSize: 10 }}>{timeStr}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
