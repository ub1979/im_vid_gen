import { NextResponse } from "next/server";
import { getLibraryCharacter, removeLibraryCharacter, updateLibraryCharacter } from "@/lib/storage";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const char = await getLibraryCharacter(id);
  if (!char) {
    return NextResponse.json({ error: "Character not found" }, { status: 404 });
  }
  return NextResponse.json(char);
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const fd = await request.formData();
  const label = fd.get("label") as string | null;
  const description = fd.get("description") as string | null;
  const updated = await updateLibraryCharacter(id, {
    ...(label !== null ? { label } : {}),
    ...(description !== null ? { description } : {}),
  });
  if (!updated) {
    return NextResponse.json({ error: "Character not found" }, { status: 404 });
  }
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  await removeLibraryCharacter(id);
  return NextResponse.json({ ok: true });
}
