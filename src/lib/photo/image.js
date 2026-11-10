// src/lib/photo/image.js
// Browser-only helpers: load a photo, crop/adjust it onto a canvas.

/**
 * @typedef {{ zoom: number, x: number, y: number, rotate: number, turn: number, flip: boolean,
 *   brightness: number, contrast: number, saturation: number }} Edit
 * zoom 1 = image just covers the frame. x/y = offset as a fraction of the frame size.
 * rotate = fine straighten in degrees (−45…45). turn = quarter turns (0–3).
 * brightness/contrast/saturation are percentages (100 = unchanged).
 */
export const defaultEdit = Object.freeze({
  zoom: 1,
  x: 0,
  y: 0,
  rotate: 0,
  turn: 0,
  flip: false,
  brightness: 100,
  contrast: 100,
  saturation: 100,
});

/** Load an image file. Browsers apply the phone's EXIF rotation automatically. */
export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () =>
      resolve({
        img,
        url,
        width: img.naturalWidth,
        height: img.naturalHeight,
        name: file.name,
        size: file.size,
        type: file.type,
      });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Couldn't open “${file.name}”. Use a JPG, PNG or WebP photo.`));
    };
    img.src = url;
  });
}

/** Width/height of an <img>, canvas or ImageBitmap. */
export const srcW = (img) => img.naturalWidth || img.width;
export const srcH = (img) => img.naturalHeight || img.height;

/** A smaller copy for fast on-screen previews (long side ≤ max). Returns the original if already small. */
export function previewSource(img, max = 1600) {
  const w = srcW(img);
  const h = srcH(img);
  const s = max / Math.max(w, h);
  if (s >= 1) return img;
  const c = makeCanvas(w * s, h * s);
  const ctx = c.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

export function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

let filterSupport;
function supportsFilter() {
  if (filterSupport === undefined) {
    const ctx = makeCanvas(1, 1).getContext("2d");
    filterSupport = typeof ctx.filter === "string";
    if (filterSupport) {
      ctx.filter = "brightness(50%)";
      filterSupport = ctx.filter === "brightness(50%)";
    }
  }
  return filterSupport;
}

/** Pixel fallback for browsers without ctx.filter (older Safari). */
function adjustPixels(ctx, w, h, { brightness, contrast, saturation }) {
  const data = ctx.getImageData(0, 0, w, h);
  const d = data.data;
  const b = brightness / 100;
  const c = contrast / 100;
  const s = saturation / 100;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] * b,
      g = d[i + 1] * b,
      bl = d[i + 2] * b;
    r = (r - 128) * c + 128;
    g = (g - 128) * c + 128;
    bl = (bl - 128) * c + 128;
    const grey = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    d[i] = grey + (r - grey) * s;
    d[i + 1] = grey + (g - grey) * s;
    d[i + 2] = grey + (bl - grey) * s;
  }
  ctx.putImageData(data, 0, 0);
}

/** How big the image is drawn (before zoom) so it just covers a w×h frame. */
export function coverScale(img, w, h, edit) {
  const quarter = (edit.turn ?? 0) % 2 === 1;
  const iw = quarter ? srcH(img) : srcW(img);
  const ih = quarter ? srcW(img) : srcH(img);
  // A straightened (rotated) image must still cover the frame's corners.
  const rad = Math.abs(((edit.rotate ?? 0) * Math.PI) / 180);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return Math.max((w * cos + h * sin) / iw, (w * sin + h * cos) / ih);
}

/**
 * Draw `img` with `edit` into a new w×h canvas.
 * @param {HTMLImageElement} img
 * @param {Edit} edit
 * @param {number} w @param {number} h
 * @param {{ background?: string, fit?: "cover" | "contain" }} [opts]
 */
export function renderEdit(img, edit, w, h, opts = {}) {
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = opts.background ?? "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawEdit(ctx, img, edit, { x: 0, y: 0, w: canvas.width, h: canvas.height }, opts.fit);
  return canvas;
}

/**
 * Draw `img` with `edit` as if into the frame `box` of an existing canvas — without clearing or clipping,
 * so a cut-out (transparent) photo can overlap its neighbours (joint photos).
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number, w: number, h: number }} box
 * @param {"cover" | "contain"} [fit]
 */
export function drawEdit(ctx, img, edit, box, fit = "cover") {
  const e = { ...defaultEdit, ...edit };
  const adjusted = e.brightness !== 100 || e.contrast !== 100 || e.saturation !== 100;
  const useFilter = !adjusted || supportsFilter();

  let scale;
  if (fit === "contain") {
    const quarter = e.turn % 2 === 1;
    const iw = quarter ? srcH(img) : srcW(img);
    const ih = quarter ? srcW(img) : srcH(img);
    scale = Math.min(box.w / iw, box.h / ih) * e.zoom;
  } else {
    scale = coverScale(img, box.w, box.h, e) * e.zoom;
  }

  // Without ctx.filter (older Safari) adjust a copy of the image's pixels first.
  let source = img;
  if (adjusted && !useFilter) {
    source = imageToCanvas(img);
    adjustPixels(source.getContext("2d"), source.width, source.height, e);
  }

  ctx.save();
  ctx.imageSmoothingQuality = "high";
  if (adjusted && useFilter) ctx.filter = `brightness(${e.brightness}%) contrast(${e.contrast}%) saturate(${e.saturation}%)`;
  ctx.translate(box.x + box.w / 2 + e.x * box.w, box.y + box.h / 2 + e.y * box.h);
  ctx.rotate(((e.turn * 90 + e.rotate) * Math.PI) / 180);
  if (e.flip) ctx.scale(-1, 1);
  ctx.scale(scale, scale);
  ctx.drawImage(source, -srcW(img) / 2, -srcH(img) / 2);
  ctx.restore();
}

/** Fit any canvas inside w×h (letterboxed on `background`). */
export function containCanvas(src, w, h, background = "#ffffff") {
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const s = Math.min(canvas.width / src.width, canvas.height / src.height);
  const dw = src.width * s;
  const dh = src.height * s;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
  return canvas;
}

/** Scale a canvas to exactly w×h (stretch — callers keep the ratio themselves). */
export function scaleCanvas(src, w, h, background) {
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext("2d");
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.imageSmoothingQuality = "high";
  // Step down in halves for sharper results on big reductions.
  let cur = src;
  while (cur.width / 2 > canvas.width && cur.height / 2 > canvas.height) {
    const half = makeCanvas(cur.width / 2, cur.height / 2);
    const hctx = half.getContext("2d");
    hctx.imageSmoothingQuality = "high";
    hctx.drawImage(cur, 0, 0, half.width, half.height);
    cur = half;
  }
  ctx.drawImage(cur, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Copy an <img> into a canvas at its natural size. */
export function imageToCanvas(img, background) {
  const c = makeCanvas(srcW(img), srcH(img));
  const ctx = c.getContext("2d");
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, c.width, c.height);
  }
  ctx.drawImage(img, 0, 0);
  return c;
}
