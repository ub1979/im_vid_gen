import type { CharacterRef } from "@/lib/types";
import type {
  ImageProvider,
  ImageGenRequest,
  ImageGenResult,
  TextLLM,
  TextGenRequest,
  TextGenWithImagesRequest,
  SegmentRequest,
  Scene,
} from "./types";
import { buildSegmentationPrompt, parseAndValidate } from "@/lib/segment";

// ---- Constants ----

const DEFAULT_BASE_URL = "http://localhost:11434";

// ---- Image Provider ----

export const ollamaImageProvider: ImageProvider = {
  id: "ollama",

  capabilities: {
    supports_reference_edit: false,
    max_reference_images: 0,
    supports_text_to_image: true,
  },

  async generate(req: ImageGenRequest): Promise<ImageGenResult> {
    const baseUrl = req.baseUrl || DEFAULT_BASE_URL;

    // Ollama does not support reference editing — always text-to-image
    let promptText = req.prompt;
    if (req.charactersUsed.length > 0) {
      promptText = augmentPromptWithDescriptions(
        promptText,
        req.charactersUsed,
      );
    }

    // Call Ollama's generate endpoint
    // Some Ollama-compatible image models respond with base64 images
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: req.model,
        prompt: promptText,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(
        `Ollama generate failed (${response.status}): ${errText}`,
      );
    }

    const data = await response.json();

    // Check for image data in various response formats
    if (data.images && data.images.length > 0) {
      // Some image models return base64 in images array
      return {
        image: Buffer.from(data.images[0], "base64"),
        mime: "image/png",
        mode: "text_to_image",
      };
    }

    if (data.response) {
      // Some models return base64 image data in the response text
      const base64Match = data.response.match(
        /data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)/,
      );
      if (base64Match) {
        return {
          image: Buffer.from(base64Match[2], "base64"),
          mime: `image/${base64Match[1]}`,
          mode: "text_to_image",
        };
      }
    }

    throw new Error(
      "Ollama model did not return image data. Ensure the model supports image generation.",
    );
  },
};

// ---- Text LLM ----

export const ollamaTextLLM: TextLLM = {
  id: "ollama",

  async generateText(req: TextGenRequest): Promise<string> {
    const baseUrl = req.baseUrl || DEFAULT_BASE_URL;

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: req.model,
        messages: [
          { role: "system", content: req.systemPrompt },
          { role: "user", content: req.userPrompt },
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ollama chat failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const text = data.message?.content;
    if (!text) throw new Error("Ollama returned no text content");
    return text;
  },

  async generateTextWithImages(req: TextGenWithImagesRequest): Promise<string> {
    const baseUrl = req.baseUrl || DEFAULT_BASE_URL;

    const images = req.images.map((img) => img.data.toString("base64"));

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: req.model,
        messages: [
          { role: "system", content: req.systemPrompt },
          { role: "user", content: req.userPrompt, images },
        ],
        stream: false,
        format: "json",
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ollama chat failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const text = data.message?.content;
    if (!text) throw new Error("Ollama returned no text content");
    return text;
  },

  async segment(req: SegmentRequest): Promise<Scene[]> {
    const baseUrl = req.baseUrl || DEFAULT_BASE_URL;

    const systemPrompt = buildSegmentationPrompt(
      req.sceneCount,
      req.intervalSeconds,
      req.characters,
      req.imageProviderId,
    );

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: req.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: req.text },
        ],
        stream: false,
        format: "json",
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(
        `Ollama chat failed (${response.status}): ${errText}`,
      );
    }

    const data = await response.json();
    const text = data.message?.content;
    if (!text) {
      throw new Error("Ollama returned no text content");
    }

    return parseAndValidate(text, req.sceneCount);
  },
};

// ---- Helpers ----

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

  return `${prompt}\n\nCharacter descriptions for visual reference: ${descriptions}`;
}
