// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// PiAPI : PiAPI cloud image and video generation provider.
//         Supports text-to-image via Flux/Midjourney, and video
//         generation via Kling, Hailuo, Seedance, Luma, Veo3,
//         Sora2, Hunyuan, WanX, SkyReels, and Framepack.
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import type {
  ImageProvider,
  ImageGenRequest,
  ImageGenResult,
} from "./types";
// =============================================================================

// =============================================================================
// Constants
// =============================================================================
const PIAPI_BASE = "https://api.piapi.ai/api/v1";

// =============================================================================
// PiAPI image model options
// =============================================================================
export const PIAPI_IMAGE_MODELS = [
  { id: "Qubico/flux1-dev", label: "Flux 1 Dev" },
  { id: "Qubico/flux1-schnell", label: "Flux 1 Schnell" },
  { id: "midjourney", label: "Midjourney" },
];

// =============================================================================
// Re-exporting video catalog
// =============================================================================
export { PIAPI_VIDEO_CATALOG, findModelDef } from "@/lib/piapi-video-catalog";

// =============================================================================
// Function creates a PiAPI task and returns the task ID -> string, object to string
// =============================================================================
async function createTask(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<string> {
  /*
      createTask : submits a generation task to PiAPI and returns the task_id
      apiKey variable : PiAPI API key for authentication
      body variable : request body with model, task_type, and input
  */
  console.log(`[PiAPI] createTask: model=${body.model}, task_type=${body.task_type}`, JSON.stringify(body.input, null, 2).slice(0, 500));

  // =====================================
  // Submit task to PiAPI
  // =====================================
  const res = await fetch(`${PIAPI_BASE}/task`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  // ==================================
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PiAPI create task failed (${res.status}): ${text}`);
  }
  // ==================================

  const data = await res.json();
  // ==================================
  if (data.code !== 200) {
    throw new Error(`PiAPI error: ${data.message || JSON.stringify(data)}`);
  }
  // ==================================

  return data.data.task_id;
}

// =============================================================================
// Function polls a PiAPI task until completion -> string, string, number to object
// =============================================================================
async function pollTask(
  apiKey: string,
  taskId: string,
  timeoutMs: number = 900_000,
): Promise<Record<string, unknown>> {
  /*
      pollTask : polls a PiAPI task at 5s intervals until completed or failed
      apiKey variable : PiAPI API key for authentication
      taskId variable : the task ID to poll
      timeoutMs variable : maximum wait time in milliseconds (default 15 min)
  */
  const start = Date.now();
  const pollInterval = 5000;

  // =====================================
  // Poll loop
  // =====================================
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${PIAPI_BASE}/task/${taskId}`, {
      headers: { "x-api-key": apiKey },
    });

    // ==================================
    if (!res.ok) {
      console.log(`[PiAPI] poll ${taskId}: HTTP ${res.status}, retrying...`);
      await new Promise(r => setTimeout(r, pollInterval));
      continue;
    }
    // ==================================

    const data = await res.json();
    const status = (data.data?.status || "").toLowerCase();
    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(`[PiAPI] poll ${taskId}: status=${status} (${elapsed}s elapsed)`);

    // ==================================
    if (status === "completed") {
      console.log(`[PiAPI] task ${taskId} completed. Full data keys:`, Object.keys(data.data || {}));
      if (data.data?.output) console.log(`[PiAPI] output:`, JSON.stringify(data.data.output).slice(0, 500));
      if (data.data?.works) console.log(`[PiAPI] works:`, JSON.stringify(data.data.works).slice(0, 500));
      return data.data;
    }
    // ==================================

    // ==================================
    if (status === "failed") {
      const errMsg = data.data?.error?.message || data.data?.error?.raw_message || "Task failed";
      throw new Error(`PiAPI task failed: ${errMsg}`);
    }
    // ==================================

    await new Promise(r => setTimeout(r, pollInterval));
  }

  throw new Error(`PiAPI task timed out after ${Math.round(timeoutMs / 1000)}s (task_id: ${taskId})`);
}

// =============================================================================
// Function downloads a file from a URL -> string to Buffer
// =============================================================================
async function downloadUrl(url: string): Promise<Buffer> {
  /*
      downloadUrl : fetches a remote file and returns it as a Buffer
      url variable : the URL to download from
  */
  const res = await fetch(url);
  // ==================================
  if (!res.ok) throw new Error(`Failed to download from PiAPI: ${res.status}`);
  // ==================================
  return Buffer.from(await res.arrayBuffer());
}

