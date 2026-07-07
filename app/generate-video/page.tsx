"use client";

import { useState, useEffect, useRef } from "react";

const STORAGE_KEY = "image_creator_settings";

const DEFAULTS: Record<string, string> = {
  defaultImageProvider: "comfyui",
  defaultImageModel: "flux2_dev_fp8mixed.safetensors",
  defaultTextProvider: "ollama",
  defaultTextModel: "glm-5.2:cloud",
  defaultVideoProvider: "comfyui",
  defaultVideoModel: "ltx-2.3",
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
  { id: "comfyui", label: "ComfyUI LTX 2.3 (local GPU)" },
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

interface LibChar {
  id: string;
  label: string;
  imagePath?: string;
}

type ImageSourceType = "project" | "library" | "upload";

export default function GenerateVideoPage() {
  const [settings, setSettings] = useState<Record<string, string>>(DEFAULTS);
  const [sourceType, setSourceType] = useState<ImageSourceType>("project");
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [selectedScene, setSelectedScene] = useState<number>(0);
  const [library, setLibrary] = useState<LibChar[]>([]);
  const [selectedChar, setSelectedChar] = useState<string>("");
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadBase64, setUploadBase64] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [videoProvider, setVideoProvider] = useState("comfyui");
  const [videoModel, setVideoModel] = useState("");
  const [prompt, setPrompt] = useState("");
  const [framePosition, setFramePosition] = useState<"first" | "last">("first");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [videoLength, setVideoLength] = useState(97);
  const [steps, setSteps] = useState(30);
  const [fps, setFps] = useState(25);
  const [duration, setDuration] = useState(5);

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    videoUrl: string;
    generation: Record<string, string | number>;
  } | null>(null);

  useEffect(() => {
    const s = loadSettings();
    setSettings(s);
    setVideoProvider(s.defaultVideoProvider || "comfyui");
    setVideoModel(s.defaultVideoModel || "");
    fetch("/api/projects").then(r => r.json()).then((p: Project[]) => {
      setProjects(p);
      if (p.length > 0) setSelectedProject(p[0].id);
    }).catch(() => {});
    fetch("/api/library").then(r => r.json()).then((chars: LibChar[]) => {
      setLibrary(chars);
      if (chars.length > 0) setSelectedChar(chars[0].id);
    }).catch(() => {});
  }, []);

  const isPiAPI = videoProvider.startsWith("piapi");
  const currentProject = projects.find(p => p.id === selectedProject);
  const doneScenes = currentProject?.scenes.filter(s => s.status === "done" && s.imagePath) || [];

  function getPreviewUrl(): string | null {
    if (sourceType === "project" && currentProject) {
      const scene = doneScenes.find(s => s.index === selectedScene);
      if (scene) return `/api/projects/${selectedProject}/keyframes/${scene.index}`;
    }
    if (sourceType === "library" && selectedChar) {
      return `/api/library/${selectedChar}/image`;
    }
    if (sourceType === "upload" && uploadPreview) {
      return uploadPreview;
    }
    return null;
  }

  function handleFileSelect(file: File) {
    const url = URL.createObjectURL(file);
    setUploadPreview(url);
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = (reader.result as string).split(",")[1];
      setUploadBase64(b64);
    };
    reader.readAsDataURL(file);
  }

  async function handleGenerate() {
    if (!prompt.trim()) { setError("Enter a prompt"); return; }
    if (isPiAPI && !settings.piapiKey) { setError("PiAPI API key required. Set it in Settings."); return; }
    setGenerating(true);
    setError(null);
    setResult(null);

    let imageSource: Record<string, unknown>;
    if (sourceType === "project") {
      imageSource = { type: "project", projectId: selectedProject, sceneIndex: selectedScene };
    } else if (sourceType === "library") {
      imageSource = { type: "library", characterId: selectedChar };
    } else {
      if (!uploadBase64) { setError("Upload an image first"); setGenerating(false); return; }
      imageSource = { type: "base64", data: uploadBase64 };
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (settings.comfyuiUrl) headers["x-base-url"] = settings.comfyuiUrl;
    if (isPiAPI && settings.piapiKey) headers["x-provider-key"] = settings.piapiKey;

    try {
      const res = await fetch("/api/generate-video", {
        method: "POST",
        headers,
        body: JSON.stringify({
          prompt: prompt.trim(),
          framePosition,
          imageSource,
          aspectRatio,
          videoProvider,
          videoModel,
          ...(isPiAPI
            ? { duration }
            : { length: videoLength, steps, fps }),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server returned ${res.status}`);
      }

      const data = await res.json();
      setResult({ videoUrl: data.videoPath, generation: data.generation });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Video generation failed");
    } finally {
      setGenerating(false);
    }
  }

  const previewUrl = getPreviewUrl();
  const durationSeconds = isPiAPI ? duration : Number(((videoLength - 1) / fps).toFixed(1));
  const providerLabel = VIDEO_PROVIDERS.find(p => p.id === videoProvider)?.label || videoProvider;

  return (
    <div className="page">
      <h1>Generate Video</h1>
      <p className="muted" style={{ marginBottom: 12 }}>
        Create videos from your scene images or character portraits.
      </p>

      <div className="note" style={{ fontSize: 11, padding: "6px 10px", marginBottom: 12 }}>
        <strong>Video Provider:</strong> {providerLabel}
        {videoModel && <> &middot; {videoModel}</>}
        &nbsp;|&nbsp;
        <strong>Output:</strong> {aspectRatio} &middot; ~{durationSeconds}s
      </div>

      {error && (
        <div className="note" style={{ borderLeftColor: "var(--danger)", marginBottom: 16 }}>
          {error}
          <button className="btn btn-sm btn-ghost" style={{ marginLeft: 8 }} onClick={() => setError(null)}>dismiss</button>
        </div>
      )}

      <div className="gen-layout">
        <div className="panel">
          <h2>Input Image</h2>

          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button className={`btn ${sourceType === "project" ? "btn-primary" : ""}`} onClick={() => setSourceType("project")}>
              From Scene
            </button>
            <button className={`btn ${sourceType === "library" ? "btn-primary" : ""}`} onClick={() => setSourceType("library")}>
              From Library
            </button>
            <button className={`btn ${sourceType === "upload" ? "btn-primary" : ""}`} onClick={() => setSourceType("upload")}>
              Upload
            </button>
          </div>

          {sourceType === "project" && (
            <div>
              <div className="field">
                <label>Project</label>
                <select value={selectedProject} onChange={e => { setSelectedProject(e.target.value); setSelectedScene(0); }}>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              {doneScenes.length > 0 ? (
                <div className="field">
                  <label>Scene</label>
                  <select value={selectedScene} onChange={e => setSelectedScene(Number(e.target.value))}>
                    {doneScenes.map(s => (
                      <option key={s.index} value={s.index}>Scene {s.index + 1}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <p className="muted" style={{ fontSize: 12 }}>No generated scenes in this project. Generate scenes first.</p>
              )}
            </div>
          )}

          {sourceType === "library" && (
            <div className="field">
              <label>Character</label>
              {library.length > 0 ? (
                <select value={selectedChar} onChange={e => setSelectedChar(e.target.value)}>
                  {library.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              ) : (
                <p className="muted" style={{ fontSize: 12 }}>No characters in library.</p>
              )}
            </div>
          )}

          {sourceType === "upload" && (
            <div>
              {!uploadPreview ? (
                <div
                  className="drop"
                  onClick={() => fileRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); if (e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files[0]); }}
                >
                  Drop an image here or click to select
                </div>
              ) : (
                <button className="btn btn-sm" onClick={() => { setUploadPreview(null); setUploadBase64(null); }}>
                  Remove
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }}
                onChange={e => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]); e.target.value = ""; }}
              />
            </div>
          )}

          {previewUrl && (
            <div style={{ marginTop: 12 }}>
              <img src={previewUrl} alt="Input" style={{ width: "100%", maxHeight: 280, objectFit: "contain", borderRadius: 10, border: "1px solid var(--border)" }} />
            </div>
          )}

          <hr style={{ margin: "16px 0", borderColor: "var(--border)" }} />

          <h2>Video Settings</h2>

          <div className="field">
            <label>Video Provider</label>
            <select value={videoProvider} onChange={e => setVideoProvider(e.target.value)}>
              {VIDEO_PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>

          <div className="field">
            <label>Prompt</label>
            <textarea
              style={{ minHeight: 80 }}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Describe the motion and action for the video..."
            />
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div className="field" style={{ flex: 1, minWidth: 120 }}>
              <label>Image Position</label>
              <select value={framePosition} onChange={e => setFramePosition(e.target.value as "first" | "last")}>
                <option value="first">First frame</option>
                <option value="last">Last frame</option>
              </select>
            </div>
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

          {/* ComfyUI-specific settings */}
          {!isPiAPI && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div className="field" style={{ flex: 1, minWidth: 100 }}>
                <label>Frames</label>
                <select value={videoLength} onChange={e => setVideoLength(Number(e.target.value))}>
                  <option value={33}>33 (~1.3s)</option>
                  <option value={49}>49 (~1.9s)</option>
                  <option value={65}>65 (~2.6s)</option>
                  <option value={81}>81 (~3.2s)</option>
                  <option value={97}>97 (~3.8s)</option>
                  <option value={121}>121 (~4.8s)</option>
                  <option value={161}>161 (~6.4s)</option>
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

          {/* PiAPI-specific settings */}
          {isPiAPI && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div className="field" style={{ flex: 1, minWidth: 100 }}>
                <label>Duration (seconds)</label>
                <select value={duration} onChange={e => setDuration(Number(e.target.value))}>
                  <option value={5}>5 seconds</option>
                  <option value={10}>10 seconds</option>
                </select>
              </div>
              <div className="field" style={{ flex: 1, minWidth: 120 }}>
                <label>Model Version</label>
                <input
                  type="text"
                  value={videoModel}
                  onChange={e => setVideoModel(e.target.value)}
                  placeholder={videoProvider === "piapi-kling" ? "2.6" : videoProvider === "piapi-hailuo" ? "v2.3" : ""}
                />
              </div>
            </div>
          )}

          {isPiAPI && !settings.piapiKey && (
            <div className="note" style={{ borderLeftColor: "var(--danger)", fontSize: 12, marginBottom: 8 }}>
              PiAPI API key not set. Go to <a href="/settings">Settings</a> to add it.
            </div>
          )}

          <button
            className="btn btn-primary"
            style={{ width: "100%", marginTop: 8 }}
            onClick={handleGenerate}
            disabled={generating || !prompt.trim() || !previewUrl || (isPiAPI && !settings.piapiKey)}
          >
            {generating ? "Generating Video..." : "Generate Video"}
          </button>
        </div>

        <div className="panel">
          <h2>Result</h2>
          {generating && (
            <div className="page-center" style={{ padding: "60px 0" }}>
              <div className="spinner" />
              <p className="muted" style={{ marginTop: 12 }}>
                Generating video with {providerLabel}...
              </p>
              <p className="muted" style={{ fontSize: 11, marginTop: 4 }}>This may take several minutes</p>
            </div>
          )}
          {result && (
            <div>
              <video
                src={result.videoUrl}
                controls
                autoPlay
                loop
                style={{ width: "100%", borderRadius: 10, marginBottom: 12 }}
              />
              <div className="note" style={{ fontSize: 11, padding: "6px 10px" }}>
                <strong>Generated with:</strong> {String(result.generation.provider || "comfyui")} / {String(result.generation.model || "LTX 2.3")}
                <br />
                Frame position: {String(result.generation.framePosition || "first")} &middot;
                {result.generation.length && <> {String(result.generation.length)} frames &middot;</>}
                {result.generation.duration && <> {String(result.generation.duration)}s &middot;</>}
                {result.generation.steps && <> {String(result.generation.steps)} steps &middot;</>}
                {" "}{String(result.generation.aspectRatio || "16:9")}
              </div>
              <a
                href={result.videoUrl}
                download
                className="btn"
                style={{ display: "block", textAlign: "center", marginTop: 8 }}
              >
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
