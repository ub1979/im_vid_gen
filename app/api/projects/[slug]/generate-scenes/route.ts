import { NextResponse } from "next/server";
import { getProject, updateProject, readCharacterImage } from "@/lib/storage";
import { getTextLLMAdapter } from "@/lib/providers/registry";
import { parseAndValidate } from "@/lib/segment";
import type { SceneEntry } from "@/lib/types";

type Params = { params: Promise<{ slug: string }> };

const VISION_PROMPT = `Describe this character's visual appearance in precise detail for an image generation model. Include:
- Species/type (human, animal, creature)
- Body shape, proportions, size
- Colors: skin/fur/feathers, hair, eyes
- Clothing, accessories, distinguishing features
- Art style (3D Pixar, 2D cartoon, realistic, etc.)

Write ONE dense paragraph, no JSON. Be specific about colors (e.g. "warm brown fur" not just "brown"). This description will be used to recreate this exact character in new scenes.`;

const VISION_MODELS: Record<string, string[]> = {
  ollama: ["kimi-k2.6:cloud", "llava:latest", "llava:13b"],
  gemini: ["gemini-2.5-flash"],
  openai: ["gpt-4o-mini"],
  claude: ["claude-sonnet-4-20250514"],
};

async function analyzeCharacterImages(
  slug: string,
  manifest: Awaited<ReturnType<typeof getProject>>,
  apiKey: string,
  baseUrl: string | undefined,
): Promise<boolean> {
  const providerId = manifest.provider.text.id;
  const textLLM = getTextLLMAdapter(providerId);
  if (!textLLM.generateTextWithImages) return false;

  // Try project's text model first, then fall back to known vision models
  const candidates = [manifest.provider.text.model];
  for (const m of VISION_MODELS[providerId] || []) {
    if (!candidates.includes(m)) candidates.push(m);
  }

  let changed = false;
  for (const char of manifest.characters) {
    if (char.visualDescription || !char.imagePath) continue;

    const imgBuffer = await readCharacterImage(slug, char.id);
    for (const model of candidates) {
      try {
        const desc = await textLLM.generateTextWithImages({
          systemPrompt: VISION_PROMPT,
          userPrompt: `Describe this character named "${char.label}".${char.description ? ` Context: ${char.description}` : ""}`,
          images: [{ data: imgBuffer, mimeType: "image/png" }],
          apiKey,
          baseUrl,
          model,
        });
        char.visualDescription = desc.replace(/```/g, "").trim();
        changed = true;
        break;
      } catch {
        // This model doesn't support vision or failed — try next
      }
    }
  }

  if (changed) {
    await updateProject(slug, { characters: manifest.characters });
  }
  return changed;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { slug } = await params;
    const apiKey = request.headers.get("x-provider-key") || "";
    const baseUrl = request.headers.get("x-base-url") || undefined;
    const manifest = await getProject(slug);

    if (!manifest.text.trim()) {
      return NextResponse.json({ error: "No text to segment" }, { status: 400 });
    }

    // Auto-analyze character images to get detailed visual descriptions
    await analyzeCharacterImages(slug, manifest, apiKey, baseUrl);

    const sceneCount = Math.ceil(manifest.durationSeconds / manifest.intervalSeconds);
    const textLLM = getTextLLMAdapter(manifest.provider.text.id);

    // Use visualDescription (from vision analysis) over user description
    const characters = manifest.characters.map((c) => ({
      label: c.label,
      description: c.visualDescription || c.description,
      hasImage: !!c.imagePath,
    }));

    let scenes;
    try {
      scenes = await textLLM.segment({
        text: manifest.text,
        characters,
        sceneCount,
        intervalSeconds: manifest.intervalSeconds,
        apiKey,
        baseUrl,
        model: manifest.provider.text.model,
        imageProviderId: manifest.provider.image.id,
      });
    } catch {
      scenes = await textLLM.segment({
        text: manifest.text + "\n\nIMPORTANT: Return ONLY valid JSON array, no markdown or commentary.",
        characters,
        sceneCount,
        intervalSeconds: manifest.intervalSeconds,
        apiKey,
        baseUrl,
        model: manifest.provider.text.model,
        imageProviderId: manifest.provider.image.id,
      });
    }

    const validated = parseAndValidate(JSON.stringify(scenes), sceneCount);

    const sceneEntries: SceneEntry[] = validated.map((s) => ({
      ...s,
      status: "pending" as const,
      imagePath: null,
    }));

    await updateProject(slug, { scenes: sceneEntries });
    return NextResponse.json(sceneEntries);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("validation failed") || msg.includes("Expected")) {
      return NextResponse.json({ error: msg }, { status: 422 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
