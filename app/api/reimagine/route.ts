// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// ReimagineRoute : API route for listing and creating reimagine projects
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import { NextResponse } from "next/server";
import { createReimagineProject, listReimagineProjects } from "@/lib/storage";
import { reimagineCreateSchema } from "@/lib/schema";
// =============================================================================

// =============================================================================
// Function lists all reimagine projects -> void to NextResponse
// =============================================================================
export async function GET() {
  /*
      GET : returns a JSON array of all reimagine projects
  */
  try {
    const projects = await listReimagineProjects();
    return NextResponse.json(projects);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// =============================================================================
// Function creates a new reimagine project -> Request to NextResponse
// =============================================================================
export async function POST(request: Request) {
  /*
      POST : validates request body and creates a new reimagine project
      request variable : incoming HTTP request with name and provider in body
  */
  try {
    const body = await request.json();
    const parsed = reimagineCreateSchema.parse(body);
    const manifest = await createReimagineProject(parsed.name, parsed.provider);
    return NextResponse.json(manifest, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // ==================================
    if (msg.includes("already exists")) {
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    // ==================================
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// =============================================================================
// =============================================================================