// =============================================================================
// PiAPI image provider adapter
// =============================================================================
export const piapiImageProvider: ImageProvider = {
  id: "piapi",

  capabilities: {
    supports_reference_edit: false,
    max_reference_images: 0,
    supports_text_to_image: true,
  },

  // =============================================================================
  // Function generates an image using PiAPI -> ImageGenRequest to ImageGenResult
  // =============================================================================
  async generate(req: ImageGenRequest): Promise<ImageGenResult> {
    /*
        generate : creates an image via PiAPI cloud API (text-to-image only)
        req variable : generation request with prompt, model, aspect ratio, and API key
    */
    const apiKey = req.apiKey;
    // ==================================
    if (!apiKey) throw new Error("PiAPI API key is required");
    // ==================================

    const model = req.model || "Qubico/flux1-dev";

    // =====================================
    // Map aspect ratio to pixel dimensions
    // =====================================
    const aspectMap: Record<string, [number, number]> = {
      "1:1": [1024, 1024],
      "16:9": [1344, 768],
      "9:16": [768, 1344],
      "4:3": [1024, 768],
      "3:4": [768, 1024],
    };
    const [width, height] = aspectMap[req.aspectRatio || "1:1"] || [1024, 1024];

    // =====================================
    // Create and poll the image task
    // =====================================
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
    // ==================================
    if (!imageUrl) throw new Error("PiAPI returned no image URL");
    // ==================================

    const image = await downloadUrl(imageUrl);
    return { image, mime: "image/png", mode: "text_to_image" };
  },
};

// =============================================================================
// Function extracts video URL from PiAPI task data -> object to string|undefined
// =============================================================================
/*
    extractVideoUrl : checks all known PiAPI response patterns for a video URL
    data variable : the full task data object from pollTask
*/
function extractVideoUrl(data: Record<string, unknown>): string | undefined {
  const output = data.output as Record<string, unknown> | undefined;
  const works = (output?.works || data.works) as Array<Record<string, unknown>> | undefined;
  const firstWork = works?.[0] as Record<string, unknown> | undefined;

  // ==================================
  // Pattern 1: output.video (Seedance, Luma, Veo3, Sora2, Kling turbo, Hailuo)
  if (output?.video && typeof output.video === "string") return output.video;
  // ==================================

  // ==================================
  // Pattern 2: output.video_url (generic fallback)
  if (output?.video_url && typeof output.video_url === "string") return output.video_url;
  // ==================================

  // ==================================
  if (firstWork) {
    // ======================
    // Pattern 3: works[].video.resource_without_watermark / resource (Kling standard/3.0)
    const video = firstWork.video as Record<string, unknown> | undefined;
    if (video?.resource_without_watermark && typeof video.resource_without_watermark === "string") return video.resource_without_watermark;
    if (video?.resource && typeof video.resource === "string") return video.resource;

    // ======================
    // Pattern 4: works[].resource.resourceWithoutWatermark / resource (Hunyuan, WanX, SkyReels, Framepack)
    const resource = firstWork.resource as Record<string, unknown> | undefined;
    if (resource?.resourceWithoutWatermark && typeof resource.resourceWithoutWatermark === "string") return resource.resourceWithoutWatermark;
    if (resource?.resource && typeof resource.resource === "string") return resource.resource;
  }
  // ==================================

  // ==================================
  // Top-level fallbacks
  if (data.video && typeof data.video === "string") return data.video;
  if (data.video_url && typeof data.video_url === "string") return data.video_url;
  // ==================================

  return undefined;
}

// =============================================================================
// Video generation interfaces
// =============================================================================
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

