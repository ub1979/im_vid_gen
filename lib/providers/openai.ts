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

const OPENAI_SIZE_MAP: Record<string, string> = {
  "1:1": "1024x1024",
  "16:9": "1792x1024",
  "9:16": "1024x1792",
  "4:3": "1792x1024",
  "3:4": "1024x1792",
};

function openaiSize(aspectRatio?: string): string {
  return (aspectRatio && OPENAI_SIZE_MAP[aspectRatio]) || "1024x1024";
}

// ---- Image Provider ----

export const openaiImageProvider: ImageProvider = {
  id: "openai",

  capabilities: {
    supports_reference_edit: true,
    max_reference_images: 4,
    supports_text_to_image: true,
  },

  async generate(req: ImageGenRequest): Promise<ImageGenResult> {
    if (!req.apiKey) {
      throw new Error("OpenAI API key is required");
    }

    const client = new OpenAI({
      apiKey: req.apiKey,
      ...(req.baseUrl ? { baseURL: req.baseUrl } : {}),
    });

    const hasRefs = req.referenceImages && req.referenceImages.length > 0;
    const mode: ImageGenResult["mode"] = hasRefs
      ? "reference_edit"
      : "text_to_image";

    let promptText = req.prompt;
    if (!hasRefs && req.charactersUsed.length > 0) {
      promptText = augmentPromptWithDescriptions(
        req.prompt,
        req.charactersUsed,
      );
    }

    if (hasRefs) {
      // gpt-image-1 edit mode: pass reference images
      // The images.edit endpoint accepts image files
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
      if (!imageData) {
        throw new Error("OpenAI returned no image data");
      }

      if (imageData.b64_json) {
        return {
          image: Buffer.from(imageData.b64_json, "base64"),
          mime: "image/png",
          mode,
        };
      } else if (imageData.url) {
        const fetchResp = await fetch(imageData.url);
        const arrayBuf = await fetchResp.arrayBuffer();
        return {
          image: Buffer.from(arrayBuf),
          mime: "image/png",
          mode,
        };
      }

      throw new Error("OpenAI edit response missing image data");
    } else {
      // Text-to-image: images.generate
      const response = await client.images.generate({
        model: req.model,
        prompt: promptText,
        n: 1,
        size: openaiSize(req.aspectRatio) as "1024x1024" | "1792x1024" | "1024x1792",
        response_format: "b64_json",
      });

      const imageData = response.data?.[0];
      if (!imageData?.b64_json) {
        throw new Error("OpenAI returned no image data");
      }

      return {
        image: Buffer.from(imageData.b64_json, "base64"),
        mime: "image/png",
        mode,
      };
    }
  },
};

// ---- Text LLM ----

export const openaiTextLLM: TextLLM = {
  id: "openai",

  async generateTextWithImages(req: TextGenWithImagesRequest): Promise<string> {
    if (!req.apiKey) {
      throw new Error("OpenAI API key is required. Add one in Settings.");
    }

    const client = new OpenAI({
      apiKey: req.apiKey,
      ...(req.baseUrl ? { baseURL: req.baseUrl } : {}),
    });

    const imageContent = req.images.map((img) => ({
      type: "image_url" as const,
      image_url: { url: `data:${img.mimeType};base64,${img.data.toString("base64")}` },
    }));

    const response = await client.chat.completions.create({
      model: req.model,
      messages: [
        { role: "system", content: req.systemPrompt },
        { role: "user", content: [...imageContent, { type: "text" as const, text: req.userPrompt }] },
      ],
      temperature: 0.7,
    });

    const text = response.choices[0]?.message?.content;
    if (!text) throw new Error("OpenAI returned no text content");
    return text;
  },

  async segment(req: SegmentRequest): Promise<Scene[]> {
    if (!req.apiKey) {
      throw new Error("OpenAI API key is required");
    }

    const client = new OpenAI({
      apiKey: req.apiKey,
      ...(req.baseUrl ? { baseURL: req.baseUrl } : {}),
    });

    const systemPrompt = buildSegmentationPrompt(
      req.sceneCount,
      req.intervalSeconds,
      req.characters,
      req.imageProviderId,
    );

    const response = await client.chat.completions.create({
      model: req.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: req.text },
      ],
      temperature: 0.7,
    });

    const text = response.choices[0]?.message?.content;
    if (!text) {
      throw new Error("OpenAI returned no text content");
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
