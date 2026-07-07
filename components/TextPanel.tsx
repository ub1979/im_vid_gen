"use client";

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
  const keyframeCount = interval > 0 ? Math.ceil(duration / interval) : 0;

  return (
    <>
      <h2 style={{ marginTop: "18px" }}>Text / Lyrics</h2>

      <div className="field">
        <label>Paste lyrics / story / poem</label>
        <textarea
          style={{ minHeight: "130px" }}
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder="Paste your lyrics, story, or poem here..."
        />
      </div>

      <div className="field">
        <label>Total duration (seconds)</label>
        <input
          type="number"
          value={duration}
          min={1}
          onChange={(e) => onDurationChange(Number(e.target.value) || 1)}
        />
      </div>

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
