// src/lib/pdf/stamp.js
// Browser-only: watermarks and page numbers drawn with <canvas> (so Bangla text shapes correctly), then
// placed on PDF pages as images.
import { toBanglaDigits } from "@/lib/utils";
import { overlayPages } from "./ops";

const FONT = `"Inter Variable", "Noto Sans Bengali Variable", "Noto Sans Bengali", sans-serif`;
const PX_PER_PT = 2; // layer sharpness (≈144 DPI)

export const colours = {
  grey: [120, 125, 140],
  red: [200, 30, 30],
  blue: [30, 70, 200],
  black: [20, 20, 20],
};

export const numberFormats = {
  plain: { label: "1, 2, 3", make: (n) => `${n}` },
  pageOf: { label: "Page 1 of 10", make: (n, t) => `Page ${n} of ${t}` },
  slash: { label: "1 / 10", make: (n, t) => `${n} / ${t}` },
  bnPlain: { label: "১, ২, ৩", make: (n) => toBanglaDigits(n) },
  bnPage: { label: "পৃষ্ঠা ১", make: (n) => `পৃষ্ঠা ${toBanglaDigits(n)}` },
  bnPageOf: { label: "পৃষ্ঠা ১ / ১০", make: (n, t) => `পৃষ্ঠা ${toBanglaDigits(n)} / ${toBanglaDigits(t)}` },
};

/** Make sure the web fonts are ready before drawing text on a canvas. */
export async function fontsReady() {
  try {
    await Promise.all([
      document.fonts.load(`700 40px "Inter Variable"`),
      document.fonts.load(`700 40px "Noto Sans Bengali Variable"`, "পৃষ্ঠা"),
    ]);
  } catch {
    // fall back to system fonts
  }
}

const rgba = (c, a) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;

/**
 * Layers for one page, in points from the bottom-left. Each layer: { canvas, x, y, w, h, key }.
 * `key` identifies identical layers so they are encoded once.
 * @param {any} s  settings (see WatermarkTool)
 * @param {{ index: number, count: number, width: number, height: number }} page
 */
export function layersForPage(s, page) {
  const layers = [];
  const { width: W, height: H } = page;

  if (s.watermark.on && (s.watermark.kind === "image" ? s.watermark.image : s.watermark.text.trim())) {
    const wm = s.watermark;
    const c = document.createElement("canvas");
    c.width = Math.round(W * PX_PER_PT);
    c.height = Math.round(H * PX_PER_PT);
    const ctx = c.getContext("2d");
    ctx.globalAlpha = wm.opacity;

    if (wm.kind === "image") {
      const img = wm.image;
      const w = W * (wm.imageWidth / 100) * PX_PER_PT;
      const h = (w * img.naturalHeight) / img.naturalWidth;
      const m = 24 * PX_PER_PT;
      const spots = {
        center: [(c.width - w) / 2, (c.height - h) / 2],
        "top-right": [c.width - w - m, m],
        "bottom-right": [c.width - w - m, c.height - h - m],
        "bottom-left": [m, c.height - h - m],
        "top-left": [m, m],
      };
      const [x, y] = spots[wm.position] ?? spots.center;
      ctx.drawImage(img, x, y, w, h);
    } else {
      const size = wm.size * PX_PER_PT;
      ctx.font = `700 ${size}px ${FONT}`;
      ctx.fillStyle = rgba(colours[wm.colour] ?? colours.grey, 1);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const angle = (-wm.angle * Math.PI) / 180;
      const lines = wm.text.split("\n").filter(Boolean);
      const drawAt = (cx, cy) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        lines.forEach((line, i) => ctx.fillText(line, 0, (i - (lines.length - 1) / 2) * size * 1.2));
        ctx.restore();
      };
      if (wm.position === "tile") {
        const textW = Math.max(...lines.map((l) => ctx.measureText(l).width));
        const stepX = Math.max(textW * 0.9, size * 4);
        const stepY = Math.max(size * lines.length * 2.6, size * 3);
        for (let y = stepY / 2, row = 0; y < c.height + stepY; y += stepY, row++)
          for (let x = row % 2 ? stepX / 2 : 0; x < c.width + stepX; x += stepX) drawAt(x, y);
      } else {
        drawAt(c.width / 2, c.height / 2);
      }
    }
    layers.push({ canvas: c, x: 0, y: 0, w: W, h: H, key: `wm|${W}|${H}` });
  }

  const n = s.numbers;
  if (n.on && !(n.skipFirst && page.index === 0)) {
    const number = n.start + page.index - (n.skipFirst ? 1 : 0);
    const total = page.count - (n.skipFirst ? 1 : 0) + n.start - 1;
    const text = (numberFormats[n.format] ?? numberFormats.plain).make(number, total);
    const size = n.size * PX_PER_PT;
    const probe = document.createElement("canvas").getContext("2d");
    probe.font = `500 ${size}px ${FONT}`;
    const tw = Math.ceil(probe.measureText(text).width) + 4 * PX_PER_PT;
    const th = Math.ceil(size * 1.5);
    const c = document.createElement("canvas");
    c.width = tw;
    c.height = th;
    const ctx = c.getContext("2d");
    ctx.font = probe.font;
    ctx.fillStyle = rgba(colours[n.colour] ?? colours.black, 1);
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(text, tw / 2, th / 2);
    const w = tw / PX_PER_PT;
    const h = th / PX_PER_PT;
    const m = n.margin; // points from the edge
    const [vert, horiz] = n.position.split("-"); // e.g. "bottom-center"
    const x = horiz === "left" ? m : horiz === "right" ? W - m - w : (W - w) / 2;
    const y = vert === "top" ? H - m - h : m;
    layers.push({ canvas: c, x, y, w, h, key: `num|${text}|${n.size}|${n.colour}` });
  }
  return layers;
}

async function pngBytes(canvas) {
  const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}

/** Apply watermark / page numbers to every page. */
export async function stampPdf(bytes, settings, onProgress) {
  await fontsReady();
  const cache = new Map(); // key → png bytes (same object → embedded once)
  return overlayPages(bytes, async (page) => {
    onProgress?.(page.index + 1, page.count);
    const out = [];
    for (const l of layersForPage(settings, page)) {
      let png = cache.get(l.key);
      if (!png) {
        png = await pngBytes(l.canvas);
        cache.set(l.key, png);
      }
      out.push({ png, x: l.x, y: l.y, w: l.w, h: l.h });
    }
    return out;
  });
}

/**
 * Draw the same layers on a rendered page preview (canvas of the page as displayed).
 * @param {HTMLCanvasElement} preview
 * @param {{ width: number, height: number }} sizePt  page size in points as displayed
 */
export function drawPreview(preview, settings, page) {
  const ctx = preview.getContext("2d");
  const k = preview.width / page.width;
  for (const l of layersForPage(settings, page)) {
    ctx.drawImage(l.canvas, l.x * k, (page.height - l.y - l.h) * k, l.w * k, l.h * k);
  }
}
