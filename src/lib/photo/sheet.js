// src/lib/photo/sheet.js
// Lay out photos on paper (mm) and draw pages onto canvases.
import { makeCanvas } from "./image";

/**
 * @typedef {{ key: string, label?: string, wMm: number, hMm: number, copies: number, newRow?: boolean,
 *   draw: (pxPerMm: number) => HTMLCanvasElement, setCopies?: (n: number) => void }} SheetItem
 * setCopies (optional) lets the sheet panel offer "Fill the page" for that item.
 * @typedef {{ item: SheetItem, x: number, y: number, w: number, h: number }} Placement
 */

const EPS = 0.01;

/**
 * Row-by-row packing, left to right, top to bottom. Copies of one item stay together.
 * @param {SheetItem[]} items
 * @param {{ w: number, h: number }} paper  in mm (orientation already applied)
 * @param {{ margin: number, gap: number, newRowPerItem: boolean, position?: "top-left" | "top" | "center" }} opts
 *   position: where the block of photos sits — top-left corner (saves paper for cutting), top centre, or the middle of the page.
 * @returns {{ pages: Placement[][], tooBig: string[], count: number }}
 */
export function layoutSheet(items, paper, { margin, gap, newRowPerItem, position = "top-left" }) {
  const pages = [[]];
  const tooBig = [];
  const maxX = paper.w - margin;
  const maxY = paper.h - margin;
  let x = margin;
  let y = margin;
  let rowH = 0;
  let count = 0;

  const newLine = () => {
    x = margin;
    y += rowH + gap;
    rowH = 0;
  };
  const newPage = () => {
    pages.push([]);
    x = margin;
    y = margin;
    rowH = 0;
  };

  for (const item of items) {
    const w = item.wMm;
    const h = item.hMm;
    if (w > maxX - margin + EPS || h > maxY - margin + EPS) {
      tooBig.push(item.label || "A photo");
      continue;
    }
    const copies = Math.max(0, Math.floor(item.copies));
    for (let i = 0; i < copies; i++) {
      const forceRow = i === 0 && (newRowPerItem || item.newRow) && x > margin + EPS;
      if (forceRow || x + w > maxX + EPS) newLine();
      if (y + h > maxY + EPS) newPage();
      pages[pages.length - 1].push({ item, x, y, w, h });
      count++;
      x += w + gap;
      rowH = Math.max(rowH, h);
    }
  }
  if (pages.length > 1 && pages[pages.length - 1].length === 0) pages.pop();
  if (position !== "top-left") {
    for (const page of pages) {
      if (!page.length) continue;
      const x0 = Math.min(...page.map((p) => p.x));
      const x1 = Math.max(...page.map((p) => p.x + p.w));
      const y0 = Math.min(...page.map((p) => p.y));
      const y1 = Math.max(...page.map((p) => p.y + p.h));
      const dx = (paper.w - (x1 - x0)) / 2 - x0;
      const dy = position === "center" ? (paper.h - (y1 - y0)) / 2 - y0 : 0;
      for (const p of page) {
        p.x += dx;
        p.y += dy;
      }
    }
  }
  return { pages, tooBig, count };
}

/**
 * How many more copies of the last item (that has setCopies) fit without adding a page.
 * @returns {{ item: SheetItem, extra: number } | null}
 */
export function roomOnLastPage(items, paper, opts) {
  const idx = items.findLastIndex((it) => typeof it.setCopies === "function" && it.copies > 0);
  if (idx < 0) return null;
  const base = layoutSheet(items, paper, opts);
  if (base.tooBig.length) return null;
  const pages = base.pages.length;
  let extra = 0;
  const trial = items.slice();
  for (let k = 1; k <= 300; k++) {
    trial[idx] = { ...items[idx], copies: items[idx].copies + k };
    if (layoutSheet(trial, paper, opts).pages.length > pages) break;
    extra = k;
  }
  return extra ? { item: items[idx], extra } : null;
}

/**
 * Draw one page.
 * @param {Placement[]} placements
 * @param {{ w: number, h: number }} paper
 * @param {number} pxPerMm
 * @param {{ cutLines?: boolean, cache?: Map<string, HTMLCanvasElement> }} [opts]
 */
export function renderPage(placements, paper, pxPerMm, opts = {}) {
  const canvas = makeCanvas(paper.w * pxPerMm, paper.h * pxPerMm);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = "high";
  const cache = opts.cache ?? new Map();

  for (const p of placements) {
    let img = cache.get(p.item.key);
    if (!img) {
      img = p.item.draw(pxPerMm);
      cache.set(p.item.key, img);
    }
    const dx = Math.round(p.x * pxPerMm);
    const dy = Math.round(p.y * pxPerMm);
    const dw = Math.round(p.w * pxPerMm);
    const dh = Math.round(p.h * pxPerMm);
    ctx.drawImage(img, dx, dy, dw, dh);
    if (opts.cutLines) {
      ctx.strokeStyle = "#9aa1b5";
      ctx.lineWidth = Math.max(1, pxPerMm * 0.1);
      ctx.strokeRect(dx + 0.5, dy + 0.5, dw - 1, dh - 1);
    }
  }
  return canvas;
}
