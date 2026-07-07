import type { ImageProvider, ImageGenResult } from "./providers/types";
import type { CharacterRef, SceneEntry } from "./types";
import { readCharacterImage } from "./storage";

function matchCharacterLabel(sceneLabel: string, charLabel: string): boolean {
  return sceneLabel.toLowerCase().trim() === charLabel.toLowerCase().trim();
}

export async function generateKeyframe(
  provider: ImageProvider,
  scene: SceneEntry,
  characters: CharacterRef[],
  apiKey: string,
  baseUrl: string | undefined,
  model: string,
  projectSlug: string,
  aspectRatio?: string,
): Promise<ImageGenResult> {
  const caps = provider.capabilities;

  // Case-insensitive label matching — LLM output may differ in casing
  const usedChars = characters.filter((c) =>
    scene.characters_used.some((label) => matchCharacterLabel(label, c.label)),
  );

  // If no exact matches found but we have characters, use ALL characters with images
  // (the LLM may have rephrased the names)
  const effectiveChars = usedChars.length > 0
    ? usedChars
    : characters.filter((c) => c.imagePath);

  let referenceImages: Buffer[] | undefined;
  let promptText = scene.prompt;
  let mode: ImageGenResult["mode"] = "text_to_image";

  if (caps.supports_reference_edit && effectiveChars.some((c) => c.imagePath)) {
    const charsWithImages = effectiveChars.filter((c) => c.imagePath);
    const charsWithoutImages = effectiveChars.filter((c) => !c.imagePath);

    const refsToSend = charsWithImages.slice(0, caps.max_reference_images);
    const excessChars = charsWithImages.slice(caps.max_reference_images);

    referenceImages = await Promise.all(
      refsToSend.map((c) => readCharacterImage(projectSlug, c.id)),
    );
    mode = "reference_edit";

    // Gemini-style: model sees images inline, tell it to use them
    const charRefList = refsToSend
      .map((c, i) => `Image ${i + 1} is "${c.label}"${c.description ? ` (${c.description})` : ""}`)
      .join(". ");
    promptText = `Using the attached reference images as character designs, generate a scene. ${charRefList}. Keep the characters' exact visual style, proportions, colors, and design from the reference images.\n\nScene: ${scene.prompt}`;

    const describeChars = [...excessChars, ...charsWithoutImages];
    if (describeChars.length > 0) {
      const descs = describeChars
        .map((c) => `[${c.label}: ${c.description || `a character named ${c.label}`}]`)
        .join(" ");
      promptText += `\n\nAdditional characters (no reference image): ${descs}`;
    }
  } else {
    if (effectiveChars.length > 0) {
      promptText = augmentPrompt(promptText, effectiveChars);
    }
  }

  return provider.generate({
    prompt: promptText,
    referenceImages,
    charactersUsed: effectiveChars,
    apiKey,
    baseUrl,
    model,
    aspectRatio,
  });
}

function augmentPrompt(prompt: string, chars: CharacterRef[]): string {
  const descs = chars
    .map((c) => {
      const desc = c.visualDescription || c.description || `a character named ${c.label}`;
      return `${c.label}: ${desc}`;
    })
    .join(". ");
  return `${prompt}. Characters present: ${descs}. Maintain exact same character designs, colors, proportions and art style across all images.`;
}
