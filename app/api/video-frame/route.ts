// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// VideoFrame : API route that extracts a frame from a generated video
//              and optionally upscales it via PiAPI
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
// =============================================================================

const exec = promisify(execFile);
const PIAPI_BASE = "https://api.piapi.ai/api/v1";

// =============================================================================
// Function finds a video file by id across project dirs -> id, project to string | null
// =============================================================================
async function findVideoPath(id: string, project?: string | null): Promise<string | null> {
  /*
      findVideoPath : searches for a video file in project and generated-videos directories
      id variable : the video identifier (used as filename without extension)
      project variable : optional project name to search first
  */
  // ==================================
  if (project) {
    const p = path.join(process.cwd(), "projects", project, "videos", `${id}.mp4`);
    try { await fs.access(p); return p; } catch {}
  }
  // ==================================

  // =====================================
  // Check generated-videos directory
  // =====================================
  const g = path.join(process.cwd(), "generated-videos", `${id}.mp4`);
  try { await fs.access(g); return g; } catch {}

  // =====================================
  // Scan all project directories
  // =====================================
  try {
    const projDir = path.join(process.cwd(), "projects");
    const projects = await fs.readdir(projDir);
    for (const p of projects) {
      const candidate = path.join(projDir, p, "videos", `${id}.mp4`);
      try { await fs.access(candidate); return candidate; } catch {}
    }
  } catch {}
  return null;
}

// =============================================================================
// Function upscales an image via PiAPI toolkit -> imageBuffer, apiKey to Buffer
// =============================================================================
async function upscaleWithPiAPI(imageBuffer: Buffer, apiKey: string): Promise<Buffer> {
  /*
      upscaleWithPiAPI : sends an image to PiAPI for 2x upscaling with face enhancement
      imageBuffer variable : raw PNG image data to upscale
      apiKey variable : PiAPI API key for authentication
  */
  const b64 = `data:image/png;base64,${imageBuffer.toString("base64")}`;

  // =====================================
  // Create upscale task
  // =====================================
  const createRes = await fetch(`${PIAPI_BASE}/task`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "Qubico/image-toolkit",
      task_type: "upscale",
      input: { image: b64, scale: 2, face_enhance: true },
    }),
  });

  // ==================================
  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`PiAPI upscale create failed (${createRes.status}): ${text}`);
  }
  // ==================================

  const createData = await createRes.json();
  // ==================================
  if (createData.code !== 200) {
    throw new Error(`PiAPI upscale error: ${createData.message || JSON.stringify(createData)}`);
  }
  // ==================================

  const taskId = createData.data.task_id;
  console.log(`[PiAPI] upscale task created: ${taskId}`);

  const start = Date.now();
  const timeout = 120_000;
  const interval = 3000;

  // =====================================
  // Poll for task completion
  // =====================================
  while (Date.now() - start < timeout) {
    await new Promise(r => setTimeout(r, interval));

    const pollRes = await fetch(`${PIAPI_BASE}/task/${taskId}`, {
      headers: { "x-api-key": apiKey },
    });
    // ==================================
    if (!pollRes.ok) continue;
    // ==================================

    const pollData = await pollRes.json();
    const status = (pollData.data?.status || "").toLowerCase();
    console.log(`[PiAPI] upscale ${taskId}: status=${status}`);

    // ==================================
    if (status === "completed") {
      const output = pollData.data?.output || pollData.data?.task_result?.task_output || {};
      const imageUrl = output.image_url as string | undefined;

      if (imageUrl) {
        const imgRes = await fetch(imageUrl);
        if (!imgRes.ok) throw new Error("Failed to download upscaled image");
        return Buffer.from(await imgRes.arrayBuffer());
      }

      const imageB64 = output.image_base64 as string | undefined;
      if (imageB64) {
        return Buffer.from(imageB64, "base64");
      }

      throw new Error(`Upscale completed but no image in output: ${JSON.stringify(output).slice(0, 300)}`);
    }
    // ==================================

    // ==================================
    if (status === "failed") {
      const err = pollData.data?.error?.message || pollData.data?.task_result?.error_messages?.[0] || "Upscale failed";
      throw new Error(`PiAPI upscale failed: ${err}`);
    }
    // ==================================
  }

  throw new Error("PiAPI upscale timed out");
}

// =============================================================================
// Function handles GET request to extract video frame -> Request to Response
// =============================================================================
export async function GET(request: Request) {
  /*
      GET : extracts a frame from a video file, optionally upscales it, returns as PNG
      request variable : incoming HTTP request with id, project, frame, upscale query params
  */
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const project = url.searchParams.get("project");
  const frame = url.searchParams.get("frame") || "last";
  const upscale = url.searchParams.get("upscale") === "true";
  const apiKey = request.headers.get("x-provider-key") || "";

  // ==================================
  if (!id || !/^vid_\d+_[a-z0-9]+$/.test(id)) {
    return NextResponse.json({ error: "Invalid video id" }, { status: 400 });
  }
  // ==================================

  const videoPath = await findVideoPath(id, project);
  // ==================================
  if (!videoPath) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }
  // ==================================

  const tmpFile = path.join(os.tmpdir(), `frame_${id}_${Date.now()}.png`);

  try {
    // =====================================
    // Extract frame with ffmpeg
    // =====================================
    // ==================================
    if (frame === "last") {
      await exec("ffmpeg", [
        "-sseof", "-0.1",
        "-i", videoPath,
        "-frames:v", "1",
        "-update", "1",
        "-y", tmpFile,
      ]);
    } else {
      await exec("ffmpeg", [
        "-i", videoPath,
        "-frames:v", "1",
        "-update", "1",
        "-y", tmpFile,
      ]);
    }
    // ==================================

    let data: Buffer = await fs.readFile(tmpFile);
    await fs.unlink(tmpFile).catch(() => {});

    // ==================================
    if (upscale && apiKey) {
      console.log(`[PiAPI] upscaling extracted frame (${data.length} bytes)...`);
      data = await upscaleWithPiAPI(Buffer.from(data), apiKey);
      console.log(`[PiAPI] upscaled frame: ${data.length} bytes`);
    }
    // ==================================

    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    await fs.unlink(tmpFile).catch(() => {});
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// =============================================================================
// =============================================================================
