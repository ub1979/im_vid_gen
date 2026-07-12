// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// Storage : file-system persistence layer for projects, sessions,
//           the character library, keyframes, reimagine projects,
//           and saved exports. All paths are sandboxed via
//           assertPathContained.
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import path from "node:path";
import fs from "node:fs/promises";
import JSZip from "jszip";
import { sanitizeSlug, assertPathContained } from "./security";
import type { ProjectManifest, CharacterRef, SceneEntry, LibraryCharacter, ReimagineManifest } from "./types";
// =============================================================================

// =============================================================================
// Function returns the projects root directory -> void to string
// =============================================================================
export function getProjectsRoot(): string {
  /*
      getProjectsRoot : resolves the absolute path to the projects directory
  */
  return path.join(process.cwd(), "projects");
}

// =============================================================================
// Function returns the library root directory -> void to string
// =============================================================================
export function getLibraryRoot(): string {
  /*
      getLibraryRoot : resolves the absolute path to the library directory
  */
  return path.join(process.cwd(), "library");
}

// =============================================================================
// Function returns the saved root directory -> void to string
// =============================================================================
export function getSavedRoot(): string {
  /*
      getSavedRoot : resolves the absolute path to the saved exports directory
  */
  return path.join(process.cwd(), "saved");
}

// =============================================================================
// Function resolves a project directory from a slug -> string to string
// =============================================================================
function projectDir(slug: string): string {
  /*
      projectDir : resolves and validates the project directory path
      slug variable : the project slug
  */
  const dir = path.resolve(getProjectsRoot(), slug);
  assertPathContained(dir, getProjectsRoot());
  return dir;
}

// =============================================================================
// Function resolves the manifest path for a project -> string to string
// =============================================================================
function manifestPath(slug: string): string {
  /*
      manifestPath : resolves the manifest.json path for a project
      slug variable : the project slug
  */
  const p = path.resolve(projectDir(slug), "manifest.json");
  assertPathContained(p, getProjectsRoot());
  return p;
}

// =============================================================================
// Function generates a keyframe filename from scene index -> number to string
// =============================================================================
function keyframeFilename(sceneIndex: number): string {
  /*
      keyframeFilename : zero-padded 3-digit, 1-indexed filename (index 0 -> scene-001.png)
      sceneIndex variable : the 0-based scene index
  */
  return `scene-${String(sceneIndex + 1).padStart(3, "0")}.png`;
}

// =============================================================================
// Function ensures a directory exists -> string to void
// =============================================================================
async function ensureDir(dir: string): Promise<void> {
  /*
      ensureDir : creates directory recursively if it does not exist
      dir variable : the directory path to ensure
  */
  await fs.mkdir(dir, { recursive: true });
}

// =============================================================================
// Function lists all projects -> void to ProjectManifest[]
// =============================================================================
export async function listProjects(): Promise<ProjectManifest[]> {
  /*
      listProjects : reads all project directories and returns their manifests
  */
  const root = getProjectsRoot();
  await ensureDir(root);

  const entries = await fs.readdir(root, { withFileTypes: true });
  const manifests: ProjectManifest[] = [];

  for (const entry of entries) {
    // ==================================
    if (!entry.isDirectory()) continue;
    try {
      const m = await getProject(entry.name);
      manifests.push(m);
    } catch {
      // ======================
      // skip directories without valid manifests
    }
  }

  return manifests;
}

// =============================================================================
// Function gets a single project manifest -> string to ProjectManifest
// =============================================================================
export async function getProject(slug: string): Promise<ProjectManifest> {
  /*
      getProject : reads and parses a project's manifest.json
      slug variable : the project slug
  */
  const mp = manifestPath(slug);
  const raw = await fs.readFile(mp, "utf-8");
  return JSON.parse(raw) as ProjectManifest;
}

