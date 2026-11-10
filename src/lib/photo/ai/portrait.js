// src/lib/photo/ai/portrait.js
// One-drop portrait preparation for passport / visa / joint photos:
// find the face → level the eyes → crop around the head and shoulders → remove the background
// (clean hair edges) → fix exposure and colour cast → measure chin and top of hair.
// The result can be drawn on any background colour and placed in any photo size with passportEdit().
import { makeCanvas, srcH, srcW } from "../image";
import { findFaces } from "./faces";
import { matte } from "./matte";

export class NoFaceError extends Error {}

const WORK_MAX = 2400; // longest side used for face finding
const TARGET_FACE = 440; // forehead-to-chin height, in pixels of the prepared photo

/** Head size presets: share of the photo height from chin to top of hair, and space above the hair. */
export const headSizes = {
  small: { head: 0.55, top: 0.12, label: "Small" },
  normal: { head: 0.63, top: 0.1, label: "Normal" },
  large: { head: 0.73, top: 0.07, label: "Large (visa)" },
};

/**
 * @typedef {{ cx: number, eyeY: number, topY: number, chinY: number, crownY: number, faceW: number }} FaceInfo
 * @typedef {{ width: number, height: number, angle: number, face: FaceInfo, warnings: string[],
 *   variant: (opts: { keepBackground?: boolean, fix?: boolean }) => HTMLCanvasElement }} Portrait
 */

/**
 * @param {HTMLImageElement | HTMLCanvasElement} img
 * @param {{ onStep?: (step: "face" | "background" | "colour") => void }} [opts]
 * @returns {Promise<Portrait>}
 */
