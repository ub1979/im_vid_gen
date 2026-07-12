// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// OutputsRoute : API route for serving a reimagined output image by index
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import { NextResponse } from "next/server";
import { readReimagineOutput } from "@/lib/storage";
// =============================================================================

type Params = { params: Promise<{ slug: string; index: string }> };

// =============================================================================
// Function serves a reimagined output image -> Request, Params to NextResponse
// =============================================================================
export async function GET(_request: Request, { params }: Params) {
  /*
      GET : reads the output image buffer for the given entry index
            and returns it as a PNG response with caching headers
      _request variable : incoming HTTP request (unused)
      params variable : route params containing slug and output index
  */
  try {
    const { slug, index: indexStr } = await params;
    const idx = parseInt(indexStr, 10);
    const buffer = await readReimagineOutput(slug, idx);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Output not found" }, { status: 404 });
  }
}

// =============================================================================
// =============================================================================
