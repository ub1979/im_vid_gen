import type { TextLLM, ImageProvider, ImageGenResult } from "./providers/types";
import type { ReimagineEntry, ReimagineCharacter } from "./types";

// ---- Style presets ----

export const STYLE_PRESETS: Record<string, { label: string; description: string }> = {
  "3d-pixar": {
    label: "3D Pixar",
    description:
      "COMPLETELY re-render as a Pixar/Disney 3D animated movie still. The subject must look like a fully 3D-modeled character with smooth plastic-like skin, large expressive cartoon eyes, exaggerated proportions (bigger head, smaller body), subsurface scattering on skin, soft studio lighting with ambient occlusion, and hyper-saturated vibrant colors. This should look like a screenshot from a Pixar film like Coco or Inside Out — NOT a photo with a filter.",
  },
  anime: {
    label: "Anime",
    description:
      "COMPLETELY re-draw as a Japanese anime illustration. Replace all photographic elements with hand-drawn anime art: bold clean outlines, flat cel-shaded coloring with hard shadow edges, large sparkly anime eyes, simplified nose and mouth, stylized hair with individual strands, dramatic lighting with rim lights and lens flares. Must look like a frame from a Studio Ghibli or Makoto Shinkai film — NOT a photo with a cartoon filter.",
  },
  watercolor: {
    label: "Watercolor",
    description:
      "COMPLETELY re-paint as a traditional watercolor painting on textured paper. All elements must show visible wet-on-wet paint bleeding, soft translucent color washes layered over each other, areas of white paper showing through, organic uneven edges where pigment pools, granulation texture in darker areas, and a loose impressionistic quality. Must look like an actual watercolor painting — NOT a photo with transparency effects.",
  },
  "oil-painting": {
    label: "Oil Painting",
    description:
      "COMPLETELY re-paint as a classical oil painting in the style of Renaissance masters. Show thick impasto brushstrokes with visible paint texture, rich deep color with complex color mixing, dramatic chiaroscuro lighting (strong contrast between light and shadow), glazing effects in skin tones, and fine detail work. Must look like a museum-quality oil painting — NOT a photo with a paint filter.",
  },
  "comic-book": {
    label: "Comic Book",
    description:
      "COMPLETELY re-draw as a Western comic book panel (Marvel/DC style). Use bold black ink outlines of varying weight, flat areas of solid color, Ben-Day dot halftone patterns for shading, dramatic foreshortening and dynamic angles, speed lines for emphasis, strong contrast with deep blacks. Must look like a hand-inked comic book page — NOT a photo with a posterize filter.",
  },
  photorealistic: {
    label: "Photorealistic",
    description:
      "Re-render as a professional studio photograph with perfect cinematic lighting: three-point lighting setup, shallow depth of field with creamy bokeh, accurate skin tones with subtle subsurface scattering, realistic material textures (fabric weave, skin pores, hair strands), and magazine-quality color grading with lifted shadows.",
  },
  claymation: {
    label: "Claymation",
    description:
      "COMPLETELY re-create as a stop-motion claymation figure like Wallace & Gromit or Coraline. The subject must look like it's physically sculpted from clay: visible fingerprint impressions and tool marks on surfaces, slightly lumpy imperfect shapes, googly rounded eyes, simple tube-like limbs, warm miniature studio lighting with soft shadows, and a tiny handcrafted set feel. Must look like a real clay model — NOT a photo with a smooth filter.",
  },
  sketch: {
    label: "Pencil Sketch",
    description:
      "COMPLETELY re-draw as a hand-drawn pencil sketch on white paper. Use graphite pencil strokes with varying pressure (light for highlights, heavy for shadows), cross-hatching and contour hatching for shading, visible individual pencil lines and construction marks, minimal to no color (pure graphite grays), slightly rough sketch-like quality with some areas more detailed than others. Must look like an artist's sketchbook drawing — NOT a photo converted to grayscale.",
  },
};

// ---- Analyze source images ----

interface AnalysisResult {
  entries: { index: number; description: string; characters_detected: string[] }[];
  characters: { label: string; description: string; appears_in: number[]; best_source_index: number }[];
}