export async function preparePortrait(img, { onStep } = {}) {
  const warnings = [];
  const work = fitCanvas(img, WORK_MAX);

  onStep?.("face");
  let faces = await findFaces(work);
  if (!faces.length) faces = await findViaPerson(work);
  if (!faces.length) {
    throw new NoFaceError("No face found. Use a clear, front-facing photo where the face is not too small.");
  }
  const face = faces[0];
  if (faces.length > 1 && area(faces[1].box) > area(face.box) * 0.55) {
    warnings.push("More than one face in the photo — the biggest one was used.");
  }

  // Level the eyes. This also fixes sideways phone photos.
  let angle = Math.atan2(face.eyeR.y - face.eyeL.y, face.eyeR.x - face.eyeL.x);
  if (Math.abs(angle) < (0.4 * Math.PI) / 180) angle = 0;
  const c = { x: (face.eyeL.x + face.eyeR.x) / 2, y: (face.eyeL.y + face.eyeR.y) / 2 };
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rot = (p) => {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    return { x: c.x + dx * cos + dy * sin, y: c.y - dx * sin + dy * cos };
  };

  const top = rot(face.top);
  const chin = rot(face.chin);
  const faceH = Math.max(1, chin.y - top.y);
  if (faceH < 110) warnings.push("The face is small in this photo, so the print may look soft. A closer photo is better.");

  // Crop generously around head and shoulders, at a fixed face size.
  const scale = Math.min(1.6, TARGET_FACE / faceH);
  const left = c.x - 1.8 * faceH;
  const topY = top.y - 1.45 * faceH;
  const W = Math.round(3.6 * faceH * scale);
  const H = Math.round(4.3 * faceH * scale);
  const crop = makeCanvas(W, H);
  const ctx = crop.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingQuality = "high";
  ctx.setTransform(scale, 0, 0, scale, -left * scale, -topY * scale);
  ctx.translate(c.x, c.y);
  ctx.rotate(-angle);
  ctx.translate(-c.x, -c.y);
  ctx.drawImage(work, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const map = (p) => {
    const r = rot(p);
    return { x: (r.x - left) * scale, y: (r.y - topY) * scale };
  };

  const P = {
    eyeL: map(face.eyeL),
    eyeR: map(face.eyeR),
    top: map(face.top),
    chin: map(face.chin),
    nose: map(face.nose),
    sideL: map(face.sideL),
    sideR: map(face.sideR),
  };
  const info = {
    cx: (P.eyeL.x + P.eyeR.x) / 2,
    eyeY: (P.eyeL.y + P.eyeR.y) / 2,
    topY: P.top.y,
    chinY: P.chin.y,
    faceW: Math.hypot(P.sideR.x - P.sideL.x, P.sideR.y - P.sideL.y),
    crownY: 0,
  };

  const src = ctx.getImageData(0, 0, W, H).data;

  onStep?.("background");
  let alpha = await matte(crop);
  alpha = refineAlpha(alpha, src, W, H, P.nose);
  const crown = findCrown(alpha, W, H, info);
  info.crownY = crown.y;
  if (crown.cut) warnings.push("The top of the head is cut off in the photo, so the head size is estimated.");

  onStep?.("colour");
  const fg = decontaminate(src, alpha, W, H);
  const lut = colourFix(src, alpha, W, H, info);

  const cache = new Map();
  const variant = ({ keepBackground = false, fix = true } = {}) => {
    const key = `${keepBackground}|${fix}`;
    if (!cache.has(key)) {
      const out = makeCanvas(W, H);
      const octx = out.getContext("2d");
      const data = octx.createImageData(W, H);
      const d = data.data;
      const from = keepBackground ? src : fg;
      for (let i = 0; i < W * H; i++) {
        const j = i * 4;
        d[j] = fix ? lut[0][from[j]] : from[j];
        d[j + 1] = fix ? lut[1][from[j + 1]] : from[j + 1];
        d[j + 2] = fix ? lut[2][from[j + 2]] : from[j + 2];
        d[j + 3] = keepBackground ? src[j + 3] : alpha[i];
      }
      octx.putImageData(data, 0, 0);
      cache.set(key, out);
    }
    return cache.get(key);
  };

  // Raw pixels for the editor (look.js): original, cleaned cut-out colours, mask and the auto-fix tables.
  const data = { W, H, src, fg, alpha, lut };
  return { width: W, height: H, angle: (angle * 180) / Math.PI, face: info, warnings, variant, data };
}

/**
 * Crop for a photo of frame size fw × fh (any unit): head (chin to top of hair) = `head` of the height,
 * `top` of the height above the hair, face centred. Use with renderEdit(..., { fit: "contain" }).
 * @param {Portrait} p
 * @param {number} fw @param {number} fh
 * @param {{ head: number, top: number }} size
 */
export function passportEdit(p, fw, fh, { head, top }) {
  const { cx, chinY, crownY } = p.face;
  const s = (head * fh) / Math.max(1, chinY - crownY);
  const contain = Math.min(fw / p.width, fh / p.height);
  return {
    zoom: s / contain,
    x: (-(cx - p.width / 2) * s) / fw,
    y: (top * fh - fh / 2 - (crownY - p.height / 2) * s) / fh,
    rotate: 0,
    turn: 0,
    flip: false,
    brightness: 100,
    contrast: 100,
    saturation: 100,
  };
}

/**
 * Remove the background of a whole photo (no cropping) — for the background remover tool.
 * @returns {Promise<{ width: number, height: number, variant: (opts: { fix?: boolean }) => HTMLCanvasElement }>}
 */
export async function cutoutWhole(img, { maxSide = 2400, onStep } = {}) {
  const work = fitCanvas(img, maxSide);
  const W = work.width;
  const H = work.height;
  const src = work.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  onStep?.("background");
  const alpha = refineAlpha(await matte(work), src, W, H, null);
  onStep?.("colour");
  const fg = decontaminate(src, alpha, W, H);
  const cache = new Map();
  const variant = ({ fix = false } = {}) => {
    const key = String(fix);
    if (!cache.has(key)) {
      const lut = fix ? colourFix(src, alpha, W, H, null) : null;
      const out = makeCanvas(W, H);
      const octx = out.getContext("2d");
      const data = octx.createImageData(W, H);
      for (let i = 0; i < W * H; i++) {
        const j = i * 4;
        data.data[j] = lut ? lut[0][fg[j]] : fg[j];
        data.data[j + 1] = lut ? lut[1][fg[j + 1]] : fg[j + 1];
        data.data[j + 2] = lut ? lut[2][fg[j + 2]] : fg[j + 2];
        data.data[j + 3] = alpha[i];
      }
      octx.putImageData(data, 0, 0);
      cache.set(key, out);
    }
    return cache.get(key);
  };
  return { width: W, height: H, variant };
}

// ——— helpers ———

const area = (b) => (b.x1 - b.x0) * (b.y1 - b.y0);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function fitCanvas(img, max) {
  const w = srcW(img);
  const h = srcH(img);
  const s = Math.min(1, max / Math.max(w, h));
  const c = makeCanvas(w * s, h * s);
  const ctx = c.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

/** Faces too small for the detector (full-body photos): find the person first, then look at the top of them. */
async function findViaPerson(work) {
  const small = fitCanvas(work, 768);
  const a = await matte(small);
  const w = small.width;
  const h = small.height;
  let x0 = w,
    y0 = h,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (a[y * w + x] > 128) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return [];
  const side = Math.min(x1 - x0, (y1 - y0) * 0.45);
  // Centre on the person's mass near the top (the head).
  let sum = 0,
    n = 0;
  for (let y = y0; y < Math.min(h, y0 + side * 0.3); y++) {
    for (let x = x0; x <= x1; x++) {
      if (a[y * w + x] > 128) {
        sum += x;
        n++;
      }
    }
  }
  const cx = n ? sum / n : (x0 + x1) / 2;
  const k = work.width / w;
  const rx = (cx - side / 2) * k;
  const ry = (y0 - side * 0.1) * k;
  const rs = side * 1.1 * k;
  const zoom = Math.max(1, 720 / rs);
  const crop = makeCanvas(rs * zoom, rs * zoom);
  const cctx = crop.getContext("2d");
  cctx.imageSmoothingQuality = "high";
  cctx.drawImage(work, rx, ry, rs, rs, 0, 0, crop.width, crop.height);
  const found = await findFaces(crop);
  const back = (p) => ({ x: rx + p.x / zoom, y: ry + p.y / zoom });
  return found.map((f) => ({
    eyeL: back(f.eyeL),
    eyeR: back(f.eyeR),
    top: back(f.top),
    chin: back(f.chin),
    nose: back(f.nose),
    sideL: back(f.sideL),
    sideR: back(f.sideR),
    box: { x0: rx + f.box.x0 / zoom, y0: ry + f.box.y0 / zoom, x1: rx + f.box.x1 / zoom, y1: ry + f.box.y1 / zoom },
  }));
}

/**
 * Clean up the model's mask: nothing outside the original photo, firmer edges,
 * and drop separate blobs (another person, a chair) that don't touch the main person.
 */
function refineAlpha(alpha, src, W, H, seed) {
  const out = new Uint8ClampedArray(W * H);
  for (let i = 0; i < out.length; i++) {
    const a = ((alpha[i] - 12) * 255) / (238 - 12);
    out[i] = (clamp(a, 0, 255) * src[i * 4 + 3]) / 255;
  }
  if (!seed) return out;

  // Connected parts on a coarse grid.
  const S = 4;
  const gw = Math.ceil(W / S);
  const gh = Math.ceil(H / S);
  const solid = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const x = Math.min(W - 1, gx * S + 2);
      const y = Math.min(H - 1, gy * S + 2);
      solid[gy * gw + gx] = out[y * W + x] > 128 ? 1 : 0;
    }
  }
  const sx = clamp(Math.round(seed.x / S), 0, gw - 1);
  const sy = clamp(Math.round(seed.y / S), 0, gh - 1);
  let start = -1;
  // Seed on the nose; if the mask is unsure there, use the nearest solid cell.
  for (let r = 0; r < 12 && start < 0; r++) {
    for (let dy = -r; dy <= r && start < 0; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = sx + dx;
        const y = sy + dy;
        if (x >= 0 && y >= 0 && x < gw && y < gh && solid[y * gw + x]) {
          start = y * gw + x;
          break;
        }
      }
    }
  }
  if (start < 0) return out;

  const keep = new Uint8Array(gw * gh);
  const stack = [start];
  keep[start] = 1;
  while (stack.length) {
    const i = stack.pop();
    const x = i % gw;
    const y = (i - x) / gw;
    const next = [x > 0 ? i - 1 : -1, x < gw - 1 ? i + 1 : -1, y > 0 ? i - gw : -1, y < gh - 1 ? i + gw : -1];
    for (const j of next) {
      if (j >= 0 && solid[j] && !keep[j]) {
        keep[j] = 1;
        stack.push(j);
      }
    }
  }
  // Grow the kept area a little so soft hair edges next to it survive.
  const grown = new Uint8Array(gw * gh);
  const R = 3;
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      if (!keep[y * gw + x]) continue;
      for (let dy = -R; dy <= R; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= gh) continue;
        for (let dx = -R; dx <= R; dx++) {
          const xx = x + dx;
          if (xx >= 0 && xx < gw) grown[yy * gw + xx] = 1;
        }
      }
    }
  }
  for (let y = 0; y < H; y++) {
    const row = Math.floor(y / S) * gw;
    for (let x = 0; x < W; x++) {
      if (!grown[row + Math.floor(x / S)]) out[y * W + x] = 0;
    }
  }
  return out;
}

