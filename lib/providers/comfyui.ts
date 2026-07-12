// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// ComfyUI : local ComfyUI GPU image and video generation provider.
//           Supports text-to-image, reference-edit (Flux2 only),
//           multiple workflow types (Qwen, Flux2, ZImage), and
//           Wan 2.1 FLF2V video generation.
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
const DEFAULT_BASE_URL = "http://localhost:8188";

// =====================================
// Aspect ratio to pixel dimension maps
// =====================================
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

// =============================================================================
// Model configuration interface and registry
// =============================================================================
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

// =============================================================================
// Function resolves a model name to its config -> string to ModelConfig
// =============================================================================
function getModelConfig(model: string): ModelConfig {
  /*
      getModelConfig : looks up a model's config, falling back to Flux2 Dev
      model variable : the model filename string to look up
  */
  return MODEL_CONFIGS[model] ?? MODEL_CONFIGS["flux2_dev_fp8mixed.safetensors"];
}

// =============================================================================
// Function builds a Qwen text-to-image workflow -> params to workflow object
// =============================================================================
function buildQwenTxt2ImgWorkflow(
  prompt: string,
  width: number,
  height: number,
  seed: number,
  steps: number = 20,
): Record<string, unknown> {
  /*
      buildQwenTxt2ImgWorkflow : constructs the ComfyUI node graph for Qwen image generation
      prompt variable : the text prompt for generation
      width variable : output image width in pixels
      height variable : output image height in pixels
      seed variable : random seed for reproducibility
      steps variable : number of sampling steps (default 20)
  */
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

// =============================================================================
// Function builds a Flux2 text-to-image workflow -> params to workflow object
// =============================================================================
function buildFlux2Txt2ImgWorkflow(
  prompt: string,
  config: ModelConfig,
  width: number,
  height: number,
  seed: number,
  steps: number = 20,
): Record<string, unknown> {
  /*
      buildFlux2Txt2ImgWorkflow : constructs the ComfyUI node graph for Flux2 image generation
      prompt variable : the text prompt for generation
      config variable : model configuration with unet, clip, vae filenames
      width variable : output image width in pixels
      height variable : output image height in pixels
      seed variable : random seed for reproducibility
      steps variable : number of sampling steps (default 20)
  */
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

// =============================================================================
// Function builds a Flux2 reference-edit workflow -> params to workflow object
// =============================================================================
function buildFlux2RefWorkflow(
  prompt: string,
  config: ModelConfig,
  refImageFilenames: string[],
  width: number,
  height: number,
  seed: number,
  steps: number = 20,
): Record<string, unknown> {
  /*
      buildFlux2RefWorkflow : constructs a Flux2 workflow with reference image conditioning
      prompt variable : the text prompt for generation
      config variable : model configuration with unet, clip, vae filenames
      refImageFilenames variable : array of uploaded reference image filenames
      width variable : output image width in pixels
      height variable : output image height in pixels
      seed variable : random seed for reproducibility
      steps variable : number of sampling steps (default 20)
  */
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

  // =====================================
  // Chain reference latent nodes for each image
  // =====================================
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

  // =====================================
  // Sampling and decode nodes
  // =====================================
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

// =============================================================================
// Function builds a ZImage text-to-image workflow -> params to workflow object
// =============================================================================
function buildZImageTxt2ImgWorkflow(
  prompt: string,
  config: ModelConfig,
  width: number,
  height: number,
  seed: number,
  steps: number = 4,
): Record<string, unknown> {
  /*
      buildZImageTxt2ImgWorkflow : constructs the ComfyUI node graph for ZImage turbo generation
      prompt variable : the text prompt for generation
      config variable : model configuration with unet, clip, vae filenames
      width variable : output image width in pixels
      height variable : output image height in pixels
      seed variable : random seed for reproducibility
      steps variable : number of sampling steps (default 4 for turbo)
  */
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

// =============================================================================
// Wan 2.1 Video generation interfaces
// =============================================================================
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

// =============================================================================
// Function builds a Wan 2.1 FLF2V video workflow -> params to workflow object
// =============================================================================
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
  /*
      buildWanVideoWorkflow : constructs the ComfyUI node graph for Wan 2.1 FLF2V video
      prompt variable : the text prompt describing the video
      firstFrameFilename variable : uploaded first frame filename or null
      lastFrameFilename variable : uploaded last frame filename or null
      width variable : output video width in pixels
      height variable : output video height in pixels
      length variable : number of frames to generate
      seed variable : random seed for reproducibility
      steps variable : number of sampling steps (default 30)
      fps variable : frames per second for output (default 16)
  */
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

  // =====================================
  // WanFirstLastFrameToVideo node
  // =====================================
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

  // ==================================
  if (firstFrameFilename) {
    nodes["20"] = { class_type: "LoadImage", inputs: { image: firstFrameFilename, upload: "image" } };
    nodes["21"] = { class_type: "CLIPVisionEncode", inputs: { clip_vision: ["6", 0], image: ["20", 0], crop: "center" } };
    (videoNode.inputs as Record<string, unknown>).start_image = ["20", 0];
    (videoNode.inputs as Record<string, unknown>).clip_vision_start_image = ["21", 0];
  }
  // ==================================

  // ==================================
  if (lastFrameFilename) {
    nodes["30"] = { class_type: "LoadImage", inputs: { image: lastFrameFilename, upload: "image" } };
    nodes["31"] = { class_type: "CLIPVisionEncode", inputs: { clip_vision: ["6", 0], image: ["30", 0], crop: "center" } };
    (videoNode.inputs as Record<string, unknown>).end_image = ["30", 0];
    (videoNode.inputs as Record<string, unknown>).clip_vision_end_image = ["31", 0];
  }
  // ==================================

  nodes["10"] = videoNode;

  // =====================================
  // Sampling, decode, and save nodes
  // =====================================
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

// =============================================================================
// Function uploads a reference image to ComfyUI -> string, Buffer, string to string
// =============================================================================
async function uploadImage(
  baseUrl: string,
  imageBuffer: Buffer,
  filename: string,
): Promise<string> {
  /*
      uploadImage : uploads an image buffer to ComfyUI's input directory
      baseUrl variable : ComfyUI server base URL
      imageBuffer variable : the image data as a Buffer
      filename variable : the filename to save as on the server
  */
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(imageBuffer)], { type: "image/png" });
  formData.append("image", blob, filename);
  formData.append("overwrite", "true");

  const res = await fetch(`${baseUrl}/upload/image`, {
    method: "POST",
    body: formData,
  });

  // ==================================
  if (!res.ok) {
    throw new Error(`ComfyUI upload failed (${res.status}): ${await res.text()}`);
  }
  // ==================================

  const data = await res.json();
  return data.name;
}

// =============================================================================
// Function queues a workflow prompt on ComfyUI -> string, object to string
// =============================================================================
async function queuePrompt(
  baseUrl: string,
  workflow: Record<string, unknown>,
): Promise<string> {
  /*
      queuePrompt : submits a workflow to ComfyUI's prompt queue
      baseUrl variable : ComfyUI server base URL
      workflow variable : the node graph workflow object
  */
  const res = await fetch(`${baseUrl}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow }),
  });

  // ==================================
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ComfyUI queue failed (${res.status}): ${errText}`);
  }
  // ==================================

  const data = await res.json();
  return data.prompt_id;
}

// =============================================================================
// Function polls ComfyUI history until result is ready -> string, string, number to object
// =============================================================================
async function waitForResult(
  baseUrl: string,
  promptId: string,
  timeoutMs: number = 300_000,
): Promise<{ filename: string; type: "image" | "video"; subfolder?: string }> {
  /*
      waitForResult : polls ComfyUI history at 2s intervals until the output is ready
      baseUrl variable : ComfyUI server base URL
      promptId variable : the prompt ID to watch for
      timeoutMs variable : maximum wait time in milliseconds (default 5 min)
  */
  const start = Date.now();
  const pollInterval = 2000;

  // =====================================
  // Poll loop
  // =====================================
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${baseUrl}/history/${promptId}`);
    // ==================================
    if (!res.ok) {
      await new Promise((r) => setTimeout(r, pollInterval));
      continue;
    }
    // ==================================

    const history = await res.json();
    const entry = history[promptId];

    // ==================================
    if (!entry) {
      await new Promise((r) => setTimeout(r, pollInterval));
      continue;
    }
    // ==================================

    // ==================================
    if (entry.status?.status_str === "error") {
      const msgs: unknown[][] = entry.status?.messages || [];
      const errMsg = msgs.find(
        (m) => Array.isArray(m) && m[0] === "execution_error",
      );
      throw new Error(
        `ComfyUI execution error: ${errMsg ? JSON.stringify(errMsg[1]) : "unknown"}`,
      );
    }
    // ==================================

    // ==================================
    if (entry.outputs) {
      for (const nodeId of Object.keys(entry.outputs)) {
        const output = entry.outputs[nodeId];
        // ======================
        // Check for video output first
        if (output.videos && output.videos.length > 0) {
          return { filename: output.videos[0].filename, type: "video", subfolder: output.videos[0].subfolder };
        }
        // ======================
        // Check for image output (may also be video by extension)
        if (output.images && output.images.length > 0) {
          const item = output.images[0];
          const isVideo = item.filename.endsWith(".mp4") || item.filename.endsWith(".webm");
          return { filename: item.filename, type: isVideo ? "video" : "image", subfolder: item.subfolder };
        }
      }
    }
    // ==================================

    await new Promise((r) => setTimeout(r, pollInterval));
  }

  throw new Error("ComfyUI generation timed out after 5 minutes");
}

// =============================================================================
// Function downloads a generated file from ComfyUI -> string, string, string? to Buffer
// =============================================================================
async function downloadFile(
  baseUrl: string,
  filename: string,
  subfolder?: string,
): Promise<Buffer> {
  /*
      downloadFile : fetches a generated output file from ComfyUI's view endpoint
      baseUrl variable : ComfyUI server base URL
      filename variable : the output filename to download
      subfolder variable : optional subfolder within the output directory
  */
  let url = `${baseUrl}/view?filename=${encodeURIComponent(filename)}&type=output`;
  // ==================================
  if (subfolder) url += `&subfolder=${encodeURIComponent(subfolder)}`;
  // ==================================

  const res = await fetch(url);
  // ==================================
  if (!res.ok) {
    throw new Error(
      `ComfyUI download failed (${res.status}): ${await res.text()}`,
    );
  }
  // ==================================

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// =============================================================================
// Function fetches available ComfyUI models -> string to string[]
// =============================================================================
export async function fetchComfyUIModels(
  baseUrl: string,
): Promise<string[]> {
  /*
      fetchComfyUIModels : queries ComfyUI for available UNET model filenames
      baseUrl variable : ComfyUI server base URL
  */
  try {
    const res = await fetch(`${baseUrl}/object_info/UNETLoader`);
    // ==================================
    if (!res.ok) return [];
    // ==================================
    const data = await res.json();
    const unetInput = data?.UNETLoader?.input?.required?.unet_name;
    // ==================================
    if (Array.isArray(unetInput) && Array.isArray(unetInput[0])) {
      return unetInput[0] as string[];
    }
    // ==================================
  } catch { /* skip */ }
  return [];
}

// =============================================================================
// ComfyUI image provider adapter
// =============================================================================
export const comfyuiImageProvider: ImageProvider = {
  id: "comfyui",

  capabilities: {
    supports_reference_edit: true,
    max_reference_images: 10,
    supports_text_to_image: true,
  },

  // =============================================================================
  // Function generates an image using ComfyUI -> ImageGenRequest to ImageGenResult
  // =============================================================================
  async generate(req: ImageGenRequest): Promise<ImageGenResult> {
    /*
        generate : creates an image via local ComfyUI using the appropriate workflow
        req variable : generation request with prompt, model, aspect ratio, and optional references
    */
    const baseUrl = req.baseUrl || DEFAULT_BASE_URL;
    const config = getModelConfig(req.model);

    const [width, height] =
      ASPECT_RATIOS[req.aspectRatio || "1:1"] || [1024, 1024];

    const seed = Math.floor(Math.random() * 2 ** 32);
    const hasRefs = req.referenceImages && req.referenceImages.length > 0;

    let workflow: Record<string, unknown>;

    const isFlux2 = config.workflow === "flux2";

    // ==================================
    if (hasRefs && isFlux2) {
      // =====================================
      // Upload reference images and build Flux2 ref workflow
      // =====================================
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
    // ==================================
    } else if (isFlux2) {
      workflow = buildFlux2Txt2ImgWorkflow(req.prompt, config, width, height, seed, config.defaultSteps);
    // ==================================
    } else if (config.workflow === "zimage") {
      workflow = buildZImageTxt2ImgWorkflow(req.prompt, config, width, height, seed, config.defaultSteps);
    // ==================================
    } else {
      workflow = buildQwenTxt2ImgWorkflow(req.prompt, width, height, seed);
    }
    // ==================================

    // =====================================
    // Queue, wait, and download result
    // =====================================
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

// =============================================================================
// Function generates a video using ComfyUI Wan 2.1 -> VideoGenRequest to VideoGenResult
// =============================================================================
export async function generateVideo(req: VideoGenRequest): Promise<VideoGenResult> {
  /*
      generateVideo : creates a video via local ComfyUI using Wan 2.1 FLF2V workflow
      req variable : video request with prompt, optional frame buffers, and generation parameters
  */
  const baseUrl = req.baseUrl || DEFAULT_BASE_URL;
  const ar = req.aspectRatio || "16:9";
  const [width, height] = VIDEO_RESOLUTIONS[ar] || [832, 480];
  const length = req.length || 81;
  const steps = req.steps || 30;
  const fps = req.fps || 16;
  const seed = Math.floor(Math.random() * 2 ** 32);

  let firstFrameFilename: string | null = null;
  let lastFrameFilename: string | null = null;

  // ==================================
  if (req.firstFrameBuffer) {
    firstFrameFilename = await uploadImage(baseUrl, req.firstFrameBuffer, `vidref_first_${Date.now()}.png`);
  }
  // ==================================

  // ==================================
  if (req.lastFrameBuffer) {
    lastFrameFilename = await uploadImage(baseUrl, req.lastFrameBuffer, `vidref_last_${Date.now()}.png`);
  }
  // ==================================

  // =====================================
  // Build workflow, queue, wait, and download
  // =====================================
  const workflow = buildWanVideoWorkflow(
    req.prompt, firstFrameFilename, lastFrameFilename,
    width, height, length, seed, steps, fps,
  );

  const promptId = await queuePrompt(baseUrl, workflow);
  const result = await waitForResult(baseUrl, promptId, 600_000);
  const video = await downloadFile(baseUrl, result.filename, result.subfolder);

  return { video, mime: "video/mp4" };
}

// =============================================================================
// =============================================================================
