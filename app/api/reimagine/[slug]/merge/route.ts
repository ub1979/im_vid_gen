import { NextResponse } from "next/server";
import { mergeReimagineProjects } from "@/lib/storage";
import { z } from "zod";

const mergeSchema = z.object({
  sourceSlug: z.string().min(1).max(200),
});

type Params = { params: Promise<{ slug: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { slug } = await params;
    const body = await request.json();
    const parsed = mergeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    const updated = await mergeReimagineProjects(slug, parsed.data.sourceSlug);
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