const ANALYSIS_SYSTEM_PROMPT = `You are an image analysis expert. You will receive a batch of source images (they may be hand-drawn, sketched, digitally created, or photographs).

For each image (numbered starting from 0), write a VERY detailed scene description that MUST include:
1. CAMERA ANGLE and PERSPECTIVE: Is it top-down/bird's eye, low angle looking up, eye level, close-up, extreme close-up, wide shot, medium shot? Describe exactly.
2. SUBJECT: What specific creature/character/object is shown? Be precise — a fly is NOT a crow, a hand is NOT a foot.
3. SUBJECT POSE and ACTION: What exactly is the subject doing? Standing, flying, eating, perching, walking? From which direction are we seeing them?
4. FRAMING: What part of the subject is visible? Full body, just the head, just feet/claws, partial view?
5. BACKGROUND and ENVIRONMENT: What's behind/around the subject?
6. COMPOSITION: Where in the frame is the subject positioned? Center, left, right, top, bottom?

Identify any recurring characters/figures across images. Give each a consistent label.

Return ONLY valid JSON with this exact structure:
{
  "entries": [
    { "index": 0, "description": "detailed scene description including camera angle, subject, pose, framing, background, composition...", "characters_detected": ["CharName1"] }
  ],
  "characters": [
    { "label": "CharName1", "description": "visual description of the character's appearance only...", "appears_in": [0, 2, 5], "best_source_index": 0 }
  ]
}

If no recurring characters are found, return an empty characters array. The best_source_index should be the image index where the character is most clearly visible.`;

export async function analyzeSourceImages(
  images: { data: Buffer; mimeType: string }[],
  textLLM: TextLLM,
  apiKey: string,
  model: string,
  baseUrl?: string,
): Promise<AnalysisResult> {
  if (!textLLM.generateTextWithImages) {
    throw new Error("Text LLM does not support image analysis");
  }

  const BATCH_SIZE = 8;
  const allEntries: AnalysisResult["entries"] = [];
  const charMap = new Map<string, AnalysisResult["characters"][0]>();

  for (let batchStart = 0; batchStart < images.length; batchStart += BATCH_SIZE) {
    const batch = images.slice(batchStart, batchStart + BATCH_SIZE);
    const globalOffset = batchStart;

    const userPrompt =
      batch.length === images.length
        ? `Analyze these ${batch.length} images (indexed 0 to ${batch.length - 1}).`
        : `Analyze these ${batch.length} images. They are images ${globalOffset} to ${globalOffset + batch.length - 1} from a set of ${images.length} total images. Use global indices in your response.`;

    const raw = await textLLM.generateTextWithImages({
      systemPrompt: ANALYSIS_SYSTEM_PROMPT,
      userPrompt,
      images: batch,
      apiKey,
      baseUrl,
      model,
    });

    let cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    // Strip trailing commas before } or ] (common LLM JSON mistake)
    cleaned = cleaned.replace(/,\s*([}\]])/g, "$1");
    // Strip single-line comments
    cleaned = cleaned.replace(/\/\/[^\n]*/g, "");
    // Strip multi-line comments
    cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, "");

    let parsed: AnalysisResult;
    try {
      parsed = JSON.parse(cleaned) as AnalysisResult;
    } catch {
      // Try to extract JSON object from the response
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("Analysis did not return valid JSON. Try again or use fewer images.");
      const extracted = match[0].replace(/,\s*([}\]])/g, "$1");
      parsed = JSON.parse(extracted) as AnalysisResult;
    }

    for (const entry of parsed.entries) {
      if (entry.index < batch.length) {
        entry.index += globalOffset;
      }
      allEntries.push(entry);
    }

    for (const char of parsed.characters) {
      const key = char.label.toLowerCase();
      const existing = charMap.get(key);
      if (existing) {
        existing.appears_in = [...new Set([...existing.appears_in, ...char.appears_in])];
      } else {
        charMap.set(key, { ...char });
      }
    }
  }

  return { entries: allEntries, characters: Array.from(charMap.values()) };
}

// ---- Build reimagine prompt ----

export function buildReimaginePrompt(
  sceneDescription: string,
  styleDescription: string,
  characters: { label: string; description: string; hasRef: boolean }[],
): string {
  let prompt = `Reimagine the following scene in this style: ${styleDescription}\n\nOriginal scene: ${sceneDescription}`;

  const withRefs = characters.filter((c) => c.hasRef);
  if (withRefs.length > 0) {
    const charList = withRefs
      .map((c, i) => `Reference image ${i + 1} is "${c.label}" (${c.description}). Keep their exact visual design, proportions, and distinguishing features.`)
      .join("\n");
    prompt += `\n\nUsing the attached character reference images, maintain each character's exact visual identity:\n${charList}`;
  }

  const withoutRefs = characters.filter((c) => !c.hasRef);
  if (withoutRefs.length > 0) {
    const descs = withoutRefs.map((c) => `[${c.label}: ${c.description}]`).join(" ");
    prompt += `\n\nAdditional characters (described, no reference image): ${descs}`;
  }

  prompt += "\n\nGenerate the reimagined scene preserving the original composition and character positioning, but rendered entirely in the target style.";

  return prompt;
}

