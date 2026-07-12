"use client";

// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// GenerateCharacterPage : create characters via text-to-image or extract
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import { useState, useEffect, useRef } from "react";
import { loadSettings, getApiKey, type SettingsState } from "@/lib/settings";
// =============================================================================

// =============================================================================
/*
    DetectedChar : shape for a character detected during image extraction
*/
// =============================================================================
interface DetectedChar {
  label: string;
  description: string;
  selected: boolean;
  saving: boolean;
  saved: boolean;
  generatedImage?: string;
  generatedMime?: string;
}

// =============================================================================
// Function renders the generate character page -> void to JSX
// =============================================================================
export default function GenerateCharacterPage() {
  /*
      GenerateCharacterPage : two-mode page for creating characters
  */

  // =====================================
  // State — generate mode
  // =====================================
  const [mode, setMode] = useState<"generate" | "upload">("generate");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    imageBase64: string;
    mime: string;
    enhancedPrompt: string;
    generation?: { imageProvider: string; imageModel: string; textProvider: string; textModel: string };
  } | null>(null);
  const [saved, setSaved] = useState(false);
  const [settings, setSettings] = useState<SettingsState | null>(null);

  // =====================================
  // State — upload/extract mode
  // =====================================
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [detectedChars, setDetectedChars] = useState<DetectedChar[]>([]);
  const [sourceImageBase64, setSourceImageBase64] = useState<string | null>(null);
  const [sourceMime, setSourceMime] = useState<string>("image/png");
  const fileRef = useRef<HTMLInputElement>(null);

  // =====================================
  // Load settings from localStorage on mount
  // =====================================
  useEffect(() => { setSettings(loadSettings()); }, []);

  // =====================================
  // Derived provider settings
  // =====================================
  const s = settings || loadSettings();
  const textProviderId = s.defaultTextProvider || "ollama";
  const textModel = s.defaultTextModel || "glm-5.2:cloud";
  const imageProviderId = s.defaultImageProvider || "comfyui";
  const imageModel = s.defaultImageModel || "flux2_dev_fp8mixed.safetensors";

  // =============================================================================
  // Function generates a character from text description -> void to void
  // =============================================================================
  async function handleGenerate() {
    /*
        handleGenerate : sends label + description to /api/generate-character
    */
    // ==================================
    if (!label.trim() || !description.trim()) {
      setError("Enter a name and description");
      return;
    }
    setGenerating(true);
    setError(null);
    setResult(null);
    setSaved(false);

    // =====================================
    // Build headers with provider auth
    // =====================================
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const key = getApiKey(s, imageProviderId);
    // ==================================
    if (key) headers["x-provider-key"] = key;
    // ==================================
    if (imageProviderId === "comfyui" && s.comfyuiUrl) headers["x-base-url"] = s.comfyuiUrl;
    // ==================================
    if (imageProviderId === "ollama" && s.ollamaUrl) headers["x-base-url"] = s.ollamaUrl;

    try {
      const res = await fetch("/api/generate-character", {
        method: "POST",
        headers,
        body: JSON.stringify({
          label: label.trim(),
          description: description.trim(),
          imageProvider: { id: imageProviderId, model: imageModel },
          textProvider: { id: textProviderId, model: textModel },
        }),
      });

      // ==================================
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server returned ${res.status}`);
      }

      const data = await res.json();
      setResult({ imageBase64: data.imageBase64, mime: data.mime, enhancedPrompt: data.enhancedPrompt, generation: data.generation });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  // =============================================================================
  // Function sets up the upload preview from a selected file -> File to void
  // =============================================================================
  function handleFileSelect(file: File) {
    /*
        handleFileSelect : creates preview URL and resets detect state
        file variable : the image file selected for extraction
    */
    setUploadFile(file);
    setUploadPreview(URL.createObjectURL(file));
    setDetectedChars([]);
    setError(null);
  }

  // =============================================================================
  // Function analyzes the uploaded image for characters -> void to void
  // =============================================================================
  async function handleAnalyze() {
    /*
        handleAnalyze : sends image to /api/analyze-characters
    */
    // ==================================
    if (!uploadFile) return;
    setAnalyzing(true);
    setError(null);
    setDetectedChars([]);

    // =====================================
    // Build request
    // =====================================
    const fd = new FormData();
    fd.append("file", uploadFile);
    fd.append("textProviderId", textProviderId);
    fd.append("textModel", textModel);

    const headers: Record<string, string> = {};
    const key = getApiKey(s, textProviderId);
    // ==================================
    if (key) headers["x-provider-key"] = key;
    // ==================================
    if (textProviderId === "ollama" && s.ollamaUrl) headers["x-base-url"] = s.ollamaUrl;

    try {
      const res = await fetch("/api/analyze-characters", {
        method: "POST",
        headers,
        body: fd,
      });

      // ==================================
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
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  // =============================================================================
  // Function toggles selection of a detected character -> number to void
  // =============================================================================
  function toggleChar(index: number) {
    /*
        toggleChar : flips the selected state of a detected character
        index variable : index of the character in detectedChars array
    */
    setDetectedChars((prev) =>
      prev.map((c, i) => (i === index ? { ...c, selected: !c.selected } : c)),
    );
  }

  // =============================================================================
  // Function generates and saves selected detected characters -> void to void
  // =============================================================================
  async function handleSaveSelected() {
    /*
        handleSaveSelected : generates individual portraits for each selected character
    */
    // ==================================
    if (!sourceImageBase64) return;
    const selected = detectedChars.filter((c) => c.selected && !c.saved);
    // ==================================
    if (selected.length === 0) return;

    setError(null);

    for (let i = 0; i < detectedChars.length; i++) {
      const char = detectedChars[i];
      // ==================================
      if (!char.selected || char.saved) continue;

      setDetectedChars((prev) =>
        prev.map((c, idx) => (idx === i ? { ...c, saving: true } : c)),
      );

      try {
        // =====================================
        // Build headers with provider auth
        // =====================================
        const key = getApiKey(s, imageProviderId);
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        // ==================================
        if (key) headers["x-provider-key"] = key;
        // ==================================
        if (imageProviderId === "comfyui" && s.comfyuiUrl) headers["x-base-url"] = s.comfyuiUrl;
        // ==================================
        if (imageProviderId === "ollama" && s.ollamaUrl) headers["x-base-url"] = s.ollamaUrl;

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

        // ==================================
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
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save character");
        setDetectedChars((prev) =>
          prev.map((c, idx) => (idx === i ? { ...c, saving: false } : c)),
        );
      }
    }
  }

  // =====================================
  // Render
  // =====================================
  return (
    <div className="page">
      <h1>Generate Character</h1>
      <p className="muted" style={{ marginBottom: 12 }}>
        Create characters from text or extract them from an uploaded image.
      </p>

      {/* ── Mode toggle ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          className={`btn ${mode === "generate" ? "btn-primary" : ""}`}
          onClick={() => setMode("generate")}
        >
          Text to Character
        </button>
        <button
          className={`btn ${mode === "upload" ? "btn-primary" : ""}`}
          onClick={() => setMode("upload")}
        >
          Extract from Image
        </button>
      </div>

      {/* ── Error banner ── */}
      {/* ================================== */}
      {error && (
        <div className="note" style={{ borderLeftColor: "var(--danger)", marginBottom: 16 }}>
          {error}
          <button className="btn btn-sm btn-ghost" style={{ marginLeft: 8 }} onClick={() => setError(null)}>dismiss</button>
        </div>
      )}

      {/* ── Generate Mode ── */}
      {/* ================================== */}
      {mode === "generate" && (
        <div className="gen-layout">
          <div className="panel">
            <h2>Character Details</h2>
            <div className="field">
              <label>Name</label>
              <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Luna" />
            </div>
            <div className="field">
              <label>Description</label>
              <textarea
                style={{ minHeight: 120 }}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the character's appearance, outfit, personality..."
              />
            </div>
            <div className="note" style={{ fontSize: 11, marginBottom: 8, padding: "6px 10px" }}>
              <strong>Image:</strong> {imageProviderId} / {imageModel} &nbsp;|&nbsp;
              <strong>Text LLM:</strong> {textProviderId} / {textModel}
            </div>
            <button
              className="btn btn-primary"
              style={{ width: "100%" }}
              onClick={handleGenerate}
              disabled={generating || !label.trim() || !description.trim()}
            >
              {generating ? "Generating..." : "Generate Character"}
            </button>
          </div>

          <div className="panel">
            <h2>Result</h2>
            {/* ================================== */}
            {generating && (
              <div className="page-center" style={{ padding: "60px 0" }}>
                <div className="spinner" />
                <p className="muted" style={{ marginTop: 12 }}>Generating character image...</p>
              </div>
            )}
            {/* ================================== */}
            {result && (
              <div>
                <img
                  src={`data:${result.mime};base64,${result.imageBase64}`}
                  alt={label}
                  style={{ width: "100%", borderRadius: 10, marginBottom: 12 }}
                />
                {/* ================================== */}
                {saved && <p style={{ color: "var(--ok)", fontSize: 13 }}>Saved to library</p>}
                {/* ================================== */}
                {result.generation && (
                  <div className="note" style={{ fontSize: 11, padding: "6px 10px", marginBottom: 8 }}>
                    <strong>Generated with:</strong><br />
                    Image: {result.generation.imageProvider} / {result.generation.imageModel}<br />
                    Text: {result.generation.textProvider} / {result.generation.textModel}
                  </div>
                )}
                <details style={{ marginTop: 8 }}>
                  <summary className="muted" style={{ fontSize: 12, cursor: "pointer" }}>Enhanced prompt</summary>
                  <p style={{ fontSize: 12, marginTop: 6, color: "var(--text-2)" }}>{result.enhancedPrompt}</p>
                </details>
              </div>
            )}
            {/* ================================== */}
            {!generating && !result && (
              <div className="page-center" style={{ padding: "60px 0" }}>
                <p className="muted">Generated character will appear here</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Upload Mode ── */}
      {/* ================================== */}
      {mode === "upload" && (
        <div>
          <div className="panel" style={{ marginBottom: 16 }}>
            <h2>Upload Image</h2>
            <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
              Upload an image with one or more characters. AI will identify each character and generate individual portraits for your library.
            </p>

            {/* ================================== */}
            {!uploadPreview ? (
              <div
                className="drop"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files[0]);
                }}
              >
                Drop an image here or click to select
              </div>
            ) : (
              <div style={{ textAlign: "center" }}>
                <img
                  src={uploadPreview}
                  alt="Uploaded"
                  style={{ maxWidth: "100%", maxHeight: 300, borderRadius: 10, border: "1px solid var(--border)" }}
                />
                <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 8 }}>
                  <button
                    className="btn btn-primary"
                    onClick={handleAnalyze}
                    disabled={analyzing}
                  >
                    {analyzing ? "Analyzing..." : "Detect Characters"}
                  </button>
                  <button
                    className="btn"
                    onClick={() => {
                      setUploadFile(null);
                      setUploadPreview(null);
                      setDetectedChars([]);
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            )}

            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              style={{ display: "none" }}
              onChange={(e) => {
                if (e.target.files?.[0]) handleFileSelect(e.target.files[0]);
                e.target.value = "";
              }}
            />
          </div>

          {/* ================================== */}
          {analyzing && (
            <div className="panel" style={{ textAlign: "center", padding: 40 }}>
              <div className="spinner" style={{ margin: "0 auto 12px" }} />
              <p className="muted">Analyzing image for characters...</p>
            </div>
          )}

          {/* ================================== */}
          {detectedChars.length > 0 && (
            <div className="panel">
              <h2>Detected Characters ({detectedChars.length})</h2>
              <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
                Select which characters to save. Individual portraits will be generated for each.
              </p>

              <div className="char-grid">
                {detectedChars.map((char, i) => (
                  <div
                    key={i}
                    className={`char-card selectable ${char.selected ? "selected" : ""}`}
                    onClick={() => !char.saving && !char.saved && toggleChar(i)}
                    style={{ opacity: char.saving ? 0.6 : 1 }}
                  >
                    {/* ================================== */}
                    {char.generatedImage ? (
                      <img
                        src={`data:${char.generatedMime};base64,${char.generatedImage}`}
                        alt={char.label}
                        className="char-card-img"
                      />
                    ) : (
                      <div className="char-card-img char-card-placeholder" style={{ fontSize: 28 }}>
                        {/* ================================== */}
                        {char.saving ? (
                          <div className="spinner-sm" />
                        ) : char.selected ? (
                          "✓"
                        ) : (
                          "—"
                        )}
                      </div>
                    )}
                    <div className="char-card-info">
                      <strong>{char.label}</strong>
                      <span className="muted" style={{ fontSize: 11 }}>
                        {char.description.length > 80
                          ? char.description.slice(0, 80) + "..."
                          : char.description}
                      </span>
                      {/* ================================== */}
                      {char.saved && (
                        <span style={{ color: "var(--ok)", fontSize: 11 }}>Saved to library</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button
                  className="btn btn-primary"
                  onClick={handleSaveSelected}
                  disabled={detectedChars.every((c) => !c.selected || c.saved || c.saving)}
                >
                  {detectedChars.some((c) => c.saving)
                    ? "Generating..."
                    : `Save ${detectedChars.filter((c) => c.selected && !c.saved).length} Character(s)`}
                </button>
                <button
                  className="btn"
                  onClick={() =>
                    setDetectedChars((prev) => prev.map((c) => ({ ...c, selected: !c.saved })))
                  }
                >
                  Select All
                </button>
                <button
                  className="btn"
                  onClick={() =>
                    setDetectedChars((prev) => prev.map((c) => ({ ...c, selected: false })))
                  }
                >
                  Deselect All
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// =============================================================================
