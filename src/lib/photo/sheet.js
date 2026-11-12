// src/lib/photo/sheet.js
// Lay out photos on paper (mm) and draw pages onto canvases.
import { makeCanvas } from "./image";

/**
 * @typedef {{ key: string, label?: string, wMm: number, hMm: number, copies: number, newRow?: boolean, group?: string,
 *   draw: (pxPerMm: number) => HTMLCanvasElement, setCopies?: (n: number) => void }} SheetItem
 * setCopies (optional) lets the sheet panel offer "Fill the page" for that item.
 * group (optional): items with the same group belong to one customer (e.g. their passport + stamp sizes) — with
 * "start each person on a new row" a new row starts only when the group changes. Defaults to the item's key.
 * @typedef {{ item: SheetItem, x: number, y: number, w: number, h: number }} Placement
 * A page is an array of Placements; grid pages also carry `page.guides` = cutting guide lines `[x1, y1, x2, y2][]` (mm):
 * one right across the page above and below every row (cut the sheet into strips first), then short ones between the
 * photos of each strip.
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
 * Grid layout for easy cutting: every photo sits in a cell of the same size, cells line up in rows and columns,
 * and the spare paper is shared out as cutting space (photos reach out to the corners of the page).
 * Small sizes share a cell: e.g. 2 stamps (20 × 25) one above the other take one passport (38 × 48) space,
 * so "4 passport + 2 stamp" is one row of 5.
 * @param {SheetItem[]} items
 * @param {{ w: number, h: number }} paper
 * @param {{ margin: number, gap: number, newRowPerItem: boolean, position?: string, spread?: boolean,
 *   cols?: number, rows?: number, pair?: boolean }} opts
 *   gap = the least cutting space between photos (gapX left–right and gapY up–down override it);
 *   spread = share all spare paper out as cutting space;
 *   used = areas of page 1 already printed on (reusing a sheet): [{ x, y, w, h }] in mm — any space touching one is
 *   skipped, so it works even when the next customer's sizes make different spaces;
 *   cols / rows = photos in a row / rows on a page (0 or missing = as many as fit); pair = let small sizes share a cell.
 * @returns {{ pages: Placement[][], tooBig: string[], count: number,
 *   grid: { cols: number, rows: number, maxCols: number, maxRows: number, cell: { w: number, h: number } } | null }}
 */
