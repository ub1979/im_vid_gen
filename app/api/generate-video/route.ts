// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// generate-video route : generates AI videos from frame images and prompts.
//                        Supports ComfyUI (local Wan 2.1) and PiAPI cloud
//                        providers. Also serves video files and lists history.
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import { NextResponse } from "next/server";
import { generateVideo } from "@/lib/providers/comfyui";
import { generatePiAPIVideo } from "@/lib/providers/piapi";
import { findModelDef } from "@/lib/piapi-video-catalog";
import { getTextLLMAdapter } from "@/lib/providers/registry";
import { readLibraryCharacterImage } from "@/lib/storage";
import fs from "node:fs/promises";
import path from "node:path";
// =============================================================================

// =============================================================================
// Types
// =============================================================================
type ImageSource =
  | { type: "project"; projectId: string; sceneIndex: number }
  | { type: "library"; characterId: string }
  | { type: "base64"; data: string }
  | null;

interface VideoMeta {
  videoId: string;
  createdAt: string;
  prompt: string;
  enhancedPrompt: string | null;
  firstFrameSource: ImageSource;
  lastFrameSource: ImageSource;
  generation: Record<string, string | number>;
}

// =============================================================================
// Function extracts project ID from frame sources -> ImageSource to string | null
// =============================================================================
function getProjectId(first: ImageSource, last: ImageSource): string | null {
  /*
      getProjectId : finds the project ID from first or last frame source
      first variable : first frame image source
      last variable : last frame image source
  */
  // ==================================
  if (first?.type === "project") return first.projectId;
  // ==================================
  if (last?.type === "project") return (last as { projectId: string }).projectId;
  return null;
}

// =============================================================================
// Function extracts scene index from first frame source -> ImageSource to number | null
// =============================================================================
function getSceneIndex(first: ImageSource): number | null {
  /*
      getSceneIndex : gets the scene index from the first frame source
      first variable : first frame image source
  */
  // ==================================
  if (first?.type === "project") return first.sceneIndex;
  return null;
}

// =============================================================================
// Function saves video data and metadata to disk -> Buffer, VideoMeta, string to object
// =============================================================================
async function saveVideoFiles(
  videoData: Buffer,
  meta: VideoMeta,
  projectId: string | null,
): Promise<{ videoId: string; servePath: string }> {
  /*
      saveVideoFiles : persists video file and JSON metadata to project or global dir
      videoData variable : raw video buffer
      meta variable : video metadata object
      projectId variable : optional project ID for scoped storage
  */
  const videoId = meta.videoId;

  // ==================================
  if (projectId) {
    const projVideoDir = path.join(process.cwd(), "projects", projectId, "videos");
    await fs.mkdir(projVideoDir, { recursive: true });
    await fs.writeFile(path.join(projVideoDir, `${videoId}.mp4`), videoData);
    await fs.writeFile(path.join(projVideoDir, `${videoId}.json`), JSON.stringify(meta, null, 2));
    return { videoId, servePath: `/api/generate-video?id=${videoId}&project=${projectId}` };
  }

  const videoDir = path.join(process.cwd(), "generated-videos");
  await fs.mkdir(videoDir, { recursive: true });
  await fs.writeFile(path.join(videoDir, `${videoId}.mp4`), videoData);
  await fs.writeFile(path.join(videoDir, `${videoId}.json`), JSON.stringify(meta, null, 2));
  return { videoId, servePath: `/api/generate-video?id=${videoId}` };
}

// =============================================================================
// Function resolves an image source to a buffer -> ImageSource to Buffer | undefined
// =============================================================================
async function resolveImage(source: ImageSource): Promise<Buffer | undefined> {
  /*
      resolveImage : loads an image buffer from project keyframe, library, or base64
      source variable : image source descriptor
  */
  // ==================================
  if (!source) return undefined;

  // ==================================
  if (source.type === "project") {
    const keyframePath = path.join(
      process.cwd(), "projects", source.projectId, "keyframes",
      `scene-${String(source.sceneIndex + 1).padStart(3, "0")}.png`,
    );
    return fs.readFile(keyframePath);
  }
  // ==================================
  if (source.type === "library") {
    return readLibraryCharacterImage(source.characterId);
  }
  // ==================================
  if (source.type === "base64") {
    return Buffer.from(source.data, "base64");
  }
  return undefined;
}

