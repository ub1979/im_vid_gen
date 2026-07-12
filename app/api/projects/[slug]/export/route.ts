// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// projects/[slug]/export route : exports a project as a ZIP archive containing
//                                keyframes, characters, and manifest data.
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import { NextResponse } from "next/server";
import { exportProject } from "@/lib/storage";
// =============================================================================

// =============================================================================
// Types
// =============================================================================
type Params = { params: Promise<{ slug: string }> };

// =============================================================================
// Function handles GET to export a project as ZIP -> Request, Params to NextResponse
// =============================================================================
export async function GET(_request: Request, { params }: Params) {
  /*
      GET : exports the project directory as a ZIP download
      _request variable : incoming HTTP request (unused)
      params variable : route params containing project slug
  */
  try {
    const { slug } = await params;
    const zipBuffer = await exportProject(slug);

    return new NextResponse(new Uint8Array(zipBuffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${slug}-export.zip"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
}

// =============================================================================
// =============================================================================
