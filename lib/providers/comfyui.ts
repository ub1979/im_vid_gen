import type {
  ImageProvider,
  ImageGenRequest,
  ImageGenResult,
} from "./types";

const DEFAULT_BASE_URL = "http://localhost:8188";

const ASPECT_RATIOS: Record<string, [number, number]> = {
  "1:1": [1024, 1024],
  "16:9": [1344, 768],
  "9:16": [768, 1344],
  "4:3": [1024, 768],
  "3:4": [768, 1024],
  "3:2": [1216, 832],
  "2:3": [832, 1216],
};

const VIDEO_RESOLUTIONS: Record<string, [number, number]> = {
  "16:9": [832, 480],
  "9:16": [480, 832],
  "1:1": [720, 720],
  "4:3": [720, 544],
  "3:4": [544, 720],
};

interface ModelConfig {
  unet: string;
  clip: string;
  clipType: string;
  vae: string;
  workflow: "qwen" | "flux2" | "zimage";
  defaultSteps: number;
}

const MODEL_CONFIGS: Record<string, ModelConfig> = {
  "qwen_image_fp8_e4m3fn.safetensors": {
    unet: "qwen_image_fp8_e4m3fn.safetensors",
    clip: "qwen_2.5_vl_7b_fp8_scaled.safetensors",
    clipType: "qwen_image",
    vae: "qwen_image_vae.safetensors",
    workflow: "qwen",
    defaultSteps: 20,
  },
  "flux2_dev_fp8mixed.safetensors": {
    unet: "flux2_dev_fp8mixed.safetensors",
    clip: "mistral_3_small_flux2_fp4_mixed.safetensors",
    clipType: "flux2",
    vae: "full_encoder_small_decoder.safetensors",
    workflow: "flux2",
    defaultSteps: 20,
  },
  "z_image_turbo_bf16.safetensors": {
    unet: "z_image_turbo_bf16.safetensors",
    clip: "qwen_3_4b.safetensors",
    clipType: "z_image",
    vae: "ae.safetensors",
    workflow: "zimage",
    defaultSteps: 4,
  },
};

function getModelConfig(model: string): ModelConfig {
  return MODEL_CONFIGS[model] ?? MODEL_CONFIGS["flux2_dev_fp8mixed.safetensors"];
}

// ---- Image workflow builders ----

function buildQwenTxt2ImgWorkflow(
  prompt: string,
  width: number,
  height: number,
  seed: number,
  steps: number = 20,
): Record<string, unknown> {
  return {
    "1": {
      class_type: "UNETLoader",
      inputs: { unet_name: "qwen_image_fp8_e4m3fn.safetensors", weight_dtype: "default" },
    },
    "2": {
      class_type: "CLIPLoader",
      inputs: { clip_name: "qwen_2.5_vl_7b_fp8_scaled.safetensors", type: "qwen_image" },
    },
    "3": {
      class_type: "VAELoader",
      inputs: { vae_name: "qwen_image_vae.safetensors" },
    },
    "4": {
      class_type: "CLIPTextEncode",
      inputs: { text: prompt, clip: ["2", 0] },
    },
    "5": {
      class_type: "CLIPTextEncode",
      inputs: { text: "", clip: ["2", 0] },
    },
    "6": {
      class_type: "EmptySD3LatentImage",
      inputs: { width, height, batch_size: 1 },
    },
    "7": {
      class_type: "ModelSamplingAuraFlow",
      inputs: { model: ["1", 0], shift: 1.73 },
    },
    "8": {
      class_type: "KSampler",
      inputs: {
        seed,
        steps,
        cfg: 2.5,
        sampler_name: "euler",
        scheduler: "simple",
        denoise: 1.0,
        model: ["7", 0],
        positive: ["4", 0],
        negative: ["5", 0],
        latent_image: ["6", 0],
      },
    },
    "9": {
      class_type: "VAEDecode",
      inputs: { samples: ["8", 0], vae: ["3", 0] },
    },
    "10": {
      class_type: "SaveImage",
      inputs: { filename_prefix: "comfyui_api", images: ["9", 0] },
    },
  };
}

