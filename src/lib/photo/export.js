// src/lib/photo/export.js
// Saving and printing: JPG/PNG/WebP blobs, size limits, PDF, and exact-size printing.
import { PDFDocument } from "pdf-lib";

/** @returns {Promise<Blob>} */
export function canvasToBlob(canvas, type = "image/jpeg", quality = 0.92) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't create the image."))), type, quality);
  });
}

/**
 * Smallest-loss JPEG/WebP that fits under maxBytes (binary search on quality).
 * @returns {Promise<{ blob: Blob, quality: number, fits: boolean }>}
 */
export async function encodeUnder(canvas, maxBytes, type = "image/jpeg") {
  if (type === "image/png") {
    const blob = await canvasToBlob(canvas, type);
    return { blob, quality: 1, fits: !maxBytes || blob.size <= maxBytes };
  }
  const best = await canvasToBlob(canvas, type, 0.95);
  if (!maxBytes || best.size <= maxBytes) return { blob: best, quality: 0.95, fits: true };

  let lo = 0.05;
  let hi = 0.95;
  let found = null;
  for (let i = 0; i < 8; i++) {
    const q = (lo + hi) / 2;
    const b = await canvasToBlob(canvas, type, q);
    if (b.size <= maxBytes) {
      found = { blob: b, quality: q };
      lo = q;
    } else hi = q;
  }
  if (found) return { ...found, fits: true };
  const smallest = await canvasToBlob(canvas, type, 0.05);
  return { blob: smallest, quality: 0.05, fits: smallest.size <= maxBytes };
}

/** Save a blob as a file in Downloads. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

const MM_TO_PT = 72 / 25.4;

/**
 * One PDF page per canvas, each exactly paper-sized.
 * @param {HTMLCanvasElement[]} canvases
 * @param {{ w: number, h: number }} paper  mm
 */
export async function canvasesToPdf(canvases, paper, title = "Print") {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setCreator("Shop tools");
  const pw = paper.w * MM_TO_PT;
  const ph = paper.h * MM_TO_PT;
  for (const c of canvases) {
    const jpg = await canvasToBlob(c, "image/jpeg", 0.93);
    const img = await pdf.embedJpg(await jpg.arrayBuffer());
    const page = pdf.addPage([pw, ph]);
    page.drawImage(img, { x: 0, y: 0, width: pw, height: ph });
  }
  const bytes = await pdf.save();
  return new Blob([bytes], { type: "application/pdf" });
}

/**
 * Print pages at their real size through a hidden frame. The print dialog must be set to
 * "Actual size" / 100% with margins "None" for exact measurements.
 * @param {HTMLCanvasElement[]} canvases
 * @param {{ w: number, h: number }} paper  mm
 */
export async function printCanvases(canvases, paper) {
  const urls = await Promise.all(canvases.map(async (c) => URL.createObjectURL(await canvasToBlob(c, "image/png"))));
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  doc.open();
  doc.write(`<!doctype html><html><head><title>Print</title><style>
    @page { size: ${paper.w}mm ${paper.h}mm; margin: 0; }
    html, body { margin: 0; padding: 0; }
    img { display: block; width: ${paper.w}mm; height: ${paper.h}mm; break-after: page; page-break-after: always; }
    img:last-child { break-after: auto; page-break-after: auto; }
  </style></head><body>${urls.map((u) => `<img src="${u}" alt="">`).join("")}</body></html>`);
  doc.close();

  await Promise.all(
    [...doc.images].map((img) => (img.complete ? Promise.resolve() : new Promise((r) => ((img.onload = r), (img.onerror = r))))),
  );

  const cleanup = () => {
    urls.forEach((u) => URL.revokeObjectURL(u));
    frame.remove();
  };
  frame.contentWindow.addEventListener("afterprint", () => setTimeout(cleanup, 500));
  setTimeout(cleanup, 5 * 60_000); // safety net
  frame.contentWindow.focus();
  frame.contentWindow.print();
}