// =============================================================================
// Function creates a new project -> string, providerConfig to ProjectManifest
// =============================================================================
export async function createProject(
  name: string,
  providerConfig?: { image: { id: string; model: string }; text: { id: string; model: string } },
): Promise<ProjectManifest> {
  /*
      createProject : creates a new project directory with manifest
      name variable : the human-readable project name
      providerConfig variable : optional image/text provider configuration
  */
  const slug = sanitizeSlug(name);
  // ==================================
  if (!slug) throw new Error("Invalid project name — produces empty slug");

  const dir = projectDir(slug);
  assertPathContained(dir, getProjectsRoot());

  // =====================================
  // Fail if already exists
  // =====================================
  try {
    await fs.access(dir);
    throw new Error(`Project "${slug}" already exists`);
  } catch (err: unknown) {
    // ==================================
    if (err instanceof Error && err.message.includes("already exists")) throw err;
    // ======================
    // ENOENT is expected
  }

  await ensureDir(path.join(dir, "characters"));
  await ensureDir(path.join(dir, "keyframes"));

  const now = new Date().toISOString();
  const manifest: ProjectManifest = {
    id: slug,
    name,
    createdAt: now,
    updatedAt: now,
    durationSeconds: 120,
    intervalSeconds: 5,
    text: "",
    characters: [],
    provider: providerConfig ?? {
      image: { id: "gemini", model: "gemini-2.0-flash" },
      text: { id: "gemini", model: "gemini-2.5-flash" },
    },
    theme: "dark",
    scenes: [],
  };

  await fs.writeFile(manifestPath(slug), JSON.stringify(manifest, null, 2), "utf-8");
  return manifest;
}

// =============================================================================
// Function updates an existing project -> string, Partial to ProjectManifest
// =============================================================================
export async function updateProject(
  slug: string,
  data: Partial<ProjectManifest>,
): Promise<ProjectManifest> {
  /*
      updateProject : merges partial data into an existing project manifest
      slug variable : the project slug
      data variable : partial manifest data to merge
  */
  const existing = await getProject(slug);
  const updated: ProjectManifest = {
    ...existing,
    ...data,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };

  await fs.writeFile(manifestPath(slug), JSON.stringify(updated, null, 2), "utf-8");
  return updated;
}