function buildFlux2Txt2ImgWorkflow(
  prompt: string,
  config: ModelConfig,
  width: number,
  height: number,
  seed: number,
  steps: number = 20,
): Record<string, unknown> {
  return {
    "1": {
      class_type: "UNETLoader",
      inputs: { unet_name: config.unet, weight_dtype: "default" },
    },
    "2": {
      class_type: "CLIPLoader",
      inputs: { clip_name: config.clip, type: config.clipType, device: "default" },
    },
    "3": {
      class_type: "VAELoader",
      inputs: { vae_name: config.vae },
    },
    "4": {
      class_type: "CLIPTextEncode",
      inputs: { text: prompt, clip: ["2", 0] },
    },
    "5": {
      class_type: "FluxGuidance",
      inputs: { conditioning: ["4", 0], guidance: 4.0 },
    },
    "6": {
      class_type: "EmptyFlux2LatentImage",
      inputs: { width, height, batch_size: 1 },
    },
    "7": {
      class_type: "Flux2Scheduler",
      inputs: { steps, width, height },
    },
    "8": {
      class_type: "BasicGuider",
      inputs: { model: ["1", 0], conditioning: ["5", 0] },
    },
    "9": {
      class_type: "RandomNoise",
      inputs: { noise_seed: seed },
    },
    "10": {
      class_type: "KSamplerSelect",
      inputs: { sampler_name: "euler" },
    },
    "11": {
      class_type: "SamplerCustomAdvanced",
      inputs: {
        noise: ["9", 0],
        guider: ["8", 0],
        sampler: ["10", 0],
        sigmas: ["7", 0],
        latent_image: ["6", 0],
      },
    },
    "12": {
      class_type: "VAEDecode",
      inputs: { samples: ["11", 0], vae: ["3", 0] },
    },
    "13": {
      class_type: "SaveImage",
      inputs: { filename_prefix: "comfyui_api", images: ["12", 0] },
    },
  };
}

function buildFlux2RefWorkflow(
  prompt: string,
  config: ModelConfig,
  refImageFilenames: string[],
  width: number,
  height: number,
  seed: number,
  steps: number = 20,
): Record<string, unknown> {
  const nodes: Record<string, unknown> = {
    "1": {
      class_type: "UNETLoader",
      inputs: { unet_name: config.unet, weight_dtype: "default" },
    },
    "2": {
      class_type: "CLIPLoader",
      inputs: { clip_name: config.clip, type: config.clipType, device: "default" },
    },
    "3": {
      class_type: "VAELoader",
      inputs: { vae_name: config.vae },
    },
    "4": {
      class_type: "CLIPTextEncode",
      inputs: { text: prompt, clip: ["2", 0] },
    },
    "5": {
      class_type: "FluxGuidance",
      inputs: { conditioning: ["4", 0], guidance: 4.0 },
    },
  };

  let lastConditioningNode = "5";
  let nodeId = 20;

  for (const filename of refImageFilenames) {
    const loadId = String(nodeId++);
    const scaleId = String(nodeId++);
    const encodeId = String(nodeId++);
    const refLatentId = String(nodeId++);

    nodes[loadId] = {
      class_type: "LoadImage",
      inputs: { image: filename, upload: "image" },
    };
    nodes[scaleId] = {
      class_type: "ImageScaleToTotalPixels",
      inputs: { image: [loadId, 0], upscale_method: "lanczos", megapixels: 1.0, resolution_steps: 1 },
    };
    nodes[encodeId] = {
      class_type: "VAEEncode",
      inputs: { pixels: [scaleId, 0], vae: ["3", 0] },
    };
    nodes[refLatentId] = {
      class_type: "ReferenceLatent",
      inputs: { conditioning: [lastConditioningNode, 0], latent: [encodeId, 0] },
    };
    lastConditioningNode = refLatentId;
  }

  Object.assign(nodes, {
    "10": {
      class_type: "EmptyFlux2LatentImage",
      inputs: { width, height, batch_size: 1 },
    },
    "11": {
      class_type: "Flux2Scheduler",
      inputs: { steps, width, height },
    },
    "12": {
      class_type: "BasicGuider",
      inputs: { model: ["1", 0], conditioning: [lastConditioningNode, 0] },
    },
    "13": {
      class_type: "RandomNoise",
      inputs: { noise_seed: seed },
    },
    "14": {
      class_type: "KSamplerSelect",
      inputs: { sampler_name: "euler" },
    },
    "15": {
      class_type: "SamplerCustomAdvanced",
      inputs: {
        noise: ["13", 0],
        guider: ["12", 0],
        sampler: ["14", 0],
        sigmas: ["11", 0],
        latent_image: ["10", 0],
      },
    },
    "16": {
      class_type: "VAEDecode",
      inputs: { samples: ["15", 0], vae: ["3", 0] },
    },
    "17": {
      class_type: "SaveImage",
      inputs: { filename_prefix: "comfyui_api", images: ["16", 0] },
    },
  });

  return nodes;
}

