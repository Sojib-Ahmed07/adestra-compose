// src/lib/photo/card.js
// Phone photo of a card (NID, smart card, any ID-1 card) → flat, straight card image.
// findCardCorners guesses the card's 4 corners; warpQuad flattens the photo between them.
import { makeCanvas, srcH, srcW } from "./image";

/** @typedef {{ x: number, y: number }} Pt */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Guess the card's corners: separate the card from the table by colour, take the biggest region,
 * then the 4-sided shape that covers most of it. Falls back to the whole photo (slightly inset).
 * @param {HTMLImageElement | HTMLCanvasElement} img
 * @returns {{ corners: Pt[], found: boolean }} corners in image pixels: top-left, top-right, bottom-right, bottom-left
 */
export function findCardCorners(img) {
  const W = srcW(img);
  const H = srcH(img);
  const s = Math.min(1, 360 / Math.max(W, H));
  const w = Math.max(8, Math.round(W * s));
  const h = Math.max(8, Math.round(H * s));
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;

  const fallback = {
    found: false,
    corners: [
      { x: W * 0.04, y: H * 0.04 },
      { x: W * 0.96, y: H * 0.04 },
      { x: W * 0.96, y: H * 0.96 },
      { x: W * 0.04, y: H * 0.96 },
    ],
  };

  // Table colour = median of the border pixels.
  const border = [[], [], []];
  for (let x = 0; x < w; x++) for (const y of [0, 1, h - 2, h - 1]) pushPx(border, d, (y * w + x) * 4);
  for (let y = 0; y < h; y++) for (const x of [0, 1, w - 2, w - 1]) pushPx(border, d, (y * w + x) * 4);
  const bg = border.map((ch) => ch.sort((a, b) => a - b)[ch.length >> 1]);

  // Distance from the table colour (brightness counts less, so shadows don't look like card).
  const dist = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const dr = d[i * 4] - bg[0];
    const dg = d[i * 4 + 1] - bg[1];
    const db = d[i * 4 + 2] - bg[2];
    const mean = (dr + dg + db) / 3;
    dist[i] = Math.sqrt((dr - mean) ** 2 + (dg - mean) ** 2 + (db - mean) ** 2) * 1.6 + Math.abs(mean);
  }
  const t = otsu(dist);
  let mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) mask[i] = dist[i] > t ? 1 : 0;
  // Close small gaps (text, photo on the card), then remove specks.
  mask = erode(dilate(mask, w, h, 3), w, h, 3);
  mask = dilate(erode(mask, w, h, 2), w, h, 2);

  const region = biggestRegion(mask, w, h);
  if (!region || region.length < w * h * 0.12) return fallback;

  const hull = convexHull(region.map((i) => ({ x: i % w, y: Math.floor(i / w) })));
  const quad = biggestQuad(hull);
  if (!quad) return fallback;
  if (polyArea(quad) < w * h * 0.12) return fallback;
  return { found: true, corners: orderCorners(quad).map((p) => ({ x: clamp(p.x / s, 0, W), y: clamp(p.y / s, 0, H) })) };
}

function pushPx(arr, d, j) {
  arr[0].push(d[j]);
  arr[1].push(d[j + 1]);
  arr[2].push(d[j + 2]);
}

function otsu(values) {
  let max = 0;
  for (const v of values) if (v > max) max = v;
  if (max <= 0) return 0;
  const bins = 128;
  const hist = new Float64Array(bins);
  for (const v of values) hist[Math.min(bins - 1, Math.floor((v / max) * bins))]++;
  const total = values.length;
  let sum = 0;
  for (let i = 0; i < bins; i++) sum += i * hist[i];
  let sumB = 0,
    wB = 0,
    best = 0,
    split = 0;
  for (let i = 0; i < bins; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      split = i;
    }
  }
  return ((split + 0.5) / bins) * max;
}

function dilate(m, w, h, r) {
  return morph(m, w, h, r, 1);
}
function erode(m, w, h, r) {
  return morph(m, w, h, r, 0);
}
/** Square-window max (dilate) or min (erode), separable. */
function morph(m, w, h, r, grow) {
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = grow ? 0 : 1;
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) {
        const p = m[y * w + k];
        if (grow ? p : !p) {
          v = grow ? 1 : 0;
          break;
        }
      }
      tmp[y * w + x] = v;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = grow ? 0 : 1;
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) {
        const p = tmp[k * w + x];
        if (grow ? p : !p) {
          v = grow ? 1 : 0;
          break;
        }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

function biggestRegion(mask, w, h) {
  const seen = new Uint8Array(w * h);
  let best = null;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue;
    const list = [];
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const j = stack.pop();
      list.push(j);
      const x = j % w;
      for (const k of [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, j - w, j + w]) {
        if (k >= 0 && k < mask.length && mask[k] && !seen[k]) {
          seen[k] = 1;
          stack.push(k);
        }
      }
    }
    if (!best || list.length > best.length) best = list;
  }
  return best;
}

