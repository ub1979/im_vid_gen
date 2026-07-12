// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// SaveRoute : API route for saving reimagined outputs to a named folder
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import { NextResponse } from "next/server";
import { saveReimagineToFolder } from "@/lib/storage";
import { z } from "zod";
// =============================================================================

// =====================================
// Save request validation schema
// =====================================
const saveSchema = z.object({
  folderName: z.string().min(1).max(200),
});

type Params = { params: Promise<{ slug: string }> };

// =============================================================================
// Function saves reimagined outputs to a folder -> Request, Params to NextResponse
// =============================================================================
export async function POST(request: Request, { params }: Params) {
  /*
      POST : validates the folder name and saves all reimagined outputs
             from the project to the specified folder
      request variable : incoming HTTP request with folderName in body
      params variable : route params containing the project slug
  */
  try {
    const { slug } = await params;
    const body = await request.json();
    const parsed = saveSchema.safeParse(body);
    // ==================================
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }
    // ==================================

    const savedPath = await saveReimagineToFolder(slug, parsed.data.folderName);

    return NextResponse.json({ ok: true, savedPath });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// =============================================================================
// =============================================================================
