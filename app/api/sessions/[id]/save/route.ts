// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// SessionSave : API route that saves a session's images to a named folder
//               and optionally deletes the originals
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import { NextResponse } from "next/server";
import { saveSessionToFolder, deleteSessionImages } from "@/lib/storage";
import { z } from "zod";
// =============================================================================

// =====================================
// Request body validation schema
// =====================================
const saveSchema = z.object({
  folderName: z.string().min(1).max(200),
  deleteAfter: z.boolean().optional(),
});

// =====================================
// Route params type
// =====================================
type Params = { params: Promise<{ id: string }> };

// =============================================================================
// Function handles POST request to save session -> Request, Params to NextResponse
// =============================================================================
export async function POST(request: Request, { params }: Params) {
  /*
      POST : validates input, saves session images to folder, optionally deletes originals
      request variable : incoming HTTP request with folderName and deleteAfter in body
      params variable : route params containing the session id
  */
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = saveSchema.safeParse(body);
    // ==================================
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }
    // ==================================

    const savedPath = await saveSessionToFolder(id, parsed.data.folderName);

    // ==================================
    if (parsed.data.deleteAfter) {
      await deleteSessionImages(id);
    }
    // ==================================

    return NextResponse.json({ ok: true, savedPath });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// =============================================================================
// =============================================================================
