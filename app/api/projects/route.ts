// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// projects route : GET lists all projects, POST creates a new project.
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import { NextResponse } from "next/server";
import { listProjects, createProject } from "@/lib/storage";
import { createProjectSchema } from "@/lib/schema";
// =============================================================================

// =============================================================================
// Function handles GET to list all projects -> void to NextResponse
// =============================================================================
export async function GET() {
  /*
      GET : returns the full list of scene projects
  */
  try {
    const projects = await listProjects();
    return NextResponse.json(projects);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// =============================================================================
// Function handles POST to create a new project -> Request to NextResponse
// =============================================================================
export async function POST(request: Request) {
  /*
      POST : creates a new scene project with a name and provider
      request variable : incoming HTTP request with JSON body (name, provider)
  */
  try {
    const body = await request.json();
    const parsed = createProjectSchema.safeParse(body);
    // ==================================
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }
    const manifest = await createProject(parsed.data.name, parsed.data.provider);
    return NextResponse.json(manifest, { status: 201 });
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
// =============================================================================
