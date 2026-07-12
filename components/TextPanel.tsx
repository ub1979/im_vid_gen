"use client";
// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// TextPanel : text/lyrics input with duration and interval controls
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
/*
    TextPanelProps : props for the text panel component
*/
// =============================================================================
interface TextPanelProps {
  text: string;
  duration: number;
  interval: number;
  onTextChange: (text: string) => void;
  onDurationChange: (duration: number) => void;
  onIntervalChange: (interval: number) => void;
  onGenerateScenes: () => void;
  generating?: boolean;
}

// =============================================================================
// Function renders text input panel with timing controls -> props to JSX
// =============================================================================
export default function TextPanel({
  text,
  duration,
  interval,
  onTextChange,
  onDurationChange,
  onIntervalChange,
  onGenerateScenes,
  generating = false,
}: TextPanelProps) {
  /*
      TextPanel : text/lyrics input with scene generation controls
      text variable : current text content
      duration variable : total duration in seconds
      interval variable : keyframe interval in seconds
      onTextChange variable : callback when text changes
      onDurationChange variable : callback when duration changes
      onIntervalChange variable : callback when interval changes
      onGenerateScenes variable : callback to trigger scene generation
      generating variable : whether scenes are being generated
  */
  const keyframeCount = interval > 0 ? Math.ceil(duration / interval) : 0;

  // =====================================
  // Render
  // =====================================
  return (
    <>
      <h2 style={{ marginTop: "18px" }}>Text / Lyrics</h2>

      {/* ==================================
          Text input area
          ================================== */}
      <div className="field">
        <label>Paste lyrics / story / poem</label>
        <textarea
          style={{ minHeight: "130px" }}
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder="Paste your lyrics, story, or poem here..."
        />
      </div>

      {/* ==================================
          Duration input
          ================================== */}
      <div className="field">
        <label>Total duration (seconds)</label>
        <input
          type="number"
          value={duration}
          min={1}
          onChange={(e) => onDurationChange(Number(e.target.value) || 1)}
        />
      </div>

      {/* ==================================
          Interval input
          ================================== */}
      <div className="field">
        <label>Keyframe every (seconds)</label>
        <input
          type="number"
          value={interval}
          min={1}
          onChange={(e) => onIntervalChange(Number(e.target.value) || 1)}
        />
        <div className="muted" style={{ fontSize: "11px", marginTop: "4px" }}>
          = {keyframeCount} keyframes
        </div>
      </div>

      {/* ==================================
          Generate button
          ================================== */}
      <button
        className="btn btn-primary"
        style={{ width: "100%", marginTop: "8px" }}
        onClick={onGenerateScenes}
        disabled={generating || !text.trim()}
      >
        {generating ? "Generating..." : "Generate Scenes"}
      </button>
    </>
  );
}

// =============================================================================
// =============================================================================
