// src/lib/utils.js
/** Join class names, skipping falsy ones. */
export function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

/** 1536 → "1.5 KB", 2_400_000 → "2.29 MB" */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

const bnDigits = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

/** "2026" → "২০২৬" */
export function toBanglaDigits(value) {
  return String(value).replace(/[0-9]/g, (d) => bnDigits[Number(d)]);
}

/** "২০২৬" → "2026" (also accepts mixed input) */
export function fromBanglaDigits(value) {
  return String(value).replace(/[০-৯]/g, (d) => String(bnDigits.indexOf(d)));
}

/** Clamp a number between min and max. */
export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/** Make a safe file name: "Rahim Uddin" → "rahim-uddin" */
export function fileSlug(text, fallback = "file") {
  const s = String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ঀ-৿]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || fallback;
}
