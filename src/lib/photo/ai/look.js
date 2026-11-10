// src/lib/photo/ai/look.js
// Manual editing on top of an automatic portrait (from portrait.js):
// light and colour, skin smoothing, sharpening, tighter edges, and erase / restore brush strokes on the mask.
// renderPortrait() draws the result; results are cached per portrait, and a small "preview" copy keeps sliders smooth.
import { makeCanvas } from "../image";

/** All values 0 = unchanged. brightness … warmth: −100…100; smooth, sharpen, edge: 0…100. */
export const defaultLook = Object.freeze({
  brightness: 0,
  contrast: 0,
  shadows: 0,
  saturation: 0,
  warmth: 0,
  smooth: 0,
  sharpen: 0,
  edge: 0,
});

export const isDefaultLook = (l) => !l || Object.keys(defaultLook).every((k) => !l[k]);

/**
 * @typedef {{ mode: "erase" | "restore", r: number, pts: number[] }} Stroke
 * r and pts (x, y, x, y, …) are in pixels of the full-size portrait.
 */

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * @param {import("./portrait").Portrait} p
 * @param {{ keepBackground?: boolean, fix?: boolean, look?: typeof defaultLook, strokes?: Stroke[],
 *   strokesRev?: number, preview?: boolean }} opts
 *   preview: work on a copy whose long side is ~800 px (fast, for the editor while dragging sliders).
 * @returns {HTMLCanvasElement}
 */
export function renderPortrait(p, opts = {}) {
  const { keepBackground = false, fix = true, look = defaultLook, strokes = [], strokesRev = 0, preview = false } = opts;
  if (!p.data) return p.variant({ keepBackground, fix });
  const key = JSON.stringify([keepBackground, fix, look, strokes.length, strokesRev, preview]);
  p._looks ??= new Map();
  const hit = p._looks.get(key);
  if (hit) {
    // Most recently used goes last.
    p._looks.delete(key);
    p._looks.set(key, hit);
    return hit;
  }
  const d = preview ? smallData(p) : { ...p.data, scale: 1 };
  const out = build(p, d, { keepBackground, fix, look: { ...defaultLook, ...look }, strokes });
  p._looks.set(key, out);
  while (p._looks.size > 6) p._looks.delete(p._looks.keys().next().value);
  return out;
}

/** A ~800 px copy of the portrait's pixel data (made once). */
function smallData(p) {
  if (p._small) return p._small;
  const { W, H, src, fg, alpha, lut } = p.data;
  const scale = Math.min(1, 800 / Math.max(W, H));
  if (scale === 1) return (p._small = { ...p.data, scale: 1 });
  const w = Math.max(1, Math.round(W * scale));
  const h = Math.max(1, Math.round(H * scale));
  const shrink = (rgbaFill) => {
    const big = makeCanvas(W, H);
    const bctx = big.getContext("2d");
    const img = bctx.createImageData(W, H);
    rgbaFill(img.data);
    bctx.putImageData(img, 0, 0);
    const c = makeCanvas(w, h);
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(big, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h).data;
  };
  // Colours are copied with full alpha so the browser doesn't premultiply them away.
  const sSrc = shrink((o) => {
    for (let i = 0; i < W * H * 4; i += 4) {
      o[i] = src[i];
      o[i + 1] = src[i + 1];
      o[i + 2] = src[i + 2];
      o[i + 3] = 255;
    }
  });
  const sSrcA = shrink((o) => {
    for (let i = 0; i < W * H; i++) {
      o[i * 4] = src[i * 4 + 3];
      o[i * 4 + 3] = 255;
    }
  });
  const sFg = shrink((o) => {
    for (let i = 0; i < W * H * 4; i += 4) {
      o[i] = fg[i];
      o[i + 1] = fg[i + 1];
      o[i + 2] = fg[i + 2];
      o[i + 3] = 255;
    }
  });
  const sA = shrink((o) => {
    for (let i = 0; i < W * H; i++) {
      o[i * 4] = alpha[i];
      o[i * 4 + 3] = 255;
    }
  });
  const a = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) {
    a[i] = sA[i * 4];
    sSrc[i * 4 + 3] = sSrcA[i * 4];
  }
  p._small = { W: w, H: h, src: sSrc, fg: sFg, alpha: a, lut, scale };
  return p._small;
}