function buildZImageTxt2ImgWorkflow(
  prompt: string,
  config: ModelConfig,
  width: number,
  height: number,
  seed: number,
  steps: number = 4,
): Record<string, unknown> {
  return {
    "1": {
      class_type: "UNETLoader",
      inputs: { unet_name: config.unet, weight_dtype: "default" },
    },
    "2": {
      class_type: "CLIPLoader",
      inputs: { clip_name: config.clip, type: config.clipType },
    },
    "3": {
      class_type: "VAELoader",
      inputs: { vae_name: config.vae },
    },
    "4": {
      class_type: "CLIPTextEncode",
      inputs: { text: prompt, clip: ["2", 0] },
    },
    "5": {
      class_type: "CLIPTextEncode",
      inputs: { text: "", clip: ["2", 0] },
    },
    "6": {
      class_type: "EmptySD3LatentImage",
      inputs: { width, height, batch_size: 1 },
    },
    "7": {
      class_type: "KSampler",
      inputs: {
        seed,
        steps,
        cfg: 1.0,
        sampler_name: "euler",
        scheduler: "simple",
        denoise: 1.0,
        model: ["1", 0],
        positive: ["4", 0],
        negative: ["5", 0],
        latent_image: ["6", 0],
      },
    },
    "8": {
      class_type: "VAEDecode",
      inputs: { samples: ["7", 0], vae: ["3", 0] },
    },
    "9": {
      class_type: "SaveImage",
      inputs: { filename_prefix: "comfyui_api", images: ["8", 0] },
    },
  };
}

// ---- Wan 2.1 Video workflow builder ----

export interface VideoGenRequest {
  prompt: string;
  firstFrameBuffer?: Buffer;
  lastFrameBuffer?: Buffer;
  baseUrl?: string;
  width?: number;
  height?: number;
  length?: number;
  steps?: number;
  fps?: number;
  aspectRatio?: string;
}

export interface VideoGenResult {
  video: Buffer;
  mime: string;
}

