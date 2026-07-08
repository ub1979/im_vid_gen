import { NextResponse } from "next/server";
import { generateVideo } from "@/lib/providers/comfyui";
import { generatePiAPIVideo } from "@/lib/providers/piapi";
import { getTextLLMAdapter } from "@/lib/providers/registry";
import { readLibraryCharacterImage } from "@/lib/storage";
import fs from "node:fs/promises";
import path from "node:path";

type ImageSource =
  | { type: "project"; projectId: string; sceneIndex: number }
  | { type: "library"; characterId: string }
  | { type: "base64"; data: string }
  | null;

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
      prompt, firstFrameSource, lastFrameSource,
      aspectRatio, length, steps, fps,
      videoProvider, videoModel, duration,
      textProviderId, textModel, characters,
    } = body as {
      prompt: string;
      firstFrameSource?: ImageSource;
      lastFrameSource?: ImageSource;
      aspectRatio?: string;
      length?: number;
      steps?: number;
      fps?: number;
      videoProvider?: string;
      videoModel?: string;
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
    let enhancedPrompt = prompt;

    if (textProviderId && textModel) {
      const textLLM = getTextLLMAdapter(textProviderId);
      if (textLLM.generateText) {
        const textApiKey = request.headers.get("x-text-provider-key") || "";
        const textBaseUrl = request.headers.get("x-text-base-url") || undefined;
        try {
          const charContext = characters && characters.length > 0
            ? `\n\nCharacters referenced in this scene:\n${characters.map(c => `- "${c.label}": ${c.description || "no description"}`).join("\n")}\nIncorporate these characters' visual details into the prompt.`
            : "";
          enhancedPrompt = await textLLM.generateText({
            systemPrompt: `You are a video generation prompt expert. Given a user's description of a video scene, produce a detailed, vivid prompt optimized for AI video generation. Describe the motion, camera movement, lighting, atmosphere, and visual details. ${hasFirst && hasLast ? "The video will interpolate between a first frame and last frame image." : hasFirst ? "The video will animate starting from a given first frame image." : "The video will animate ending at a given last frame image."} Focus on describing the MOTION and TRANSITION that should happen.${charContext} Output ONLY the video prompt, no explanations or preamble.`,
            userPrompt: prompt,
            apiKey: textApiKey,
            baseUrl: textBaseUrl,
            model: textModel,
          });
        } catch {
          // Fall back to raw prompt
        }
      }
    }

    const frameMode = hasFirst && hasLast ? "both"
      : hasFirst ? "first" : "last";

    if (isPiAPI) {
      if (!apiKey) {
        return NextResponse.json({ error: "PiAPI API key is required. Set it in Settings." }, { status: 400 });
      }

      const firstB64 = firstFrameBuffer ? `data:image/png;base64,${firstFrameBuffer.toString("base64")}` : undefined;
      const lastB64 = lastFrameBuffer ? `data:image/png;base64,${lastFrameBuffer.toString("base64")}` : undefined;

      const piModel = provider === "piapi-kling" ? "kling"
        : provider === "piapi-hailuo" ? "hailuo"
        : provider === "piapi-seedance" ? "seedance-2.0"
        : "kling";

      const result = await generatePiAPIVideo({
        prompt: enhancedPrompt,
        apiKey,
        model: piModel,
        version: videoModel || undefined,
        imageUrl: firstB64,
        imageTailUrl: lastB64,
        duration: duration || 5,
        aspectRatio: aspectRatio || "16:9",
      });

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
        enhancedPrompt,
        generation: {
          provider,
          model: `${piModel} ${videoModel || ""}`.trim(),
          frameMode,
          aspectRatio: aspectRatio || "16:9",
          duration: duration || 5,
          textProvider: textProviderId || "",
          textModel: textModel || "",
        },
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

    const videoDir = path.join(process.cwd(), "generated-videos");
    await fs.mkdir(videoDir, { recursive: true });
    const videoId = `vid_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const vidPath = path.join(videoDir, `${videoId}.mp4`);
    await fs.writeFile(vidPath, result.video);

    return NextResponse.json({
      videoId,
      videoPath: `/api/generate-video?id=${videoId}`,
      mime: result.mime,
      enhancedPrompt,
      generation: {
        provider: "comfyui",
        model: "Wan 2.1 FLF2V (14B)",
        frameMode,
        aspectRatio: aspectRatio || "16:9",
        length: length || 81,
        steps: steps || 30,
        fps: fps || 16,
        textProvider: textProviderId || "",
        textModel: textModel || "",
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