// =============================================================================
// Function generates a video using PiAPI -> PiAPIVideoRequest to PiAPIVideoResult
// =============================================================================
export async function generatePiAPIVideo(req: PiAPIVideoRequest): Promise<PiAPIVideoResult> {
  /*
      generatePiAPIVideo : creates a video via PiAPI cloud using various model backends
      req variable : video request with prompt, model, variant, optional images, and API key
  */
  const model = req.model || "kling";
  const input: Record<string, unknown> = { prompt: req.prompt };
  let taskType = "video_generation";

  // =====================================
  // Build model-specific input parameters
  // =====================================
  // ==================================
  if (model === "kling") {
    input.version = req.variant || "2.6";
    input.mode = req.mode || "std";
    input.duration = req.duration || 5;
    input.aspect_ratio = req.aspectRatio || "16:9";
    if (req.imageUrl) input.image_url = req.imageUrl;
    if (req.imageTailUrl) input.image_tail_url = req.imageTailUrl;
  // ==================================
  } else if (model === "hailuo") {
    input.model = req.variant || "v2.3";
    input.duration = req.duration || 6;
    if (req.imageUrl) input.image_url = req.imageUrl;
  // ==================================
  } else if (model === "seedance") {
    taskType = req.variant || "seedance-2";
    const imageUrls: string[] = [];
    if (req.imageUrl) imageUrls.push(req.imageUrl);
    if (req.imageTailUrl) imageUrls.push(req.imageTailUrl);
    input.mode = imageUrls.length > 0 ? "first_last_frames" : "text_to_video";
    if (imageUrls.length > 0) input.image_urls = imageUrls;
    input.duration = req.duration || 5;
    input.aspect_ratio = req.aspectRatio || "16:9";
  // ==================================
  } else if (model === "luma") {
    input.model_name = req.variant || "ray-v2";
    input.duration = req.duration || 5;
    input.aspect_ratio = req.aspectRatio || "16:9";
    if (req.imageUrl) input.start_image = req.imageUrl;
    if (req.imageTailUrl) input.end_image = req.imageTailUrl;
  // ==================================
  } else if (model === "veo3") {
    taskType = req.variant || "veo3-video";
    input.duration = `${req.duration || 8}s`;
    input.aspect_ratio = req.aspectRatio || "16:9";
    if (req.imageUrl) input.image_url = req.imageUrl;
  // ==================================
  } else if (model === "sora2") {
    taskType = req.variant || "sora2-video";
    input.duration = req.duration || 4;
    input.aspect_ratio = req.aspectRatio || "16:9";
    if (req.imageUrl) input.image_url = req.imageUrl;
  // ==================================
  } else if (model === "Qubico/hunyuan") {
    taskType = req.variant || "txt2video";
    input.aspect_ratio = req.aspectRatio || "16:9";
    if (req.imageUrl) input.image = req.imageUrl;
  // ==================================
  } else if (model === "Qubico/wanx") {
    taskType = req.variant || "img2video-14b";
    input.aspect_ratio = req.aspectRatio || "16:9";
    if (req.imageUrl) input.image = req.imageUrl;
    // ==================================
    if (taskType === "img2video-14b-keyframe" && req.imageTailUrl) {
      input.end_image = req.imageTailUrl;
    }
    // ==================================
  // ==================================
  } else if (model === "Qubico/skyreels") {
    taskType = req.variant || "img2video";
    input.aspect_ratio = req.aspectRatio || "16:9";
    if (req.imageUrl) input.image = req.imageUrl;
  // ==================================
  } else if (model === "Qubico/framepack") {
    taskType = req.variant || "img2video";
    input.duration = req.duration || 10;
    if (req.imageUrl) input.start_image = req.imageUrl;
    if (req.imageTailUrl) input.end_image = req.imageTailUrl;
  // ==================================
  } else {
    input.duration = req.duration || 5;
    input.aspect_ratio = req.aspectRatio || "16:9";
    if (req.imageUrl) input.image_url = req.imageUrl;
    if (req.imageTailUrl) input.image_tail_url = req.imageTailUrl;
  }
  // ==================================

  // =====================================
  // Create and poll the video task
  // =====================================
  const taskId = await createTask(req.apiKey, {
    model,
    task_type: taskType,
    input,
  });

  const taskResult = await pollTask(req.apiKey, taskId) as Record<string, unknown>;
  const videoUrl = extractVideoUrl(taskResult);
  // ==================================
  if (!videoUrl) throw new Error(`PiAPI returned no video URL. Data: ${JSON.stringify(taskResult).slice(0, 500)}`);
  // ==================================

  return { videoUrl, taskId };
}

// =============================================================================
// Function returns available PiAPI image model IDs -> void to string[]
// =============================================================================
export function fetchPiAPIImageModels(): string[] {
  /*
      fetchPiAPIImageModels : returns the list of available PiAPI image model identifiers
  */
  return PIAPI_IMAGE_MODELS.map(m => m.id);
}

// =============================================================================
// =============================================================================