function buildWanVideoWorkflow(
  prompt: string,
  firstFrameFilename: string | null,
  lastFrameFilename: string | null,
  width: number,
  height: number,
  length: number,
  seed: number,
  steps: number = 30,
  fps: number = 16,
): Record<string, unknown> {
  const nodes: Record<string, unknown> = {
    "1": {
      class_type: "UNETLoader",
      inputs: { unet_name: "wan2.1_flf2v_720p_14B_fp8_e4m3fn.safetensors", weight_dtype: "fp8_e4m3fn" },
    },
    "2": {
      class_type: "CLIPLoader",
      inputs: { clip_name: "umt5_xxl_fp8_e4m3fn_scaled.safetensors", type: "wan" },
    },
    "3": {
      class_type: "VAELoader",
      inputs: { vae_name: "wan_2.1_vae.safetensors" },
    },
    "4": {
      class_type: "CLIPTextEncode",
      inputs: { text: prompt, clip: ["2", 0] },
    },
    "5": {
      class_type: "CLIPTextEncode",
      inputs: { text: "", clip: ["2", 0] },
    },
    "6": {
      class_type: "CLIPVisionLoader",
      inputs: { clip_name: "clip_vision_h.safetensors" },
    },
  };

  // Use WanFirstLastFrameToVideo for first+last or first-only
  const videoNode: Record<string, unknown> = {
    class_type: "WanFirstLastFrameToVideo",
    inputs: {
      positive: ["4", 0],
      negative: ["5", 0],
      vae: ["3", 0],
      width,
      height,
      length,
      batch_size: 1,
    },
  };

  if (firstFrameFilename) {
    nodes["20"] = { class_type: "LoadImage", inputs: { image: firstFrameFilename, upload: "image" } };
    nodes["21"] = { class_type: "CLIPVisionEncode", inputs: { clip_vision: ["6", 0], image: ["20", 0], crop: "center" } };
    (videoNode.inputs as Record<string, unknown>).start_image = ["20", 0];
    (videoNode.inputs as Record<string, unknown>).clip_vision_start_image = ["21", 0];
  }

  if (lastFrameFilename) {
    nodes["30"] = { class_type: "LoadImage", inputs: { image: lastFrameFilename, upload: "image" } };
    nodes["31"] = { class_type: "CLIPVisionEncode", inputs: { clip_vision: ["6", 0], image: ["30", 0], crop: "center" } };
    (videoNode.inputs as Record<string, unknown>).end_image = ["30", 0];
    (videoNode.inputs as Record<string, unknown>).clip_vision_end_image = ["31", 0];
  }

  nodes["10"] = videoNode;

  Object.assign(nodes, {
    "11": { class_type: "KSampler", inputs: {
      seed, steps, cfg: 5.0, sampler_name: "uni_pc", scheduler: "simple", denoise: 1.0,
      model: ["1", 0], positive: ["10", 0], negative: ["10", 1], latent_image: ["10", 2],
    }},
    "12": { class_type: "VAEDecode", inputs: { samples: ["11", 0], vae: ["3", 0] } },
    "13": { class_type: "CreateVideo", inputs: { images: ["12", 0], fps } },
    "14": { class_type: "SaveVideo", inputs: { video: ["13", 0], filename_prefix: "video/comfyui_api", format: "mp4", codec: "h264" } },
  });

  return nodes;
}

// ---- Upload reference images to ComfyUI ----

async function uploadImage(
  baseUrl: string,
  imageBuffer: Buffer,
  filename: string,
): Promise<string> {
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(imageBuffer)], { type: "image/png" });
  formData.append("image", blob, filename);
  formData.append("overwrite", "true");

  const res = await fetch(`${baseUrl}/upload/image`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`ComfyUI upload failed (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  return data.name;
}

// ---- Queue / Wait / Download ----

async function queuePrompt(
  baseUrl: string,
  workflow: Record<string, unknown>,
): Promise<string> {
  const res = await fetch(`${baseUrl}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ComfyUI queue failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.prompt_id;
}

