// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// library/[id]/image route : serves the character's image file as PNG binary.
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import { NextResponse } from "next/server";
import { readLibraryCharacterImage } from "@/lib/storage";
// =============================================================================

// =============================================================================
// Types
// =============================================================================
type Params = { params: Promise<{ id: string }> };

// =============================================================================
// Function handles GET to serve a character image -> Request, Params to NextResponse
// =============================================================================
export async function GET(_request: Request, { params }: Params) {
  /*
      GET : reads and serves the character's image as PNG
      _request variable : incoming HTTP request (unused)
      params variable : route params containing character id
  */
  try {
    const { id } = await params;
    const buffer = await readLibraryCharacterImage(id);
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
