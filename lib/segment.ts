import { sceneArraySchema } from "./schema";
import type { Scene } from "./providers/types";

// ---- Build the segmentation system prompt ----

function getPromptStyleGuide(imageProviderId?: string): string {
  switch (imageProviderId) {
    case "comfyui":
      return `
## Prompt Style (Qwen-Image)
Write prompts in a descriptive, tag-based style. Lead with the subject and characters, then describe the scene, setting, lighting, mood, camera angle, and art style. Use comma-separated descriptive phrases.
Example style: "A cute brown dog with floppy ears and red cape, walking through sunny park, green grass, colorful flowers, warm golden light, 3D Pixar animation style, cheerful mood, wide angle shot"`;
    case "gemini":
      return `
## Prompt Style (Gemini)
Write prompts as detailed natural language descriptions. Be narrative — describe what's happening, the characters' expressions and actions, the environment, and the desired visual style. Include emotional tone and atmosphere.`;
    case "openai":
      return `
## Prompt Style (OpenAI)
Write prompts as clear, concise natural language descriptions. Focus on the main subject, action, setting, and style. Be specific about visual details but keep prompts under 200 words.`;
    default:
      return "";
  }
}

export function buildSegmentationPrompt(
  sceneCount: number,
  intervalSeconds: number,
  characters: { label: string; description?: string; hasImage?: boolean }[],
  imageProviderId?: string,
): string {
  const charLines: string[] = [];
  for (const c of characters) {
    charLines.push(`- "${c.label}"${c.description ? `: ${c.description}` : ""}`);
  }

  const characterInstructions = characters.length > 0
    ? `
## Character Consistency
When writing prompts for scenes that include characters:
- ALWAYS describe each character's full visual appearance (colors, proportions, style, clothing, distinguishing features) based on their description above
- Maintain EXACT same character designs across all scenes — consistency is critical
- Use the character's EXACT label name in characters_used
- Describe pose, expression, action, and scene context in addition to appearance`
    : "";

  const promptStyle = getPromptStyleGuide(imageProviderId);

  return `You are a creative director. Your job is to split provided text (lyrics, poem, or story) into exactly ${sceneCount} timeline scenes for keyframe image generation.

## Characters
${charLines.join("\n") || "(no characters defined)"}
${characterInstructions}
${promptStyle}

## Timeline rules
- Produce exactly ${sceneCount} scenes.
- Scene i covers time [i * ${intervalSeconds}, (i+1) * ${intervalSeconds}) seconds.
- scene.index is 0-based (0, 1, 2, ...).
- scene.time_start = index * ${intervalSeconds}
- scene.time_end = (index + 1) * ${intervalSeconds}
- Distribute the full text across all ${sceneCount} scenes.

## For each scene, write:
- lyric_excerpt: the slice of text this scene covers (verbatim excerpt).
- prompt: a concrete, detailed image-generation prompt. Describe each character's full visual appearance (based on their description above) so the image generator can recreate them accurately. Reference characters by their EXACT labels. Describe the setting, lighting, mood, composition. Maintain a consistent visual style across all scenes.
- characters_used: an array of the character labels that appear in this scene. Use EXACT label strings.

## Output format
Return ONLY a JSON array — no markdown fences, no commentary, no explanations. Each element:
{
  "index": <number>,
  "time_start": <number>,
  "time_end": <number>,
  "lyric_excerpt": "<string>",
  "prompt": "<string>",
  "characters_used": ["<label>", ...]
}`;
}

// ---- Parse and validate LLM output ----

export function parseAndValidate(
  raw: string,
  expectedCount: number,
): Scene[] {
  // Strip markdown code fences if present
  let cleaned = raw.trim();

  // Remove ```json ... ``` or ``` ... ```
  const fenceMatch = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(
      `Scene segmentation output is not valid JSON. Raw output starts with: "${cleaned.slice(0, 120)}..."`,
    );
  }

  // Validate with Zod
  const result = sceneArraySchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Scene array validation failed: ${issues}`);
  }

  const scenes = result.data as Scene[];

  // Check array length
  if (scenes.length !== expectedCount) {
    throw new Error(
      `Expected ${expectedCount} scenes but got ${scenes.length}`,
    );
  }

  return scenes;
}
