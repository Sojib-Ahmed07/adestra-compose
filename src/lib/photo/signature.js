// src/lib/photo/signature.js
// Make a phone photo of a signature look like a clean scan: white paper, solid ink.

const INK = { black: [17, 17, 17], blue: [16, 42, 140] };

/**
 * Cleans the canvas in place.
 * @param {HTMLCanvasElement} canvas
 * @param {{ strength: number, ink: "original" | "black" | "blue" }} opts  strength 0.3 (gentle) … 0.95 (strong)
 */
export function cleanSignature(canvas, { strength = 0.7, ink = "original" } = {}) {
  const ctx = canvas.getContext("2d");
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = data.data;

  // Brightness histogram → paper level (bright end) and ink level (dark end).
  const hist = new Uint32Array(256);
  const lum = new Uint8ClampedArray(d.length / 4);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    lum[j] = l;
    hist[lum[j]]++;
  }
  const total = lum.length;
  const pct = (p) => {
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= total * p) return v;
    }
    return 255;
  };
  const paper = pct(0.9);
  const inkLevel = Math.min(pct(0.01), paper - 10);
  const span = Math.max(1, paper - inkLevel);
  const cut = 1 - strength * 0.6; // strength 0.7 → keep pixels darker than ~58% of the way to paper

  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const n = (lum[j] - inkLevel) / span; // 0 = ink, 1 = paper
    if (n >= cut) {
      d[i] = d[i + 1] = d[i + 2] = 255;
      continue;
    }
    const dark = Math.min(1, (1 - n / cut) * 1.6);
    const c = ink === "original" ? [d[i] * 0.6, d[i + 1] * 0.6, d[i + 2] * 0.6] : INK[ink];
    d[i] = 255 + (c[0] - 255) * dark;
    d[i + 1] = 255 + (c[1] - 255) * dark;
    d[i + 2] = 255 + (c[2] - 255) * dark;
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}
