import { NextResponse } from "next/server";
import { updateReimagineProject, saveReimagineStyleRef, readReimagineStyleRef } from "@/lib/storage";
import { validateMagicBytes, MAX_UPLOAD_BYTES } from "@/lib/security";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { slug } = await params;
    const buffer = await readReimagineStyleRef(slug);
    return new NextResponse(new Uint8Array(buffer), {
      headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600" },
    });
  } catch {
    return NextResponse.json({ error: "Style reference not found" }, { status: 404 });
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { slug } = await params;
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

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

    const stylePath = await saveReimagineStyleRef(slug, buffer);
    await updateReimagineProject(slug, {
      styleMode: "reference",
      styleRefImagePath: stylePath,
    });

    return NextResponse.json({ path: stylePath }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
