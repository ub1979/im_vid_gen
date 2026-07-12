// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// Gemini : Google Gemini image generation and text LLM provider.
//          Supports reference-edit, text-to-image, segmentation,
//          plain text generation, and text-with-images analysis.
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import { GoogleGenAI, Modality, type Part } from "@google/genai";
import type { CharacterRef } from "@/lib/types";
import type {
  ImageProvider,
  ImageGenRequest,
  ImageGenResult,
  TextLLM,
  SegmentRequest,
  TextGenRequest,
  TextGenWithImagesRequest,
  Scene,
} from "./types";
import { buildSegmentationPrompt, parseAndValidate } from "@/lib/segment";
// =============================================================================

// =============================================================================
// Function parses Gemini error messages into user-friendly strings -> unknown to string
// =============================================================================
function parseGeminiError(err: unknown, modelHint?: string): string {
  /*
      parseGeminiError : converts raw Gemini errors into actionable messages
      err variable : the caught error object
      modelHint variable : optional model name for context in error messages
  */
  const msg = err instanceof Error ? err.message : String(err);
  console.error("[Gemini RAW error]", msg);

  // ==================================
  if (msg.includes("RESOURCE_EXHAUSTED") || msg.includes("429") || msg.includes("quota") || msg.includes("spending cap")) {
    const modelMatch = msg.match(/model:\s*([\w.-]+)/);
    const model = modelMatch ? modelMatch[1] : modelHint || "unknown";
    // ==================================
    if (msg.includes("spending cap") || msg.includes("monthly")) {
      return `Your Gemini project has exceeded its monthly spending cap. Go to https://ai.studio/spend to increase it.`;
    }
    // ==================================
    if (msg.includes("limit: 0")) {
      return `Model "${model}" is not available on your Gemini plan (free tier limit is 0). Try a different model like "gemini-2.0-flash" in Settings.`;
    }
    // ==================================
    const retryMatch = msg.match(/retry in ([\d.]+)s/i);
    const retryIn = retryMatch ? retryMatch[1] : "a few";
    return `Gemini rate limit hit for "${model}". Wait ${retryIn} seconds and try again, or switch to a different model in Settings.`;
  }
  // ==================================

  return msg;
}

// =============================================================================
// Gemini image provider adapter
// =============================================================================
export const geminiImageProvider: ImageProvider = {
  id: "gemini",

  capabilities: {
    supports_reference_edit: true,
    max_reference_images: 8,
    supports_text_to_image: true,
  },

  // =============================================================================
  // Function generates an image using Gemini -> ImageGenRequest to ImageGenResult
  // =============================================================================
  async generate(req: ImageGenRequest): Promise<ImageGenResult> {
    /*
        generate : creates an image via the Gemini API with optional reference images
        req variable : generation request with prompt, references, model, and API key
    */
    // ==================================
    if (!req.apiKey) {
      throw new Error("Gemini API key is required. Add one in Settings.");
    }
    // ==================================

    const ai = new GoogleGenAI({ apiKey: req.apiKey });

    const hasRefs = req.referenceImages && req.referenceImages.length > 0;
    const mode: ImageGenResult["mode"] = hasRefs
      ? "reference_edit"
      : "text_to_image";

    const parts: Part[] = [];

    // ==================================
    if (hasRefs) {
      // =====================================
      // Interleave each reference image with a label
      // =====================================
      for (let i = 0; i < req.referenceImages!.length; i++) {
        const charLabel = req.charactersUsed[i]?.label || `Character ${i + 1}`;
        parts.push({ text: `Reference image for character "${charLabel}":` });
        parts.push({
          inlineData: {
            mimeType: "image/png",
            data: Buffer.from(req.referenceImages![i]).toString("base64"),
          },
        });
      }
    }
    // ==================================

    parts.push({ text: req.prompt });

    // =====================================
    // Call Gemini generateContent API
    // =====================================
    let response;
    try {
      response = await ai.models.generateContent({
        model: req.model,
        contents: parts,
        config: {
          responseModalities: [Modality.IMAGE, Modality.TEXT],
          ...(req.aspectRatio ? { aspectRatio: req.aspectRatio } : {}),
        },
      });
    } catch (err) {
      throw new Error(parseGeminiError(err, req.model));
    }

    // =====================================
    // Extract image from response candidates
    // =====================================
    const candidates = response.candidates;
    // ==================================
    if (!candidates || candidates.length === 0) {
      throw new Error("Gemini returned no candidates");
    }
    // ==================================

    for (const candidate of candidates) {
      // ==================================
      if (!candidate.content?.parts) continue;
      // ==================================
      for (const part of candidate.content.parts) {
        // ==================================
        if (part.inlineData?.data) {
          return {
            image: Buffer.from(part.inlineData.data, "base64"),
            mime: part.inlineData.mimeType || "image/png",
            mode,
          };
        }
        // ==================================
      }
    }

    throw new Error("Gemini response did not contain an image");
  },
};

