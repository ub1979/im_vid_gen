// =============================================================================
// '''
// Modifying it on 2026-07-11
//
// Security : input validation, path containment, header redaction,
//            and magic byte verification for uploads.
//
// done by : main git
//
// '''
// =============================================================================

// =============================================================================
// Importing the libraries
import path from "node:path";
// =============================================================================

// =============================================================================
// Constants
// =============================================================================
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_PROMPT_LENGTH = 8192; // 8 KB

// =============================================================================
// Function sanitizes a name into a URL-safe slug -> string to string
// =============================================================================
export function sanitizeSlug(name: string): string {
  /*
      sanitizeSlug : converts a human-readable name to a lowercase URL slug
      name variable : the raw name to sanitize
  */
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

// =============================================================================
// Function asserts a path is within a root directory -> string, string to void
// =============================================================================
export function assertPathContained(
  resolvedPath: string,
  root: string,
): void {
  /*
      assertPathContained : throws if resolvedPath escapes root (path traversal)
      resolvedPath variable : the path to check
      root variable : the allowed root directory
  */
  const absPath = path.resolve(resolvedPath);
  const absRoot = path.resolve(root);

  // ==================================
  if (absPath !== absRoot && !absPath.startsWith(absRoot + path.sep)) {
    throw new Error(
      `Path traversal blocked: ${absPath} is outside ${absRoot}`,
    );
  }
}

// =============================================================================
// Sensitive header names
// =============================================================================
const SENSITIVE_HEADERS = new Set([
  "x-provider-key",
  "authorization",
]);

// =============================================================================
// Function redacts sensitive headers from a record -> Record to Record
// =============================================================================
export function redactHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  /*
      redactHeaders : replaces values of sensitive headers with [REDACTED]
      headers variable : the original headers object
  */
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    // ==================================
    if (SENSITIVE_HEADERS.has(key.toLowerCase())) {
      result[key] = "[REDACTED]";
    // ==================================
    } else {
      result[key] = value;
    }
  }
  return result;
}

// =============================================================================
// Magic byte definitions for image format detection
// =============================================================================
const MAGIC: { bytes: number[]; offset: number; mime: string }[] = [
  { bytes: [0x89, 0x50, 0x4e, 0x47], offset: 0, mime: "image/png" },
  { bytes: [0xff, 0xd8, 0xff], offset: 0, mime: "image/jpeg" },
];

const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

// =============================================================================
// Function validates image format via magic bytes -> Buffer to string | null
// =============================================================================
export function validateMagicBytes(buffer: Buffer): string | null {
  /*
      validateMagicBytes : checks file header bytes to determine image MIME type
      buffer variable : the raw file buffer to inspect
  */
  for (const { bytes, offset, mime } of MAGIC) {
    // ==================================
    if (buffer.length >= offset + bytes.length) {
      const match = bytes.every((b, i) => buffer[offset + i] === b);
      // ==================================
      if (match) return mime;
    }
  }

  // =====================================
  // WebP check: bytes 0-3 must be RIFF, bytes 8-11 must be WEBP
  // =====================================
  // ==================================
  if (buffer.length >= 12) {
    const isRiff = RIFF.every((b, i) => buffer[i] === b);
    const isWebp = WEBP.every((b, i) => buffer[8 + i] === b);
    // ==================================
    if (isRiff && isWebp) return "image/webp";
  }

  return null;
}

// =============================================================================
// =============================================================================
