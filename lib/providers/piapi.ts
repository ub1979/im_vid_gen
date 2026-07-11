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

export { PIAPI_VIDEO_CATALOG, findModelDef } from "@/lib/piapi-video-catalog";

// ---- Shared helpers ----

async function createTask(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<string> {
  console.log(`[PiAPI] createTask: model=${body.model}, task_type=${body.task_type}`, JSON.stringify(body.input, null, 2).slice(0, 500));
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
  timeoutMs: number = 900_000,
): Promise<Record<string, unknown>> {
  const start = Date.now();
  const pollInterval = 5000;

  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${PIAPI_BASE}/task/${taskId}`, {
      headers: { "x-api-key": apiKey },
    });

    if (!res.ok) {
      console.log(`[PiAPI] poll ${taskId}: HTTP ${res.status}, retrying...`);
      await new Promise(r => setTimeout(r, pollInterval));
      continue;
    }

    const data = await res.json();
    const status = (data.data?.status || "").toLowerCase();
    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(`[PiAPI] poll ${taskId}: status=${status} (${elapsed}s elapsed)`);

    if (status === "completed") {
      console.log(`[PiAPI] task ${taskId} completed. Full data keys:`, Object.keys(data.data || {}));
      if (data.data?.output) console.log(`[PiAPI] output:`, JSON.stringify(data.data.output).slice(0, 500));
      if (data.data?.works) console.log(`[PiAPI] works:`, JSON.stringify(data.data.works).slice(0, 500));
      return data.data;
    }

    if (status === "failed") {
      const errMsg = data.data?.error?.message || data.data?.error?.raw_message || "Task failed";
      throw new Error(`PiAPI task failed: ${errMsg}`);
    }

    await new Promise(r => setTimeout(r, pollInterval));
  }

  throw new Error(`PiAPI task timed out after ${Math.round(timeoutMs / 1000)}s (task_id: ${taskId})`);
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

    const result = await pollTask(apiKey, taskId);
    const outputObj = result.output as Record<string, unknown> | undefined;
    const imageUrl = (outputObj?.image_url || result.image_url) as string;
    if (!imageUrl) throw new Error("PiAPI returned no image URL");

    const image = await downloadUrl(imageUrl);
    return { image, mime: "image/png", mode: "text_to_image" };
  },
};

// ---- Video URL extraction ----
// Each PiAPI model returns the video URL in a different structure.
// pollTask returns the full data.data object; this function checks all known patterns.

function extractVideoUrl(data: Record<string, unknown>): string | undefined {
  const output = data.output as Record<string, unknown> | undefined;
  const works = (output?.works || data.works) as Array<Record<string, unknown>> | undefined;
  const firstWork = works?.[0] as Record<string, unknown> | undefined;

  // Pattern 1: output.video (Seedance, Luma, Veo3, Sora2, Kling turbo, Hailuo)
  if (output?.video && typeof output.video === "string") return output.video;

  // Pattern 2: output.video_url (generic fallback)
  if (output?.video_url && typeof output.video_url === "string") return output.video_url;

  if (firstWork) {
    // Pattern 3: works[].video.resource_without_watermark / resource (Kling standard/3.0)
    const video = firstWork.video as Record<string, unknown> | undefined;
    if (video?.resource_without_watermark && typeof video.resource_without_watermark === "string") return video.resource_without_watermark;
    if (video?.resource && typeof video.resource === "string") return video.resource;

    // Pattern 4: works[].resource.resourceWithoutWatermark / resource (Hunyuan, WanX, SkyReels, Framepack)
    const resource = firstWork.resource as Record<string, unknown> | undefined;
    if (resource?.resourceWithoutWatermark && typeof resource.resourceWithoutWatermark === "string") return resource.resourceWithoutWatermark;
    if (resource?.resource && typeof resource.resource === "string") return resource.resource;
  }

  // Top-level fallbacks
  if (data.video && typeof data.video === "string") return data.video;
  if (data.video_url && typeof data.video_url === "string") return data.video_url;

  return undefined;
}

// ---- Video Generation ----

export interface PiAPIVideoRequest {
  prompt: string;
  apiKey: string;
  model?: string;
  variant?: string;
  mode?: string;
  imageUrl?: string;
  imageTailUrl?: string;
  duration?: number;
  aspectRatio?: string;
}

export interface PiAPIVideoResult {
  videoUrl: string;
  taskId: string;
}

export async function generatePiAPIVideo(req: PiAPIVideoRequest): Promise<PiAPIVideoResult> {
  const model = req.model || "kling";
  const input: Record<string, unknown> = { prompt: req.prompt };
  let taskType = "video_generation";

  if (model === "kling") {
    input.version = req.variant || "2.6";
    input.mode = req.mode || "std";
    input.duration = req.duration || 5;
    input.aspect_ratio = req.aspectRatio || "16:9";
    if (req.imageUrl) input.image_url = req.imageUrl;
    if (req.imageTailUrl) input.image_tail_url = req.imageTailUrl;
  } else if (model === "hailuo") {
    input.model = req.variant || "v2.3";
    input.duration = req.duration || 6;
    if (req.imageUrl) input.image_url = req.imageUrl;
  } else if (model === "seedance") {
    taskType = req.variant || "seedance-2";
    const imageUrls: string[] = [];
    if (req.imageUrl) imageUrls.push(req.imageUrl);
    if (req.imageTailUrl) imageUrls.push(req.imageTailUrl);
    input.mode = imageUrls.length > 0 ? "first_last_frames" : "text_to_video";
    if (imageUrls.length > 0) input.image_urls = imageUrls;
    input.duration = req.duration || 5;
    input.aspect_ratio = req.aspectRatio || "16:9";
  } else if (model === "luma") {
    input.model_name = req.variant || "ray-v2";
    input.duration = req.duration || 5;
    input.aspect_ratio = req.aspectRatio || "16:9";
    if (req.imageUrl) input.start_image = req.imageUrl;
    if (req.imageTailUrl) input.end_image = req.imageTailUrl;
  } else if (model === "veo3") {
    taskType = req.variant || "veo3-video";
    input.duration = `${req.duration || 8}s`;
    input.aspect_ratio = req.aspectRatio || "16:9";
    if (req.imageUrl) input.image_url = req.imageUrl;
  } else if (model === "sora2") {
    taskType = req.variant || "sora2-video";
    input.duration = req.duration || 4;
    input.aspect_ratio = req.aspectRatio || "16:9";
    if (req.imageUrl) input.image_url = req.imageUrl;
  } else if (model === "Qubico/hunyuan") {
    taskType = req.variant || "txt2video";
    input.aspect_ratio = req.aspectRatio || "16:9";
    if (req.imageUrl) input.image = req.imageUrl;
  } else if (model === "Qubico/wanx") {
    taskType = req.variant || "img2video-14b";
    input.aspect_ratio = req.aspectRatio || "16:9";
    if (req.imageUrl) input.image = req.imageUrl;
    if (taskType === "img2video-14b-keyframe" && req.imageTailUrl) {
      input.end_image = req.imageTailUrl;
    }
  } else if (model === "Qubico/skyreels") {
    taskType = req.variant || "img2video";
    input.aspect_ratio = req.aspectRatio || "16:9";
    if (req.imageUrl) input.image = req.imageUrl;
  } else if (model === "Qubico/framepack") {
    taskType = req.variant || "img2video";
    input.duration = req.duration || 10;
    if (req.imageUrl) input.start_image = req.imageUrl;
    if (req.imageTailUrl) input.end_image = req.imageTailUrl;
  } else {
    input.duration = req.duration || 5;
    input.aspect_ratio = req.aspectRatio || "16:9";
    if (req.imageUrl) input.image_url = req.imageUrl;
    if (req.imageTailUrl) input.image_tail_url = req.imageTailUrl;
  }

  const taskId = await createTask(req.apiKey, {
    model,
    task_type: taskType,
    input,
  });

  const taskResult = await pollTask(req.apiKey, taskId) as Record<string, unknown>;
  const videoUrl = extractVideoUrl(taskResult);
  if (!videoUrl) throw new Error(`PiAPI returned no video URL. Data: ${JSON.stringify(taskResult).slice(0, 500)}`);

  return { videoUrl, taskId };
}

// ---- Model listing ----

export function fetchPiAPIImageModels(): string[] {
  return PIAPI_IMAGE_MODELS.map(m => m.id);
}