export function layoutGrid(items, paper, opts) {
  const { margin, newRowPerItem, position = "top-left", spread = true, pair = true } = opts;
  const gapX = Number.isFinite(opts.gapX) ? opts.gapX : opts.gap;
  const gapY = Number.isFinite(opts.gapY) ? opts.gapY : opts.gap;
  const availW = paper.w - 2 * margin;
  const availH = paper.h - 2 * margin;
  const tooBig = [];
  const live = [];
  for (const it of items) {
    if (Math.floor(it.copies) <= 0) continue;
    if (it.wMm > availW + EPS || it.hMm > availH + EPS) tooBig.push(it.label || "A photo");
    else live.push(it);
  }
  if (!live.length) return { pages: [[]], tooBig, count: 0, grid: null };

  // The main size (biggest photo) sets the cell; smaller sizes may share it.
  const main = live.reduce((a, b) => (b.wMm * b.hMm > a.wMm * a.hMm ? b : a));
  const base = { w: Math.max(...live.map((i) => i.wMm)), h: Math.max(...live.map((i) => i.hMm)) };
  const mainArea = main.wMm * main.hMm;
  const SLACK = 1.15; // a shared cell may be up to 15% taller than the main photo (never wider — keeps 5 in a row)
  const packOf = (it) => {
    const w = it.wMm;
    const h = it.hMm;
    const single = { kx: 1, ky: 1 };
    if (!pair || w * h * 2 > mainArea * 1.2) return single;
    const fitsX = (k) => k * w + (k - 1) * gapX <= base.w + EPS;
    const fitsY = (k) => k * h + (k - 1) * gapY <= base.h * SLACK + EPS && k * h + (k - 1) * gapY <= availH + EPS;
    let kx = 1;
    let ky = 1;
    while (fitsX(kx + 1)) kx++;
    while (fitsY(ky + 1)) ky++;
    return kx * ky >= 2 ? { kx, ky } : single;
  };
  const packs = new Map(live.map((it) => [it, packOf(it)]));
  const blockOf = (it) => {
    const { kx, ky } = packs.get(it);
    return { w: kx * it.wMm + (kx - 1) * gapX, h: ky * it.hMm + (ky - 1) * gapY };
  };
  const cell = { w: 0, h: 0 };
  for (const it of live) {
    const b = blockOf(it);
    cell.w = Math.max(cell.w, b.w);
    cell.h = Math.max(cell.h, b.h);
  }
  cell.w = Math.min(cell.w, availW);
  cell.h = Math.min(cell.h, availH);

  const maxCols = Math.max(1, Math.floor((availW + gapX + EPS) / (cell.w + gapX)));
  const maxRows = Math.max(1, Math.floor((availH + gapY + EPS) / (cell.h + gapY)));
  const cols = opts.cols > 0 ? Math.min(opts.cols, maxCols) : maxCols;
  const rows = opts.rows > 0 ? Math.min(opts.rows, maxRows) : maxRows;

  let gx = gapX;
  let gy = gapY;
  let x0 = margin;
  let y0 = margin;
  if (spread) {
    gx = cols > 1 ? (availW - cols * cell.w) / (cols - 1) : 0;
    gy = rows > 1 ? (availH - rows * cell.h) / (rows - 1) : 0;
    if (cols === 1) x0 = (paper.w - cell.w) / 2;
    if (rows === 1) y0 = position === "center" ? (paper.h - cell.h) / 2 : margin;
  } else {
    const blockW = cols * cell.w + (cols - 1) * gapX;
    const blockH = rows * cell.h + (rows - 1) * gapY;
    if (position !== "top-left") x0 = (paper.w - blockW) / 2;
    if (position === "center") y0 = (paper.h - blockH) / 2;
  }

  // Fill cells in order. A cell holds up to kx × ky copies of one item.
  const pages = [];
  let page = null;
  let col = 0;
  let row = 0;
  let count = 0;
  let lastGroup = null;
  const nextCell = () => {
    col++;
    if (col >= cols) {
      col = 0;
      row++;
    }
  };
  const ensurePage = () => {
    if (!page || row >= rows) {
      page = [];
      page.cells = [];
      page.spaces = []; // the spaces this page prints on ({ x, y, w, h } mm)
      pages.push(page);
      row = 0;
      col = 0;
    }
  };
  // Reusing a sheet: spaces already printed on (page 1 only) are skipped.
  const usedAreas = (opts.used || []).filter((r) => r && Number.isFinite(r.x) && Number.isFinite(r.y));
  const cellAt = (r, c) => ({ x: x0 + c * (cell.w + gx), y: y0 + r * (cell.h + gy), w: cell.w, h: cell.h });
  const touches = (a, b) => a.x < b.x + b.w - 0.3 && b.x < a.x + a.w - 0.3 && a.y < b.y + b.h - 0.3 && b.y < a.y + a.h - 0.3;
  const isUsed = (r, c) => usedAreas.some((u) => touches(u, cellAt(r, c)));
  const takeCell = () => {
    for (; ;) {
      ensurePage();
      if (pages.length === 1 && isUsed(row, col)) nextCell();
      else return;
    }
  };
  for (const it of live) {
    const group = it.group ?? it.key;
    if ((newRowPerItem || it.newRow) && lastGroup !== null && group !== lastGroup && col > 0) {
      col = 0;
      row++;
    }
    lastGroup = group;
    const { kx, ky } = packs.get(it);
    const per = kx * ky;
    let left = Math.floor(it.copies);
    while (left > 0) {
      takeCell();
      const cx = x0 + col * (cell.w + gx);
      const cy = y0 + row * (cell.h + gy);
      const n = Math.min(per, left);
      // Shared cell: fill one column top to bottom, then the next (stamps one above the other first).
      const usedX = Math.min(kx, Math.ceil(n / ky));
      const bw = usedX * it.wMm + (usedX - 1) * gapX;
      const ox = cx + (cell.w - bw) / 2;
      for (let k = 0; k < n; k++) {
        const ix = Math.floor(k / ky);
        const iy = k % ky;
        page.push({ item: it, x: ox + ix * (it.wMm + gapX), y: cy + iy * (it.hMm + gapY), w: it.wMm, h: it.hMm });
      }
      page.cells.push({ row, x: cx, y: cy });
      page.spaces.push({ x: cx, y: cy, w: cell.w, h: cell.h });
      count += n;
      left -= n;
      nextCell();
    }
  }
  // Guide lines: across the whole page at the top and bottom of each row; inside a row, between the cells,
  // reaching into the cutting space above and below (so a cut strip still shows where to cut).
  for (const p of pages) {
    const lines = [];
    const rowsUsed = [...new Set(p.cells.map((c) => c.row))];
    for (const r of rowsUsed) {
      const cells = p.cells.filter((c) => c.row === r);
      const y = cells[0].y;
      lines.push([0, y, paper.w, y], [0, y + cell.h, paper.w, y + cell.h]);
      const top = Math.max(0, y - Math.max(gy, 2) / 2);
      const bottom = Math.min(paper.h, y + cell.h + Math.max(gy, 2) / 2);
      const xs = new Set();
      for (const c of cells) xs.add(c.x).add(c.x + cell.w);
      for (const x of xs) lines.push([x, top, x, bottom]);
    }
    p.guides = lines;
    delete p.cells;
  }
  // Page 1 also carries the areas already printed on (shaded in the preview, never printed).
  if (pages.length && usedAreas.length) pages[0].usedRects = usedAreas;
  // Spaces of page 1 (for the reuse map): where they are and whether they are already used.
  const spaces = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) spaces.push({ ...cellAt(r, c), used: isUsed(r, c) });
  return { pages: pages.length ? pages : [[]], tooBig, count, grid: { cols, rows, maxCols, maxRows, cell, spaces } };
}

