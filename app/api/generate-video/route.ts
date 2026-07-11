import { NextResponse } from "next/server";
import { generateVideo } from "@/lib/providers/comfyui";
import { generatePiAPIVideo } from "@/lib/providers/piapi";
import { findModelDef } from "@/lib/piapi-video-catalog";
import { getTextLLMAdapter } from "@/lib/providers/registry";
import { readLibraryCharacterImage } from "@/lib/storage";
import fs from "node:fs/promises";
import path from "node:path";

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

function getProjectId(first: ImageSource, last: ImageSource): string | null {
  if (first?.type === "project") return first.projectId;
  if (last?.type === "project") return (last as { projectId: string }).projectId;
  return null;
}

function getSceneIndex(first: ImageSource): number | null {
  if (first?.type === "project") return first.sceneIndex;
  return null;
}

async function saveVideoFiles(
  videoData: Buffer,
  meta: VideoMeta,
  projectId: string | null,
): Promise<{ videoId: string; servePath: string }> {
  const videoId = meta.videoId;

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

async function resolveImage(source: ImageSource): Promise<Buffer | undefined> {
  if (!source) return undefined;

  if (source.type === "project") {
    const keyframePath = path.join(
      process.cwd(), "projects", source.projectId, "keyframes",
      `scene-${String(source.sceneIndex + 1).padStart(3, "0")}.png`,
    );
    return fs.readFile(keyframePath);
  }
  if (source.type === "library") {
    return readLibraryCharacterImage(source.characterId);
  }
  if (source.type === "base64") {
    return Buffer.from(source.data, "base64");
  }
  return undefined;
}

export async function POST(request: Request) {
  try {
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

    if (!prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }
    if (!firstFrameSource && !lastFrameSource) {
      return NextResponse.json({ error: "At least one frame image is required" }, { status: 400 });
    }

    const firstFrameBuffer = await resolveImage(firstFrameSource ?? null);
    const lastFrameBuffer = await resolveImage(lastFrameSource ?? null);

    const provider = videoProvider || "comfyui";
    const isPiAPI = provider.startsWith("piapi");

    const hasFirst = !!firstFrameBuffer;
    const hasLast = !!lastFrameBuffer;
    const enhancedPrompt = prompt;

    const frameMode = hasFirst && hasLast ? "both"
      : hasFirst ? "first" : "last";

    if (isPiAPI) {
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

    // ComfyUI / LTX path
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

async function collectVideoMetas(dir: string): Promise<VideoMeta[]> {
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

async function findVideoFile(id: string, projectHint?: string | null): Promise<string | null> {
  if (projectHint) {
    const projPath = path.join(process.cwd(), "projects", projectHint, "videos", `${id}.mp4`);
    try { await fs.access(projPath); return projPath; } catch {}
  }
  const globalPath = path.join(process.cwd(), "generated-videos", `${id}.mp4`);
  try { await fs.access(globalPath); return globalPath; } catch {}
  // search all project video dirs
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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const list = url.searchParams.get("list");
  const projectParam = url.searchParams.get("project");

  if (list === "true") {
    const allMetas: VideoMeta[] = [];

    // collect from generated-videos/
    allMetas.push(...await collectVideoMetas(path.join(process.cwd(), "generated-videos")));

    // collect from each project's videos/ folder
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

  if (!id || !/^vid_\d+_[a-z0-9]+$/.test(id)) {
    return NextResponse.json({ error: "Invalid video id" }, { status: 400 });
  }

  const videoPath = await findVideoFile(id, projectParam);
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
