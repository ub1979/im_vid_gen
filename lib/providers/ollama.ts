// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// Ollama : local Ollama image generation and text LLM provider.
//          Supports text-to-image (no reference editing), plain text,
//          text-with-images analysis, and scene segmentation.
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
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
// =============================================================================

// =============================================================================
// Constants
// =============================================================================
const DEFAULT_BASE_URL = "http://localhost:11434";

// =============================================================================
// Ollama image provider adapter
// =============================================================================
export const ollamaImageProvider: ImageProvider = {
  id: "ollama",

  capabilities: {
    supports_reference_edit: false,
    max_reference_images: 0,
    supports_text_to_image: true,
  },

  // =============================================================================
  // Function generates an image using Ollama -> ImageGenRequest to ImageGenResult
  // =============================================================================
  async generate(req: ImageGenRequest): Promise<ImageGenResult> {
    /*
        generate : creates an image via local Ollama (text-to-image only)
        req variable : generation request with prompt, model, and optional base URL
    */
    const baseUrl = req.baseUrl || DEFAULT_BASE_URL;

    // =====================================
    // Augment prompt with character descriptions if needed
    // =====================================
    let promptText = req.prompt;
    // ==================================
    if (req.charactersUsed.length > 0) {
      promptText = augmentPromptWithDescriptions(
        promptText,
        req.charactersUsed,
      );
    }
    // ==================================

    // =====================================
    // Call Ollama generate endpoint
    // =====================================
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: req.model,
        prompt: promptText,
        stream: false,
      }),
    });

    // ==================================
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(
        `Ollama generate failed (${response.status}): ${errText}`,
      );
    }
    // ==================================

    const data = await response.json();

    // =====================================
    // Check for image data in various response formats
    // =====================================
    // ==================================
    if (data.images && data.images.length > 0) {
      return {
        image: Buffer.from(data.images[0], "base64"),
        mime: "image/png",
        mode: "text_to_image",
      };
    }
    // ==================================

    // ==================================
    if (data.response) {
      const base64Match = data.response.match(
        /data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)/,
      );
      // ==================================
      if (base64Match) {
        return {
          image: Buffer.from(base64Match[2], "base64"),
          mime: `image/${base64Match[1]}`,
          mode: "text_to_image",
        };
      }
      // ==================================
    }
    // ==================================

    throw new Error(
      "Ollama model did not return image data. Ensure the model supports image generation.",
    );
  },
};

// =============================================================================
// Ollama text LLM adapter
// =============================================================================
export const ollamaTextLLM: TextLLM = {
  id: "ollama",

  // =============================================================================
  // Function generates plain text -> TextGenRequest to string
  // =============================================================================
  async generateText(req: TextGenRequest): Promise<string> {
    /*
        generateText : sends a text prompt to Ollama and returns the response
        req variable : request with system prompt, user prompt, model, and base URL
    */
    const baseUrl = req.baseUrl || DEFAULT_BASE_URL;

    // =====================================
    // Call Ollama chat endpoint
    // =====================================
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

    // ==================================
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ollama chat failed (${response.status}): ${errText}`);
    }
    // ==================================

    const data = await response.json();
    const text = data.message?.content;
    // ==================================
    if (!text) throw new Error("Ollama returned no text content");
    // ==================================
    return text;
  },

  // =============================================================================
  // Function generates text from images -> TextGenWithImagesRequest to string
  // =============================================================================
  async generateTextWithImages(req: TextGenWithImagesRequest): Promise<string> {
    /*
        generateTextWithImages : sends images + text to Ollama for analysis
        req variable : request containing images, system prompt, user prompt, and base URL
    */
    const baseUrl = req.baseUrl || DEFAULT_BASE_URL;

    // =====================================
    // Convert images to base64
    // =====================================
    const images = req.images.map((img) => img.data.toString("base64"));

    // =====================================
    // Call Ollama chat endpoint with images
    // =====================================
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

    // ==================================
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ollama chat failed (${response.status}): ${errText}`);
    }
    // ==================================

    const data = await response.json();
    const text = data.message?.content;
    // ==================================
    if (!text) throw new Error("Ollama returned no text content");
    // ==================================
    return text;
  },

  // =============================================================================
  // Function segments text into timed scenes -> SegmentRequest to Scene[]
  // =============================================================================
  async segment(req: SegmentRequest): Promise<Scene[]> {
    /*
        segment : splits input text into timed scenes using Ollama
        req variable : segmentation request with text, characters, scene count
    */
    const baseUrl = req.baseUrl || DEFAULT_BASE_URL;

    // =====================================
    // Build segmentation system prompt
    // =====================================
    const systemPrompt = buildSegmentationPrompt(
      req.sceneCount,
      req.intervalSeconds,
      req.characters,
      req.imageProviderId,
    );

    // =====================================
    // Call Ollama chat endpoint
    // =====================================
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

    // ==================================
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(
        `Ollama chat failed (${response.status}): ${errText}`,
      );
    }
    // ==================================

    const data = await response.json();
    const text = data.message?.content;
    // ==================================
    if (!text) {
      throw new Error("Ollama returned no text content");
    }
    // ==================================

    return parseAndValidate(text, req.sceneCount);
  },
};

// =============================================================================
// Function augments a prompt with character descriptions -> string, CharacterRef[] to string
// =============================================================================
function augmentPromptWithDescriptions(
  prompt: string,
  characters: CharacterRef[],
): string {
  /*
      augmentPromptWithDescriptions : appends character text descriptions to a prompt
      prompt variable : the original image generation prompt
      characters variable : array of character references with labels and descriptions
  */
  const descriptions = characters
    .map(
      (c) =>
        `[${c.label}: ${c.description || `a character named ${c.label}`}]`,
    )
    .join(" ");

  return `${prompt}\n\nCharacter descriptions for visual reference: ${descriptions}`;
}

// =============================================================================
// =============================================================================
