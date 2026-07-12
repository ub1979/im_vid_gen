// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// analyze-characters route : accepts an image upload and uses a text LLM with
//                            vision to identify all distinct characters in it,
//                            returning labels, descriptions, and base64 data.
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import { NextResponse } from "next/server";
import { getTextLLMAdapter } from "@/lib/providers/registry";
import { validateMagicBytes, MAX_UPLOAD_BYTES } from "@/lib/security";
// =============================================================================

// =============================================================================
// Function handles POST to analyze characters in an uploaded image -> Request to NextResponse
// =============================================================================
export async function POST(request: Request) {
  /*
      POST : analyzes an uploaded image for distinct characters using vision LLM
      request variable : incoming HTTP request with form data (file, textProviderId, textModel)
  */
  try {
    // =====================================
    // Extract headers and form data
    // =====================================
    const apiKey = request.headers.get("x-provider-key") || "";
    const baseUrl = request.headers.get("x-base-url") || undefined;
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const textProviderId = (formData.get("textProviderId") as string) || "gemini";
    const textModel = (formData.get("textModel") as string) || "gemini-2.5-flash";

    // ==================================
    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    // =====================================
    // Read and validate the file buffer
    // =====================================
    const arrayBuf = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    // ==================================
    if (buffer.byteLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 413 });
    }

    const mime = validateMagicBytes(buffer);
    // ==================================
    if (!mime) {
      return NextResponse.json(
        { error: "Invalid image type. Accepted: PNG, JPEG, WebP" },
        { status: 415 },
      );
    }

    // =====================================
    // Verify the text LLM supports images
    // =====================================
    const textLLM = getTextLLMAdapter(textProviderId);
    // ==================================
    if (!textLLM.generateTextWithImages) {
      return NextResponse.json(
        { error: "Text provider does not support image analysis" },
        { status: 400 },
      );
    }

    // =====================================
    // Call the vision LLM to identify characters
    // =====================================
    const raw = await textLLM.generateTextWithImages({
      systemPrompt: `You are a character identification expert. Analyze the image and identify all distinct characters/figures present.

For each character, provide:
- A short name/label (e.g. "Red Knight", "Girl with hat", "Blue Dragon")
- A detailed visual description covering: appearance, body type, clothing/outfit, colors, distinguishing features, accessories, pose, expression

Return ONLY valid JSON with this exact structure:
{
  "characters": [
    { "label": "Character Name", "description": "Detailed visual description..." }
  ]
}

If there is only one character, still return it in the array. If the image has no identifiable characters (e.g. landscape, object), return an empty characters array.`,
      userPrompt: "Identify all characters in this image.",
      images: [{ data: buffer, mimeType: mime }],
      apiKey,
      baseUrl,
      model: textModel,
    });

    // =====================================
    // Parse the LLM response and return
    // =====================================
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return NextResponse.json({
      characters: parsed.characters || [],
      imageBase64: buffer.toString("base64"),
      mime,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// =============================================================================
// =============================================================================
