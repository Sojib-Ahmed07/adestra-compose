// src/lib/pdf/images.js
// Browser-only: turn image files into bytes pdf-lib can embed (phone rotation applied, size limited).
import { canvasToBlob } from "@/lib/photo/export";
import { loadImage, makeCanvas } from "@/lib/photo/image";

export const imageQualities = {
  high: { label: "High", maxSide: 3508, quality: 0.92 }, // A4 at 300 DPI
  normal: { label: "Normal", maxSide: 2480, quality: 0.85 }, // A4 at ~210 DPI
  small: { label: "Small file", maxSide: 1754, quality: 0.72 }, // A4 at 150 DPI
};

/**
 * @param {File} file
 * @param {keyof imageQualities} level
 * @param {{ grey?: boolean }} [opts]
 * @returns {Promise<{ bytes: Uint8Array, type: "jpg" | "png", width: number, height: number }>}
 */
export async function prepareImage(file, level = "normal", opts = {}) {
  const q = imageQualities[level] ?? imageQualities.normal;
  const loaded = await loadImage(file);
  try {
    const { width, height } = loaded;
    const k = Math.min(1, q.maxSide / Math.max(width, height));
    const c = makeCanvas(width * k, height * k);
    const ctx = c.getContext("2d");
    const keepPng = file.type === "image/png" && !opts.grey;
    if (!keepPng) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
    }
    if (opts.grey) ctx.filter = "grayscale(1)";
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(loaded.img, 0, 0, c.width, c.height);
    const blob = await canvasToBlob(c, keepPng ? "image/png" : "image/jpeg", q.quality);
    return { bytes: new Uint8Array(await blob.arrayBuffer()), type: keepPng ? "png" : "jpg", width: c.width, height: c.height };
  } finally {
    URL.revokeObjectURL(loaded.url);
  }
}
