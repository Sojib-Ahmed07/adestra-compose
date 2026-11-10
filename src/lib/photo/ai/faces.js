// src/lib/photo/ai/faces.js
// Face finding with MediaPipe Face Mesh (runs offline in the browser from /vendor/facemesh).
// Returns the few landmarks the photo tools need, in pixels of the canvas that was passed in.
import { makeCanvas } from "../image";

const BASE = "/vendor/facemesh/";
const scripts = new Map();

/** Add a <script> once and wait for it. */
export function loadScript(src) {
  if (!scripts.has(src)) {
    scripts.set(
      src,
      new Promise((resolve, reject) => {
        const el = document.createElement("script");
        el.src = src;
        el.async = true;
        el.onload = () => resolve();
        el.onerror = () => {
          scripts.delete(src);
          reject(new Error("Couldn't load the photo AI files. Run `npm run vendor` and reload the page."));
        };
        document.head.appendChild(el);
      }),
    );
  }
  return scripts.get(src);
}

let meshPromise;
function getMesh() {
  if (!meshPromise) {
    meshPromise = (async () => {
      await loadScript(`${BASE}face_mesh.js`);
      const mesh = new window.FaceMesh({ locateFile: (f) => `${BASE}${f}` });
      mesh.setOptions({
        maxNumFaces: 4,
        refineLandmarks: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
        selfieMode: false,
      });
      await mesh.initialize();
      return mesh;
    })().catch((err) => {
      meshPromise = null;
      throw err;
    });
  }
  return meshPromise;
}

/** Start downloading the face model early (e.g. when a photo tool opens). */
export function warmFaces() {
  getMesh().catch(() => {});
}

// Landmark numbers in the 468-point face mesh.
const L = { top: 10, chin: 152, nose: 1, left: 234, right: 454, eyeA: [33, 133], eyeB: [362, 263] };

/**
 * @typedef {{ x: number, y: number }} Pt
 * @typedef {{ eyeL: Pt, eyeR: Pt, top: Pt, chin: Pt, nose: Pt, sideL: Pt, sideR: Pt,
 *   box: { x0: number, y0: number, x1: number, y1: number } }} Face
 * eyeL is the eye on the left of the picture. top = upper forehead (not the top of the hair).
 */

let queue = Promise.resolve();

/**
 * Find faces in a canvas. Calls are queued — the model handles one picture at a time.
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<Face[]>} biggest face first
 */
export function findFaces(canvas) {
  const run = queue.then(async () => {
    const mesh = await getMesh();
    // The model works on a small copy anyway; a huge canvas only slows the upload to the GPU.
    const input = shrink(canvas, 1280);
    const sx = canvas.width / input.width;
    const sy = canvas.height / input.height;
    const result = await new Promise((resolve, reject) => {
      mesh.onResults(resolve);
      mesh.reset(); // each photo is new — don't track from the previous one
      mesh.send({ image: input }).catch(reject);
    });
    const list = (result.multiFaceLandmarks || []).map((lm) => toFace(lm, input.width * sx, input.height * sy));
    return list.sort((a, b) => area(b.box) - area(a.box));
  });
  queue = run.catch(() => {});
  return run;
}

function toFace(lm, w, h) {
  const p = (i) => ({ x: lm[i].x * w, y: lm[i].y * h });
  const mid = ([a, b]) => {
    const pa = p(a);
    const pb = p(b);
    return { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
  };
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const pt of lm) {
    x0 = Math.min(x0, pt.x * w);
    y0 = Math.min(y0, pt.y * h);
    x1 = Math.max(x1, pt.x * w);
    y1 = Math.max(y1, pt.y * h);
  }
  // eyeA is the person's right eye = the picture's left eye when the photo is upright.
  // Keep that order (not sorted by x), so a sideways or upside-down photo still gives the true tilt.
  const eyeL = mid(L.eyeA);
  const eyeR = mid(L.eyeB);
  return {
    eyeL,
    eyeR,
    top: p(L.top),
    chin: p(L.chin),
    nose: p(L.nose),
    sideL: p(L.left),
    sideR: p(L.right),
    box: { x0, y0, x1, y1 },
  };
}

const area = (b) => (b.x1 - b.x0) * (b.y1 - b.y0);

function shrink(canvas, max) {
  const s = max / Math.max(canvas.width, canvas.height);
  if (s >= 1) return canvas;
  const c = makeCanvas(canvas.width * s, canvas.height * s);
  const ctx = c.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, c.width, c.height);
  return c;
}
