// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// OpenAI : OpenAI image generation and text LLM provider.
//          Supports reference-edit via images.edit, text-to-image via
//          images.generate, text-with-images analysis, and segmentation.
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import OpenAI from "openai";
import type { CharacterRef } from "@/lib/types";
import type {
  ImageProvider,
  ImageGenRequest,
  ImageGenResult,
  TextLLM,
  TextGenWithImagesRequest,
  SegmentRequest,
  Scene,
} from "./types";
import { buildSegmentationPrompt, parseAndValidate } from "@/lib/segment";
// =============================================================================

// =============================================================================
// Constants
// =============================================================================
const OPENAI_SIZE_MAP: Record<string, string> = {
  "1:1": "1024x1024",
  "16:9": "1792x1024",
  "9:16": "1024x1792",
  "4:3": "1792x1024",
  "3:4": "1024x1792",
};

// =============================================================================
// Function maps aspect ratio to OpenAI size string -> string to string
// =============================================================================
function openaiSize(aspectRatio?: string): string {
  /*
      openaiSize : converts an aspect ratio like "16:9" to an OpenAI size like "1792x1024"
      aspectRatio variable : optional aspect ratio string
  */
  return (aspectRatio && OPENAI_SIZE_MAP[aspectRatio]) || "1024x1024";
}

// =============================================================================
// OpenAI image provider adapter
// =============================================================================
export const openaiImageProvider: ImageProvider = {
  id: "openai",

  capabilities: {
    supports_reference_edit: true,
    max_reference_images: 4,
    supports_text_to_image: true,
  },

  // =============================================================================
  // Function generates an image using OpenAI -> ImageGenRequest to ImageGenResult
  // =============================================================================
  async generate(req: ImageGenRequest): Promise<ImageGenResult> {
    /*
        generate : creates an image via the OpenAI API with optional reference images
        req variable : generation request with prompt, references, model, and API key
    */
    // ==================================
    if (!req.apiKey) {
      throw new Error("OpenAI API key is required");
    }
    // ==================================

    const client = new OpenAI({
      apiKey: req.apiKey,
      ...(req.baseUrl ? { baseURL: req.baseUrl } : {}),
    });

    const hasRefs = req.referenceImages && req.referenceImages.length > 0;
    const mode: ImageGenResult["mode"] = hasRefs
      ? "reference_edit"
      : "text_to_image";

    let promptText = req.prompt;
    // ==================================
    if (!hasRefs && req.charactersUsed.length > 0) {
      promptText = augmentPromptWithDescriptions(
        req.prompt,
        req.charactersUsed,
      );
    }
    // ==================================

    // ==================================
    if (hasRefs) {
      // =====================================
      // Reference edit mode via images.edit
      // =====================================
      const imageFiles = req.referenceImages!.map((buf, i) =>
        new File([new Uint8Array(buf)], `reference-${i}.png`, { type: "image/png" }),
      );

      const response = await client.images.edit({
        model: req.model,
        prompt: promptText,
        image: imageFiles,
        size: openaiSize(req.aspectRatio) as "1024x1024" | "1792x1024" | "1024x1792",
      });

      const imageData = response.data?.[0];
      // ==================================
      if (!imageData) {
        throw new Error("OpenAI returned no image data");
      }
      // ==================================

      // ==================================
      if (imageData.b64_json) {
        return {
          image: Buffer.from(imageData.b64_json, "base64"),
          mime: "image/png",
          mode,
        };
      // ==================================
      } else if (imageData.url) {
        const fetchResp = await fetch(imageData.url);
        const arrayBuf = await fetchResp.arrayBuffer();
        return {
          image: Buffer.from(arrayBuf),
          mime: "image/png",
          mode,
        };
      }
      // ==================================

      throw new Error("OpenAI edit response missing image data");
    // ==================================
    } else {
      // =====================================
      // Text-to-image mode via images.generate
      // =====================================
      const response = await client.images.generate({
        model: req.model,
        prompt: promptText,
        n: 1,
        size: openaiSize(req.aspectRatio) as "1024x1024" | "1792x1024" | "1024x1792",
        response_format: "b64_json",
      });

      const imageData = response.data?.[0];
      // ==================================
      if (!imageData?.b64_json) {
        throw new Error("OpenAI returned no image data");
      }
      // ==================================

      return {
        image: Buffer.from(imageData.b64_json, "base64"),
        mime: "image/png",
        mode,
      };
    }
    // ==================================
  },
};

// =============================================================================
// OpenAI text LLM adapter
// =============================================================================
export const openaiTextLLM: TextLLM = {
  id: "openai",

  // =============================================================================
  // Function generates text from images -> TextGenWithImagesRequest to string
  // =============================================================================
  async generateTextWithImages(req: TextGenWithImagesRequest): Promise<string> {
    /*
        generateTextWithImages : sends images + text to OpenAI for analysis
        req variable : request containing images, system prompt, user prompt, and API key
    */
    // ==================================
    if (!req.apiKey) {
      throw new Error("OpenAI API key is required. Add one in Settings.");
    }
    // ==================================

    const client = new OpenAI({
      apiKey: req.apiKey,
      ...(req.baseUrl ? { baseURL: req.baseUrl } : {}),
    });

    // =====================================
    // Build image content blocks
    // =====================================
    const imageContent = req.images.map((img) => ({
      type: "image_url" as const,
      image_url: { url: `data:${img.mimeType};base64,${img.data.toString("base64")}` },
    }));

    // =====================================
    // Call OpenAI chat completions API
    // =====================================
    const response = await client.chat.completions.create({
      model: req.model,
      messages: [
        { role: "system", content: req.systemPrompt },
        { role: "user", content: [...imageContent, { type: "text" as const, text: req.userPrompt }] },
      ],
      temperature: 0.7,
    });

    const text = response.choices[0]?.message?.content;
    // ==================================
    if (!text) throw new Error("OpenAI returned no text content");
    // ==================================
    return text;
  },

  // =============================================================================
  // Function segments text into timed scenes -> SegmentRequest to Scene[]
  // =============================================================================
  async segment(req: SegmentRequest): Promise<Scene[]> {
    /*
        segment : splits input text into timed scenes using OpenAI
        req variable : segmentation request with text, characters, scene count
    */
    // ==================================
    if (!req.apiKey) {
      throw new Error("OpenAI API key is required");
    }
    // ==================================

    const client = new OpenAI({
      apiKey: req.apiKey,
      ...(req.baseUrl ? { baseURL: req.baseUrl } : {}),
    });

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
    // Call OpenAI chat completions API
    // =====================================
    const response = await client.chat.completions.create({
      model: req.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: req.text },
      ],
      temperature: 0.7,
    });

    const text = response.choices[0]?.message?.content;
    // ==================================
    if (!text) {
      throw new Error("OpenAI returned no text content");
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