/** Top of the hair: first row above the forehead where the mask fills the middle of the head. */
function findCrown(alpha, W, H, f) {
  const faceH = f.chinY - f.topY;
  const half = Math.max(4, f.faceW * 0.16);
  const x0 = Math.max(0, Math.round(f.cx - half));
  const x1 = Math.min(W - 1, Math.round(f.cx + half));
  const need = (x1 - x0 + 1) * 0.5;
  const lo = f.topY - 0.8 * faceH;
  const hi = f.topY - 0.08 * faceH;
  for (let y = 0; y < f.topY; y++) {
    let n = 0;
    for (let x = x0; x <= x1; x++) if (alpha[y * W + x] > 127) n++;
    if (n >= need) {
      if (y <= 1) return { y: f.topY - 0.38 * faceH, cut: true };
      return { y: clamp(y, lo, hi), cut: false };
    }
  }
  return { y: f.topY - 0.3 * faceH, cut: false };
}

/**
 * Remove the old background's colour from soft edges (hair), so a white or blue background
 * doesn't show a dark or coloured halo. Solves I = a·F + (1 − a)·B for F, with B estimated
 * from nearby background pixels.
 */
function decontaminate(src, alpha, W, H) {
  const out = new Uint8ClampedArray(src);
  const S = 8;
  const gw = Math.ceil(W / S);
  const gh = Math.ceil(H / S);
  const num = new Float32Array(gw * gh * 3);
  const den = new Float32Array(gw * gh);
  for (let y = 0; y < H; y += 2) {
    const gy = Math.floor(y / S);
    for (let x = 0; x < W; x += 2) {
      const i = y * W + x;
      const wgt = src[i * 4 + 3] ? (255 - alpha[i]) / 255 : 0;
      if (wgt < 0.5) continue;
      const g = gy * gw + Math.floor(x / S);
      num[g * 3] += src[i * 4] * wgt;
      num[g * 3 + 1] += src[i * 4 + 1] * wgt;
      num[g * 3 + 2] += src[i * 4 + 2] * wgt;
      den[g] += wgt;
    }
  }
  // Blur the background estimate outward so cells inside the person get the colour around them.
  let n = num;
  let d = den;
  for (const r of [2, 4, 8]) {
    [n, d] = boxBlurGrid(n, d, gw, gh, r);
  }
  const bg = new Float32Array(gw * gh * 3);
  for (let g = 0; g < gw * gh; g++) {
    const k = d[g] > 1e-4 ? 1 / d[g] : 0;
    bg[g * 3] = k ? n[g * 3] * k : 255;
    bg[g * 3 + 1] = k ? n[g * 3 + 1] * k : 255;
    bg[g * 3 + 2] = k ? n[g * 3 + 2] * k : 255;
  }

  for (let y = 0; y < H; y++) {
    const fy = clamp(y / S - 0.5, 0, gh - 1);
    const y0 = Math.floor(fy);
    const y1 = Math.min(gh - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const a = alpha[i];
      if (a === 0 || a >= 250) continue;
      const fx = clamp(x / S - 0.5, 0, gw - 1);
      const x0 = Math.floor(fx);
      const x1 = Math.min(gw - 1, x0 + 1);
      const tx = fx - x0;
      const A = Math.max(0.2, a / 255);
      for (let ch = 0; ch < 3; ch++) {
        const b =
          (bg[(y0 * gw + x0) * 3 + ch] * (1 - tx) + bg[(y0 * gw + x1) * 3 + ch] * tx) * (1 - ty) +
          (bg[(y1 * gw + x0) * 3 + ch] * (1 - tx) + bg[(y1 * gw + x1) * 3 + ch] * tx) * ty;
        out[i * 4 + ch] = (src[i * 4 + ch] - (1 - A) * b) / A;
      }
    }
  }
  return out;
}

