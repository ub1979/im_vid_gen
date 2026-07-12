// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// SlugRoute : API route for getting, updating, and deleting a single
//             reimagine project by slug
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import { NextResponse } from "next/server";
import { getReimagineProject, updateReimagineProject, deleteReimagineProject } from "@/lib/storage";
// =============================================================================

type Params = { params: Promise<{ slug: string }> };

// =============================================================================
// Function gets a reimagine project by slug -> Request, Params to NextResponse
// =============================================================================
export async function GET(_request: Request, { params }: Params) {
  /*
      GET : retrieves a single reimagine project manifest by slug
      _request variable : incoming HTTP request (unused)
      params variable : route params containing the project slug
  */
  try {
    const { slug } = await params;
    const manifest = await getReimagineProject(slug);
    return NextResponse.json(manifest);
  } catch {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
}

// =============================================================================
// Function updates a reimagine project -> Request, Params to NextResponse
// =============================================================================
export async function PUT(request: Request, { params }: Params) {
  /*
      PUT : updates a reimagine project manifest with the provided body
      request variable : incoming HTTP request with update fields in body
      params variable : route params containing the project slug
  */
  try {
    const { slug } = await params;
    const body = await request.json();
    const updated = await updateReimagineProject(slug, body);
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// =============================================================================
// Function deletes a reimagine project -> Request, Params to NextResponse
// =============================================================================
export async function DELETE(_request: Request, { params }: Params) {
  /*
      DELETE : removes a reimagine project and its data
      _request variable : incoming HTTP request (unused)
      params variable : route params containing the project slug
  */
  try {
    const { slug } = await params;
    await deleteReimagineProject(slug);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// =============================================================================
// =============================================================================
