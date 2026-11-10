// src/lib/pdf/ops.js
// PDF building blocks on top of pdf-lib (browser or server safe; no DOM here except where noted).
import { degrees, PDFDocument } from "pdf-lib";

export const MM_TO_PT = 72 / 25.4;

/**
 * Read a PDF file and count its pages.
 * @param {File} file
 * @returns {Promise<{ name: string, size: number, bytes: Uint8Array, pageCount: number, encrypted: boolean }>}
 */
export async function readPdfFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = file.name;
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    return { name, size: file.size, bytes, pageCount: doc.getPageCount(), encrypted: false };
  } catch (err) {
    if (/encrypted/i.test(err?.message || "")) {
      let pageCount = 0;
      try {
        pageCount = (await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })).getPageCount();
      } catch {
        // page count unknown
      }
      return { name, size: file.size, bytes, pageCount, encrypted: true };
    }
    throw new Error(`Couldn't open “${name}”. The file may be damaged or not a PDF.`);
  }
}

/**
 * Build a new PDF from pages of other PDFs.
 * @param {{ bytes: Uint8Array, pageIndex: number, rotate?: number }[]} pages  rotate = extra degrees (multiple of 90)
 * @param {{ title?: string }} [opts]
 * @returns {Promise<Uint8Array>}
 */
export async function assemblePages(pages, opts = {}) {
  const out = await PDFDocument.create();
  if (opts.title) out.setTitle(opts.title);
  out.setProducer("Shop tools");
  const cache = new Map();
  for (const p of pages) {
    let src = cache.get(p.bytes);
    if (!src) {
      src = await PDFDocument.load(p.bytes, { updateMetadata: false });
      cache.set(p.bytes, src);
    }
    const [copy] = await out.copyPages(src, [p.pageIndex]);
    if (p.rotate) copy.setRotation(degrees((((copy.getRotation().angle + p.rotate) % 360) + 360) % 360));
    out.addPage(copy);
  }
  return out.save({ useObjectStreams: true });
}

/** Re-save a PDF compactly (no quality loss). */
export async function resave(bytes) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  return doc.save({ useObjectStreams: true });
}

/**
 * Parse page ranges like "1-3, 5, 8-" for a document with `count` pages.
 * @returns {{ groups: number[][], error?: string }}  groups of 0-based page indexes
 */
export function parseRanges(text, count) {
  const groups = [];
  const parts = String(text || "")
    .replace(/[০-৯]/g, (d) => "০১২৩৪৫৬৭৮৯".indexOf(d))
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return { groups, error: "Type the pages, e.g. 1-3, 5, 8-10" };
  for (const part of parts) {
    const m = part.match(/^(\d*)\s*[-–to]*\s*(\d*)$/i);
    if (!m || (!m[1] && !m[2])) return { groups, error: `“${part}” isn't a page or range.` };
    const isRange = /[-–]|to/i.test(part);
    const from = m[1] ? Number(m[1]) : 1;
    const to = isRange ? (m[2] ? Number(m[2]) : count) : from;
    if (from < 1 || to < 1 || from > count || to > count) return { groups, error: `“${part}” is outside 1–${count}.` };
    const g = [];
    if (from <= to) for (let i = from; i <= to; i++) g.push(i - 1);
    else for (let i = from; i >= to; i--) g.push(i - 1);
    groups.push(g);
  }
  return { groups };
}

/**
 * Put images on PDF pages.
 * @param {{ bytes: Uint8Array, type: "jpg" | "png", width: number, height: number }[]} images  width/height in px
 * @param {{ paper: { w: number, h: number } | null, landscape: "auto" | boolean, marginMm: number, fit: "contain" | "cover" }} opts
 *   paper null = each page is exactly the image size (at 150 DPI).
 */
export async function imagesToPdf(images, { paper, landscape = "auto", marginMm = 0, fit = "contain" }) {
  const out = await PDFDocument.create();
  out.setProducer("Shop tools");
  for (const im of images) {
    const img = im.type === "png" ? await out.embedPng(im.bytes) : await out.embedJpg(im.bytes);
    if (!paper) {
      const pw = (im.width / 150) * 72;
      const ph = (im.height / 150) * 72;
      const page = out.addPage([pw, ph]);
      page.drawImage(img, { x: 0, y: 0, width: pw, height: ph });
      continue;
    }
    let pw = paper.w * MM_TO_PT;
    let ph = paper.h * MM_TO_PT;
    const wantLandscape = landscape === "auto" ? im.width > im.height : landscape;
    if (wantLandscape !== pw > ph) [pw, ph] = [ph, pw];
    const page = out.addPage([pw, ph]);
    const m = marginMm * MM_TO_PT;
    const boxW = pw - 2 * m;
    const boxH = ph - 2 * m;
    const k = fit === "cover" ? Math.max(boxW / im.width, boxH / im.height) : Math.min(boxW / im.width, boxH / im.height);
    const w = im.width * k;
    const h = im.height * k;
    page.drawImage(img, { x: m + (boxW - w) / 2, y: m + (boxH - h) / 2, width: w, height: h });
  }
  return out.save({ useObjectStreams: true });
}

/**
 * Draw images (PNG bytes) on top of pages.
 * @param {Uint8Array} bytes  the PDF
 * @param {(info: { index: number, count: number, width: number, height: number }) =>
 *   Promise<{ png: Uint8Array, x: number, y: number, w: number, h: number }[]>} layersFor
 *   Coordinates are PDF points from the bottom-left of the page as the reader sees it (rotation handled here).
 *   Reuse the same `png` Uint8Array object for identical layers — it is embedded once.
 */
export async function overlayPages(bytes, layersFor) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const pages = doc.getPages();
  const embedded = new Map();
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const rot = ((page.getRotation().angle % 360) + 360) % 360;
    // The visible area (crop box) can start away from 0,0.
    const box = page.getCropBox();
    const rawW = box.width;
    const rawH = box.height;
    const quarter = rot === 90 || rot === 270;
    const width = quarter ? rawH : rawW;
    const height = quarter ? rawW : rawH;
    const layers = (await layersFor({ index: i, count: pages.length, width, height })) || [];
    for (const layer of layers) {
      let img = embedded.get(layer.png);
      if (!img) {
        img = await doc.embedPng(layer.png);
        embedded.set(layer.png, img);
      }
      // Convert "as displayed" coordinates into the page's own (unrotated) space.
      const { x, y, w, h } = layer;
      let o;
      if (rot === 0) o = { x, y, width: w, height: h };
      else if (rot === 90) o = { x: rawW - y, y: x, width: w, height: h, rotate: degrees(90) };
      else if (rot === 180) o = { x: rawW - x, y: rawH - y, width: w, height: h, rotate: degrees(180) };
      else o = { x: y, y: rawH - x, width: w, height: h, rotate: degrees(270) };
      page.drawImage(img, { ...o, x: o.x + box.x, y: o.y + box.y });
    }
  }
  return doc.save({ useObjectStreams: true });
}

/** Uint8Array → Blob for download. */
export const pdfBlob = (bytes) => new Blob([bytes], { type: "application/pdf" });

/** "report.pdf" → "report-merged.pdf" */
export function suffixName(name, suffix, ext = "pdf") {
  const base = String(name || "document").replace(/\.[^.]+$/, "");
  return `${base}${suffix ? `-${suffix}` : ""}.${ext}`;
}
