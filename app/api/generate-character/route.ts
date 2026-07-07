import { NextResponse } from "next/server";
import { getImageProviderAdapter, getTextLLMAdapter } from "@/lib/providers/registry";
import { saveLibraryCharacterImage, addLibraryCharacter } from "@/lib/storage";
import { z } from "zod";

const requestSchema = z.object({
  description: z.string().min(1).max(4000),
  label: z.string().min(1).max(200),
  imageProvider: z.object({ id: z.string(), model: z.string() }),
  textProvider: z.object({ id: z.string(), model: z.string() }),
  sourceImageBase64: z.string().optional(),
  sourceMime: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const apiKey = request.headers.get("x-provider-key") || "";
    const baseUrl = request.headers.get("x-base-url") || undefined;
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    const { description, label, imageProvider, textProvider, sourceImageBase64, sourceMime } = parsed.data;

    // Step 1: Enhance description using text LLM
    const textLLM = getTextLLMAdapter(textProvider.id);
    let enhancedPrompt: string;

    if (sourceImageBase64) {
      enhancedPrompt = `Using the attached reference image, generate a standalone character portrait of ONLY "${label}": ${description}. Show just this one character in a clean portrait composition, matching their exact visual design from the reference. High quality, detailed.`;
    } else {
      enhancedPrompt = `A detailed character portrait: ${description}. High quality, detailed, professional illustration style.`;
      if (textLLM.generateText) {
        try {
          enhancedPrompt = await textLLM.generateText({
            systemPrompt: `You are a character design expert. Create a detailed, vivid image generation prompt for the described character. Include appearance, clothing, pose, expression, art style, and background. Output ONLY the image prompt, no explanations.`,
            userPrompt: description,
            apiKey,
            baseUrl,
            model: textProvider.model,
          });
        } catch {
          // Fall back to basic prompt
        }
      }
    }

    // Step 2: Generate character image
    const imgProvider = getImageProviderAdapter(imageProvider.id);
    const referenceImages = sourceImageBase64
      ? [Buffer.from(sourceImageBase64, "base64")]
      : undefined;

    const result = await imgProvider.generate({
      prompt: enhancedPrompt,
      referenceImages,
      charactersUsed: referenceImages
        ? [{ id: "source", label, description }]
        : [],
      apiKey,
      baseUrl,
      model: imageProvider.model,
    });

    // Step 3: Save to library with generation metadata
    const id = crypto.randomUUID();
    const imagePath = await saveLibraryCharacterImage(id, result.image);
    const character = await addLibraryCharacter({
      id,
      label,
      description,
      imagePath,
      generation: {
        imageProvider: imageProvider.id,
        imageModel: imageProvider.model,
        textProvider: textProvider.id,
        textModel: textProvider.model,
        generatedAt: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      character,
      enhancedPrompt,
      imageBase64: result.image.toString("base64"),
      mime: result.mime,
      generation: {
        imageProvider: imageProvider.id,
        imageModel: imageProvider.model,
        textProvider: textProvider.id,
        textModel: textProvider.model,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