function boxBlurGrid(num, den, gw, gh, r) {
  const n2 = new Float32Array(num.length);
  const d2 = new Float32Array(den.length);
  // Separable box blur: rows then columns.
  const nt = new Float32Array(num.length);
  const dt = new Float32Array(den.length);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      let s0 = 0,
        s1 = 0,
        s2 = 0,
        sd = 0;
      for (let k = Math.max(0, x - r); k <= Math.min(gw - 1, x + r); k++) {
        const g = y * gw + k;
        s0 += num[g * 3];
        s1 += num[g * 3 + 1];
        s2 += num[g * 3 + 2];
        sd += den[g];
      }
      const g = y * gw + x;
      nt[g * 3] = s0;
      nt[g * 3 + 1] = s1;
      nt[g * 3 + 2] = s2;
      dt[g] = sd;
    }
  }
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      let s0 = 0,
        s1 = 0,
        s2 = 0,
        sd = 0;
      for (let k = Math.max(0, y - r); k <= Math.min(gh - 1, y + r); k++) {
        const g = k * gw + x;
        s0 += nt[g * 3];
        s1 += nt[g * 3 + 1];
        s2 += nt[g * 3 + 2];
        sd += dt[g];
      }
      const g = y * gw + x;
      // Keep the original where it already had a good estimate.
      const keep = den[g] > 2 ? 1 : 0;
      n2[g * 3] = keep ? num[g * 3] : s0;
      n2[g * 3 + 1] = keep ? num[g * 3 + 1] : s1;
      n2[g * 3 + 2] = keep ? num[g * 3 + 2] : s2;
      d2[g] = keep ? den[g] : sd;
    }
  }
  return [n2, d2];
}

