// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// Claude : Anthropic Claude text LLM provider (no image generation).
//          Supports text-with-images analysis and scene segmentation.
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import Anthropic from "@anthropic-ai/sdk";
import type {
  TextLLM,
  TextGenWithImagesRequest,
  SegmentRequest,
  Scene,
} from "./types";
import { buildSegmentationPrompt, parseAndValidate } from "@/lib/segment";
// =============================================================================

// =============================================================================
// Claude text LLM adapter
// =============================================================================
export const claudeTextLLM: TextLLM = {
  id: "claude",

  // =============================================================================
  // Function generates text from images using Claude -> TextGenWithImagesRequest to string
  // =============================================================================
  async generateTextWithImages(req: TextGenWithImagesRequest): Promise<string> {
    /*
        generateTextWithImages : sends images + text prompt to Claude for analysis
        req variable : request containing images, system prompt, user prompt, and API key
    */
    // ==================================
    if (!req.apiKey) {
      throw new Error("Anthropic API key is required. Add one in Settings.");
    }
    // ==================================

    const client = new Anthropic({ apiKey: req.apiKey });

    // =====================================
    // Build image content blocks
    // =====================================
    const imageBlocks = req.images.map((img) => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: img.mimeType as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
        data: img.data.toString("base64"),
      },
    }));

    // =====================================
    // Call Claude messages API
    // =====================================
    const response = await client.messages.create({
      model: req.model,
      max_tokens: 8192,
      system: req.systemPrompt,
      messages: [
        { role: "user", content: [...imageBlocks, { type: "text" as const, text: req.userPrompt }] },
      ],
    });

    // =====================================
    // Extract text from response blocks
    // =====================================
    let text = "";
    for (const block of response.content) {
      // ==================================
      if (block.type === "text") text += block.text;
      // ==================================
    }
    // ==================================
    if (!text) throw new Error("Claude returned no text content");
    // ==================================
    return text;
  },

  // =============================================================================
  // Function segments text into timed scenes -> SegmentRequest to Scene[]
  // =============================================================================
  async segment(req: SegmentRequest): Promise<Scene[]> {
    /*
        segment : splits input text into timed scenes using Claude
        req variable : segmentation request with text, characters, scene count
    */
    // ==================================
    if (!req.apiKey) {
      throw new Error("Anthropic API key is required");
    }
    // ==================================

    const client = new Anthropic({ apiKey: req.apiKey });

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
    // Call Claude messages API
    // =====================================
    const response = await client.messages.create({
      model: req.model,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: req.text }],
    });

    // =====================================
    // Extract text from response content blocks
    // =====================================
    let text = "";
    for (const block of response.content) {
      // ==================================
      if (block.type === "text") {
        text += block.text;
      }
      // ==================================
    }

    // ==================================
    if (!text) {
      throw new Error("Claude returned no text content");
    }
    // ==================================

    return parseAndValidate(text, req.sceneCount);
  },
};

// =============================================================================
// =============================================================================