// ---- Generate a single reimagined image ----

export async function generateReimagined(
  provider: ImageProvider,
  entry: ReimagineEntry,
  sourceImage: Buffer,
  characters: { char: ReimagineCharacter; image: Buffer }[],
  styleRefImage: Buffer | null,
  styleDescription: string,
  apiKey: string,
  model: string,
  baseUrl?: string,
): Promise<ImageGenResult> {
  const caps = provider.capabilities;
  const maxRefs = caps.max_reference_images;

  // Budget: 1 for source image + 1 for style ref (if present) + rest for characters
  const styleSlots = styleRefImage ? 1 : 0;
  const charSlots = Math.max(0, maxRefs - 1 - styleSlots);

  const charsWithImages = characters.slice(0, charSlots);
  const excessChars = characters.slice(charSlots);

  // Build reference images array: source first, then style ref, then character refs
  const referenceImages: Buffer[] = [sourceImage];
  if (styleRefImage) {
    referenceImages.push(styleRefImage);
  }
  for (const c of charsWithImages) {
    referenceImages.push(c.image);
  }

  // Build prompt
  const charInfo = characters.map((c) => ({
    label: c.char.label,
    description: c.char.description,
    hasRef: charsWithImages.includes(c),
  }));

  const sceneDesc = entry.reimaginedPrompt || entry.prompt;

  let prompt = `You are recreating a specific scene in a new art style. Follow these rules STRICTLY:

RULE 1 — EXACT COMPOSITION: You MUST preserve the EXACT camera angle, perspective, framing, and subject positioning from the source image (Image 1). If the source shows a top-down view, your output MUST be top-down. If it shows a close-up of feet, show feet. If the subject faces left, it faces left. Do NOT change the camera angle.

RULE 2 — EXACT SUBJECT: Draw ONLY what appears in the source image. If the source shows a FLY, draw a FLY — not a crow, not a bird. If the source shows no animal, don't add one. Never substitute one creature for another.

RULE 3 — STYLE ONLY: Apply the target style's RENDERING TECHNIQUE (line quality, shading, coloring, lighting, texture) but NOT its content. The style reference shows HOW to render — not WHAT to render.

TARGET STYLE: ${styleDescription}\n\n`;

  if (styleRefImage) {
    prompt += `Style reference (Image 2): Copy ONLY the artistic style from this image — its rendering technique, color palette, lighting approach, line quality, and shading method. Do NOT copy any subjects, characters, objects, or composition from this image. It is a STYLE guide only.\n\n`;
  }

  const charRefOffset = 1 + styleSlots;
  if (charsWithImages.length > 0) {
    const charDescs = charsWithImages
      .map((c, i) => `Image ${charRefOffset + i + 1} is "${c.char.label}" (${c.char.description}). Use for visual identity reference only — pose and angle come from the SOURCE image.`)
      .join("\n");
    prompt += `Character identity references:\n${charDescs}\n\n`;
  }

  if (excessChars.length > 0) {
    const descs = excessChars.map((c) => `[${c.char.label}: ${c.char.description}]`).join(" ");
    prompt += `Additional characters (no reference image): ${descs}\n\n`;
  }

  prompt += `SCENE TO RECREATE (from source Image 1): ${sceneDesc}\n\nRe-draw this EXACT scene preserving camera angle, subject type, pose, framing, and composition. Only change the rendering style.`;

  // Build charactersUsed for the provider
  const charactersUsed = [
    { id: "source", label: "Source Image", description: "Original image to reimagine" },
    ...(styleRefImage ? [{ id: "style-ref", label: "Style Reference" }] : []),
    ...charsWithImages.map((c) => ({ id: c.char.id, label: c.char.label, description: c.char.description })),
  ];

  return provider.generate({
    prompt,
    referenceImages,
    charactersUsed,
    apiKey,
    model,
    baseUrl,
  });
}
