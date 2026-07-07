import { NextResponse } from "next/server";
import { exportProject } from "@/lib/storage";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { slug } = await params;
    const zipBuffer = await exportProject(slug);

    return new NextResponse(new Uint8Array(zipBuffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${slug}-export.zip"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
}