// =============================================================================
// Function handles POST to generate a video -> Request to NextResponse
// =============================================================================
export async function POST(request: Request) {
  /*
      POST : generates an AI video from frame images and prompt using ComfyUI or PiAPI
      request variable : incoming HTTP request with JSON body
  */
  try {
    // =====================================
    // Extract headers and parse request body
    // =====================================
    const apiKey = request.headers.get("x-provider-key") || "";
    const baseUrl = request.headers.get("x-base-url") || undefined;
    const body = await request.json();

    const {
      prompt, rawPrompt, firstFrameSource, lastFrameSource,
      aspectRatio, length, steps, fps,
      videoProvider, videoModel, videoMode, duration,
      textProviderId, textModel, characters,
    } = body as {
      prompt: string;
      rawPrompt?: string;
      firstFrameSource?: ImageSource;
      lastFrameSource?: ImageSource;
      aspectRatio?: string;
      length?: number;
      steps?: number;
      fps?: number;
      videoProvider?: string;
      videoModel?: string;
      videoMode?: string;
      duration?: number;
      textProviderId?: string;
      textModel?: string;
      characters?: { label: string; description: string }[];
    };

    // ==================================
    if (!prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }
    // ==================================
    if (!firstFrameSource && !lastFrameSource) {
      return NextResponse.json({ error: "At least one frame image is required" }, { status: 400 });
    }

    // =====================================
    // Resolve frame images from sources
    // =====================================
    const firstFrameBuffer = await resolveImage(firstFrameSource ?? null);
    const lastFrameBuffer = await resolveImage(lastFrameSource ?? null);

    const provider = videoProvider || "comfyui";
    const isPiAPI = provider.startsWith("piapi");

    const hasFirst = !!firstFrameBuffer;
    const hasLast = !!lastFrameBuffer;
    const enhancedPrompt = prompt;

    const frameMode = hasFirst && hasLast ? "both"
      : hasFirst ? "first" : "last";

    // ==================================
    if (isPiAPI) {
      // =====================================
      // PiAPI cloud video generation path
      // =====================================
      // ==================================
      if (!apiKey) {
        return NextResponse.json({ error: "PiAPI API key is required. Set it in Settings." }, { status: 400 });
      }

      const firstB64 = firstFrameBuffer ? `data:image/png;base64,${firstFrameBuffer.toString("base64")}` : undefined;
      const lastB64 = lastFrameBuffer ? `data:image/png;base64,${lastFrameBuffer.toString("base64")}` : undefined;

      const modelDef = findModelDef(provider);
      const piModel = modelDef?.apiModel || "kling";

      const result = await generatePiAPIVideo({
        prompt: enhancedPrompt,
        apiKey,
        model: piModel,
        variant: videoModel || undefined,
        mode: videoMode || undefined,
        imageUrl: firstB64,
        imageTailUrl: lastB64,
        duration: duration || modelDef?.defaultDuration || 5,
        aspectRatio: aspectRatio || "16:9",
      });

      const videoRes = await fetch(result.videoUrl);
      // ==================================
      if (!videoRes.ok) throw new Error("Failed to download video from PiAPI");
      const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

      const generation = {
        provider,
        model: `${piModel} ${videoModel || ""}`.trim(),
        variant: videoModel || "",
        mode: videoMode || "",
        frameMode,
        aspectRatio: aspectRatio || "16:9",
        duration: duration || 5,
        textProvider: textProviderId || "",
        textModel: textModel || "",
      };

      const videoId = `vid_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const projId = getProjectId(firstFrameSource ?? null, lastFrameSource ?? null);
      const meta: VideoMeta = {
        videoId,
        createdAt: new Date().toISOString(),
        prompt: rawPrompt || prompt,
        enhancedPrompt: rawPrompt ? prompt : null,
        firstFrameSource: firstFrameSource ?? null,
        lastFrameSource: lastFrameSource ?? null,
        generation,
      };

      const saved = await saveVideoFiles(videoBuffer, meta, projId);

      return NextResponse.json({
        videoId: saved.videoId,
        videoPath: saved.servePath,
        mime: "video/mp4",
        enhancedPrompt,
        generation,
      });
    }

    // =====================================
    // ComfyUI / Wan 2.1 local path
    // =====================================
    const result = await generateVideo({
      prompt: enhancedPrompt,
      firstFrameBuffer,
      lastFrameBuffer,
      baseUrl,
      aspectRatio,
      length,
      steps,
      fps,
    });

    const generation = {
      provider: "comfyui",
      model: "Wan 2.1 FLF2V (14B)",
      frameMode,
      aspectRatio: aspectRatio || "16:9",
      length: length || 81,
      steps: steps || 30,
      fps: fps || 16,
      textProvider: textProviderId || "",
      textModel: textModel || "",
    };

    const videoId = `vid_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const projId = getProjectId(firstFrameSource ?? null, lastFrameSource ?? null);
    const meta: VideoMeta = {
      videoId,
      createdAt: new Date().toISOString(),
      prompt: rawPrompt || prompt,
      enhancedPrompt: rawPrompt ? prompt : null,
      firstFrameSource: firstFrameSource ?? null,
      lastFrameSource: lastFrameSource ?? null,
      generation,
    };

    const saved = await saveVideoFiles(result.video, meta, projId);

    return NextResponse.json({
      videoId: saved.videoId,
      videoPath: saved.servePath,
      mime: result.mime,
      enhancedPrompt,
      generation,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// =============================================================================
// Function collects video metadata from a directory -> string to VideoMeta[]
// =============================================================================
async function collectVideoMetas(dir: string): Promise<VideoMeta[]> {
  /*
      collectVideoMetas : reads all JSON metadata files from a video directory
      dir variable : filesystem path to scan for .json metadata
  */
  try {
    const files = await fs.readdir(dir);
    const jsonFiles = files.filter(f => f.endsWith(".json"));
    const metas: VideoMeta[] = [];
    for (const f of jsonFiles) {
      try {
        const raw = await fs.readFile(path.join(dir, f), "utf-8");
        metas.push(JSON.parse(raw));
      } catch { /* skip corrupt */ }
    }
    return metas;
  } catch {
    return [];
  }
}

// =============================================================================
// Function locates a video file on disk by ID -> string, string to string | null
// =============================================================================
async function findVideoFile(id: string, projectHint?: string | null): Promise<string | null> {
  /*
      findVideoFile : searches project dir, global dir, then all projects for a video
      id variable : video ID to look up
      projectHint variable : optional project ID to check first
  */
  // ==================================
  if (projectHint) {
    const projPath = path.join(process.cwd(), "projects", projectHint, "videos", `${id}.mp4`);
    try { await fs.access(projPath); return projPath; } catch {}
  }
  const globalPath = path.join(process.cwd(), "generated-videos", `${id}.mp4`);
  try { await fs.access(globalPath); return globalPath; } catch {}
  // =====================================
  // Search all project video dirs as fallback
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
// Function handles GET to serve video files or list video history -> Request to Response
// =============================================================================
export async function GET(request: Request) {
  /*
      GET : serves a video file by ID or lists all video metadata
      request variable : incoming HTTP request with query params (id, list, project)
  */
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const list = url.searchParams.get("list");
  const projectParam = url.searchParams.get("project");

  // ==================================
  if (list === "true") {
    // =====================================
    // Collect all video metadata across projects and global dir
    // =====================================
    const allMetas: VideoMeta[] = [];

    allMetas.push(...await collectVideoMetas(path.join(process.cwd(), "generated-videos")));

    try {
      const projDir = path.join(process.cwd(), "projects");
      const projects = await fs.readdir(projDir);
      for (const p of projects) {
        allMetas.push(...await collectVideoMetas(path.join(projDir, p, "videos")));
      }
    } catch {}

    allMetas.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return NextResponse.json({ videos: allMetas });
  }

  // ==================================
  if (!id || !/^vid_\d+_[a-z0-9]+$/.test(id)) {
    return NextResponse.json({ error: "Invalid video id" }, { status: 400 });
  }

  // =====================================
  // Locate and serve the video file
  // =====================================
  const videoPath = await findVideoFile(id, projectParam);
  // ==================================
  if (!videoPath) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  const data = await fs.readFile(videoPath);
  return new Response(data, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Disposition": `inline; filename="${id}.mp4"`,
    },
  });
}

// =============================================================================
// =============================================================================
