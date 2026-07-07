import { NextResponse } from "next/server";
import { getReimagineProject, updateReimagineProject, deleteReimagineProject } from "@/lib/storage";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { slug } = await params;
    const manifest = await getReimagineProject(slug);
    return NextResponse.json(manifest);
  } catch {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const { slug } = await params;
    const body = await request.json();
    const updated = await updateReimagineProject(slug, body);
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { slug } = await params;
    await deleteReimagineProject(slug);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
