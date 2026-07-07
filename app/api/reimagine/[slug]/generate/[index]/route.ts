import { NextResponse } from "next/server";
import {
  getReimagineProject,
  updateReimagineProject,
  readReimagineSource,
  readReimagineCharRef,
  readReimagineStyleRef,
  saveReimagineOutput,
} from "@/lib/storage";
import { getImageProviderAdapter } from "@/lib/providers/registry";
import { generateReimagined, STYLE_PRESETS } from "@/lib/reimagine";

type Params = { params: Promise<{ slug: string; index: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { slug, index: indexStr } = await params;
    const idx = parseInt(indexStr, 10);
    const apiKey = request.headers.get("x-provider-key") || "";
    const baseUrl = request.headers.get("x-base-url") || "";
    const manifest = await getReimagineProject(slug);

    const entry = manifest.entries[idx];
    if (!entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    // Mark as generating
    manifest.entries[idx] = { ...entry, status: "generating", error: undefined };
    await updateReimagineProject(slug, { entries: manifest.entries });

    const provider = getImageProviderAdapter(manifest.provider.image.id);

    // Load source image
    const sourceImage = await readReimagineSource(slug, entry.sourceImageId);

    // Load character reference images — only for characters in this image
    const usedLabels = new Set(entry.characters_used.map((l) => l.toLowerCase()));
    const charRefs = await Promise.all(
      manifest.characters
        .filter((c) => c.referenceImagePath && usedLabels.has(c.label.toLowerCase()))
        .map(async (char) => {
          const image = await readReimagineCharRef(slug, char.id);
          return { char, image };
        }),
    );

    // Load style reference if applicable
    let styleRefImage: Buffer | null = null;
    if (manifest.styleMode === "reference" && manifest.styleRefImagePath) {
      try {
        styleRefImage = await readReimagineStyleRef(slug);
      } catch { /* no style ref */ }
    }

    // Get style description
    let styleDescription = manifest.styleDescription || "";
    if (!styleDescription && manifest.stylePreset) {
      const preset = STYLE_PRESETS[manifest.stylePreset];
      if (preset) styleDescription = preset.description;
    }

    let result;
    let lastErr: string | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        result = await generateReimagined(
          provider,
          entry,
          sourceImage,
          charRefs,
          styleRefImage,
          styleDescription,
          apiKey,
          manifest.provider.image.model,
          baseUrl || undefined,
        );
        break;
      } catch (retryErr) {
        lastErr = retryErr instanceof Error ? retryErr.message : String(retryErr);
        const isSpendingCap = lastErr.includes("spending cap") || lastErr.includes("monthly");
        const isRateLimit = !isSpendingCap && (lastErr.includes("429") || lastErr.includes("RESOURCE_EXHAUSTED") || lastErr.includes("rate"));
        if (isRateLimit && attempt < 2) {
          await new Promise((r) => setTimeout(r, (attempt + 1) * 5000));
          continue;
        }
        throw retryErr;
      }
    }
    if (!result) throw new Error(lastErr || "Generation failed after retries");

    const outputPath = await saveReimagineOutput(slug, idx, result.image);

    manifest.entries[idx] = {
      ...entry,
      status: "done",
      outputImagePath: outputPath,
      error: undefined,
    };
    await updateReimagineProject(slug, { entries: manifest.entries });

    return NextResponse.json(manifest.entries[idx]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    // Try to mark entry as failed
    try {
      const { slug, index: indexStr } = await params;
      const idx = parseInt(indexStr, 10);
      const manifest = await getReimagineProject(slug);
      if (manifest.entries[idx]) {
        manifest.entries[idx] = { ...manifest.entries[idx], status: "failed", error: msg };
        await updateReimagineProject(slug, { entries: manifest.entries });
      }
    } catch { /* best effort */ }

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
