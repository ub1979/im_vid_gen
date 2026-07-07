import { NextResponse } from "next/server";
import { getTextLLMAdapter } from "@/lib/providers/registry";
import { validateMagicBytes, MAX_UPLOAD_BYTES } from "@/lib/security";

export async function POST(request: Request) {
  try {
    const apiKey = request.headers.get("x-provider-key") || "";
    const baseUrl = request.headers.get("x-base-url") || undefined;
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const textProviderId = (formData.get("textProviderId") as string) || "gemini";
    const textModel = (formData.get("textModel") as string) || "gemini-2.5-flash";

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const arrayBuf = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    if (buffer.byteLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 413 });
    }

    const mime = validateMagicBytes(buffer);
    if (!mime) {
      return NextResponse.json(
        { error: "Invalid image type. Accepted: PNG, JPEG, WebP" },
        { status: 415 },
      );
    }

    const textLLM = getTextLLMAdapter(textProviderId);
    if (!textLLM.generateTextWithImages) {
      return NextResponse.json(
        { error: "Text provider does not support image analysis" },
        { status: 400 },
      );
    }

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
