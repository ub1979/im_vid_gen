// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// SourcesRoute : API route for uploading source images to a reimagine project
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import { NextResponse } from "next/server";
import { getReimagineProject, updateReimagineProject, saveReimagineSource } from "@/lib/storage";
import { validateMagicBytes, MAX_UPLOAD_BYTES } from "@/lib/security";
import type { ReimagineEntry } from "@/lib/types";
// =============================================================================

type Params = { params: Promise<{ slug: string }> };

// =============================================================================
// Function uploads source images to a reimagine project -> Request, Params to NextResponse
// =============================================================================
export async function POST(request: Request, { params }: Params) {
  /*
      POST : accepts multipart form data with image files, validates each
             file's size and type via magic bytes, saves them as source images,
             and appends new entries to the project manifest
      request variable : incoming HTTP request with files in form data
      params variable : route params containing the project slug
  */
  try {
    const { slug } = await params;
    const manifest = await getReimagineProject(slug);
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    // ==================================
    if (files.length === 0) {
      return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
    }
    // ==================================

    const newEntries: ReimagineEntry[] = [];

    for (const file of files) {
      const arrayBuf = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);

      // ==================================
      if (buffer.byteLength > MAX_UPLOAD_BYTES) {
        return NextResponse.json({ error: `File "${file.name}" too large (max 10MB)` }, { status: 413 });
      }
      // ==================================

      const mime = validateMagicBytes(buffer);
      // ==================================
      if (!mime) {
        return NextResponse.json(
          { error: `File "${file.name}" is not a valid image (PNG, JPEG, WebP)` },
          { status: 415 },
        );
      }
      // ==================================

      const id = crypto.randomUUID();
      await saveReimagineSource(slug, id, buffer);

      // =====================================
      // Build new entry for this source image
      // =====================================
      const index = manifest.entries.length + newEntries.length;
      newEntries.push({
        index,
        sourceImageId: id,
        prompt: "",
        reimaginedPrompt: "",
        characters_used: [],
        status: "pending",
        outputImagePath: null,
      });
    }

    const updated = await updateReimagineProject(slug, {
      entries: [...manifest.entries, ...newEntries],
    });

    return NextResponse.json(updated.entries, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// =============================================================================
// =============================================================================
