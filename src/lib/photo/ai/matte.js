// src/lib/photo/ai/matte.js
// Background removal: MODNet portrait matting in a Web Worker (public/workers/matte.js).
// matte(canvas) → one alpha value (0–255) per pixel of that canvas: 255 = person, 0 = background.
import { makeCanvas } from "../image";

const SIDE = 512; // the model's preferred short side
const STRIDE = 32;

let worker;
let seq = 0;
const pending = new Map();

function getWorker() {
  if (!worker) {
    worker = new Worker("/workers/matte.js", { type: "module" });
    worker.onmessage = ({ data }) => {
      const job = pending.get(data.id);
      if (!job) return;
      pending.delete(data.id);
      if (data.error) job.reject(new Error(friendly(data.error)));
      else job.resolve(data);
    };
    worker.onerror = (ev) => {
      ev.preventDefault?.();
      for (const job of pending.values()) job.reject(new Error(friendly(ev.message || "worker failed")));
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  }
  return worker;
}

function friendly(msg) {
  if (/fetch|404|failed to load|no available backend/i.test(msg)) {
    return "Couldn't load the background-removal files. Run `npm run vendor` and reload the page.";
  }
  return `Background removal failed: ${msg}`;
}

function call(payload, transfer = []) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, ...payload }, transfer);
  });
}

/** Load the model in the background so the first photo is faster. */
export function warmMatte() {
  call({}).catch(() => {});
}

const snap = (v) => Math.max(STRIDE, Math.round(v / STRIDE) * STRIDE);

/**
 * Person mask for a canvas.
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<Uint8ClampedArray>} alpha, canvas.width × canvas.height
 */
export async function matte(canvas) {
  const W = canvas.width;
  const H = canvas.height;
  const ratio = SIDE / Math.min(W, H);
  const w = snap(W * ratio);
  const h = snap(H * ratio);

  const small = makeCanvas(w, h);
  const sctx = small.getContext("2d", { willReadFrequently: true });
  sctx.imageSmoothingQuality = "high";
  sctx.fillStyle = "#fff";
  sctx.fillRect(0, 0, w, h);
  sctx.drawImage(canvas, 0, 0, w, h);
  const pixels = sctx.getImageData(0, 0, w, h).data;

  const { matte: m } = await call({ width: w, height: h, pixels }, [pixels.buffer]);

  // Model output → grey image → smooth upscale to the canvas size.
  const out = sctx.createImageData(w, h);
  for (let i = 0; i < m.length; i++) {
    const v = Math.round(Math.min(1, Math.max(0, m[i])) * 255);
    out.data[i * 4] = v;
    out.data[i * 4 + 1] = v;
    out.data[i * 4 + 2] = v;
    out.data[i * 4 + 3] = 255;
  }
  sctx.putImageData(out, 0, 0);
  const big = makeCanvas(W, H);
  const bctx = big.getContext("2d", { willReadFrequently: true });
  bctx.imageSmoothingEnabled = true;
  bctx.imageSmoothingQuality = "high";
  bctx.drawImage(small, 0, 0, W, H);
  const rgba = bctx.getImageData(0, 0, W, H).data;
  const alpha = new Uint8ClampedArray(W * H);
  for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4];
  return alpha;
}