/**
 * Gentle automatic fix, as three lookup tables (R, G, B):
 * a mild colour-cast correction, a small levels stretch, and exposure set from the face's brightness.
 */
function colourFix(src, alpha, W, H, f) {
  const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

  // Colour cast: grey-world over the whole photo, softened and limited.
  let sr = 0,
    sg = 0,
    sb = 0,
    n = 0;
  const hist = new Uint32Array(256);
  let fgCount = 0;
  for (let i = 0; i < W * H; i += 3) {
    const j = i * 4;
    if (!src[j + 3]) continue;
    sr += src[j];
    sg += src[j + 1];
    sb += src[j + 2];
    n++;
    if (alpha[i] > 200) {
      hist[Math.round(lum(src[j], src[j + 1], src[j + 2]))]++;
      fgCount++;
    }
  }
  const mean = (sr + sg + sb) / 3 / Math.max(1, n);
  const gain = [sr, sg, sb].map((s) => {
    const g = mean / Math.max(1, s / Math.max(1, n));
    return clamp(1 + (g - 1) * 0.5, 0.9, 1.12);
  });

  // Levels: stretch only a little, never squash.
  const pct = (p) => {
    let acc = 0;
    const target = fgCount * p;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= target) return v;
    }
    return 255;
  };
  const lo = fgCount ? Math.min(pct(0.005), 18) : 0;
  const hi = fgCount ? Math.max(pct(0.995), 228) : 255;

  if (!f) {
    // No face known: only cast + levels.
    return gain.map((g) => {
      const t = new Uint8ClampedArray(256);
      for (let v = 0; v < 256; v++) t[v] = Math.round(clamp((v * g - lo) / (hi - lo), 0, 1) * 255);
      return t;
    });
  }

  // Exposure: face (cheeks, nose, mouth) brightness → about 55%.
  const fcx = f.cx;
  const fcy = f.eyeY + (f.chinY - f.eyeY) * 0.45;
  const rx = f.faceW * 0.28;
  const ry = (f.chinY - f.eyeY) * 0.45;
  let ls = 0,
    ln = 0;
  for (let y = Math.max(0, Math.floor(fcy - ry)); y < Math.min(H, fcy + ry); y += 2) {
    for (let x = Math.max(0, Math.floor(fcx - rx)); x < Math.min(W, fcx + rx); x += 2) {
      const dx = (x - fcx) / rx;
      const dy = (y - fcy) / ry;
      if (dx * dx + dy * dy > 1) continue;
      const i = y * W + x;
      if (alpha[i] < 230) continue;
      const j = i * 4;
      const v = lum(src[j] * gain[0], src[j + 1] * gain[1], src[j + 2] * gain[2]);
      ls += clamp((v - lo) / (hi - lo), 0.001, 1);
      ln++;
    }
  }
  const skin = ln ? ls / ln : 0.55;
  const gamma = clamp(Math.log(0.55) / Math.log(clamp(skin, 0.05, 0.95)), 0.75, 1.25);

  return gain.map((g) => {
    const t = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) {
      const s = clamp((v * g - lo) / (hi - lo), 0, 1);
      t[v] = Math.round(Math.pow(s, gamma) * 255);
    }
    return t;
  });
}
