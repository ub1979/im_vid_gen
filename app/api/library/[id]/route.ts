// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// library/[id] route : single character operations — GET one character,
//                      PATCH to update label/description, DELETE to remove.
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import { NextResponse } from "next/server";
import { getLibraryCharacter, removeLibraryCharacter, updateLibraryCharacter } from "@/lib/storage";
// =============================================================================

// =============================================================================
// Types
// =============================================================================
type Params = { params: Promise<{ id: string }> };

// =============================================================================
// Function handles GET to retrieve a single character -> Request, Params to NextResponse
// =============================================================================
export async function GET(_request: Request, { params }: Params) {
  /*
      GET : returns a single character by ID
      _request variable : incoming HTTP request (unused)
      params variable : route params containing character id
  */
  const { id } = await params;
  const char = await getLibraryCharacter(id);
  // ==================================
  if (!char) {
    return NextResponse.json({ error: "Character not found" }, { status: 404 });
  }
  return NextResponse.json(char);
}

// =============================================================================
// Function handles PATCH to update a character's label/description -> Request, Params to NextResponse
// =============================================================================
export async function PATCH(request: Request, { params }: Params) {
  /*
      PATCH : updates a character's label and/or description
      request variable : incoming HTTP request with form data
      params variable : route params containing character id
  */
  const { id } = await params;
  const fd = await request.formData();
  const label = fd.get("label") as string | null;
  const description = fd.get("description") as string | null;
  const updated = await updateLibraryCharacter(id, {
    ...(label !== null ? { label } : {}),
    ...(description !== null ? { description } : {}),
  });
  // ==================================
  if (!updated) {
    return NextResponse.json({ error: "Character not found" }, { status: 404 });
  }
  return NextResponse.json(updated);
}

// =============================================================================
// Function handles DELETE to remove a character -> Request, Params to NextResponse
// =============================================================================
export async function DELETE(_request: Request, { params }: Params) {
  /*
      DELETE : removes a character from the library
      _request variable : incoming HTTP request (unused)
      params variable : route params containing character id
  */
  const { id } = await params;
  await removeLibraryCharacter(id);
  return NextResponse.json({ ok: true });
}

// =============================================================================
// =============================================================================
