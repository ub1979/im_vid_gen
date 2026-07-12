// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// Generate : keyframe image generation logic — resolves characters,
//            builds prompts with reference images, and delegates to
//            the image provider.
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import type { ImageProvider, ImageGenResult } from "./providers/types";
import type { CharacterRef, SceneEntry } from "./types";
import { readCharacterImage } from "./storage";
// =============================================================================

// =============================================================================
// Function matches a scene label to a character label -> string, string to boolean
// =============================================================================
function matchCharacterLabel(sceneLabel: string, charLabel: string): boolean {
  /*
      matchCharacterLabel : case-insensitive comparison of scene and character labels
      sceneLabel variable : the label from the scene's characters_used array
      charLabel variable : the label from the character definition
  */
  return sceneLabel.toLowerCase().trim() === charLabel.toLowerCase().trim();
}

// =============================================================================
// Function generates a keyframe image for a scene -> provider, scene, chars, etc. to ImageGenResult
// =============================================================================
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
  /*
      generateKeyframe : generates a single keyframe image using the provider
      provider variable : the image generation provider instance
      scene variable : the scene entry to generate an image for
      characters variable : all available character references
      apiKey variable : API key for the provider
      baseUrl variable : optional base URL override for the provider
      model variable : the model ID to use
      projectSlug variable : the project directory slug
      aspectRatio variable : optional aspect ratio override
  */
  const caps = provider.capabilities;

  // =====================================
  // Resolve which characters are used in this scene
  // =====================================
  const usedChars = characters.filter((c) =>
    scene.characters_used.some((label) => matchCharacterLabel(label, c.label)),
  );

  // ==================================
  // If no exact matches, fall back to all characters with images
  // ==================================
  const effectiveChars = usedChars.length > 0
    ? usedChars
    : characters.filter((c) => c.imagePath);

  let referenceImages: Buffer[] | undefined;
  let promptText = scene.prompt;
  let mode: ImageGenResult["mode"] = "text_to_image";

  // ==================================
  if (caps.supports_reference_edit && effectiveChars.some((c) => c.imagePath)) {
    // =====================================
    // Reference edit mode — attach character images
    // =====================================
    const charsWithImages = effectiveChars.filter((c) => c.imagePath);
    const charsWithoutImages = effectiveChars.filter((c) => !c.imagePath);

    const refsToSend = charsWithImages.slice(0, caps.max_reference_images);
    const excessChars = charsWithImages.slice(caps.max_reference_images);

    referenceImages = await Promise.all(
      refsToSend.map((c) => readCharacterImage(projectSlug, c.id)),
    );
    mode = "reference_edit";

    const charRefList = refsToSend
      .map((c, i) => `Image ${i + 1} is "${c.label}"${c.description ? ` (${c.description})` : ""}`)
      .join(". ");
    promptText = `Using the attached reference images as character designs, generate a scene. ${charRefList}. Keep the characters' exact visual style, proportions, colors, and design from the reference images.\n\nScene: ${scene.prompt}`;

    const describeChars = [...excessChars, ...charsWithoutImages];
    // ==================================
    if (describeChars.length > 0) {
      const descs = describeChars
        .map((c) => `[${c.label}: ${c.description || `a character named ${c.label}`}]`)
        .join(" ");
      promptText += `\n\nAdditional characters (no reference image): ${descs}`;
    }
  // ==================================
  } else {
    // =====================================
    // Text-only mode — augment prompt with character descriptions
    // =====================================
    // ==================================
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

// =============================================================================
// Function augments a prompt with character descriptions -> string, CharacterRef[] to string
// =============================================================================
function augmentPrompt(prompt: string, chars: CharacterRef[]): string {
  /*
      augmentPrompt : appends detailed character descriptions to a scene prompt
      prompt variable : the original scene prompt
      chars variable : array of characters to describe
  */
  const descs = chars
    .map((c) => {
      const desc = c.visualDescription || c.description || `a character named ${c.label}`;
      return `${c.label}: ${desc}`;
    })
    .join(". ");
  return `${prompt}. Characters present: ${descs}. Maintain exact same character designs, colors, proportions and art style across all images.`;
}

// =============================================================================
// =============================================================================
