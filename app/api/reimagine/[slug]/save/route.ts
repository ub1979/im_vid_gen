import { NextResponse } from "next/server";
import { saveReimagineToFolder } from "@/lib/storage";
import { z } from "zod";

const saveSchema = z.object({
  folderName: z.string().min(1).max(200),
});

type Params = { params: Promise<{ slug: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { slug } = await params;
    const body = await request.json();
    const parsed = saveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    const savedPath = await saveReimagineToFolder(slug, parsed.data.folderName);

    return NextResponse.json({ ok: true, savedPath });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
