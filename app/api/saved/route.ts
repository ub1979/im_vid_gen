// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// SavedRoute : API route that lists all saved session folders
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import { NextResponse } from "next/server";
import { listSavedFolders } from "@/lib/storage";
// =============================================================================

// =============================================================================
// Function handles GET request to list saved folders -> void to NextResponse
// =============================================================================
export async function GET() {
  /*
      GET : returns a JSON list of all saved session folders
  */
  try {
    const folders = await listSavedFolders();
    return NextResponse.json(folders);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// =============================================================================
// =============================================================================
