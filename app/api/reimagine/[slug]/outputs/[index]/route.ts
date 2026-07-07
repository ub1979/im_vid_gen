import { NextResponse } from "next/server";
import { readReimagineOutput } from "@/lib/storage";

type Params = { params: Promise<{ slug: string; index: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { slug, index: indexStr } = await params;
    const idx = parseInt(indexStr, 10);
    const buffer = await readReimagineOutput(slug, idx);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Output not found" }, { status: 404 });
  }
}
