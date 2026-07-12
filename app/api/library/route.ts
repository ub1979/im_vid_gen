// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// library route : CRUD for the character library. GET lists all characters,
//                 POST creates a new character with optional image upload.
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import { NextResponse } from "next/server";
import {
  listLibraryCharacters,
  addLibraryCharacter,
  saveLibraryCharacterImage,
} from "@/lib/storage";
import { validateMagicBytes, MAX_UPLOAD_BYTES } from "@/lib/security";
// =============================================================================

// =============================================================================
// Function handles GET to list all library characters -> void to NextResponse
// =============================================================================
export async function GET() {
  /*
      GET : returns the full list of characters in the library
  */
  try {
    const characters = await listLibraryCharacters();
    return NextResponse.json(characters);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// =============================================================================
// Function handles POST to add a new character to the library -> Request to NextResponse
// =============================================================================
export async function POST(request: Request) {
  /*
      POST : creates a new character with label, description, and optional image
      request variable : incoming HTTP request with form data (label, description, file)
  */
  try {
    // =====================================
    // Parse form data
    // =====================================
    const formData = await request.formData();
    const label = formData.get("label") as string | null;
    const description = (formData.get("description") as string) || "";
    const file = formData.get("file") as File | null;

    // ==================================
    if (!label?.trim()) {
      return NextResponse.json({ error: "Label is required" }, { status: 400 });
    }

    const id = crypto.randomUUID();
    let imagePath: string | undefined;

    // ==================================
    if (file) {
      // =====================================
      // Validate and save uploaded image
      // =====================================
      const arrayBuf = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);

      // ==================================
      if (buffer.byteLength > MAX_UPLOAD_BYTES) {
        return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 413 });
      }

      const mime = validateMagicBytes(buffer);
      // ==================================
      if (!mime) {
        return NextResponse.json(
          { error: "Invalid image type. Accepted: PNG, JPEG, WebP" },
          { status: 415 },
        );
      }

      imagePath = await saveLibraryCharacterImage(id, buffer);
    }

    // =====================================
    // Save character record
    // =====================================
    const character = await addLibraryCharacter({
      id,
      label: label.trim(),
      description,
      imagePath,
    });

    return NextResponse.json(character, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// =============================================================================
// =============================================================================
