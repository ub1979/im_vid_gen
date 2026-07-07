import { NextResponse } from "next/server";
import { createReimagineProject, listReimagineProjects } from "@/lib/storage";
import { reimagineCreateSchema } from "@/lib/schema";

export async function GET() {
  try {
    const projects = await listReimagineProjects();
    return NextResponse.json(projects);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = reimagineCreateSchema.parse(body);
    const manifest = await createReimagineProject(parsed.name, parsed.provider);
    return NextResponse.json(manifest, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("already exists")) {
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
