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
): Promise<string> {
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
        if (output.images && output.images.length > 0) {
          return output.images[0].filename;
        }
      }
    }

    await new Promise((r) => setTimeout(r, pollInterval));
  }

  throw new Error("ComfyUI generation timed out after 5 minutes");
}

async function downloadImage(
  baseUrl: string,
  filename: string,
): Promise<Buffer> {
  const res = await fetch(
    `${baseUrl}/view?filename=${encodeURIComponent(filename)}&type=output`,
  );
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

export const comfyuiImageProvider: ImageProvider = {
  id: "comfyui",

  capabilities: {
    supports_reference_edit: false,
    max_reference_images: 0,
    supports_text_to_image: true,
  },

  async generate(req: ImageGenRequest): Promise<ImageGenResult> {
    const baseUrl = req.baseUrl || DEFAULT_BASE_URL;

    const [width, height] =
      ASPECT_RATIOS[req.aspectRatio || "1:1"] || [1024, 1024];

    const seed = Math.floor(Math.random() * 2 ** 32);
    const workflow = buildQwenTxt2ImgWorkflow(req.prompt, width, height, seed);

    const promptId = await queuePrompt(baseUrl, workflow);
    const outputFilename = await waitForResult(baseUrl, promptId);
    const image = await downloadImage(baseUrl, outputFilename);

    return {
      image,
      mime: "image/png",
      mode: "text_to_image",
    };
  },
};
