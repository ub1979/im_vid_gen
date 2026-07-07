import path from "node:path";

// ---- Constants ----

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_PROMPT_LENGTH = 8192; // 8 KB

// ---- Slug ----

export function sanitizeSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

// ---- Path containment ----

export function assertPathContained(
  resolvedPath: string,
  root: string,
): void {
  const absPath = path.resolve(resolvedPath);
  const absRoot = path.resolve(root);

  if (absPath !== absRoot && !absPath.startsWith(absRoot + path.sep)) {
    throw new Error(
      `Path traversal blocked: ${absPath} is outside ${absRoot}`,
    );
  }
}

// ---- Header redaction ----

const SENSITIVE_HEADERS = new Set([
  "x-provider-key",
  "authorization",
]);

export function redactHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    result[key] = SENSITIVE_HEADERS.has(key.toLowerCase())
      ? "[REDACTED]"
      : value;
  }
  return result;
}

// ---- Magic bytes ----

const MAGIC: { bytes: number[]; offset: number; mime: string }[] = [
  { bytes: [0x89, 0x50, 0x4e, 0x47], offset: 0, mime: "image/png" },
  { bytes: [0xff, 0xd8, 0xff], offset: 0, mime: "image/jpeg" },
];

// WebP: RIFF at bytes 0-3 and WEBP at bytes 8-11
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

export function validateMagicBytes(buffer: Buffer): string | null {
  for (const { bytes, offset, mime } of MAGIC) {
    if (buffer.length >= offset + bytes.length) {
      const match = bytes.every((b, i) => buffer[offset + i] === b);
      if (match) return mime;
    }
  }

  // WebP check: bytes 0-3 must be RIFF, bytes 8-11 must be WEBP
  if (buffer.length >= 12) {
    const isRiff = RIFF.every((b, i) => buffer[i] === b);
    const isWebp = WEBP.every((b, i) => buffer[8 + i] === b);
    if (isRiff && isWebp) return "image/webp";
  }

  return null;
}
