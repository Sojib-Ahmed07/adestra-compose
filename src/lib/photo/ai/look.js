// src/lib/photo/ai/look.js
// Manual editing on top of an automatic portrait (from portrait.js):
// light and colour, face touch-up (retouch.js), spot-fix brush, clarity, sharpening, tighter edges,
// background blur, and erase / restore brush strokes on the mask.
// renderPortrait() draws the result; results are cached per portrait, and a small "preview" copy keeps sliders smooth.
import { applyAdjust, compileAdjust, isDefaultAdjust } from "../adjust";
import { makeCanvas } from "../image";
import { applyBrushes, blurBehind, clarity, denoise, fillOutside, heal, retouchFace } from "./retouch";
import { toneCurvePixel, toneTables } from "./tone";

/**
 * All values 0 = unchanged.
 * Light & colour (−100…100): brightness, contrast, shadows, highlights, saturation, vibrance, warmth, tint, clarity;
 * denoise 0…100 (grain from a dim room / phone camera).
 * Face touch-up (0…100): blemish, smooth, even, shine, darkCircles, eyes, teeth, faceLight. sharpen 0…100.
 * Background (0…100): edge (tighter mask edges), bgBlur (blur the original background when it is kept).
 */
export const defaultLook = Object.freeze({
  brightness: 0,
  contrast: 0,
  shadows: 0,
  highlights: 0,
  saturation: 0,
  vibrance: 0,
  warmth: 0,
  tint: 0,
  clarity: 0,
  denoise: 0,
  blemish: 0,
  smooth: 0,
  even: 0,
  shine: 0,
  darkCircles: 0,
  eyes: 0,
  teeth: 0,
  faceLight: 0,
  sharpen: 0,
  edge: 0,
  bgBlur: 0,
  adj: null, // Photoshop-style adjustments (../adjust.js): Exposure, Levels, Curves, Color Balance, Hue/Saturation
});

export const isDefaultLook = (l) => !l || Object.keys(defaultLook).every((k) => (k === "adj" ? isDefaultAdjust(l.adj) : !l[k]));

/** One-tap "make it better" for dull phone photos (light & colour tab). */
export const enhanceLook = Object.freeze({ clarity: 14, vibrance: 8, shadows: 12, highlights: 12, denoise: 30, sharpen: 20 });

