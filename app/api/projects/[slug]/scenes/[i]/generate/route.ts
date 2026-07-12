// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// projects/[slug]/scenes/[i]/generate route : generates a keyframe image for
//                                             a single scene using the configured
//                                             image provider. Supports prompt and
//                                             provider overrides from the request.
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import { NextResponse } from "next/server";
import { getProject, updateProject, saveKeyframe } from "@/lib/storage";
import { getImageProviderAdapter } from "@/lib/providers/registry";
import { generateKeyframe } from "@/lib/generate";
// =============================================================================

// =============================================================================
// Types
// =============================================================================
type Params = { params: Promise<{ slug: string; i: string }> };

// =============================================================================
// Function handles POST to generate a keyframe for one scene -> Request, Params to NextResponse
// =============================================================================
export async function POST(request: Request, { params }: Params) {
  /*
      POST : generates a keyframe image for the scene at index i
      request variable : incoming HTTP request with optional JSON body (prompt, provider, aspectRatio)
      params variable : route params containing project slug and scene index
  */
  try {
    // =====================================
    // Parse params and load project
    // =====================================
    const { slug, i } = await params;
    const sceneIndex = parseInt(i, 10);
    const apiKey = request.headers.get("x-provider-key") || "";
    const baseUrl = request.headers.get("x-base-url") || undefined;

    const manifest = await getProject(slug);
    const scene = manifest.scenes[sceneIndex];
    // ==================================
    if (!scene) {
      return NextResponse.json({ error: "Scene not found" }, { status: 404 });
    }

    // =====================================
    // Apply prompt and provider overrides from body
    // =====================================
    let body: { prompt?: string; provider?: { id: string; model: string }; aspectRatio?: string } = {};
    try { body = await request.json(); } catch { /* no body is fine */ }
    // ==================================
    if (body.prompt) {
      scene.prompt = body.prompt;
    }
    const aspectRatio = body.aspectRatio;

    const providerId = body.provider?.id || manifest.provider.image.id;
    const providerModel = body.provider?.model || manifest.provider.image.model;

    // ==================================
    if (body.provider) {
      manifest.provider = { ...manifest.provider, image: body.provider };
    }

    // =====================================
    // Mark scene as generating
    // =====================================
    manifest.scenes[sceneIndex] = { ...scene, status: "generating", error: undefined };
    await updateProject(slug, { scenes: manifest.scenes });

    const provider = getImageProviderAdapter(providerId);

    try {
      // =====================================
      // Generate and save the keyframe image
      // =====================================
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
        generation: {
          imageProvider: providerId,
          imageModel: providerModel,
          textProvider: manifest.provider.text.id,
          textModel: manifest.provider.text.model,
          generatedAt: new Date().toISOString(),
        },
      };
      await updateProject(slug, { scenes: manifest.scenes });

      return NextResponse.json(manifest.scenes[sceneIndex]);
    } catch (err) {
      // =====================================
      // Mark scene as failed with error message
      // =====================================
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

// =============================================================================
// =============================================================================
