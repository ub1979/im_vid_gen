// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// projects/[slug]/keyframes/[i] route : serves a keyframe image by scene index.
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import { NextResponse } from "next/server";
import { readKeyframe } from "@/lib/storage";
// =============================================================================

// =============================================================================
// Types
// =============================================================================
type Params = { params: Promise<{ slug: string; i: string }> };

// =============================================================================
// Function handles GET to serve a keyframe image -> Request, Params to NextResponse
// =============================================================================
export async function GET(_request: Request, { params }: Params) {
  /*
      GET : reads and serves a scene keyframe image as PNG
      _request variable : incoming HTTP request (unused)
      params variable : route params containing project slug and scene index
  */
  try {
    const { slug, i } = await params;
    const sceneIndex = parseInt(i, 10);
    // ==================================
    if (isNaN(sceneIndex) || sceneIndex < 0) {
      return NextResponse.json({ error: "Invalid scene index" }, { status: 400 });
    }

    const buffer = await readKeyframe(slug, sceneIndex);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-cache, must-revalidate",
      },
    });
  } catch {
    return NextResponse.json({ error: "Keyframe not found" }, { status: 404 });
  }
}

// =============================================================================
// =============================================================================