function build(p, d, { keepBackground, fix, look, strokes }) {
  const { W, H, src, fg, lut, scale } = d;
  const n = W * H;

  // 1. Mask: tighter edges, then brush strokes.
  let alpha = d.alpha;
  if (!keepBackground && (look.edge > 0 || strokes.length)) {
    alpha = new Uint8ClampedArray(d.alpha);
    if (look.edge > 0) {
      const t = (look.edge / 100) * 0.6;
      for (let i = 0; i < n; i++) alpha[i] = clamp(((alpha[i] / 255 - t) / (1 - t)) * 255, 0, 255);
    }
    if (strokes.length) alpha = paintStrokes(alpha, W, H, strokes, scale);
  }

  // 2. Colour tables: auto fix, brightness, contrast, shadows, warmth.
  const tables = [0, 1, 2].map((ch) => {
    const t = new Float32Array(256);
    const gain = 1 + (look.brightness / 100) * 0.45;
    const con = 1 + look.contrast / 100;
    const warm = (look.warmth / 100) * 22 * (ch === 0 ? 1 : ch === 2 ? -1 : 0.15);
    for (let v = 0; v < 256; v++) {
      let x = fix ? lut[ch][v] : v;
      x = x * gain;
      x = x + (look.shadows / 100) * 70 * (1 - clamp(x, 0, 255) / 255) ** 2;
      x = (x - 128) * con + 128;
      x = x + warm;
      t[v] = clamp(x, 0, 255);
    }
    return t;
  });

  const from = keepBackground ? src : fg;
  const rgb = new Float32Array(n * 3);
  const sat = 1 + look.saturation / 100;
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    let r = tables[0][from[j]];
    let g = tables[1][from[j + 1]];
    let b = tables[2][from[j + 2]];
    if (sat !== 1) {
      const grey = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = grey + (r - grey) * sat;
      g = grey + (g - grey) * sat;
      b = grey + (b - grey) * sat;
    }
    rgb[i * 3] = r;
    rgb[i * 3 + 1] = g;
    rgb[i * 3 + 2] = b;
  }

  // 3. Smooth skin inside the face, keeping edges (eyes, lips, hairline) sharp.
  if (look.smooth > 0 && p.face) smoothSkin(rgb, W, H, p.face, scale, look.smooth / 100);

  // 4. Sharpen (unsharp mask) — helps small prints look crisp.
  if (look.sharpen > 0) sharpen(rgb, W, H, (look.sharpen / 100) * 1.4);

  const out = makeCanvas(W, H);
  const ctx = out.getContext("2d");
  const img = ctx.createImageData(W, H);
  const o = img.data;
  for (let i = 0; i < n; i++) {
    o[i * 4] = rgb[i * 3];
    o[i * 4 + 1] = rgb[i * 3 + 1];
    o[i * 4 + 2] = rgb[i * 3 + 2];
    o[i * 4 + 3] = keepBackground ? src[i * 4 + 3] : alpha[i];
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

function paintStrokes(alpha, W, H, strokes, scale) {
  const c = makeCanvas(W, H);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  const img = ctx.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    img.data[i * 4] = alpha[i];
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const s of strokes) {
    const col = s.mode === "erase" ? "#000" : "#f00";
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = s.r * 2 * scale;
    const pts = s.pts;
    if (pts.length === 2) {
      ctx.beginPath();
      ctx.arc(pts[0] * scale, pts[1] * scale, s.r * scale, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(pts[0] * scale, pts[1] * scale);
    for (let k = 2; k < pts.length; k += 2) ctx.lineTo(pts[k] * scale, pts[k + 1] * scale);
    ctx.stroke();
  }
  const data = ctx.getImageData(0, 0, W, H).data;
  const out = new Uint8ClampedArray(W * H);
  for (let i = 0; i < W * H; i++) out[i] = data[i * 4];
  return out;
}

/** Separable box blur of an RGB float image (radius r), in place into a new array. */
function boxBlur(rgb, W, H, r, x0 = 0, y0 = 0, x1 = W, y1 = H) {
  const out = new Float32Array(rgb);
  const tmp = new Float32Array(rgb);
  const win = 2 * r + 1;
  for (let y = y0; y < y1; y++) {
    for (let ch = 0; ch < 3; ch++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += rgb[(y * W + clamp(x0 + k, 0, W - 1)) * 3 + ch];
      for (let x = x0; x < x1; x++) {
        tmp[(y * W + x) * 3 + ch] = acc / win;
        acc += rgb[(y * W + clamp(x + r + 1, 0, W - 1)) * 3 + ch] - rgb[(y * W + clamp(x - r, 0, W - 1)) * 3 + ch];
      }
    }
  }
  for (let x = x0; x < x1; x++) {
    for (let ch = 0; ch < 3; ch++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += tmp[(clamp(y0 + k, 0, H - 1) * W + x) * 3 + ch];
      for (let y = y0; y < y1; y++) {
        out[(y * W + x) * 3 + ch] = acc / win;
        acc += tmp[(clamp(y + r + 1, 0, H - 1) * W + x) * 3 + ch] - tmp[(clamp(y - r, 0, H - 1) * W + x) * 3 + ch];
      }
    }
  }
  return out;
}

function smoothSkin(rgb, W, H, f, scale, amount) {
  const cx = f.cx * scale;
  const cy = ((f.topY + f.chinY) / 2) * scale;
  const rx = f.faceW * 0.56 * scale;
  const ry = (f.chinY - f.topY) * 0.62 * scale;
  const x0 = Math.max(0, Math.floor(cx - rx));
  const x1 = Math.min(W, Math.ceil(cx + rx));
  const y0 = Math.max(0, Math.floor(cy - ry));
  const y1 = Math.min(H, Math.ceil(cy + ry));
  if (x1 <= x0 || y1 <= y0) return;
  const r = Math.max(1, Math.round(f.faceW * scale * 0.014));
  const blur = boxBlur(boxBlur(rgb, W, H, r, x0, y0, x1, y1), W, H, r, x0, y0, x1, y1);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const d2 = dx * dx + dy * dy;
      if (d2 >= 1) continue;
      const fall = d2 < 0.6 ? 1 : (1 - d2) / 0.4;
      const i = (y * W + x) * 3;
      // Big differences = real detail (eyes, brows, lips) → leave them.
      const diff =
        Math.abs(rgb[i] - blur[i]) + Math.abs(rgb[i + 1] - blur[i + 1]) + Math.abs(rgb[i + 2] - blur[i + 2]);
      const keep = Math.exp(-diff / 40);
      const w = amount * fall * keep;
      rgb[i] += (blur[i] - rgb[i]) * w;
      rgb[i + 1] += (blur[i + 1] - rgb[i + 1]) * w;
      rgb[i + 2] += (blur[i + 2] - rgb[i + 2]) * w;
    }
  }
}

function sharpen(rgb, W, H, amount) {
  const blur = boxBlur(rgb, W, H, 1);
  for (let i = 0; i < rgb.length; i++) rgb[i] = clamp(rgb[i] + (rgb[i] - blur[i]) * amount, 0, 255);
}