// =============================================================================
// Gemini text LLM adapter
// =============================================================================
export const geminiTextLLM: TextLLM = {
  id: "gemini",

  // =============================================================================
  // Function segments text into timed scenes -> SegmentRequest to Scene[]
  // =============================================================================
  async segment(req: SegmentRequest): Promise<Scene[]> {
    /*
        segment : splits input text into timed scenes using Gemini
        req variable : segmentation request with text, characters, scene count
    */
    // ==================================
    if (!req.apiKey) {
      throw new Error("Gemini API key is required. Add one in Settings.");
    }
    // ==================================

    const ai = new GoogleGenAI({ apiKey: req.apiKey });

    const systemPrompt = buildSegmentationPrompt(
      req.sceneCount,
      req.intervalSeconds,
      req.characters,
      req.imageProviderId,
    );

    let response;
    try {
      response = await ai.models.generateContent({
        model: req.model,
        contents: req.text,
        config: {
          systemInstruction: systemPrompt,
        },
      });
    } catch (err) {
      throw new Error(parseGeminiError(err, req.model));
    }

    const text = response.text;
    // ==================================
    if (!text) {
      throw new Error("Gemini returned no text content");
    }
    // ==================================

    return parseAndValidate(text, req.sceneCount);
  },

  // =============================================================================
  // Function generates plain text -> TextGenRequest to string
  // =============================================================================
  async generateText(req: TextGenRequest): Promise<string> {
    /*
        generateText : sends a text prompt to Gemini and returns the response
        req variable : request with system prompt, user prompt, model, and API key
    */
    // ==================================
    if (!req.apiKey) {
      throw new Error("Gemini API key is required. Add one in Settings.");
    }
    // ==================================

    const ai = new GoogleGenAI({ apiKey: req.apiKey });
    let response;
    try {
      response = await ai.models.generateContent({
        model: req.model,
        contents: req.userPrompt,
        config: { systemInstruction: req.systemPrompt },
      });
    } catch (err) {
      throw new Error(parseGeminiError(err, req.model));
    }

    return response.text || "";
  },

  // =============================================================================
  // Function generates text from images -> TextGenWithImagesRequest to string
  // =============================================================================
  async generateTextWithImages(req: TextGenWithImagesRequest): Promise<string> {
    /*
        generateTextWithImages : sends images + text to Gemini for analysis
        req variable : request containing images, system prompt, user prompt, and API key
    */
    // ==================================
    if (!req.apiKey) {
      throw new Error("Gemini API key is required. Add one in Settings.");
    }
    // ==================================

    const ai = new GoogleGenAI({ apiKey: req.apiKey });
    const parts: Part[] = [];

    // =====================================
    // Build image content parts
    // =====================================
    for (const img of req.images) {
      parts.push({
        inlineData: {
          mimeType: img.mimeType,
          data: img.data.toString("base64"),
        },
      });
    }
    parts.push({ text: req.userPrompt });

    let response;
    try {
      response = await ai.models.generateContent({
        model: req.model,
        contents: parts,
        config: { systemInstruction: req.systemPrompt },
      });
    } catch (err) {
      throw new Error(parseGeminiError(err, req.model));
    }

    return response.text || "";
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
