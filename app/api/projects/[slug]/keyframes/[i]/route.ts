import { NextResponse } from "next/server";
import { readKeyframe } from "@/lib/storage";

type Params = { params: Promise<{ slug: string; i: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { slug, i } = await params;
    const sceneIndex = parseInt(i, 10);
    if (isNaN(sceneIndex) || sceneIndex < 0) {
      return NextResponse.json({ error: "Invalid scene index" }, { status: 400 });
    }

    const buffer = await readKeyframe(slug, sceneIndex);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-cache, must-revalidate",
      },
    });
  } catch {
    return NextResponse.json({ error: "Keyframe not found" }, { status: 404 });
  }
}
