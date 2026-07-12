// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// enhance-prompt route : takes a rough text description and uses a text LLM
//                        to produce a detailed, vivid version suitable for
//                        AI image generation.
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import { NextResponse } from "next/server";
import { getTextLLMAdapter } from "@/lib/providers/registry";
// =============================================================================

// =============================================================================
// Function handles POST to enhance a text prompt via LLM -> Request to NextResponse
// =============================================================================
export async function POST(request: Request) {
  /*
      POST : enhances a rough description into a detailed image-gen prompt
      request variable : JSON body with prompt, context, textProvider
  */
  try {
    // =====================================
    // Extract headers and parse body
    // =====================================
    const apiKey = request.headers.get("x-provider-key") || "";
    const baseUrl = request.headers.get("x-base-url") || undefined;
    const body = await request.json();

    const { prompt, context, textProvider } = body as {
      prompt: string;
      context?: string;
      textProvider: { id: string; model: string };
    };

    // ==================================
    if (!prompt?.trim()) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }
    // ==================================
    if (!textProvider?.id || !textProvider?.model) {
      return NextResponse.json({ error: "textProvider is required" }, { status: 400 });
    }

    // =====================================
    // Call the text LLM
    // =====================================
    const textLLM = getTextLLMAdapter(textProvider.id);
    // ==================================
    if (!textLLM.generateText) {
      return NextResponse.json({ error: "Text provider does not support generation" }, { status: 400 });
    }

    const contextLine = context ? ` This is a ${context}.` : "";

    const enhanced = await textLLM.generateText({
      systemPrompt: `You are an expert at writing detailed visual descriptions for AI image generation.${contextLine} Take the user's rough description and expand it into a vivid, detailed prompt covering appearance, clothing, colors, lighting, pose, expression, and distinguishing features. Keep it concise but rich in visual detail. Output ONLY the enhanced description, no explanations.`,
      userPrompt: prompt,
      apiKey,
      baseUrl,
      model: textProvider.model,
    });

    return NextResponse.json({ enhanced });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// =============================================================================
// =============================================================================
