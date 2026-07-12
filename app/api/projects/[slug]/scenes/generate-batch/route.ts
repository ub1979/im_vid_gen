// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// projects/[slug]/scenes/generate-batch route : generates keyframe images for
//                                               multiple scenes sequentially.
//                                               Updates each scene status as it
//                                               progresses (generating -> done/failed).
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
import { z } from "zod";
// =============================================================================

// =============================================================================
// Schema and types
// =============================================================================
const batchSchema = z.object({
  sceneIndices: z.array(z.number().int().min(0)),
  aspectRatio: z.string().max(10).optional(),
  provider: z.object({ id: z.string(), model: z.string() }).optional(),
});

type Params = { params: Promise<{ slug: string }> };

// =============================================================================
// Function handles POST to batch-generate keyframes for multiple scenes -> Request, Params to NextResponse
// =============================================================================
export async function POST(request: Request, { params }: Params) {
  /*
      POST : generates keyframe images for a batch of scene indices sequentially
      request variable : incoming HTTP request with JSON body (sceneIndices, aspectRatio, provider)
      params variable : route params containing project slug
  */
  try {
    // =====================================
    // Parse params and validate body
    // =====================================
    const { slug } = await params;
    const apiKey = request.headers.get("x-provider-key") || "";
    const baseUrl = request.headers.get("x-base-url") || undefined;
    const body = await request.json();

    const parsed = batchSchema.safeParse(body);
    // ==================================
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    const manifest = await getProject(slug);

    // =====================================
    // Resolve provider from request or manifest
    // =====================================
    const providerId = parsed.data.provider?.id || manifest.provider.image.id;
    const providerModel = parsed.data.provider?.model || manifest.provider.image.model;
    const provider = getImageProviderAdapter(providerId);

    // ==================================
    if (parsed.data.provider) {
      manifest.provider = { ...manifest.provider, image: parsed.data.provider };
      await updateProject(slug, { provider: manifest.provider });
    }

    // =====================================
    // Generate keyframes for each scene index
    // =====================================
    for (const idx of parsed.data.sceneIndices) {
      const scene = manifest.scenes[idx];
      // ==================================
      if (!scene) continue;

      // =====================================
      // Mark as generating
      // =====================================
      manifest.scenes[idx] = { ...scene, status: "generating", error: undefined };
      await updateProject(slug, { scenes: manifest.scenes });

      try {
        const result = await generateKeyframe(
          provider,
          scene,
          manifest.characters,
          apiKey,
          baseUrl,
          providerModel,
          slug,
          parsed.data.aspectRatio,
        );

        const imagePath = await saveKeyframe(slug, idx, result.image);
        manifest.scenes[idx] = {
          ...scene,
          status: "done",
          imagePath,
          mode: result.mode,
          error: undefined,
        };
      } catch (err) {
        manifest.scenes[idx] = {
          ...scene,
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
        };
      }

      await updateProject(slug, { scenes: manifest.scenes });
    }

    return NextResponse.json(manifest.scenes);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// =============================================================================
// =============================================================================
