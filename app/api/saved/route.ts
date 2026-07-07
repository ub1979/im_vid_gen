import { NextResponse } from "next/server";
import { listSavedFolders } from "@/lib/storage";

export async function GET() {
  try {
    const folders = await listSavedFolders();
    return NextResponse.json(folders);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
