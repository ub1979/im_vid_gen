// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// projects/[slug] route : single project operations — GET, PUT (full update),
//                         PATCH (rename), DELETE.
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import { NextResponse } from "next/server";
import { getProject, updateProject, deleteProject, renameProject } from "@/lib/storage";
import { updateProjectSchema } from "@/lib/schema";
import { z } from "zod";
// =============================================================================

// =============================================================================
// Schema and types
// =============================================================================
const renameSchema = z.object({ name: z.string().min(1).max(200) });

type Params = { params: Promise<{ slug: string }> };

// =============================================================================
// Function handles GET to retrieve a single project -> Request, Params to NextResponse
// =============================================================================
export async function GET(_request: Request, { params }: Params) {
  /*
      GET : returns a project manifest by slug
      _request variable : incoming HTTP request (unused)
      params variable : route params containing project slug
  */
  try {
    const { slug } = await params;
    const manifest = await getProject(slug);
    return NextResponse.json(manifest);
  } catch {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
}

// =============================================================================
// Function handles PUT to fully update a project -> Request, Params to NextResponse
// =============================================================================
export async function PUT(request: Request, { params }: Params) {
  /*
      PUT : replaces project data with validated update body
      request variable : incoming HTTP request with JSON body
      params variable : route params containing project slug
  */
  try {
    const { slug } = await params;
    const body = await request.json();
    const parsed = updateProjectSchema.safeParse(body);
    // ==================================
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }
    const updated = await updateProject(slug, parsed.data);
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// =============================================================================
// Function handles PATCH to rename a project -> Request, Params to NextResponse
// =============================================================================
export async function PATCH(request: Request, { params }: Params) {
  /*
      PATCH : renames a project to a new name
      request variable : incoming HTTP request with JSON body (name)
      params variable : route params containing project slug
  */
  try {
    const { slug } = await params;
    const body = await request.json();
    const parsed = renameSchema.safeParse(body);
    // ==================================
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }
    const updated = await renameProject(slug, parsed.data.name);
    return NextResponse.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // ==================================
    if (msg.includes("already exists")) {
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// =============================================================================
// Function handles DELETE to remove a project -> Request, Params to NextResponse
// =============================================================================
export async function DELETE(_request: Request, { params }: Params) {
  /*
      DELETE : removes a project and its directory
      _request variable : incoming HTTP request (unused)
      params variable : route params containing project slug
  */
  try {
    const { slug } = await params;
    await deleteProject(slug);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// =============================================================================
// =============================================================================