async function waitForResult(
  baseUrl: string,
  promptId: string,
  timeoutMs: number = 300_000,
): Promise<{ filename: string; type: "image" | "video"; subfolder?: string }> {
  const start = Date.now();
  const pollInterval = 2000;

  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${baseUrl}/history/${promptId}`);
    if (!res.ok) {
      await new Promise((r) => setTimeout(r, pollInterval));
      continue;
    }

    const history = await res.json();
    const entry = history[promptId];

    if (!entry) {
      await new Promise((r) => setTimeout(r, pollInterval));
      continue;
    }

    if (entry.status?.status_str === "error") {
      const msgs: unknown[][] = entry.status?.messages || [];
      const errMsg = msgs.find(
        (m) => Array.isArray(m) && m[0] === "execution_error",
      );
      throw new Error(
        `ComfyUI execution error: ${errMsg ? JSON.stringify(errMsg[1]) : "unknown"}`,
      );
    }

    if (entry.outputs) {
      for (const nodeId of Object.keys(entry.outputs)) {
        const output = entry.outputs[nodeId];
        if (output.videos && output.videos.length > 0) {
          return { filename: output.videos[0].filename, type: "video", subfolder: output.videos[0].subfolder };
        }
        if (output.images && output.images.length > 0) {
          const item = output.images[0];
          const isVideo = item.filename.endsWith(".mp4") || item.filename.endsWith(".webm");
          return { filename: item.filename, type: isVideo ? "video" : "image", subfolder: item.subfolder };
        }
      }
    }

    await new Promise((r) => setTimeout(r, pollInterval));
  }

  throw new Error("ComfyUI generation timed out after 5 minutes");
}

async function downloadFile(
  baseUrl: string,
  filename: string,
  subfolder?: string,
): Promise<Buffer> {
  let url = `${baseUrl}/view?filename=${encodeURIComponent(filename)}&type=output`;
  if (subfolder) url += `&subfolder=${encodeURIComponent(subfolder)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `ComfyUI download failed (${res.status}): ${await res.text()}`,
    );
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function fetchComfyUIModels(
  baseUrl: string,
): Promise<string[]> {
  try {
    const res = await fetch(`${baseUrl}/object_info/UNETLoader`);
    if (!res.ok) return [];
    const data = await res.json();
    const unetInput = data?.UNETLoader?.input?.required?.unet_name;
    if (Array.isArray(unetInput) && Array.isArray(unetInput[0])) {
      return unetInput[0] as string[];
    }
  } catch { /* skip */ }
  return [];
}

// ---- Image Provider ----

export const comfyuiImageProvider: ImageProvider = {
  id: "comfyui",

  capabilities: {
    supports_reference_edit: true,
    max_reference_images: 10,
    supports_text_to_image: true,
  },

  async generate(req: ImageGenRequest): Promise<ImageGenResult> {
    const baseUrl = req.baseUrl || DEFAULT_BASE_URL;
    const config = getModelConfig(req.model);

    const [width, height] =
      ASPECT_RATIOS[req.aspectRatio || "1:1"] || [1024, 1024];

    const seed = Math.floor(Math.random() * 2 ** 32);
    const hasRefs = req.referenceImages && req.referenceImages.length > 0;

    let workflow: Record<string, unknown>;

    const isFlux2 = config.workflow === "flux2";

    if (hasRefs && isFlux2) {
      const uploadedNames: string[] = [];
      for (let i = 0; i < req.referenceImages!.length; i++) {
        const name = await uploadImage(
          baseUrl,
          req.referenceImages![i],
          `ref_${Date.now()}_${i}.png`,
        );
        uploadedNames.push(name);
      }
      workflow = buildFlux2RefWorkflow(req.prompt, config, uploadedNames, width, height, seed, config.defaultSteps);
    } else if (isFlux2) {
      workflow = buildFlux2Txt2ImgWorkflow(req.prompt, config, width, height, seed, config.defaultSteps);
    } else if (config.workflow === "zimage") {
      workflow = buildZImageTxt2ImgWorkflow(req.prompt, config, width, height, seed, config.defaultSteps);
    } else {
      workflow = buildQwenTxt2ImgWorkflow(req.prompt, width, height, seed);
    }

    const promptId = await queuePrompt(baseUrl, workflow);
    const result = await waitForResult(baseUrl, promptId);
    const image = await downloadFile(baseUrl, result.filename, result.subfolder);

    return {
      image,
      mime: "image/png",
      mode: hasRefs && isFlux2 ? "reference_edit" : "text_to_image",
    };
  },
};

// ---- Video Provider ----

export async function generateVideo(req: VideoGenRequest): Promise<VideoGenResult> {
  const baseUrl = req.baseUrl || DEFAULT_BASE_URL;
  const ar = req.aspectRatio || "16:9";
  const [width, height] = VIDEO_RESOLUTIONS[ar] || [832, 480];
  const length = req.length || 81;
  const steps = req.steps || 30;
  const fps = req.fps || 16;
  const seed = Math.floor(Math.random() * 2 ** 32);

  let firstFrameFilename: string | null = null;
  let lastFrameFilename: string | null = null;

  if (req.firstFrameBuffer) {
    firstFrameFilename = await uploadImage(baseUrl, req.firstFrameBuffer, `vidref_first_${Date.now()}.png`);
  }
  if (req.lastFrameBuffer) {
    lastFrameFilename = await uploadImage(baseUrl, req.lastFrameBuffer, `vidref_last_${Date.now()}.png`);
  }

  const workflow = buildWanVideoWorkflow(
    req.prompt, firstFrameFilename, lastFrameFilename,
    width, height, length, seed, steps, fps,
  );

  const promptId = await queuePrompt(baseUrl, workflow);
  const result = await waitForResult(baseUrl, promptId, 600_000);
  const video = await downloadFile(baseUrl, result.filename, result.subfolder);

  return { video, mime: "video/mp4" };
}
