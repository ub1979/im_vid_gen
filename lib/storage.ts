import path from "node:path";
import fs from "node:fs/promises";
import JSZip from "jszip";
import { sanitizeSlug, assertPathContained } from "./security";
import type { ProjectManifest, CharacterRef, SceneEntry, LibraryCharacter, ReimagineManifest } from "./types";

// ---- Roots ----

export function getProjectsRoot(): string {
  return path.join(process.cwd(), "projects");
}

export function getLibraryRoot(): string {
  return path.join(process.cwd(), "library");
}

export function getSavedRoot(): string {
  return path.join(process.cwd(), "saved");
}

// ---- Helpers ----

function projectDir(slug: string): string {
  const dir = path.resolve(getProjectsRoot(), slug);
  assertPathContained(dir, getProjectsRoot());
  return dir;
}

function manifestPath(slug: string): string {
  const p = path.resolve(projectDir(slug), "manifest.json");
  assertPathContained(p, getProjectsRoot());
  return p;
}

/** Zero-padded 3-digit, 1-indexed filename: index 0 → scene-001.png */
function keyframeFilename(sceneIndex: number): string {
  return `scene-${String(sceneIndex + 1).padStart(3, "0")}.png`;
}

// ---- Ensure directories ----

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

// ---- List projects ----

export async function listProjects(): Promise<ProjectManifest[]> {
  const root = getProjectsRoot();
  await ensureDir(root);

  const entries = await fs.readdir(root, { withFileTypes: true });
  const manifests: ProjectManifest[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const m = await getProject(entry.name);
      manifests.push(m);
    } catch {
      // skip directories without valid manifests
    }
  }

  return manifests;
}

// ---- Get project ----

export async function getProject(slug: string): Promise<ProjectManifest> {
  const mp = manifestPath(slug);
  const raw = await fs.readFile(mp, "utf-8");
  return JSON.parse(raw) as ProjectManifest;
}

// ---- Create project ----

