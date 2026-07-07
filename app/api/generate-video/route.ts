import { NextResponse } from "next/server";
import { generateVideo } from "@/lib/providers/comfyui";
import { generatePiAPIVideo } from "@/lib/providers/piapi";
import { readLibraryCharacterImage } from "@/lib/storage";
import fs from "node:fs/promises";
import path from "node:path";

export async function POST(request: Request) {
  try {
    const apiKey = request.headers.get("x-provider-key") || "";
    const baseUrl = request.headers.get("x-base-url") || undefined;
    const body = await request.json();

    const {
      prompt, framePosition, imageSource, aspectRatio,
      length, steps, fps,
      videoProvider, videoModel,
      duration,
    } = body as {
      prompt: string;
      framePosition: "first" | "last";
      imageSource: { type: "project"; projectId: string; sceneIndex: number }
        | { type: "library"; characterId: string }
        | { type: "base64"; data: string };
      aspectRatio?: string;
      length?: number;
      steps?: number;
      fps?: number;
      videoProvider?: string;
      videoModel?: string;
      duration?: number;
    };

    if (!prompt || !imageSource || !framePosition) {
      return NextResponse.json({ error: "prompt, imageSource, and framePosition are required" }, { status: 400 });
    }

    let imageBuffer: Buffer;

    if (imageSource.type === "project") {
      const keyframePath = path.join(
        process.cwd(), "projects", imageSource.projectId, "keyframes",
        `scene-${String(imageSource.sceneIndex + 1).padStart(3, "0")}.png`,
      );
      imageBuffer = await fs.readFile(keyframePath);
    } else if (imageSource.type === "library") {
      imageBuffer = await readLibraryCharacterImage(imageSource.characterId);
    } else if (imageSource.type === "base64") {
      imageBuffer = Buffer.from(imageSource.data, "base64");
    } else {
      return NextResponse.json({ error: "Invalid imageSource type" }, { status: 400 });
    }

    const provider = videoProvider || "comfyui";
    const isPiAPI = provider.startsWith("piapi");

    if (isPiAPI) {
      if (!apiKey) {
        return NextResponse.json({ error: "PiAPI API key is required. Set it in Settings." }, { status: 400 });
      }

      // Upload image as base64 data URL for PiAPI
      const b64 = imageBuffer.toString("base64");
      const dataUrl = `data:image/png;base64,${b64}`;

      const piModel = provider === "piapi-kling" ? "kling"
        : provider === "piapi-hailuo" ? "hailuo"
        : provider === "piapi-seedance" ? "seedance-2.0"
        : "kling";

      const result = await generatePiAPIVideo({
        prompt,
        apiKey,
        model: piModel,
        version: videoModel || undefined,
        imageUrl: framePosition === "first" ? dataUrl : undefined,
        imageTailUrl: framePosition === "last" ? dataUrl : undefined,
        duration: duration || 5,
        aspectRatio: aspectRatio || "16:9",
      });

      // Download the video from PiAPI URL and save locally
      const videoRes = await fetch(result.videoUrl);
      if (!videoRes.ok) throw new Error("Failed to download video from PiAPI");
      const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

      const videoDir = path.join(process.cwd(), "generated-videos");
      await fs.mkdir(videoDir, { recursive: true });
      const videoId = `vid_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const videoPath = path.join(videoDir, `${videoId}.mp4`);
      await fs.writeFile(videoPath, videoBuffer);

      return NextResponse.json({
        videoId,
        videoPath: `/api/generate-video?id=${videoId}`,
        mime: "video/mp4",
        generation: {
          provider,
          model: `${piModel} ${videoModel || ""}`.trim(),
          framePosition,
          aspectRatio: aspectRatio || "16:9",
          duration: duration || 5,
        },
      });
    }

    // ComfyUI / LTX path
    const result = await generateVideo({
      prompt,
      imageBuffer,
      framePosition,
      baseUrl,
      aspectRatio,
      length,
      steps,
      fps,
    });

    const videoDir = path.join(process.cwd(), "generated-videos");
    await fs.mkdir(videoDir, { recursive: true });
    const videoId = `vid_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const vidPath = path.join(videoDir, `${videoId}.mp4`);
    await fs.writeFile(vidPath, result.video);

    return NextResponse.json({
      videoId,
      videoPath: `/api/generate-video?id=${videoId}`,
      mime: result.mime,
      generation: {
        provider: "comfyui",
        model: "LTX 2.3 (22B)",
        framePosition,
        aspectRatio: aspectRatio || "16:9",
        length: length || 97,
        steps: steps || 30,
        fps: fps || 25,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id || !/^vid_\d+_[a-z0-9]+$/.test(id)) {
    return NextResponse.json({ error: "Invalid video id" }, { status: 400 });
  }

  const videoPath = path.join(process.cwd(), "generated-videos", `${id}.mp4`);
  try {
    const data = await fs.readFile(videoPath);
    return new Response(data, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `inline; filename="${id}.mp4"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }
}
