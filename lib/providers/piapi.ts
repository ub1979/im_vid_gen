import type {
  ImageProvider,
  ImageGenRequest,
  ImageGenResult,
} from "./types";

const PIAPI_BASE = "https://api.piapi.ai/api/v1";

// ---- PiAPI models ----

export const PIAPI_IMAGE_MODELS = [
  { id: "Qubico/flux1-dev", label: "Flux 1 Dev" },
  { id: "Qubico/flux1-schnell", label: "Flux 1 Schnell" },
  { id: "midjourney", label: "Midjourney" },
];

export const PIAPI_VIDEO_MODELS = [
  { id: "kling", label: "Kling", versions: ["2.6", "2.5", "2.1", "1.6", "1.5"] },
  { id: "hailuo", label: "Hailuo (Minimax)", versions: ["v2.3", "v2.3-fast"] },
  { id: "seedance-2.0", label: "Seedance 2.0", versions: [] },
];

// ---- Shared helpers ----

async function createTask(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<string> {
  const res = await fetch(`${PIAPI_BASE}/task`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PiAPI create task failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  if (data.code !== 200) {
    throw new Error(`PiAPI error: ${data.message || JSON.stringify(data)}`);
  }

  return data.data.task_id;
}

async function pollTask(
  apiKey: string,
  taskId: string,
  timeoutMs: number = 600_000,
): Promise<Record<string, unknown>> {
  const start = Date.now();
  const pollInterval = 5000;

  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${PIAPI_BASE}/task/${taskId}`, {
      headers: { "x-api-key": apiKey },
    });

    if (!res.ok) {
      await new Promise(r => setTimeout(r, pollInterval));
      continue;
    }

    const data = await res.json();
    const status = data.data?.status;

    if (status === "Completed") {
      return data.data.output;
    }

    if (status === "Failed") {
      const errMsg = data.data?.error?.message || "Task failed";
      throw new Error(`PiAPI task failed: ${errMsg}`);
    }

    await new Promise(r => setTimeout(r, pollInterval));
  }

  throw new Error("PiAPI task timed out");
}

async function downloadUrl(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download from PiAPI: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ---- Image Provider ----

export const piapiImageProvider: ImageProvider = {
  id: "piapi",

  capabilities: {
    supports_reference_edit: false,
    max_reference_images: 0,
    supports_text_to_image: true,
  },

  async generate(req: ImageGenRequest): Promise<ImageGenResult> {
    const apiKey = req.apiKey;
    if (!apiKey) throw new Error("PiAPI API key is required");

    const model = req.model || "Qubico/flux1-dev";

    const aspectMap: Record<string, [number, number]> = {
      "1:1": [1024, 1024],
      "16:9": [1344, 768],
      "9:16": [768, 1344],
      "4:3": [1024, 768],
      "3:4": [768, 1024],
    };
    const [width, height] = aspectMap[req.aspectRatio || "1:1"] || [1024, 1024];

    const taskId = await createTask(apiKey, {
      model,
      task_type: "txt2img",
      input: {
        prompt: req.prompt,
        width,
        height,
      },
    });

    const output = await pollTask(apiKey, taskId);
    const imageUrl = (output as Record<string, unknown>).image_url as string;
    if (!imageUrl) throw new Error("PiAPI returned no image URL");

    const image = await downloadUrl(imageUrl);
    return { image, mime: "image/png", mode: "text_to_image" };
  },
};

// ---- Video Generation ----

export interface PiAPIVideoRequest {
  prompt: string;
  apiKey: string;
  model?: string;
  version?: string;
  imageUrl?: string;
  imageTailUrl?: string;
  duration?: number;
  aspectRatio?: string;
  mode?: string;
}

export interface PiAPIVideoResult {
  videoUrl: string;
  taskId: string;
}

export async function generatePiAPIVideo(req: PiAPIVideoRequest): Promise<PiAPIVideoResult> {
  const model = req.model || "kling";
  const input: Record<string, unknown> = {
    prompt: req.prompt,
    duration: req.duration || 5,
    aspect_ratio: req.aspectRatio || "16:9",
  };

  if (model === "kling") {
    input.version = req.version || "2.6";
    input.mode = req.mode || "std";
    if (req.imageUrl) input.image_url = req.imageUrl;
    if (req.imageTailUrl) input.image_tail_url = req.imageTailUrl;
  } else if (model === "hailuo") {
    input.model = req.version || "v2.3";
    if (req.imageUrl) input.image_url = req.imageUrl;
  } else {
    if (req.imageUrl) input.image_url = req.imageUrl;
  }

  const taskId = await createTask(req.apiKey, {
    model,
    task_type: "video_generation",
    input,
  });

  const output = await pollTask(req.apiKey, taskId);
  const videoUrl = (output as Record<string, unknown>).video_url as string;
  if (!videoUrl) throw new Error("PiAPI returned no video URL");

  return { videoUrl, taskId };
}

// ---- Model listing ----

export function fetchPiAPIImageModels(): string[] {
  return PIAPI_IMAGE_MODELS.map(m => m.id);
}

export function fetchPiAPIVideoModels(): string[] {
  return PIAPI_VIDEO_MODELS.map(m => m.id);
}
