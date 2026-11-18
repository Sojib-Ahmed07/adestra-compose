// src/lib/photo/ai/matte.js
// Background removal. Two engines, same answer: matte(canvas) → one alpha value (0–255) per pixel of that canvas,
// 255 = person, 0 = background.
//  - "best": BiRefNet on Cloudflare's servers (free plan, 5,000 photos a month) through our own /api/cutout, which
//    forwards to the shop's Cloudflare Worker. Only offered when CUTOUT_URL / CUTOUT_KEY are set on the server.
//    The photo leaves the browser (owner's decision, 18 Nov 2026).
//  - "offline": MODNet in a Web Worker (public/workers/matte.js), on this computer.
// If "best" fails (no internet, monthly limit, Worker down) the photo is done offline and a notice is sent
// (onCutoutNotice) — a photo never fails because of the cloud.
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
  call({}).catch(() => { });
}

const snap = (v) => Math.max(STRIDE, Math.round(v / STRIDE) * STRIDE);

// ——— engine choice ———

const MODE_KEY = "cutout:mode";
let cloud = null; // Promise<boolean>: is the Cloudflare cut-out set up on the server?
const listeners = new Set();

/** Is the Cloudflare cut-out set up? (asks the server once) */
export function cloudCutoutReady() {
  if (!cloud) {
    cloud = fetch("/api/cutout", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((d) => !!d.enabled)
      .catch(() => false);
  }
  return cloud;
}

/** "best" (Cloudflare) or "offline". Saved on this computer; "best" by default. */
export function getCutoutMode() {
  try {
    return localStorage.getItem(MODE_KEY) === "offline" ? "offline" : "best";
  } catch {
    return "best";
  }
}
export function setCutoutMode(mode) {
  try {
    localStorage.setItem(MODE_KEY, mode === "offline" ? "offline" : "best");
  } catch { }
}

/** Listen for "the cloud cut-out failed, done offline" notices. Returns an unsubscribe function. */
export function onCutoutNotice(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const notify = (msg) => listeners.forEach((fn) => fn(msg));

const CLOUD_SIDE = 1600; // longest side sent to Cloudflare (keeps the upload small and under Vercel's 4.5 MB limit)

async function cloudMatte(canvas) {
  const W = canvas.width;
  const H = canvas.height;
  const k = Math.min(1, CLOUD_SIDE / Math.max(W, H));
  const w = Math.max(1, Math.round(W * k));
  const h = Math.max(1, Math.round(H * k));
  const send = makeCanvas(w, h);
  const sctx = send.getContext("2d");
  sctx.fillStyle = "#fff";
  sctx.fillRect(0, 0, w, h);
  sctx.imageSmoothingQuality = "high";
  sctx.drawImage(canvas, 0, 0, w, h);
  const blob = await new Promise((res) => send.toBlob(res, "image/jpeg", 0.92));
  if (!blob) throw new Error("could not read the photo");

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 60000);
  let res;
  try {
    res = await fetch("/api/cutout", {
      method: "POST",
      body: blob,
      headers: { "content-type": "image/jpeg" },
      signal: ctl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let msg = `error ${res.status}`;
    try {
      msg = (await res.json()).error || msg;
    } catch { }
    throw new Error(msg);
  }
  const bmp = await createImageBitmap(await res.blob());
  const big = makeCanvas(W, H);
  const bctx = big.getContext("2d", { willReadFrequently: true });
  bctx.imageSmoothingEnabled = true;
  bctx.imageSmoothingQuality = "high";
  bctx.drawImage(bmp, 0, 0, W, H);
  bmp.close?.();
  const rgba = bctx.getImageData(0, 0, W, H).data;
  const alpha = new Uint8ClampedArray(W * H);
  for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
  return alpha;
}

/**
 * Person mask for a canvas, with the chosen engine.
 * @param {HTMLCanvasElement} canvas
 * @param {{ local?: boolean }} [opts]  local: always use the offline engine (quick checks)
 * @returns {Promise<Uint8ClampedArray>} alpha, canvas.width × canvas.height
 */
export async function matte(canvas, { local = false } = {}) {
  if (!local && getCutoutMode() === "best" && (await cloudCutoutReady())) {
    try {
      return await cloudMatte(canvas);
    } catch (err) {
      const why = (err?.name === "AbortError" ? "it took too long" : err?.message || "unknown error").replace(/\.+$/, "");
      notify(`Best cut-out (Cloudflare) didn't work — ${why}. This photo was done offline.`);
    }
  }
  return localMatte(canvas);
}

/** Offline engine: MODNet in the Web Worker. */
async function localMatte(canvas) {
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