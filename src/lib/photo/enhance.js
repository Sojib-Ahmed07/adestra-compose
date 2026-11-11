// src/lib/photo/enhance.js
// Make a phone photo / scan of a document or card print clearly (browser only):
// white balance from the paper/card white, a levels stretch, a little colour and sharpening, optional black & white.
// It only improves how the picture prints — it never changes what is written on it.
import { makeCanvas } from "./image";

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** @typedef {"off" | "clear" | "extra"} EnhanceLevel */

export const enhanceLevels = [
    { value: "off", label: "As it is" },
    { value: "clear", label: "Clearer" },
    { value: "extra", label: "Extra clear" },
];

/**
 * @param {HTMLCanvasElement} src
 * @param {{ level?: EnhanceLevel, grey?: boolean, brightness?: number, contrast?: number }} opts
 *   brightness / contrast: −50…50 extra by hand (0 = none)
 * @returns {HTMLCanvasElement} a new canvas (or `src` itself when nothing changes)
 */
export function enhanceScan(src, { level = "clear", grey = false, brightness = 0, contrast = 0 } = {}) {
    if (level === "off" && !grey && !brightness && !contrast) return src;
    const W = src.width;
    const H = src.height;
    const out = makeCanvas(W, H);
    const ctx = out.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(src, 0, 0);
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    const n = W * H;

    let gain = [1, 1, 1];
    let lo = 0;
    let hi = 255;
    if (level !== "off") {
        // Histogram of brightness.
        const hist = new Uint32Array(256);
        for (let i = 0; i < n; i += 2) hist[(d[i * 4] * 54 + d[i * 4 + 1] * 183 + d[i * 4 + 2] * 19) >> 8]++;
        const total = Math.ceil(n / 2);
        const pct = (p) => {
            let acc = 0;
            for (let v = 0; v < 256; v++) {
                acc += hist[v];
                if (acc >= total * p) return v;
            }
            return 255;
        };
        const p90 = pct(0.9);
        // White balance: the brightest, nearly grey pixels are the card / paper white.
        let sr = 0,
            sg = 0,
            sb = 0,
            k = 0;
        for (let i = 0; i < n; i += 2) {
            const j = i * 4;
            const r = d[j],
                g = d[j + 1],
                b = d[j + 2];
            const l = (r * 54 + g * 183 + b * 19) >> 8;
            if (l < p90) continue;
            const mx = Math.max(r, g, b);
            if (mx - Math.min(r, g, b) > mx * 0.25) continue;
            sr += r;
            sg += g;
            sb += b;
            k++;
        }
        if (k > 50) {
            const m = (sr + sg + sb) / 3 / k;
            gain = [sr, sg, sb].map((s) => clamp(m / (s / k), 0.82, 1.22));
        }
        const strong = level === "extra";
        lo = Math.min(pct(strong ? 0.01 : 0.005), strong ? 70 : 45);
        hi = Math.max(pct(strong ? 0.985 : 0.995), 150);
    }

    const con = 1 + contrast / 100 + (level === "extra" ? 0.08 : 0);
    const bright = brightness * 1.2;
    const satBoost = level === "extra" ? 1.15 : level === "clear" ? 1.06 : 1;
    const gamma = level === "off" ? 1 : 0.92;
    const lut = [0, 1, 2].map((ch) => {
        const t = new Uint8ClampedArray(256);
        for (let v = 0; v < 256; v++) {
            let x = clamp((v * gain[ch] - lo) / Math.max(1, hi - lo), 0, 1);
            x = Math.pow(x, gamma) * 255;
            x = (x - 128) * con + 128 + bright;
            t[v] = clamp(Math.round(x), 0, 255);
        }
        return t;
    });
    for (let i = 0; i < n; i++) {
        const j = i * 4;
        let r = lut[0][d[j]],
            g = lut[1][d[j + 1]],
            b = lut[2][d[j + 2]];
        const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (grey) {
            r = g = b = l;
        } else if (satBoost !== 1) {
            r = l + (r - l) * satBoost;
            g = l + (g - l) * satBoost;
            b = l + (b - l) * satBoost;
        }
        d[j] = r;
        d[j + 1] = g;
        d[j + 2] = b;
    }

    // Sharpen (unsharp mask, radius 1) — text and the photo on the card look crisper.
    const amount = level === "extra" ? 0.9 : level === "clear" ? 0.55 : 0;
    if (amount > 0) sharpenRGBA(d, W, H, amount);
    ctx.putImageData(img, 0, 0);
    return out;
}

function sharpenRGBA(d, W, H, amount) {
    const copy = new Uint8ClampedArray(d);
    for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
            const j = (y * W + x) * 4;
            for (let c = 0; c < 3; c++) {
                const blur = (copy[j - 4 + c] + copy[j + 4 + c] + copy[j - W * 4 + c] + copy[j + W * 4 + c] + copy[j + c] * 4) / 8;
                d[j + c] = copy[j + c] + (copy[j + c] - blur) * amount * 2;
            }
        }
    }
}