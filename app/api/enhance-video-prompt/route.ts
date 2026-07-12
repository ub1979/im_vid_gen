// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// enhance-video-prompt route : takes a user's video prompt and uses a text LLM
//                              to produce a detailed, vivid prompt optimized for
//                              AI video generation with camera consistency.
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
// Function handles POST to enhance a video prompt via LLM -> Request to NextResponse
// =============================================================================
export async function POST(request: Request) {
  /*
      POST : enhances a user video prompt with detailed motion/camera/lighting descriptions
      request variable : incoming HTTP request with JSON body (prompt, textProviderId, textModel, frameMode, characters)
  */
  try {
    // =====================================
    // Extract headers and parse body
    // =====================================
    const textApiKey = request.headers.get("x-text-provider-key") || "";
    const textBaseUrl = request.headers.get("x-text-base-url") || undefined;
    const body = await request.json();

    const { prompt, textProviderId, textModel, frameMode, characters } = body as {
      prompt: string;
      textProviderId: string;
      textModel: string;
      frameMode: "first" | "last" | "both";
      characters?: { label: string; description: string }[];
    };

    // ==================================
    if (!prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }
    // ==================================
    if (!textProviderId || !textModel) {
      return NextResponse.json({ error: "text provider and model are required" }, { status: 400 });
    }

    // =====================================
    // Validate text provider supports generation
    // =====================================
    const textLLM = getTextLLMAdapter(textProviderId);
    // ==================================
    if (!textLLM.generateText) {
      return NextResponse.json({ error: "Text provider does not support generation" }, { status: 400 });
    }

    // =====================================
    // Build character context and frame description
    // =====================================
    const charContext = characters && characters.length > 0
      ? `\n\nCharacters referenced in this scene:\n${characters.map(c => `- "${c.label}": ${c.description || "no description"}`).join("\n")}\nIncorporate these characters' visual details into the prompt.`
      : "";

    // ==================================
    // Determine frame description based on mode
    // ==================================
    const frameDesc = frameMode === "both"
      ? "The video will interpolate between a first frame image and a last frame image. CRITICAL: maintain the same camera angle and viewpoint as the reference images throughout — if the reference is a front shot, the video must stay front-facing. Camera movements like slow zoom or gentle pan are fine, but never change the fundamental viewing angle (e.g. front to side, or eye-level to bird's-eye)."
      : frameMode === "first"
        ? "The video will animate starting from a given first frame image. CRITICAL: maintain the same camera angle and viewpoint as the reference image — if the reference is a front shot, keep it front-facing throughout. Camera movements like slow zoom or gentle pan are fine, but never change the fundamental viewing angle."
        : "The video will animate ending at a given last frame image. CRITICAL: the camera angle must match the end frame's viewpoint. Camera movements are fine but the viewing angle must stay consistent with the reference.";

    // =====================================
    // Call the text LLM to enhance the prompt
    // =====================================
    const enhanced = await textLLM.generateText({
      systemPrompt: `You are a video generation prompt expert. Given a user's description of a video scene, produce a detailed, vivid prompt optimized for AI video generation. Describe the motion, camera movement, lighting, atmosphere, and visual details. ${frameDesc} Focus on describing the MOTION and TRANSITION that should happen. IMPORTANT: never describe a camera angle change that contradicts the reference image's perspective — if the reference shows a front view, do not write "side angle" or "low angle shot". You may add subtle camera movements (slow zoom, gentle tracking) but the base viewing angle must stay the same as the reference frame.${charContext} Output ONLY the video prompt, no explanations or preamble.`,
      userPrompt: prompt,
      apiKey: textApiKey,
      baseUrl: textBaseUrl,
      model: textModel,
    });

    return NextResponse.json({ enhanced });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// =============================================================================
// =============================================================================