/** The layout chosen by opts.mode: "grid" (easy cutting, default) or "pack" (row packing, saves paper). */
export const layoutFor = (opts) => (opts.mode === "pack" ? layoutSheet : layoutGrid);

/**
 * How many more copies of the last item (that has setCopies) fit without adding a page.
 * @returns {{ item: SheetItem, extra: number } | null}
 */
export function roomOnLastPage(items, paper, opts) {
  const layout = layoutFor(opts);
  const idx = items.findLastIndex((it) => typeof it.setCopies === "function" && it.copies > 0);
  if (idx < 0) return null;
  const base = layout(items, paper, opts);
  if (base.tooBig.length) return null;
  const pages = base.pages.length;
  let extra = 0;
  const trial = items.slice();
  for (let k = 1; k <= 300; k++) {
    trial[idx] = { ...items[idx], copies: items[idx].copies + k };
    if (layout(trial, paper, opts).pages.length > pages) break;
    extra = k;
  }
  return extra ? { item: items[idx], extra } : null;
}

/**
 * Draw one page.
 * @param {Placement[]} placements
 * @param {{ w: number, h: number }} paper
 * @param {number} pxPerMm
 * @param {{ cutLines?: boolean, cache?: Map<string, HTMLCanvasElement>, preview?: boolean }} [opts]
 *   preview: also shade the spaces of a reused sheet that are already printed on.
 */
export function renderPage(placements, paper, pxPerMm, opts = {}) {
  const canvas = makeCanvas(paper.w * pxPerMm, paper.h * pxPerMm);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = "high";
  const cache = opts.cache ?? new Map();

  // Reused sheet: show the spaces already printed on (preview only — never printed).
  if (opts.preview && placements.usedRects) {
    ctx.fillStyle = "#e3e6ee";
    ctx.strokeStyle = "#9aa1b5";
    ctx.lineWidth = Math.max(1, pxPerMm * 0.2);
    for (const r of placements.usedRects) {
      const x = Math.round(r.x * pxPerMm);
      const y = Math.round(r.y * pxPerMm);
      const w = Math.round(r.w * pxPerMm);
      const h = Math.round(r.h * pxPerMm);
      ctx.fillRect(x, y, w, h);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y + h);
      ctx.moveTo(x + w, y);
      ctx.lineTo(x, y + h);
      ctx.stroke();
    }
  }

  // Grid pages: light guide lines right across the page along every row and column of photos, so the sheet can be
  // cut into strips with scissors from edge to edge. Drawn first — photos cover them.
  if (opts.cutLines && placements.guides) {
    ctx.strokeStyle = "#c3c8d4";
    ctx.lineWidth = Math.max(1, pxPerMm * 0.12);
    ctx.beginPath();
    const at = (v) => Math.round(v * pxPerMm) + 0.5;
    for (const [x1, y1, x2, y2] of placements.guides) {
      ctx.moveTo(at(x1), at(y1));
      ctx.lineTo(at(x2), at(y2));
    }
    ctx.stroke();
  }

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