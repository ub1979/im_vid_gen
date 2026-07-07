import { NextResponse } from "next/server";
import { getProject, updateProject, saveKeyframe } from "@/lib/storage";
import { getImageProviderAdapter } from "@/lib/providers/registry";
import { generateKeyframe } from "@/lib/generate";

type Params = { params: Promise<{ slug: string; i: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { slug, i } = await params;
    const sceneIndex = parseInt(i, 10);
    const apiKey = request.headers.get("x-provider-key") || "";
    const baseUrl = request.headers.get("x-base-url") || undefined;

    const manifest = await getProject(slug);
    const scene = manifest.scenes[sceneIndex];
    if (!scene) {
      return NextResponse.json({ error: "Scene not found" }, { status: 404 });
    }

    // Allow prompt override, provider override, and aspect ratio from request body
    let body: { prompt?: string; provider?: { id: string; model: string }; aspectRatio?: string } = {};
    try { body = await request.json(); } catch { /* no body is fine */ }
    if (body.prompt) {
      scene.prompt = body.prompt;
    }
    const aspectRatio = body.aspectRatio;

    // Use provider from request body (current settings) if provided, else fall back to manifest
    const providerId = body.provider?.id || manifest.provider.image.id;
    const providerModel = body.provider?.model || manifest.provider.image.model;

    // Sync manifest provider if overridden
    if (body.provider) {
      manifest.provider = { ...manifest.provider, image: body.provider };
    }

    // Mark generating
    manifest.scenes[sceneIndex] = { ...scene, status: "generating", error: undefined };
    await updateProject(slug, { scenes: manifest.scenes });

    const provider = getImageProviderAdapter(providerId);

    try {
      const result = await generateKeyframe(
        provider,
        scene,
        manifest.characters,
        apiKey,
        baseUrl,
        providerModel,
        slug,
        aspectRatio,
      );

      const imagePath = await saveKeyframe(slug, sceneIndex, result.image);
      manifest.scenes[sceneIndex] = {
        ...scene,
        status: "done",
        imagePath,
        mode: result.mode,
        error: undefined,
      };
      await updateProject(slug, { scenes: manifest.scenes });

      return NextResponse.json(manifest.scenes[sceneIndex]);
    } catch (err) {
      manifest.scenes[sceneIndex] = {
        ...scene,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      };
      await updateProject(slug, { scenes: manifest.scenes });
      return NextResponse.json(manifest.scenes[sceneIndex]);
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
