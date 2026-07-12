// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// projects/[slug]/characters route : POST to add a character with optional
//                                    image upload to a specific project.
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import { NextResponse } from "next/server";
import { getProject, updateProject, saveCharacterImage } from "@/lib/storage";
import { validateMagicBytes, MAX_UPLOAD_BYTES } from "@/lib/security";
import type { CharacterRef } from "@/lib/types";
// =============================================================================

// =============================================================================
// Types
// =============================================================================
type Params = { params: Promise<{ slug: string }> };

// =============================================================================
// Function handles POST to add a character to a project -> Request, Params to NextResponse
// =============================================================================
export async function POST(request: Request, { params }: Params) {
  /*
      POST : uploads a character image and adds it to the project's character list
      request variable : incoming HTTP request with form data (file, label, description)
      params variable : route params containing project slug
  */
  try {
    // =====================================
    // Parse form data
    // =====================================
    const { slug } = await params;
    const formData = await request.formData();

    const file = formData.get("file") as File | null;
    const label = formData.get("label") as string | null;
    const description = (formData.get("description") as string) || undefined;

    // ==================================
    if (!label || !label.trim()) {
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
        return NextResponse.json({ error: "Invalid image type. Accepted: PNG, JPEG, WebP" }, { status: 415 });
      }

      imagePath = await saveCharacterImage(slug, id, buffer);
    }

    // =====================================
    // Create character record and update project
    // =====================================
    const character: CharacterRef = { id, label: label.trim(), description, imagePath };

    const manifest = await getProject(slug);
    manifest.characters.push(character);
    await updateProject(slug, { characters: manifest.characters });

    return NextResponse.json(character, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// =============================================================================
// =============================================================================
