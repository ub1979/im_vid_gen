// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// MergeRoute : API route for merging entries from one reimagine project
//              into another
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import { NextResponse } from "next/server";
import { mergeReimagineProjects } from "@/lib/storage";
import { z } from "zod";
// =============================================================================

// =====================================
// Merge request validation schema
// =====================================
const mergeSchema = z.object({
  sourceSlug: z.string().min(1).max(200),
});

type Params = { params: Promise<{ slug: string }> };

// =============================================================================
// Function merges entries from source project into target -> Request, Params to NextResponse
// =============================================================================
export async function POST(request: Request, { params }: Params) {
  /*
      POST : validates the source slug and merges its entries into the
             target project identified by the route slug
      request variable : incoming HTTP request with sourceSlug in body
      params variable : route params containing the target project slug
  */
  try {
    const { slug } = await params;
    const body = await request.json();
    const parsed = mergeSchema.safeParse(body);
    // ==================================
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }
    // ==================================

    const updated = await mergeReimagineProjects(slug, parsed.data.sourceSlug);
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// =============================================================================
// =============================================================================