export async function createProject(
  name: string,
  providerConfig?: { image: { id: string; model: string }; text: { id: string; model: string } },
): Promise<ProjectManifest> {
  const slug = sanitizeSlug(name);
  if (!slug) throw new Error("Invalid project name — produces empty slug");

  const dir = projectDir(slug);
  assertPathContained(dir, getProjectsRoot());

  // Fail if already exists
  try {
    await fs.access(dir);
    throw new Error(`Project "${slug}" already exists`);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("already exists")) throw err;
    // ENOENT is expected — directory doesn't exist yet
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

// ---- Update project ----

export async function updateProject(
  slug: string,
  data: Partial<ProjectManifest>,
): Promise<ProjectManifest> {
  const existing = await getProject(slug);
  const updated: ProjectManifest = {
    ...existing,
    ...data,
    id: existing.id, // never allow overwriting the id
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };

  await fs.writeFile(manifestPath(slug), JSON.stringify(updated, null, 2), "utf-8");
  return updated;
}

// ---- Rename project ----

export async function renameProject(
  oldSlug: string,
  newName: string,
): Promise<ProjectManifest> {
  const newSlug = sanitizeSlug(newName);
  if (!newSlug) throw new Error("Invalid project name — produces empty slug");

  const oldDir = projectDir(oldSlug);
  const newDir = projectDir(newSlug);
  assertPathContained(oldDir, getProjectsRoot());
  assertPathContained(newDir, getProjectsRoot());

  if (newSlug !== oldSlug) {
    // Check new name doesn't collide
    try {
      await fs.access(newDir);
      throw new Error(`A project named "${newSlug}" already exists`);
    } catch (err: unknown) {
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

// ---- Delete project ----

export async function deleteProject(slug: string): Promise<void> {
  const dir = projectDir(slug);
  assertPathContained(dir, getProjectsRoot());
  await fs.rm(dir, { recursive: true, force: true });
}

// ---- Character images ----

export async function saveCharacterImage(
  slug: string,
  id: string,
  buffer: Buffer,
): Promise<string> {
  const dir = projectDir(slug);
  const charDir = path.resolve(dir, "characters");
  assertPathContained(charDir, getProjectsRoot());
  await ensureDir(charDir);

  const filePath = path.resolve(charDir, `${id}.png`);
  assertPathContained(filePath, getProjectsRoot());

  await fs.writeFile(filePath, buffer);
  return `characters/${id}.png`;
}

export async function readCharacterImage(
  slug: string,
  characterId: string,
): Promise<Buffer> {
  const dir = projectDir(slug);
  const filePath = path.resolve(dir, "characters", `${characterId}.png`);
  assertPathContained(filePath, getProjectsRoot());

  return fs.readFile(filePath);
}

// ---- Keyframes ----

export async function saveKeyframe(
  slug: string,
  sceneIndex: number,
  buffer: Buffer,
): Promise<string> {
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

export async function readKeyframe(
  slug: string,
  sceneIndex: number,
): Promise<Buffer> {
  const dir = projectDir(slug);
  const filename = keyframeFilename(sceneIndex);
  const filePath = path.resolve(dir, "keyframes", filename);
  assertPathContained(filePath, getProjectsRoot());

  return fs.readFile(filePath);
}

// ---- Export ----

export async function exportProject(slug: string): Promise<Buffer> {
  const manifest = await getProject(slug);
  const dir = projectDir(slug);
  const zip = new JSZip();

  // Add prompts.json
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

  // Add prompts.txt (human-readable)
  const lines = manifest.scenes.map(
    (s) =>
      `[Scene ${s.index + 1}] ${s.time_start}s–${s.time_end}s\n` +
      `Lyric: ${s.lyric_excerpt}\n` +
      `Prompt: ${s.prompt}\n` +
      `Characters: ${s.characters_used.join(", ")}\n` +
      `Status: ${s.status}${s.mode ? ` (${s.mode})` : ""}`,
  );
  zip.file("prompts.txt", lines.join("\n\n"));

  // Add keyframe images
  const kfDir = path.resolve(dir, "keyframes");
  assertPathContained(kfDir, getProjectsRoot());

  try {
    const files = await fs.readdir(kfDir);
    for (const f of files) {
      if (!f.endsWith(".png")) continue;
      const fp = path.resolve(kfDir, f);
      assertPathContained(fp, getProjectsRoot());
      const buf = await fs.readFile(fp);
      zip.file(`keyframes/${f}`, buf);
    }
  } catch {
    // keyframes dir may not exist yet
  }

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  return zipBuffer;
}

// ---- Character Library (global, not per-project) ----

async function getLibraryManifest(): Promise<LibraryCharacter[]> {
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

async function saveLibraryManifest(chars: LibraryCharacter[]): Promise<void> {
  const root = getLibraryRoot();
  await ensureDir(root);
  await fs.writeFile(
    path.join(root, "library.json"),
    JSON.stringify(chars, null, 2),
    "utf-8",
  );
}

export async function listLibraryCharacters(): Promise<LibraryCharacter[]> {
  return getLibraryManifest();
}

export async function addLibraryCharacter(
  char: Omit<LibraryCharacter, "createdAt">,
): Promise<LibraryCharacter> {
  const chars = await getLibraryManifest();
  const entry: LibraryCharacter = { ...char, createdAt: new Date().toISOString() };
  chars.push(entry);
  await saveLibraryManifest(chars);
  return entry;
}

export async function removeLibraryCharacter(id: string): Promise<void> {
  const chars = await getLibraryManifest();
  const filtered = chars.filter((c) => c.id !== id);
  await saveLibraryManifest(filtered);
  const imgPath = path.join(getLibraryRoot(), "images", `${id}.png`);
  try { await fs.unlink(imgPath); } catch { /* may not exist */ }
}

export async function getLibraryCharacter(id: string): Promise<LibraryCharacter | null> {
  const chars = await getLibraryManifest();
  return chars.find((c) => c.id === id) ?? null;
}

export async function updateLibraryCharacter(
  id: string,
  updates: { label?: string; description?: string },
): Promise<LibraryCharacter | null> {
  const chars = await getLibraryManifest();
  const idx = chars.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  if (updates.label !== undefined) chars[idx].label = updates.label;
  if (updates.description !== undefined) chars[idx].description = updates.description;
  await saveLibraryManifest(chars);
  return chars[idx];
}

export async function saveLibraryCharacterImage(
  id: string,
  buffer: Buffer,
): Promise<string> {
  const imgDir = path.join(getLibraryRoot(), "images");
  await ensureDir(imgDir);
  const filePath = path.join(imgDir, `${id}.png`);
  await fs.writeFile(filePath, buffer);
  return `images/${id}.png`;
}

export async function readLibraryCharacterImage(id: string): Promise<Buffer> {
  const filePath = path.join(getLibraryRoot(), "images", `${id}.png`);
  return fs.readFile(filePath);
}

// ---- Session (scene generation workspace) ----

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

function sessionDir(id: string): string {
  return path.join(getProjectsRoot(), id);
}

export async function createSession(data: {
  characters: CharacterRef[];
  text: string;
  mode: "single" | "sequence";
  keyframeCount: number;
  provider: Session["provider"];
}): Promise<Session> {
  const id = `session-${Date.now()}`;
  const dir = sessionDir(id);
  await ensureDir(path.join(dir, "keyframes"));
  await ensureDir(path.join(dir, "characters"));

  // Copy character images from library into session
  for (const char of data.characters) {
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

  // Also write a ProjectManifest so existing API routes work
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

export async function getSession(id: string): Promise<Session> {
  const dir = sessionDir(id);
  const raw = await fs.readFile(path.join(dir, "manifest.json"), "utf-8");
  return JSON.parse(raw) as Session;
}

export async function updateSession(id: string, data: Partial<Session>): Promise<Session> {
  const existing = await getSession(id);
  const updated = { ...existing, ...data, id: existing.id, createdAt: existing.createdAt };
  await fs.writeFile(
    path.join(sessionDir(id), "manifest.json"),
    JSON.stringify(updated, null, 2),
    "utf-8",
  );
  return updated;
}

// ---- Save session to named folder ----

export async function listSavedFolders(): Promise<string[]> {
  const root = getSavedRoot();
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch {
    return [];
  }
}

export async function saveSessionToFolder(
  sessionId: string,
  folderName: string,
): Promise<string> {
  const root = getSavedRoot();
  await ensureDir(root);
  const slug = sanitizeSlug(folderName) || `save-${Date.now()}`;
  const destDir = path.join(root, slug);
  await ensureDir(destDir);

  const srcDir = path.join(sessionDir(sessionId), "keyframes");
  try {
    const files = await fs.readdir(srcDir);
    for (const f of files) {
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

export async function deleteSessionImages(sessionId: string): Promise<void> {
  const kfDir = path.join(sessionDir(sessionId), "keyframes");
  try {
    const files = await fs.readdir(kfDir);
    for (const f of files) {
      await fs.unlink(path.join(kfDir, f));
    }
  } catch { /* may not exist */ }
}

// ---- Reimagine Projects ----

function reimagineDir(slug: string): string {
  const dir = path.resolve(getProjectsRoot(), slug);
  assertPathContained(dir, getProjectsRoot());
  return dir;
}

function reimagineManifestPath(slug: string): string {
  const p = path.resolve(reimagineDir(slug), "manifest.json");
  assertPathContained(p, getProjectsRoot());
  return p;
}

function reimagineOutputFilename(index: number): string {
  return `reimagine-${String(index + 1).padStart(3, "0")}.png`;
}

export async function createReimagineProject(
  name: string,
  providerConfig?: { image: { id: string; model: string }; text: { id: string; model: string } },
): Promise<ReimagineManifest> {
  const slug = sanitizeSlug(name) || `reimagine-${Date.now()}`;
  const dir = reimagineDir(slug);

  try {
    await fs.access(dir);
    throw new Error(`Project "${slug}" already exists`);
  } catch (err: unknown) {
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

export async function listReimagineProjects(): Promise<ReimagineManifest[]> {
  const root = getProjectsRoot();
  await ensureDir(root);
  const entries = await fs.readdir(root, { withFileTypes: true });
  const manifests: ReimagineManifest[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const raw = await fs.readFile(path.join(root, entry.name, "manifest.json"), "utf-8");
      const m = JSON.parse(raw);
      if (m.styleMode !== undefined && m.entries !== undefined) {
        manifests.push(m as ReimagineManifest);
      }
    } catch { /* skip */ }
  }
  return manifests.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getReimagineProject(slug: string): Promise<ReimagineManifest> {
  const raw = await fs.readFile(reimagineManifestPath(slug), "utf-8");
  return JSON.parse(raw) as ReimagineManifest;
}

export async function updateReimagineProject(
  slug: string,
  data: Partial<ReimagineManifest>,
): Promise<ReimagineManifest> {
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

export async function deleteReimagineProject(slug: string): Promise<void> {
  const dir = reimagineDir(slug);
  assertPathContained(dir, getProjectsRoot());
  await fs.rm(dir, { recursive: true, force: true });
}

export async function mergeReimagineProjects(
  targetSlug: string,
  sourceSlug: string,
): Promise<ReimagineManifest> {
  const target = await getReimagineProject(targetSlug);
  const source = await getReimagineProject(sourceSlug);

  const existingIds = new Set(target.entries.map((e) => e.sourceImageId));
  let nextIndex = target.entries.length;

  for (const entry of source.entries) {
    if (existingIds.has(entry.sourceImageId)) continue;
    const srcBuffer = await readReimagineSource(sourceSlug, entry.sourceImageId);
    await saveReimagineSource(targetSlug, entry.sourceImageId, srcBuffer);

    const newIndex = nextIndex++;
    let outputImagePath: string | null = null;
    let status = entry.status;

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

  // Merge characters — add any from source that don't exist in target (by label)
  const existingCharLabels = new Set(target.characters.map((c) => c.label.toLowerCase()));
  for (const char of source.characters) {
    if (existingCharLabels.has(char.label.toLowerCase())) continue;
    // Copy character reference image if it exists
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

export async function saveReimagineSource(slug: string, id: string, buffer: Buffer): Promise<string> {
  const dir = reimagineDir(slug);
  const srcDir = path.resolve(dir, "sources");
  assertPathContained(srcDir, getProjectsRoot());
  await ensureDir(srcDir);
  const filePath = path.resolve(srcDir, `${id}.png`);
  assertPathContained(filePath, getProjectsRoot());
  await fs.writeFile(filePath, buffer);
  return `sources/${id}.png`;
}

export async function readReimagineSource(slug: string, id: string): Promise<Buffer> {
  const dir = reimagineDir(slug);
  const filePath = path.resolve(dir, "sources", `${id}.png`);
  assertPathContained(filePath, getProjectsRoot());
  return fs.readFile(filePath);
}

export async function saveReimagineCharRef(slug: string, id: string, buffer: Buffer): Promise<string> {
  const dir = reimagineDir(slug);
  const charDir = path.resolve(dir, "characters");
  assertPathContained(charDir, getProjectsRoot());
  await ensureDir(charDir);
  const filePath = path.resolve(charDir, `${id}.png`);
  assertPathContained(filePath, getProjectsRoot());
  await fs.writeFile(filePath, buffer);
  return `characters/${id}.png`;
}

export async function readReimagineCharRef(slug: string, id: string): Promise<Buffer> {
  const dir = reimagineDir(slug);
  const filePath = path.resolve(dir, "characters", `${id}.png`);
  assertPathContained(filePath, getProjectsRoot());
  return fs.readFile(filePath);
}

export async function saveReimagineOutput(slug: string, index: number, buffer: Buffer): Promise<string> {
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

export async function readReimagineOutput(slug: string, index: number): Promise<Buffer> {
  const dir = reimagineDir(slug);
  const filename = reimagineOutputFilename(index);
  const filePath = path.resolve(dir, "outputs", filename);
  assertPathContained(filePath, getProjectsRoot());
  return fs.readFile(filePath);
}

export async function saveReimagineStyleRef(slug: string, buffer: Buffer): Promise<string> {
  const dir = reimagineDir(slug);
  const refDir = path.resolve(dir, "style-ref");
  assertPathContained(refDir, getProjectsRoot());
  await ensureDir(refDir);
  const filePath = path.resolve(refDir, "ref.png");
  assertPathContained(filePath, getProjectsRoot());
  await fs.writeFile(filePath, buffer);
  return "style-ref/ref.png";
}

export async function readReimagineStyleRef(slug: string): Promise<Buffer> {
  const dir = reimagineDir(slug);
  const filePath = path.resolve(dir, "style-ref", "ref.png");
  assertPathContained(filePath, getProjectsRoot());
  return fs.readFile(filePath);
}

export async function saveReimagineToFolder(
  slug: string,
  folderName: string,
): Promise<string> {
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
      if (f.endsWith(".png") || f.endsWith(".jpg") || f.endsWith(".webp")) {
        await fs.copyFile(path.join(outDir, f), path.join(destDir, f));
      }
    }
  } catch { /* outputs dir may not exist */ }

  return destDir;
}
