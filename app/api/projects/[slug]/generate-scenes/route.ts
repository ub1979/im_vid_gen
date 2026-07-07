import { NextResponse } from "next/server";
import { getProject, updateProject } from "@/lib/storage";
import { getTextLLMAdapter } from "@/lib/providers/registry";
import { parseAndValidate } from "@/lib/segment";
import type { SceneEntry } from "@/lib/types";

type Params = { params: Promise<{ slug: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { slug } = await params;
    const apiKey = request.headers.get("x-provider-key") || "";
    const baseUrl = request.headers.get("x-base-url") || undefined;
    const manifest = await getProject(slug);

    if (!manifest.text.trim()) {
      return NextResponse.json({ error: "No text to segment" }, { status: 400 });
    }

    const sceneCount = Math.ceil(manifest.durationSeconds / manifest.intervalSeconds);
    const textLLM = getTextLLMAdapter(manifest.provider.text.id);

    const characters = manifest.characters.map((c) => ({
      label: c.label,
      description: c.description,
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
      // Retry once with JSON-only nudge
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
