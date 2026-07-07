import Anthropic from "@anthropic-ai/sdk";
import type {
  TextLLM,
  TextGenWithImagesRequest,
  SegmentRequest,
  Scene,
} from "./types";
import { buildSegmentationPrompt, parseAndValidate } from "@/lib/segment";

// ---- Text LLM only (Claude has no image generation) ----

export const claudeTextLLM: TextLLM = {
  id: "claude",

  async generateTextWithImages(req: TextGenWithImagesRequest): Promise<string> {
    if (!req.apiKey) {
      throw new Error("Anthropic API key is required. Add one in Settings.");
    }

    const client = new Anthropic({ apiKey: req.apiKey });

    const imageBlocks = req.images.map((img) => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: img.mimeType as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
        data: img.data.toString("base64"),
      },
    }));

    const response = await client.messages.create({
      model: req.model,
      max_tokens: 8192,
      system: req.systemPrompt,
      messages: [
        { role: "user", content: [...imageBlocks, { type: "text" as const, text: req.userPrompt }] },
      ],
    });

    let text = "";
    for (const block of response.content) {
      if (block.type === "text") text += block.text;
    }
    if (!text) throw new Error("Claude returned no text content");
    return text;
  },

  async segment(req: SegmentRequest): Promise<Scene[]> {
    if (!req.apiKey) {
      throw new Error("Anthropic API key is required");
    }

    const client = new Anthropic({ apiKey: req.apiKey });

    const systemPrompt = buildSegmentationPrompt(
      req.sceneCount,
      req.intervalSeconds,
      req.characters,
      req.imageProviderId,
    );

    const response = await client.messages.create({
      model: req.model,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: req.text }],
    });

    // Extract text from response content blocks
    let text = "";
    for (const block of response.content) {
      if (block.type === "text") {
        text += block.text;
      }
    }

    if (!text) {
      throw new Error("Claude returned no text content");
    }

    return parseAndValidate(text, req.sceneCount);
  },
};
