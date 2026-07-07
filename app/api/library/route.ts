import { NextResponse } from "next/server";
import {
  listLibraryCharacters,
  addLibraryCharacter,
  saveLibraryCharacterImage,
} from "@/lib/storage";
import { validateMagicBytes, MAX_UPLOAD_BYTES } from "@/lib/security";

export async function GET() {
  try {
    const characters = await listLibraryCharacters();
    return NextResponse.json(characters);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const label = formData.get("label") as string | null;
    const description = (formData.get("description") as string) || "";
    const file = formData.get("file") as File | null;

    if (!label?.trim()) {
      return NextResponse.json({ error: "Label is required" }, { status: 400 });
    }

    const id = crypto.randomUUID();
    let imagePath: string | undefined;

    if (file) {
      const arrayBuf = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);

      if (buffer.byteLength > MAX_UPLOAD_BYTES) {
        return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 413 });
      }

      const mime = validateMagicBytes(buffer);
      if (!mime) {
        return NextResponse.json(
          { error: "Invalid image type. Accepted: PNG, JPEG, WebP" },
          { status: 415 },
        );
      }

      imagePath = await saveLibraryCharacterImage(id, buffer);
    }

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
