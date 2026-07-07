import type { CharacterRef } from "@/lib/types";
import type {
  ImageProvider,
  ImageGenRequest,
  ImageGenResult,
} from "./types";

// ---- Constants ----

const DASHSCOPE_BASE_URL =
  "https://dashscope.aliyuncs.com/api/v1/services/aigc/image-generation/generation";
const DASHSCOPE_TASK_URL =
  "https://dashscope.aliyuncs.com/api/v1/tasks";

// ---- Image Provider ----

export const qwenImageProvider: ImageProvider = {
  id: "qwen",

  capabilities: {
    supports_reference_edit: true,
    max_reference_images: 1,
    supports_text_to_image: true,
  },

  async generate(req: ImageGenRequest): Promise<ImageGenResult> {
    if (!req.apiKey) {
      throw new Error("DashScope API key is required for Qwen");
    }

    const hasRefs = req.referenceImages && req.referenceImages.length > 0;
    const mode: ImageGenResult["mode"] = hasRefs
      ? "reference_edit"
      : "text_to_image";

    // ADR-004: Qwen supports max 1 reference image.
    // When >1 character, pass the first as reference and augment prompt
    // with text descriptions of the remaining characters.
    let promptText = req.prompt;
    const refImage = hasRefs ? req.referenceImages![0] : undefined;

    if (req.charactersUsed.length > 1 && hasRefs) {
      // First character gets the reference image; others get text descriptions
      const remainingChars = req.charactersUsed.slice(1);
      promptText = augmentPromptWithDescriptions(promptText, remainingChars);
    } else if (!hasRefs && req.charactersUsed.length > 0) {
      promptText = augmentPromptWithDescriptions(
        promptText,
        req.charactersUsed,
      );
    }

    // Submit async task to DashScope
    const baseUrl = req.baseUrl || DASHSCOPE_BASE_URL;

    // Build request body
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const input: Record<string, any> = {
      prompt: promptText,
    };

    if (refImage) {
      // Pass reference image as base64 data URL
      input.ref_image = `data:image/png;base64,${refImage.toString("base64")}`;
    }

    const body = {
      model: req.model,
      input,
      parameters: {
        size: req.aspectRatio === "16:9" ? "1280*720"
          : req.aspectRatio === "9:16" ? "720*1280"
          : req.aspectRatio === "4:3" ? "1024*768"
          : req.aspectRatio === "3:4" ? "768*1024"
          : "1024*1024",
        n: 1,
      },
    };

    // Submit generation task
    const submitResp = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${req.apiKey}`,
        "X-DashScope-Async": "enable",
      },
      body: JSON.stringify(body),
    });

    if (!submitResp.ok) {
      const errText = await submitResp.text();
      throw new Error(
        `DashScope submit failed (${submitResp.status}): ${errText}`,
      );
    }

    const submitData = await submitResp.json();
    const taskId = submitData.output?.task_id;
    if (!taskId) {
      throw new Error("DashScope did not return a task_id");
    }

    // Poll for completion
    const taskUrl = `${DASHSCOPE_TASK_URL}/${taskId}`;
    const maxAttempts = 60;
    const pollInterval = 2000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await sleep(pollInterval);

      const pollResp = await fetch(taskUrl, {
        headers: {
          Authorization: `Bearer ${req.apiKey}`,
        },
      });

      if (!pollResp.ok) {
        const errText = await pollResp.text();
        throw new Error(
          `DashScope poll failed (${pollResp.status}): ${errText}`,
        );
      }

      const pollData = await pollResp.json();
      const status = pollData.output?.task_status;

      if (status === "SUCCEEDED") {
        const results = pollData.output?.results;
        if (!results || results.length === 0) {
          throw new Error("DashScope task succeeded but returned no results");
        }

        const imageUrl = results[0].url;
        if (!imageUrl) {
          throw new Error("DashScope result missing image URL");
        }

        // Fetch the generated image
        const imgResp = await fetch(imageUrl);
        if (!imgResp.ok) {
          throw new Error(`Failed to fetch generated image from ${imageUrl}`);
        }
        const arrayBuf = await imgResp.arrayBuffer();
        return {
          image: Buffer.from(arrayBuf),
          mime: "image/png",
          mode,
        };
      }

      if (status === "FAILED") {
        const errMsg =
          pollData.output?.message || "DashScope generation failed";
        throw new Error(errMsg);
      }

      // PENDING or RUNNING — continue polling
    }

    throw new Error("DashScope generation timed out after polling");
  },
};

// ---- Helpers ----

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function augmentPromptWithDescriptions(
  prompt: string,
  characters: CharacterRef[],
): string {
  const descriptions = characters
    .map(
      (c) =>
        `[${c.label}: ${c.description || `a character named ${c.label}`}]`,
    )
    .join(" ");

  return `${prompt}\n\nAdditional character descriptions: ${descriptions}`;
}
