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

function parseGeminiError(err: unknown, modelHint?: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("[Gemini RAW error]", msg);

  if (msg.includes("RESOURCE_EXHAUSTED") || msg.includes("429") || msg.includes("quota") || msg.includes("spending cap")) {
    const modelMatch = msg.match(/model:\s*([\w.-]+)/);
    const model = modelMatch ? modelMatch[1] : modelHint || "unknown";
    if (msg.includes("spending cap") || msg.includes("monthly")) {
      return `Your Gemini project has exceeded its monthly spending cap. Go to https://ai.studio/spend to increase it.`;
    }
    if (msg.includes("limit: 0")) {
      return `Model "${model}" is not available on your Gemini plan (free tier limit is 0). Try a different model like "gemini-2.0-flash" in Settings.`;
    }
    const retryMatch = msg.match(/retry in ([\d.]+)s/i);
    const retryIn = retryMatch ? retryMatch[1] : "a few";
    return `Gemini rate limit hit for "${model}". Wait ${retryIn} seconds and try again, or switch to a different model in Settings.`;
  }

  return msg;
}

export const geminiImageProvider: ImageProvider = {
  id: "gemini",

  capabilities: {
    supports_reference_edit: true,
    max_reference_images: 8,
    supports_text_to_image: true,
  },

  async generate(req: ImageGenRequest): Promise<ImageGenResult> {
    if (!req.apiKey) {
      throw new Error("Gemini API key is required. Add one in Settings.");
    }

    const ai = new GoogleGenAI({ apiKey: req.apiKey });

    const hasRefs = req.referenceImages && req.referenceImages.length > 0;
    const mode: ImageGenResult["mode"] = hasRefs
      ? "reference_edit"
      : "text_to_image";

    const parts: Part[] = [];

    if (hasRefs) {
      // Interleave each reference image with a label so the model knows which character it is
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

    // The prompt from generate.ts already includes reference instructions when refs are present
    parts.push({ text: req.prompt });

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

    const candidates = response.candidates;
    if (!candidates || candidates.length === 0) {
      throw new Error("Gemini returned no candidates");
    }

    for (const candidate of candidates) {
      if (!candidate.content?.parts) continue;
      for (const part of candidate.content.parts) {
        if (part.inlineData?.data) {
          return {
            image: Buffer.from(part.inlineData.data, "base64"),
            mime: part.inlineData.mimeType || "image/png",
            mode,
          };
        }
      }
    }

    throw new Error("Gemini response did not contain an image");
  },
};

export const geminiTextLLM: TextLLM = {
  id: "gemini",

  async segment(req: SegmentRequest): Promise<Scene[]> {
    if (!req.apiKey) {
      throw new Error("Gemini API key is required. Add one in Settings.");
    }

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
    if (!text) {
      throw new Error("Gemini returned no text content");
    }

    return parseAndValidate(text, req.sceneCount);
  },

  async generateText(req: TextGenRequest): Promise<string> {
    if (!req.apiKey) {
      throw new Error("Gemini API key is required. Add one in Settings.");
    }

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

  async generateTextWithImages(req: TextGenWithImagesRequest): Promise<string> {
    if (!req.apiKey) {
      throw new Error("Gemini API key is required. Add one in Settings.");
    }

    const ai = new GoogleGenAI({ apiKey: req.apiKey });
    const parts: Part[] = [];

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