function convexHull(points) {
  const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function polyArea(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const j = (i + 1) % p.length;
    a += p[i].x * p[j].y - p[j].x * p[i].y;
  }
  return Math.abs(a) / 2;
}

/** The 4 hull points that enclose the most area (candidates = extreme points in 36 directions). */
function biggestQuad(hull) {
  if (hull.length < 4) return null;
  const cand = [];
  for (let k = 0; k < 36; k++) {
    const a = (k * Math.PI) / 18;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let best = hull[0];
    let bv = -Infinity;
    for (const p of hull) {
      const v = p.x * dx + p.y * dy;
      if (v > bv) {
        bv = v;
        best = p;
      }
    }
    if (!cand.includes(best)) cand.push(best);
  }
  if (cand.length < 4) return null;
  // Candidates are in angular order around the hull, so any 4 in order form a simple quad.
  let best = null;
  let bestA = 0;
  const n = cand.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++) {
          const q = [cand[a], cand[b], cand[c], cand[d]];
          const ar = polyArea(q);
          if (ar > bestA) {
            bestA = ar;
            best = q;
          }
        }
  return best;
}

/** Order as top-left, top-right, bottom-right, bottom-left (clockwise from the top-left). */
export function orderCorners(q) {
  const cx = q.reduce((s, p) => s + p.x, 0) / 4;
  const cy = q.reduce((s, p) => s + p.y, 0) / 4;
  const sorted = q.slice().sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  // atan2 order starts near the left (−π); find the top-left = smallest x + y.
  let start = 0;
  for (let i = 1; i < 4; i++) if (sorted[i].x + sorted[i].y < sorted[start].x + sorted[start].y) start = i;
  return [0, 1, 2, 3].map((k) => sorted[(start + k) % 4]);
}

/**
 * Flatten the area between 4 corners (TL, TR, BR, BL) into a w × h canvas (perspective correction).
 * If the card was photographed standing up (taller than wide), it's turned so the long side is across.
 */
export function warpQuad(img, corners, w, h) {
  let q = corners;
  const top = Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y) + Math.hypot(q[2].x - q[3].x, q[2].y - q[3].y);
  const side = Math.hypot(q[3].x - q[0].x, q[3].y - q[0].y) + Math.hypot(q[2].x - q[1].x, q[2].y - q[1].y);
  if ((side > top) !== (h > w)) q = [q[3], q[0], q[1], q[2]]; // turn a quarter

  const W = srcW(img);
  const H = srcH(img);
  const sc = makeCanvas(W, H);
  const sctx = sc.getContext("2d", { willReadFrequently: true });
  sctx.drawImage(img, 0, 0);
  const sd = sctx.getImageData(0, 0, W, H).data;

  const out = makeCanvas(w, h);
  const octx = out.getContext("2d");
  const od = octx.createImageData(out.width, out.height);
  const Hm = homography(
    [
      { x: 0, y: 0 },
      { x: out.width, y: 0 },
      { x: out.width, y: out.height },
      { x: 0, y: out.height },
    ],
    q,
  );
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const z = Hm[6] * px + Hm[7] * py + 1;
      const sx = (Hm[0] * px + Hm[1] * py + Hm[2]) / z - 0.5;
      const sy = (Hm[3] * px + Hm[4] * py + Hm[5]) / z - 0.5;
      const x0 = clamp(Math.floor(sx), 0, W - 1);
      const y0 = clamp(Math.floor(sy), 0, H - 1);
      const x1 = Math.min(W - 1, x0 + 1);
      const y1 = Math.min(H - 1, y0 + 1);
      const fx = clamp(sx - x0, 0, 1);
      const fy = clamp(sy - y0, 0, 1);
      const o = (y * out.width + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const a = sd[(y0 * W + x0) * 4 + ch] * (1 - fx) + sd[(y0 * W + x1) * 4 + ch] * fx;
        const b = sd[(y1 * W + x0) * 4 + ch] * (1 - fx) + sd[(y1 * W + x1) * 4 + ch] * fx;
        od.data[o + ch] = a * (1 - fy) + b * fy;
      }
      od.data[o + 3] = 255;
    }
  }
  octx.putImageData(od, 0, 0);
  return out;
}

/** 3×3 projective map (last entry 1) taking 4 points `from` onto `to`. */
function homography(from, to) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i];
    const { x: u, y: v } = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  return solve(A, b);
}

function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const div = M[c][c] || 1e-12;
    for (let k = c; k <= n; k++) M[c][k] /= div;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row) => row[n]);
}
