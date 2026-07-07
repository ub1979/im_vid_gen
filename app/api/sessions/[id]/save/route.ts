import { NextResponse } from "next/server";
import { saveSessionToFolder, deleteSessionImages } from "@/lib/storage";
import { z } from "zod";

const saveSchema = z.object({
  folderName: z.string().min(1).max(200),
  deleteAfter: z.boolean().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = saveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    const savedPath = await saveSessionToFolder(id, parsed.data.folderName);

    if (parsed.data.deleteAfter) {
      await deleteSessionImages(id);
    }

    return NextResponse.json({ ok: true, savedPath });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
