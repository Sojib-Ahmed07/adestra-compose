// src/lib/bangla/ocr.js
// Image → text in the browser with tesseract.js. Engine and language files are served from /vendor/tesseract
// (copied by scripts/copy-vendor.mjs), so nothing is sent to the internet.

export const ocrLanguages = {
  "ben+eng": "Bangla + English",
  ben: "Bangla only",
  eng: "English only",
};

let current = null; // { langs, worker }
let logger = () => {};

/**
 * One worker, reused while the language stays the same.
 * @param {keyof typeof ocrLanguages} langs
 */
async function getWorker(langs) {
  if (current?.langs === langs) return current.worker;
  if (current) await current.worker.terminate().catch(() => {});
  const { createWorker, OEM } = await import("tesseract.js");
  const base = `${window.location.origin}/vendor/tesseract`;
  const worker = await createWorker(langs.split("+"), OEM.LSTM_ONLY, {
    workerPath: `${base}/worker.min.js`,
    corePath: `${base}/core`,
    langPath: `${base}/lang`,
    workerBlobURL: false,
    gzip: true,
    cacheMethod: "write", // keep the language files in the browser after the first use
    logger: (m) => logger(m),
  });
  current = { langs, worker };
  return worker;
}

/**
 * Read the text in one image.
 * @param {HTMLCanvasElement | Blob} image
 * @param {keyof typeof ocrLanguages} langs
 * @param {(status: string, progress: number) => void} [onProgress]  progress 0–1
 * @returns {Promise<{ text: string, confidence: number }>}
 */
export async function recognize(image, langs, onProgress) {
  logger = (m) => onProgress?.(statusLabel(m.status), m.progress ?? 0);
  try {
    const worker = await getWorker(langs);
    const { data } = await worker.recognize(image);
    return { text: tidy(data.text), confidence: Math.round(data.confidence ?? 0) };
  } finally {
    logger = () => {};
  }
}

/** Free the worker (call when leaving the tool). */
export async function stopOcr() {
  if (current) {
    const w = current.worker;
    current = null;
    await w.terminate().catch(() => {});
  }
}

function statusLabel(s = "") {
  if (s.includes("loading tesseract core")) return "Starting the reader";
  if (s.includes("loading language") || s.includes("loaded language")) return "Loading language files";
  if (s.includes("initializ")) return "Getting ready";
  if (s.includes("recognizing")) return "Reading text";
  return s ? s[0].toUpperCase() + s.slice(1) : "Working";
}

/** Clean up OCR output: trim lines, keep paragraph breaks, Bangla full stop spacing. */
function tidy(text) {
  return String(text || "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ +।/g, "।")
    .trim();
}

/**
 * Make a photo easier to read: grey, stronger contrast, and enlarged if small.
 * @param {HTMLCanvasElement} src
 */
export function enhanceForOcr(src) {
  const scale = Math.max(1, Math.min(2.5, 1800 / Math.max(src.width, src.height)));
  const c = document.createElement("canvas");
  c.width = Math.round(src.width * scale);
  c.height = Math.round(src.height * scale);
  const ctx = c.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.filter = "grayscale(1) contrast(1.4)";
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}
