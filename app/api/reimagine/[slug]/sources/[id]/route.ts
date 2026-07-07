import { NextResponse } from "next/server";
import { readReimagineSource } from "@/lib/storage";

type Params = { params: Promise<{ slug: string; id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { slug, id } = await params;
    const buffer = await readReimagineSource(slug, id);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }
}
