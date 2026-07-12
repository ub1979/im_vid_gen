// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// AnalyzeRoute : API route for analyzing source images in a reimagine project,
//                extracting scene descriptions, characters, and style info
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import { NextResponse } from "next/server";
import {
  getReimagineProject,
  updateReimagineProject,
  readReimagineSource,
  saveReimagineCharRef,
  readReimagineStyleRef,
} from "@/lib/storage";
import { getTextLLMAdapter } from "@/lib/providers/registry";
import { analyzeSourceImages, STYLE_PRESETS } from "@/lib/reimagine";
import type { ReimagineCharacter } from "@/lib/types";
// =============================================================================

type Params = { params: Promise<{ slug: string }> };

// =============================================================================
// Function analyzes source images for scene and character info -> Request, Params to NextResponse
// =============================================================================
export async function POST(request: Request, { params }: Params) {
  /*
      POST : loads all source images, runs LLM analysis for scene descriptions
             and character identification, analyzes style reference if present,
             then updates the project manifest with results
      request variable : incoming HTTP request with provider key in headers
      params variable : route params containing the project slug
  */
  try {
    const { slug } = await params;
    const apiKey = request.headers.get("x-provider-key") || "";
    const baseUrl = request.headers.get("x-base-url") || undefined;
    const manifest = await getReimagineProject(slug);

    // ==================================
    if (manifest.entries.length === 0) {
      return NextResponse.json({ error: "No source images uploaded" }, { status: 400 });
    }
    // ==================================

    const textLLM = getTextLLMAdapter(manifest.provider.text.id);

    // =====================================
    // Load all source images
    // =====================================
    const images = await Promise.all(
      manifest.entries.map(async (entry) => {
        const data = await readReimagineSource(slug, entry.sourceImageId);
        return { data, mimeType: "image/png" as const };
      }),
    );

    // =====================================
    // Analyze images for scene descriptions and character identification
    // =====================================
    const analysis = await analyzeSourceImages(
      images,
      textLLM,
      apiKey,
      manifest.provider.text.model,
      baseUrl,
    );

    // =====================================
    // If style reference image exists, analyze its style
    // =====================================
    let styleDescription = manifest.styleDescription || "";
    // ==================================
    if (manifest.styleMode === "reference" && manifest.styleRefImagePath) {
      try {
        const styleImg = await readReimagineStyleRef(slug);
        // ==================================
        if (textLLM.generateTextWithImages) {
          styleDescription = await textLLM.generateTextWithImages({
            systemPrompt:
              "Analyze this image's visual style. Describe the art style, rendering technique, color palette, lighting approach, texture, level of detail, and overall aesthetic. Be specific enough that another artist could replicate this style. Return only the style description text, no JSON.",
            userPrompt: "Describe the visual style of this image.",
            images: [{ data: styleImg, mimeType: "image/png" }],
            apiKey,
            baseUrl,
            model: manifest.provider.text.model,
          });
        }
        // ==================================
      } catch {
        // ====================== Style ref may not exist yet
      }
    } else if (manifest.styleMode === "preset" && manifest.stylePreset) {
      const preset = STYLE_PRESETS[manifest.stylePreset];
      if (preset) styleDescription = preset.description;
    }
    // ==================================

    // =====================================
    // Build characters from analysis
    // =====================================
    const characters: ReimagineCharacter[] = await Promise.all(
      analysis.characters.map(async (c) => {
        const id = crypto.randomUUID();
        // =====================================
        // Use the best source image as the character reference
        // =====================================
        const bestEntry = manifest.entries[c.best_source_index];
        let referenceImagePath: string | undefined;
        // ==================================
        if (bestEntry) {
          try {
            const srcImg = await readReimagineSource(slug, bestEntry.sourceImageId);
            referenceImagePath = await saveReimagineCharRef(slug, id, srcImg);
          } catch { /* skip */ }
        }
        // ==================================
        return {
          id,
          label: c.label,
          description: c.description,
          sourceImageIds: c.appears_in.map((i) => manifest.entries[i]?.sourceImageId).filter(Boolean) as string[],
          referenceImagePath,
        };
      }),
    );

    // =====================================
    // Update entries with scene descriptions
    // =====================================
    const updatedEntries = manifest.entries.map((entry, i) => {
      const analysisEntry = analysis.entries.find((e) => e.index === i);
      const prompt = analysisEntry?.description || entry.prompt;
      return {
        ...entry,
        prompt,
        reimaginedPrompt: prompt,
        characters_used: analysisEntry?.characters_detected || [],
      };
    });

    const updated = await updateReimagineProject(slug, {
      characters,
      entries: updatedEntries,
      styleDescription,
    });

    return NextResponse.json({
      characters: updated.characters,
      entries: updated.entries,
      styleDescription,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// =============================================================================
// =============================================================================
