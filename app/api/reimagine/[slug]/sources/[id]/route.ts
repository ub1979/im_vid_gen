// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// SourceByIdRoute : API route for serving a source image by its UUID
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import { NextResponse } from "next/server";
import { readReimagineSource } from "@/lib/storage";
// =============================================================================

type Params = { params: Promise<{ slug: string; id: string }> };

// =============================================================================
// Function serves a source image by ID -> Request, Params to NextResponse
// =============================================================================
export async function GET(_request: Request, { params }: Params) {
  /*
      GET : reads the source image buffer for the given ID
            and returns it as a PNG response with caching headers
      _request variable : incoming HTTP request (unused)
      params variable : route params containing slug and source image ID
  */
  try {
    const { slug, id } = await params;
    const buffer = await readReimagineSource(slug, id);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }
}

// =============================================================================
// =============================================================================