// =============================================================================
// Function renames a project -> string, string to ProjectManifest
// =============================================================================
export async function renameProject(
  oldSlug: string,
  newName: string,
): Promise<ProjectManifest> {
  /*
      renameProject : renames a project directory and updates its manifest
      oldSlug variable : the current project slug
      newName variable : the new human-readable name
  */
  const newSlug = sanitizeSlug(newName);
  // ==================================
  if (!newSlug) throw new Error("Invalid project name — produces empty slug");

  const oldDir = projectDir(oldSlug);
  const newDir = projectDir(newSlug);
  assertPathContained(oldDir, getProjectsRoot());
  assertPathContained(newDir, getProjectsRoot());

  // ==================================
  if (newSlug !== oldSlug) {
    // =====================================
    // Check new name doesn't collide
    // =====================================
    try {
      await fs.access(newDir);
      throw new Error(`A project named "${newSlug}" already exists`);
    } catch (err: unknown) {
      // ==================================
      if (err instanceof Error && err.message.includes("already exists")) throw err;
    }
    await fs.rename(oldDir, newDir);
  }

  const manifest = await getProject(newSlug);
  const updated: ProjectManifest = {
    ...manifest,
    id: newSlug,
    name: newName,
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(manifestPath(newSlug), JSON.stringify(updated, null, 2), "utf-8");
  return updated;
}

// =============================================================================
// Function deletes a project -> string to void
// =============================================================================
export async function deleteProject(slug: string): Promise<void> {
  /*
      deleteProject : removes an entire project directory recursively
      slug variable : the project slug to delete
  */
  const dir = projectDir(slug);
  assertPathContained(dir, getProjectsRoot());
  await fs.rm(dir, { recursive: true, force: true });
}

// =============================================================================
// Function saves a character image to a project -> string, string, Buffer to string
// =============================================================================
export async function saveCharacterImage(
  slug: string,
  id: string,
  buffer: Buffer,
): Promise<string> {
  /*
      saveCharacterImage : writes a character image file to the project's characters dir
      slug variable : the project slug
      id variable : the character ID
      buffer variable : the raw image data
  */
  const dir = projectDir(slug);
  const charDir = path.resolve(dir, "characters");
  assertPathContained(charDir, getProjectsRoot());
  await ensureDir(charDir);

  const filePath = path.resolve(charDir, `${id}.png`);
  assertPathContained(filePath, getProjectsRoot());

  await fs.writeFile(filePath, buffer);
  return `characters/${id}.png`;
}

// =============================================================================
// Function reads a character image from a project -> string, string to Buffer
// =============================================================================
export async function readCharacterImage(
  slug: string,
  characterId: string,
): Promise<Buffer> {
  /*
      readCharacterImage : reads the character image file as a Buffer
      slug variable : the project slug
      characterId variable : the character ID
  */
  const dir = projectDir(slug);
  const filePath = path.resolve(dir, "characters", `${characterId}.png`);
  assertPathContained(filePath, getProjectsRoot());

  return fs.readFile(filePath);
}

// =============================================================================
// Function saves a keyframe image -> string, number, Buffer to string
// =============================================================================
export async function saveKeyframe(
  slug: string,
  sceneIndex: number,
  buffer: Buffer,
): Promise<string> {
  /*
      saveKeyframe : writes a keyframe image to the project's keyframes dir
      slug variable : the project slug
      sceneIndex variable : the 0-based scene index
      buffer variable : the raw image data
  */
  const dir = projectDir(slug);
  const kfDir = path.resolve(dir, "keyframes");
  assertPathContained(kfDir, getProjectsRoot());
  await ensureDir(kfDir);

  const filename = keyframeFilename(sceneIndex);
  const filePath = path.resolve(kfDir, filename);
  assertPathContained(filePath, getProjectsRoot());

  await fs.writeFile(filePath, buffer);
  return `keyframes/${filename}`;
}

// =============================================================================
// Function reads a keyframe image -> string, number to Buffer
// =============================================================================
export async function readKeyframe(
  slug: string,
  sceneIndex: number,
): Promise<Buffer> {
  /*
      readKeyframe : reads a keyframe image file as a Buffer
      slug variable : the project slug
      sceneIndex variable : the 0-based scene index
  */
  const dir = projectDir(slug);
  const filename = keyframeFilename(sceneIndex);
  const filePath = path.resolve(dir, "keyframes", filename);
  assertPathContained(filePath, getProjectsRoot());

  return fs.readFile(filePath);
}

// =============================================================================
// Function exports a project as a zip file -> string to Buffer
// =============================================================================
export async function exportProject(slug: string): Promise<Buffer> {
  /*
      exportProject : packages a project's prompts and keyframes into a zip
      slug variable : the project slug to export
  */
  const manifest = await getProject(slug);
  const dir = projectDir(slug);
  const zip = new JSZip();

  // =====================================
  // Add prompts.json
  // =====================================
  const prompts = manifest.scenes.map((s) => ({
    index: s.index,
    time_start: s.time_start,
    time_end: s.time_end,
    lyric_excerpt: s.lyric_excerpt,
    prompt: s.prompt,
    characters_used: s.characters_used,
    status: s.status,
    mode: s.mode,
  }));
  zip.file("prompts.json", JSON.stringify(prompts, null, 2));

  // =====================================
  // Add prompts.txt (human-readable)
  // =====================================
  const lines = manifest.scenes.map(
    (s) =>
      `[Scene ${s.index + 1}] ${s.time_start}s–${s.time_end}s\n` +
      `Lyric: ${s.lyric_excerpt}\n` +
      `Prompt: ${s.prompt}\n` +
      `Characters: ${s.characters_used.join(", ")}\n` +
      `Status: ${s.status}${s.mode ? ` (${s.mode})` : ""}`,
  );
  zip.file("prompts.txt", lines.join("\n\n"));

  // =====================================
  // Add keyframe images
  // =====================================
  const kfDir = path.resolve(dir, "keyframes");
  assertPathContained(kfDir, getProjectsRoot());

  try {
    const files = await fs.readdir(kfDir);
    for (const f of files) {
      // ==================================
      if (!f.endsWith(".png")) continue;
      const fp = path.resolve(kfDir, f);
      assertPathContained(fp, getProjectsRoot());
      const buf = await fs.readFile(fp);
      zip.file(`keyframes/${f}`, buf);
    }
  } catch {
    // ======================
    // keyframes dir may not exist yet
  }

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  return zipBuffer;
}

// =============================================================================
// Character Library (global, not per-project)
// =============================================================================

// =============================================================================
// Function reads the global library manifest -> void to LibraryCharacter[]
// =============================================================================
async function getLibraryManifest(): Promise<LibraryCharacter[]> {
  /*
      getLibraryManifest : reads library.json from the library directory
  */
  const root = getLibraryRoot();
  await ensureDir(root);
  const manifestFile = path.join(root, "library.json");
  try {
    const raw = await fs.readFile(manifestFile, "utf-8");
    return JSON.parse(raw) as LibraryCharacter[];
  } catch {
    return [];
  }
}

// =============================================================================
// Function writes the global library manifest -> LibraryCharacter[] to void
// =============================================================================
async function saveLibraryManifest(chars: LibraryCharacter[]): Promise<void> {
  /*
      saveLibraryManifest : writes updated library.json to disk
      chars variable : the full array of library characters
  */
  const root = getLibraryRoot();
  await ensureDir(root);
  await fs.writeFile(
    path.join(root, "library.json"),
    JSON.stringify(chars, null, 2),
    "utf-8",
  );
}

// =============================================================================
// Function lists all library characters -> void to LibraryCharacter[]
// =============================================================================
export async function listLibraryCharacters(): Promise<LibraryCharacter[]> {
  /*
      listLibraryCharacters : returns all characters in the global library
  */
  return getLibraryManifest();
}

// =============================================================================
// Function adds a character to the library -> Omit<LibraryCharacter> to LibraryCharacter
// =============================================================================
export async function addLibraryCharacter(
  char: Omit<LibraryCharacter, "createdAt">,
): Promise<LibraryCharacter> {
  /*
      addLibraryCharacter : appends a new character to the library
      char variable : the character data (without createdAt)
  */
  const chars = await getLibraryManifest();
  const entry: LibraryCharacter = { ...char, createdAt: new Date().toISOString() };
  chars.push(entry);
  await saveLibraryManifest(chars);
  return entry;
}

// =============================================================================
// Function removes a character from the library -> string to void
// =============================================================================
export async function removeLibraryCharacter(id: string): Promise<void> {
  /*
      removeLibraryCharacter : deletes a character and its image from the library
      id variable : the character ID to remove
  */
  const chars = await getLibraryManifest();
  const filtered = chars.filter((c) => c.id !== id);
  await saveLibraryManifest(filtered);
  const imgPath = path.join(getLibraryRoot(), "images", `${id}.png`);
  try { await fs.unlink(imgPath); } catch { /* may not exist */ }
}

// =============================================================================
// Function gets a single library character -> string to LibraryCharacter | null
// =============================================================================
export async function getLibraryCharacter(id: string): Promise<LibraryCharacter | null> {
  /*
      getLibraryCharacter : finds a character by ID in the library
      id variable : the character ID to look up
  */
  const chars = await getLibraryManifest();
  return chars.find((c) => c.id === id) ?? null;
}

// =============================================================================
// Function updates a library character -> string, updates to LibraryCharacter | null
// =============================================================================
export async function updateLibraryCharacter(
  id: string,
  updates: { label?: string; description?: string },
): Promise<LibraryCharacter | null> {
  /*
      updateLibraryCharacter : updates label/description for a library character
      id variable : the character ID
      updates variable : partial update object
  */
  const chars = await getLibraryManifest();
  const idx = chars.findIndex((c) => c.id === id);
  // ==================================
  if (idx === -1) return null;
  // ==================================
  if (updates.label !== undefined) chars[idx].label = updates.label;
  // ==================================
  if (updates.description !== undefined) chars[idx].description = updates.description;
  await saveLibraryManifest(chars);
  return chars[idx];
}

// =============================================================================
// Function saves a library character image -> string, Buffer to string
// =============================================================================
export async function saveLibraryCharacterImage(
  id: string,
  buffer: Buffer,
): Promise<string> {
  /*
      saveLibraryCharacterImage : writes a character image to the library images dir
      id variable : the character ID
      buffer variable : the raw image data
  */
  const imgDir = path.join(getLibraryRoot(), "images");
  await ensureDir(imgDir);
  const filePath = path.join(imgDir, `${id}.png`);
  await fs.writeFile(filePath, buffer);
  return `images/${id}.png`;
}

// =============================================================================
// Function reads a library character image -> string to Buffer
// =============================================================================
export async function readLibraryCharacterImage(id: string): Promise<Buffer> {
  /*
      readLibraryCharacterImage : reads a character image from the library
      id variable : the character ID
  */
  const filePath = path.join(getLibraryRoot(), "images", `${id}.png`);
  return fs.readFile(filePath);
}

// =============================================================================
// Session (scene generation workspace)
// =============================================================================

// =============================================================================
/*
    Session : a temporary scene generation workspace
*/
// =============================================================================
export interface Session {
  id: string;
  createdAt: string;
  characters: CharacterRef[];
  text: string;
  mode: "single" | "sequence";
  keyframeCount: number;
  scenes: SceneEntry[];
  provider: { image: { id: string; model: string }; text: { id: string; model: string } };
}

// =============================================================================
// Function resolves a session directory -> string to string
// =============================================================================
function sessionDir(id: string): string {
  /*
      sessionDir : returns the directory path for a session
      id variable : the session ID
  */
  return path.join(getProjectsRoot(), id);
}

// =============================================================================
// Function creates a new session -> session data to Session
// =============================================================================
export async function createSession(data: {
  characters: CharacterRef[];
  text: string;
  mode: "single" | "sequence";
  keyframeCount: number;
  provider: Session["provider"];
}): Promise<Session> {
  /*
      createSession : creates a new temporary session with character images
      data variable : the session creation data
  */
  const id = `session-${Date.now()}`;
  const dir = sessionDir(id);
  await ensureDir(path.join(dir, "keyframes"));
  await ensureDir(path.join(dir, "characters"));

  // =====================================
  // Copy character images from library into session
  // =====================================
  for (const char of data.characters) {
    // ==================================
    if (char.imagePath) {
      try {
        const libImg = await readLibraryCharacterImage(char.id);
        await fs.writeFile(path.join(dir, "characters", `${char.id}.png`), libImg);
        char.imagePath = `characters/${char.id}.png`;
      } catch { /* character may not have an image */ }
    }
  }

  const session: Session = {
    id,
    createdAt: new Date().toISOString(),
    ...data,
    scenes: [],
  };

  await fs.writeFile(
    path.join(dir, "manifest.json"),
    JSON.stringify(session, null, 2),
    "utf-8",
  );

  // =====================================
  // Write a ProjectManifest so existing API routes work
  // =====================================
  const manifest: ProjectManifest = {
    id,
    name: id,
    createdAt: session.createdAt,
    updatedAt: session.createdAt,
    durationSeconds: data.keyframeCount * 5,
    intervalSeconds: 5,
    text: data.text,
    characters: data.characters,
    provider: data.provider,
    theme: "dark",
    scenes: [],
  };
  await fs.writeFile(manifestPath(id), JSON.stringify(manifest, null, 2), "utf-8");

  return session;
}

// =============================================================================
// Function reads a session -> string to Session
// =============================================================================
export async function getSession(id: string): Promise<Session> {
  /*
      getSession : reads and parses a session's manifest
      id variable : the session ID
  */
  const dir = sessionDir(id);
  const raw = await fs.readFile(path.join(dir, "manifest.json"), "utf-8");
  return JSON.parse(raw) as Session;
}

// =============================================================================
// Function updates a session -> string, Partial to Session
// =============================================================================
export async function updateSession(id: string, data: Partial<Session>): Promise<Session> {
  /*
      updateSession : merges partial data into an existing session
      id variable : the session ID
      data variable : partial session data to merge
  */
  const existing = await getSession(id);
  const updated = { ...existing, ...data, id: existing.id, createdAt: existing.createdAt };
  await fs.writeFile(
    path.join(sessionDir(id), "manifest.json"),
    JSON.stringify(updated, null, 2),
    "utf-8",
  );
  return updated;
}

// =============================================================================
// Function lists saved export folders -> void to string[]
// =============================================================================
export async function listSavedFolders(): Promise<string[]> {
  /*
      listSavedFolders : returns the names of all saved export directories
  */
  const root = getSavedRoot();
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch {
    return [];
  }
}

// =============================================================================
// Function saves session keyframes to a named folder -> string, string to string
// =============================================================================
export async function saveSessionToFolder(
  sessionId: string,
  folderName: string,
): Promise<string> {
  /*
      saveSessionToFolder : copies keyframes and manifest to a named save folder
      sessionId variable : the session to save
      folderName variable : the destination folder name
  */
  const root = getSavedRoot();
  await ensureDir(root);
  const slug = sanitizeSlug(folderName) || `save-${Date.now()}`;
  const destDir = path.join(root, slug);
  await ensureDir(destDir);

  const srcDir = path.join(sessionDir(sessionId), "keyframes");
  try {
    const files = await fs.readdir(srcDir);
    for (const f of files) {
      // ==================================
      if (f.endsWith(".png") || f.endsWith(".jpg") || f.endsWith(".webp")) {
        await fs.copyFile(path.join(srcDir, f), path.join(destDir, f));
      }
    }
  } catch { /* keyframes dir may not exist */ }

  try {
    const manifestSrc = path.join(sessionDir(sessionId), "manifest.json");
    await fs.copyFile(manifestSrc, path.join(destDir, "manifest.json"));
  } catch { /* manifest may not exist */ }

  return destDir;
}

// =============================================================================
// Function deletes all keyframe images in a session -> string to void
// =============================================================================
export async function deleteSessionImages(sessionId: string): Promise<void> {
  /*
      deleteSessionImages : removes all files from a session's keyframes directory
      sessionId variable : the session ID
  */
  const kfDir = path.join(sessionDir(sessionId), "keyframes");
  try {
    const files = await fs.readdir(kfDir);
    for (const f of files) {
      await fs.unlink(path.join(kfDir, f));
    }
  } catch { /* may not exist */ }
}

// =============================================================================
// Reimagine Projects
// =============================================================================

// =============================================================================
// Function resolves a reimagine project directory -> string to string
// =============================================================================
function reimagineDir(slug: string): string {
  /*
      reimagineDir : resolves and validates the reimagine project directory
      slug variable : the project slug
  */
  const dir = path.resolve(getProjectsRoot(), slug);
  assertPathContained(dir, getProjectsRoot());
  return dir;
}

// =============================================================================
// Function resolves the reimagine manifest path -> string to string
// =============================================================================
function reimagineManifestPath(slug: string): string {
  /*
      reimagineManifestPath : resolves the manifest.json path for a reimagine project
      slug variable : the project slug
  */
  const p = path.resolve(reimagineDir(slug), "manifest.json");
  assertPathContained(p, getProjectsRoot());
  return p;
}

// =============================================================================
// Function generates a reimagine output filename -> number to string
// =============================================================================
function reimagineOutputFilename(index: number): string {
  /*
      reimagineOutputFilename : zero-padded output filename (index 0 -> reimagine-001.png)
      index variable : the 0-based entry index
  */
  return `reimagine-${String(index + 1).padStart(3, "0")}.png`;
}

// =============================================================================
// Function creates a new reimagine project -> string, config to ReimagineManifest
// =============================================================================
export async function createReimagineProject(
  name: string,
  providerConfig?: { image: { id: string; model: string }; text: { id: string; model: string } },
): Promise<ReimagineManifest> {
  /*
      createReimagineProject : creates a new reimagine project directory with manifest
      name variable : the project name
      providerConfig variable : optional provider configuration
  */
  const slug = sanitizeSlug(name) || `reimagine-${Date.now()}`;
  const dir = reimagineDir(slug);

  try {
    await fs.access(dir);
    throw new Error(`Project "${slug}" already exists`);
  } catch (err: unknown) {
    // ==================================
    if (err instanceof Error && err.message.includes("already exists")) throw err;
  }

  await ensureDir(path.join(dir, "sources"));
  await ensureDir(path.join(dir, "characters"));
  await ensureDir(path.join(dir, "style-ref"));
  await ensureDir(path.join(dir, "outputs"));

  const now = new Date().toISOString();
  const manifest: ReimagineManifest = {
    id: slug,
    name,
    createdAt: now,
    updatedAt: now,
    styleMode: "preset",
    characters: [],
    entries: [],
    provider: providerConfig ?? {
      image: { id: "gemini", model: "gemini-2.0-flash" },
      text: { id: "gemini", model: "gemini-2.5-flash" },
    },
  };

  await fs.writeFile(reimagineManifestPath(slug), JSON.stringify(manifest, null, 2), "utf-8");
  return manifest;
}

// =============================================================================
// Function lists all reimagine projects -> void to ReimagineManifest[]
// =============================================================================
export async function listReimagineProjects(): Promise<ReimagineManifest[]> {
  /*
      listReimagineProjects : scans projects dir for reimagine-type manifests
  */
  const root = getProjectsRoot();
  await ensureDir(root);
  const entries = await fs.readdir(root, { withFileTypes: true });
  const manifests: ReimagineManifest[] = [];
  for (const entry of entries) {
    // ==================================
    if (!entry.isDirectory()) continue;
    try {
      const raw = await fs.readFile(path.join(root, entry.name, "manifest.json"), "utf-8");
      const m = JSON.parse(raw);
      // ==================================
      if (m.styleMode !== undefined && m.entries !== undefined) {
        manifests.push(m as ReimagineManifest);
      }
    } catch { /* skip */ }
  }
  return manifests.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

// =============================================================================
// Function gets a reimagine project manifest -> string to ReimagineManifest
// =============================================================================
export async function getReimagineProject(slug: string): Promise<ReimagineManifest> {
  /*
      getReimagineProject : reads and parses a reimagine project's manifest
      slug variable : the project slug
  */
  const raw = await fs.readFile(reimagineManifestPath(slug), "utf-8");
  return JSON.parse(raw) as ReimagineManifest;
}

// =============================================================================
// Function updates a reimagine project -> string, Partial to ReimagineManifest
// =============================================================================
export async function updateReimagineProject(
  slug: string,
  data: Partial<ReimagineManifest>,
): Promise<ReimagineManifest> {
  /*
      updateReimagineProject : merges partial data into a reimagine manifest
      slug variable : the project slug
      data variable : partial manifest data to merge
  */
  const existing = await getReimagineProject(slug);
  const updated: ReimagineManifest = {
    ...existing,
    ...data,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(reimagineManifestPath(slug), JSON.stringify(updated, null, 2), "utf-8");
  return updated;
}

// =============================================================================
// Function deletes a reimagine project -> string to void
// =============================================================================
export async function deleteReimagineProject(slug: string): Promise<void> {
  /*
      deleteReimagineProject : removes a reimagine project directory
      slug variable : the project slug
  */
  const dir = reimagineDir(slug);
  assertPathContained(dir, getProjectsRoot());
  await fs.rm(dir, { recursive: true, force: true });
}

// =============================================================================
// Function merges two reimagine projects -> string, string to ReimagineManifest
// =============================================================================
export async function mergeReimagineProjects(
  targetSlug: string,
  sourceSlug: string,
): Promise<ReimagineManifest> {
  /*
      mergeReimagineProjects : copies entries and characters from source into target
      targetSlug variable : the target project slug
      sourceSlug variable : the source project slug to merge from
  */
  const target = await getReimagineProject(targetSlug);
  const source = await getReimagineProject(sourceSlug);

  const existingIds = new Set(target.entries.map((e) => e.sourceImageId));
  let nextIndex = target.entries.length;

  for (const entry of source.entries) {
    // ==================================
    if (existingIds.has(entry.sourceImageId)) continue;
    const srcBuffer = await readReimagineSource(sourceSlug, entry.sourceImageId);
    await saveReimagineSource(targetSlug, entry.sourceImageId, srcBuffer);

    const newIndex = nextIndex++;
    let outputImagePath: string | null = null;
    let status = entry.status;

    // ==================================
    if (entry.status === "done" && entry.outputImagePath) {
      try {
        const outBuffer = await readReimagineOutput(sourceSlug, entry.index);
        outputImagePath = await saveReimagineOutput(targetSlug, newIndex, outBuffer);
      } catch {
        status = "pending";
      }
    }

    target.entries.push({
      ...entry,
      index: newIndex,
      status,
      outputImagePath,
      error: undefined,
    });
  }

  // =====================================
  // Merge characters — add any from source that don't exist in target (by label)
  // =====================================
  const existingCharLabels = new Set(target.characters.map((c) => c.label.toLowerCase()));
  for (const char of source.characters) {
    // ==================================
    if (existingCharLabels.has(char.label.toLowerCase())) continue;
    // ==================================
    if (char.referenceImagePath) {
      try {
        const charImg = await readReimagineCharRef(sourceSlug, char.id);
        await saveReimagineCharRef(targetSlug, char.id, charImg);
      } catch { /* skip */ }
    }
    target.characters.push(char);
    existingCharLabels.add(char.label.toLowerCase());
  }

  return updateReimagineProject(targetSlug, {
    entries: target.entries,
    characters: target.characters,
  });
}

// =============================================================================
// Function saves a reimagine source image -> string, string, Buffer to string
// =============================================================================
export async function saveReimagineSource(slug: string, id: string, buffer: Buffer): Promise<string> {
  /*
      saveReimagineSource : writes a source image to the sources directory
      slug variable : the project slug
      id variable : the source image ID
      buffer variable : the raw image data
  */
  const dir = reimagineDir(slug);
  const srcDir = path.resolve(dir, "sources");
  assertPathContained(srcDir, getProjectsRoot());
  await ensureDir(srcDir);
  const filePath = path.resolve(srcDir, `${id}.png`);
  assertPathContained(filePath, getProjectsRoot());
  await fs.writeFile(filePath, buffer);
  return `sources/${id}.png`;
}

// =============================================================================
// Function reads a reimagine source image -> string, string to Buffer
// =============================================================================
export async function readReimagineSource(slug: string, id: string): Promise<Buffer> {
  /*
      readReimagineSource : reads a source image from the project
      slug variable : the project slug
      id variable : the source image ID
  */
  const dir = reimagineDir(slug);
  const filePath = path.resolve(dir, "sources", `${id}.png`);
  assertPathContained(filePath, getProjectsRoot());
  return fs.readFile(filePath);
}

// =============================================================================
// Function saves a reimagine character reference image -> string, string, Buffer to string
// =============================================================================
export async function saveReimagineCharRef(slug: string, id: string, buffer: Buffer): Promise<string> {
  /*
      saveReimagineCharRef : writes a character reference image
      slug variable : the project slug
      id variable : the character ID
      buffer variable : the raw image data
  */
  const dir = reimagineDir(slug);
  const charDir = path.resolve(dir, "characters");
  assertPathContained(charDir, getProjectsRoot());
  await ensureDir(charDir);
  const filePath = path.resolve(charDir, `${id}.png`);
  assertPathContained(filePath, getProjectsRoot());
  await fs.writeFile(filePath, buffer);
  return `characters/${id}.png`;
}

// =============================================================================
// Function reads a reimagine character reference image -> string, string to Buffer
// =============================================================================
export async function readReimagineCharRef(slug: string, id: string): Promise<Buffer> {
  /*
      readReimagineCharRef : reads a character reference image
      slug variable : the project slug
      id variable : the character ID
  */
  const dir = reimagineDir(slug);
  const filePath = path.resolve(dir, "characters", `${id}.png`);
  assertPathContained(filePath, getProjectsRoot());
  return fs.readFile(filePath);
}

// =============================================================================
// Function saves a reimagine output image -> string, number, Buffer to string
// =============================================================================
export async function saveReimagineOutput(slug: string, index: number, buffer: Buffer): Promise<string> {
  /*
      saveReimagineOutput : writes an output image to the outputs directory
      slug variable : the project slug
      index variable : the 0-based entry index
      buffer variable : the raw image data
  */
  const dir = reimagineDir(slug);
  const outDir = path.resolve(dir, "outputs");
  assertPathContained(outDir, getProjectsRoot());
  await ensureDir(outDir);
  const filename = reimagineOutputFilename(index);
  const filePath = path.resolve(outDir, filename);
  assertPathContained(filePath, getProjectsRoot());
  await fs.writeFile(filePath, buffer);
  return `outputs/${filename}`;
}

// =============================================================================
// Function reads a reimagine output image -> string, number to Buffer
// =============================================================================
export async function readReimagineOutput(slug: string, index: number): Promise<Buffer> {
  /*
      readReimagineOutput : reads an output image from the project
      slug variable : the project slug
      index variable : the 0-based entry index
  */
  const dir = reimagineDir(slug);
  const filename = reimagineOutputFilename(index);
  const filePath = path.resolve(dir, "outputs", filename);
  assertPathContained(filePath, getProjectsRoot());
  return fs.readFile(filePath);
}

// =============================================================================
// Function saves a reimagine style reference image -> string, Buffer to string
// =============================================================================
export async function saveReimagineStyleRef(slug: string, buffer: Buffer): Promise<string> {
  /*
      saveReimagineStyleRef : writes the style reference image
      slug variable : the project slug
      buffer variable : the raw image data
  */
  const dir = reimagineDir(slug);
  const refDir = path.resolve(dir, "style-ref");
  assertPathContained(refDir, getProjectsRoot());
  await ensureDir(refDir);
  const filePath = path.resolve(refDir, "ref.png");
  assertPathContained(filePath, getProjectsRoot());
  await fs.writeFile(filePath, buffer);
  return "style-ref/ref.png";
}

// =============================================================================
// Function reads a reimagine style reference image -> string to Buffer
// =============================================================================
export async function readReimagineStyleRef(slug: string): Promise<Buffer> {
  /*
      readReimagineStyleRef : reads the style reference image
      slug variable : the project slug
  */
  const dir = reimagineDir(slug);
  const filePath = path.resolve(dir, "style-ref", "ref.png");
  assertPathContained(filePath, getProjectsRoot());
  return fs.readFile(filePath);
}

// =============================================================================
// Function saves reimagine outputs to a named folder -> string, string to string
// =============================================================================
export async function saveReimagineToFolder(
  slug: string,
  folderName: string,
): Promise<string> {
  /*
      saveReimagineToFolder : copies output images to a named save folder
      slug variable : the project slug
      folderName variable : the destination folder name
  */
  const root = getSavedRoot();
  await ensureDir(root);
  const destSlug = sanitizeSlug(folderName) || `save-${Date.now()}`;
  const destDir = path.join(root, destSlug);
  await ensureDir(destDir);

  const outDir = path.resolve(reimagineDir(slug), "outputs");
  assertPathContained(outDir, getProjectsRoot());
  try {
    const files = await fs.readdir(outDir);
    for (const f of files) {
      // ==================================
      if (f.endsWith(".png") || f.endsWith(".jpg") || f.endsWith(".webp")) {
        await fs.copyFile(path.join(outDir, f), path.join(destDir, f));
      }
    }
  } catch { /* outputs dir may not exist */ }

  return destDir;
}

// =============================================================================
// =============================================================================