/**
 * @typedef {{ mode: "erase" | "restore" | "heal" | "clone" | "dodge" | "burn", r: number, pts: number[],
 *   dx?: number, dy?: number, s?: number }} Stroke
 * r and pts (x, y, x, y, …) are in pixels of the full-size portrait.
 * erase / restore paint on the background mask; heal = Spot Healing (fills from the colours around it);
 * clone = Clone Stamp (copies from dx, dy away); dodge / burn lighten / darken (s = strength 0…1).
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
  const { W, H, src, fg, alpha, tone } = p.data;
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
  p._small = { W: w, H: h, src: sSrc, fg: sFg, alpha: a, tone, scale };
  return p._small;
}

function build(p, d, { keepBackground, fix, look, strokes }) {
  const { W, H, src, fg, tone, scale } = d;
  const n = W * H;
  const maskStrokes = strokes.filter((s) => s.mode === "erase" || s.mode === "restore");
  const healStrokes = strokes.filter((s) => s.mode === "heal");
  const brushStrokes = strokes.filter((s) => s.mode === "clone" || s.mode === "dodge" || s.mode === "burn");
  const blurBg = keepBackground && look.bgBlur > 0;

  // 1. Mask: tighter edges, then brush strokes.
  let alpha = d.alpha;
  if ((!keepBackground || blurBg) && (look.edge > 0 || maskStrokes.length)) {
    alpha = new Uint8ClampedArray(d.alpha);
    if (look.edge > 0) {
      const t = (look.edge / 100) * 0.6;
      for (let i = 0; i < n; i++) alpha[i] = clamp(((alpha[i] / 255 - t) / (1 - t)) * 255, 0, 255);
    }
    if (maskStrokes.length) alpha = paintStrokes(alpha, W, H, maskStrokes, scale);
  }

  // 2. Colour: automatic fix (tone.js), then the manual sliders.
  const prep = fix && tone ? toneTables(tone) : null;
  const manual = manualTables(look);
  const sat = 1 + look.saturation / 100;
  const vib = look.vibrance / 100;
  const tmp = [0, 0, 0];
  const colour = (px) => {
    const rgb = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const j = i * 4;
      let r, g, b;
      if (prep) {
        toneCurvePixel(tone, prep[0][px[j]], prep[1][px[j + 1]], prep[2][px[j + 2]], tmp);
        [r, g, b] = tmp;
      } else {
        r = px[j];
        g = px[j + 1];
        b = px[j + 2];
      }
      r = manual[0][Math.round(r)];
      g = manual[1][Math.round(g)];
      b = manual[2][Math.round(b)];
      if (sat !== 1 || vib) {
        const grey = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const mx = Math.max(r, g, b);
        const s0 = mx > 0 ? (mx - Math.min(r, g, b)) / mx : 0;
        const k = sat * (1 + vib * (1 - s0) * 1.4);
        r = grey + (r - grey) * k;
        g = grey + (g - grey) * k;
        b = grey + (b - grey) * k;
      }
      rgb[i * 3] = clamp(r, 0, 255);
      rgb[i * 3 + 1] = clamp(g, 0, 255);
      rgb[i * 3 + 2] = clamp(b, 0, 255);
    }
    return rgb;
  };

  let rgb;
  if (blurBg) {
    // Person from the cleaned cut-out colours, background = the original, blurred (person kept out of the blur).
    const person = colour(fg);
    const back = blurBehind(colour(src), alpha, W, H, Math.max(1, (look.bgBlur / 100) * 0.012 * Math.max(W, H)), src);
    rgb = person;
    for (let i = 0; i < n; i++) {
      const a = alpha[i] / 255;
      if (a >= 1) continue;
      rgb[i * 3] = rgb[i * 3] * a + back[i * 3] * (1 - a);
      rgb[i * 3 + 1] = rgb[i * 3 + 1] * a + back[i * 3 + 1] * (1 - a);
      rgb[i * 3 + 2] = rgb[i * 3 + 2] * a + back[i * 3 + 2] * (1 - a);
    }
  } else {
    rgb = colour(keepBackground ? src : fg);
  }
  // Photoshop-style adjustments (Exposure → Levels → Curves → Color Balance → Hue/Saturation).
  applyAdjust(rgb, n, compileAdjust(look.adj));
  // Kept background: corners that were outside the original photo get the colours next to them.
  const filled = keepBackground && fillOutside(rgb, src, W, H);

  // 3. Grain, spot-fix brush, then the face touch-up.
  if (look.denoise > 0) denoise(rgb, W, H, look.denoise / 100, Math.max(1, Math.round(2 * scale + 0.5)));
  if (healStrokes.length) heal(rgb, W, H, healStrokes, scale);
  if (p.face?.pts) retouchFace(rgb, W, H, scaledFace(p, d), look);
  if (brushStrokes.length) applyBrushes(rgb, W, H, brushStrokes, scale);

  // 4. Clarity and sharpening — help small prints look crisp.
  if (look.clarity) clarity(rgb, W, H, look.clarity / 100, Math.max(W, H) * 0.012);
  if (look.sharpen > 0) sharpen(rgb, W, H, (look.sharpen / 100) * 1.4);

  const out = makeCanvas(W, H);
  const ctx = out.getContext("2d");
  const img = ctx.createImageData(W, H);
  const o = img.data;
  for (let i = 0; i < n; i++) {
    o[i * 4] = rgb[i * 3];
    o[i * 4 + 1] = rgb[i * 3 + 1];
    o[i * 4 + 2] = rgb[i * 3 + 2];
    o[i * 4 + 3] = filled ? 255 : keepBackground ? src[i * 4 + 3] : alpha[i];
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

/** Face points in the pixels of the data being drawn (preview copies are smaller). */
function scaledFace(p, d) {
  if (d.scale === 1) return p.face;
  d._face ??= { ...p.face, pts: p.face.pts.map((v) => v * d.scale) };
  return d._face;
}

/** Per-channel tables for brightness, contrast, shadows, highlights, warm/cool and tint. */
function manualTables(look) {
  return [0, 1, 2].map((ch) => {
    const t = new Float32Array(256);
    const gain = 1 + (look.brightness / 100) * 0.45;
    const con = 1 + look.contrast / 100;
    const warm = (look.warmth / 100) * 22 * (ch === 0 ? 1 : ch === 2 ? -1 : 0.15);
    const tint = (look.tint / 100) * 14 * (ch === 1 ? -1 : 0.5); // + = magenta, − = green
    for (let v = 0; v < 256; v++) {
      let x = v * gain;
      x = x + (look.shadows / 100) * 70 * (1 - clamp(x, 0, 255) / 255) ** 2;
      x = x - (look.highlights / 100) * 60 * (clamp(x, 0, 255) / 255) ** 3;
      x = (x - 128) * con + 128;
      x = x + warm + tint;
      t[v] = clamp(x, 0, 255);
    }
    return t;
  });
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

function sharpen(rgb, W, H, amount) {
  const blur = boxBlur(rgb, W, H, 1);
  for (let i = 0; i < rgb.length; i++) rgb[i] = clamp(rgb[i] + (rgb[i] - blur[i]) * amount, 0, 255);
}