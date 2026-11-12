// src/lib/photo/adjust.js
// Photoshop-style adjustments (browser or Node — plain arrays only), applied in this fixed order:
//   Exposure → Levels → Curves → Color Balance → Hue/Saturation
// Each one works like the Photoshop adjustment of the same name, so staff trained in Photoshop feel at home.
// Plus Auto Tone / Auto Contrast / Auto Color, worked out from a histogram of the photo.
//
// Adjust = {
//   exposure: { exposure: −3…3 stops, offset: −0.25…0.25, gamma: 0.3…3 },
//   levels:   { rgb, r, g, b: [inBlack, gamma, inWhite, outBlack, outWhite] }    (0…255, gamma 0.1…9.99)
//   curves:   { rgb, r, g, b: [[x, y], …] }                                       (0…255, sorted by x, ends included)
//   balance:  { shadows, midtones, highlights: [cyanRed, magentaGreen, yellowBlue] (−100…100), preserve: boolean }
//   hsl:      { master, reds, yellows, greens, cyans, blues, magentas: [hue −180…180, saturation −100…100, lightness −100…100] }
// }
// Missing parts = no change, so an Adjust can be stored small.

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

export const CHANNELS = ["rgb", "r", "g", "b"];
export const LEVELS_ID = [0, 1, 255, 0, 255];
export const CURVE_ID = [
    [0, 0],
    [255, 255],
];
export const RANGES = ["master", "reds", "yellows", "greens", "cyans", "blues", "magentas"];
const RANGE_HUE = { reds: 0, yellows: 60, greens: 120, cyans: 180, blues: 240, magentas: 300 };
export const TONES = ["shadows", "midtones", "highlights"];

export const defaultAdjust = Object.freeze({
    exposure: { exposure: 0, offset: 0, gamma: 1 },
    levels: { rgb: LEVELS_ID, r: LEVELS_ID, g: LEVELS_ID, b: LEVELS_ID },
    curves: { rgb: CURVE_ID, r: CURVE_ID, g: CURVE_ID, b: CURVE_ID },
    balance: { shadows: [0, 0, 0], midtones: [0, 0, 0], highlights: [0, 0, 0], preserve: true },
    hsl: Object.fromEntries(RANGES.map((r) => [r, [0, 0, 0]])),
});

/** Fill in missing parts. */
export function fullAdjust(adj) {
    const a = adj || {};
    return {
        exposure: { ...defaultAdjust.exposure, ...a.exposure },
        levels: { ...defaultAdjust.levels, ...a.levels },
        curves: { ...defaultAdjust.curves, ...a.curves },
        balance: { ...defaultAdjust.balance, ...a.balance },
        hsl: { ...defaultAdjust.hsl, ...a.hsl },
    };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const isLevelsId = (l) => !l || same(l, LEVELS_ID);
export const isCurveId = (c) => !c || same(c, CURVE_ID);

/** Which sections are changed (for the "•" marks in the panel). */
export function changedParts(adj) {
    const a = fullAdjust(adj);
    return {
        exposure: a.exposure.exposure !== 0 || a.exposure.offset !== 0 || a.exposure.gamma !== 1,
        levels: CHANNELS.some((c) => !isLevelsId(a.levels[c])),
        curves: CHANNELS.some((c) => !isCurveId(a.curves[c])),
        balance: TONES.some((t) => a.balance[t].some((v) => v !== 0)),
        hsl: RANGES.some((r) => a.hsl[r].some((v) => v !== 0)),
    };
}
export const isDefaultAdjust = (adj) => !adj || !Object.values(changedParts(adj)).some(Boolean);

// ——— building blocks ———

const toLin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toSrgb = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

/** One Levels setting as a function 0…255 → 0…255. */
export function levelsFn([inB, gamma, inW, outB, outW]) {
    const span = Math.max(1, inW - inB);
    const g = clamp(gamma, 0.1, 9.99);
    return (v) => {
        const x = clamp((v - inB) / span, 0, 1) ** (1 / g);
        return outB + x * (outW - outB);
    };
}

/**
 * Monotone cubic curve through points (Fritsch–Carlson) → table of 256 values. Like Photoshop curves, the line is flat
 * outside the first / last point.
 */
export function curveTable(points) {
    const pts = [...points].sort((a, b) => a[0] - b[0]);
    const t = new Float32Array(256);
    if (pts.length < 2) {
        for (let i = 0; i < 256; i++) t[i] = i;
        return t;
    }
    const n = pts.length;
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const d = [];
    for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / Math.max(1e-6, xs[i + 1] - xs[i]));
    const m = new Array(n);
    m[0] = d[0];
    m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
        if (d[i] === 0) {
            m[i] = 0;
            m[i + 1] = 0;
            continue;
        }
        const a = m[i] / d[i];
        const b = m[i + 1] / d[i];
        const s = a * a + b * b;
        if (s > 9) {
            const k = 3 / Math.sqrt(s);
            m[i] = k * a * d[i];
            m[i + 1] = k * b * d[i];
        }
    }
    let seg = 0;
    for (let x = 0; x < 256; x++) {
        if (x <= xs[0]) {
            t[x] = ys[0];
            continue;
        }
        if (x >= xs[n - 1]) {
            t[x] = ys[n - 1];
            continue;
        }
        while (seg < n - 2 && x > xs[seg + 1]) seg++;
        const h = xs[seg + 1] - xs[seg];
        const u = (x - xs[seg]) / h;
        const h00 = 2 * u ** 3 - 3 * u ** 2 + 1;
        const h10 = u ** 3 - 2 * u ** 2 + u;
        const h01 = -2 * u ** 3 + 3 * u ** 2;
        const h11 = u ** 3 - u ** 2;
        t[x] = clamp(h00 * ys[seg] + h10 * h * m[seg] + h01 * ys[seg + 1] + h11 * h * m[seg + 1], 0, 255);
    }
    return t;
}

// Color Balance weights by tone (the same shape GIMP uses for its Photoshop-like Color Balance).
const A = 0.25;
const B = 0.333;
const SCALE = 0.7;
const wShadow = (l) => clamp((l - B) / -A + 0.5, 0, 1) * SCALE;
const wMid = (l) => clamp((l - B) / A + 0.5, 0, 1) * clamp((l + B - 1) / -A + 0.5, 0, 1) * SCALE;
const wHigh = (l) => clamp((l + B - 1) / A + 0.5, 0, 1) * SCALE;

/**
 * Compile an Adjust into fast tables.
 * @returns {null | { lut: Float32Array[], preserve: boolean, balance: boolean, hsl: null | object }}
 */
export function compileAdjust(adj) {
    if (isDefaultAdjust(adj)) return null;
    const a = fullAdjust(adj);
    const ex = a.exposure;
    const exOn = ex.exposure !== 0 || ex.offset !== 0 || ex.gamma !== 1;
    const lvRgb = levelsFn(a.levels.rgb);
    const lvCh = ["r", "g", "b"].map((c) => levelsFn(a.levels[c]));
    const cvRgb = curveTable(a.curves.rgb);
    const cvCh = ["r", "g", "b"].map((c) => curveTable(a.curves[c]));
    const bal = a.balance;
    const balOn = TONES.some((t) => bal[t].some((v) => v !== 0));

    const lut = [0, 1, 2].map((ch) => {
        const t = new Float32Array(256);
        for (let v = 0; v < 256; v++) {
            let x = v;
            if (exOn) {
                let lin = toLin(x / 255) * 2 ** ex.exposure + ex.offset;
                lin = clamp(lin, 0, 1) ** (1 / clamp(ex.gamma, 0.1, 10));
                x = toSrgb(lin) * 255;
            }
            x = lvRgb(lvCh[ch](x));
            x = interp(cvRgb, interp(cvCh[ch], x));
            if (balOn) {
                const l = x / 255;
                x += (bal.shadows[ch] * wShadow(l) + bal.midtones[ch] * wMid(l) + bal.highlights[ch] * wHigh(l)) * 1.28;
            }
            t[v] = clamp(x, 0, 255);
        }
        return t;
    });

    let hsl = null;
    if (RANGES.some((r) => a.hsl[r].some((v) => v !== 0))) {
        hsl = {
            master: a.hsl.master,
            ranges: Object.entries(RANGE_HUE)
                .filter(([k]) => a.hsl[k].some((v) => v !== 0))
                .map(([k, hue]) => ({ hue, v: a.hsl[k] })),
        };
    }
    return { lut, preserve: balOn && bal.preserve, balance: balOn, hsl };
}

function interp(t, x) {
    if (x <= 0) return t[0];
    if (x >= 255) return t[255];
    const i = Math.floor(x);
    return t[i] + (t[i + 1] - t[i]) * (x - i);
}

/** Apply a compiled Adjust to RGB floats (n × 3, 0…255) in place. */
export function applyAdjust(rgb, n, c) {
    if (!c) return;
    const [L0, L1, L2] = c.lut;
    for (let i = 0; i < n; i++) {
        const j = i * 3;
        let r = interp(L0, rgb[j]);
        let g = interp(L1, rgb[j + 1]);
        let b = interp(L2, rgb[j + 2]);
        if (c.preserve) {
            // Preserve luminosity: colour changes, brightness stays.
            const before = lum(rgb[j], rgb[j + 1], rgb[j + 2]);
            const after = lum(r, g, b);
            if (after > 0.5) {
                const k = before / after;
                r *= k;
                g *= k;
                b *= k;
            }
        }
        if (c.hsl) [r, g, b] = hueSat(r, g, b, c.hsl);
        rgb[j] = clamp(r, 0, 255);
        rgb[j + 1] = clamp(g, 0, 255);
        rgb[j + 2] = clamp(b, 0, 255);
    }
}

/** Hue/Saturation with colour ranges (each range: full effect ±15°, fading out by ±45°). */
function hueSat(r, g, b, h) {
    let [H, S, L] = rgbToHsl(r / 255, g / 255, b / 255);
    let dh = h.master[0];
    let ds = h.master[1];
    let dl = h.master[2];
    if (h.ranges.length) {
        const grey = clamp(S / 0.08, 0, 1); // greys have no real hue — leave them
        for (const rg of h.ranges) {
            let d = Math.abs(H - rg.hue);
            if (d > 180) d = 360 - d;
            const w = (d <= 15 ? 1 : d >= 45 ? 0 : 1 - (d - 15) / 30) * grey;
            if (!w) continue;
            dh += rg.v[0] * w;
            ds += rg.v[1] * w;
            dl += rg.v[2] * w;
        }
    }
    H = (H + dh + 360) % 360;
    S = clamp(S * (1 + ds / 100), 0, 1);
    L = dl >= 0 ? L + (1 - L) * (dl / 100) : L * (1 + dl / 100);
    const [R, G, B2] = hslToRgb(H, S, clamp(L, 0, 1));
    return [R * 255, G * 255, B2 * 255];
}

function rgbToHsl(r, g, b) {
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const l = (mx + mn) / 2;
    if (mx === mn) return [0, 0, l];
    const d = mx - mn;
    const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    let h;
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return [h * 60, s, l];
}

function hslToRgb(h, s, l) {
    if (s === 0) return [l, l, l];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = (t) => {
        t = (t + 360) % 360;
        if (t < 60) return p + ((q - p) * t) / 60;
        if (t < 180) return q;
        if (t < 240) return p + ((q - p) * (240 - t)) / 60;
        return p;
    };
    return [f(h + 120), f(h), f(h - 120)];
}

// ——— histogram and Auto buttons ———

/**
 * @param {Uint8ClampedArray} px RGBA
 * @param {number} [minAlpha] pixels more see-through than this are skipped (the removed background)
 * @returns {{ r: Uint32Array, g: Uint32Array, b: Uint32Array, l: Uint32Array, n: number }}
 */
export function histogram(px, minAlpha = 128) {
    const r = new Uint32Array(256);
    const g = new Uint32Array(256);
    const b = new Uint32Array(256);
    const l = new Uint32Array(256);
    let n = 0;
    for (let j = 0; j < px.length; j += 4) {
        if (px[j + 3] < minAlpha) continue;
        r[px[j]]++;
        g[px[j + 1]]++;
        b[px[j + 2]]++;
        l[Math.round(lum(px[j], px[j + 1], px[j + 2]))]++;
        n++;
    }
    return { r, g, b, l, n };
}

function pct(h, n, p) {
    const target = n * p;
    let acc = 0;
    for (let v = 0; v < 256; v++) {
        acc += h[v];
        if (acc > target) return v;
    }
    return 255;
}

const CLIP = 0.001; // Photoshop's default: clip 0.1% at each end

/** Auto Contrast: one black and white point for all channels (colours don't change). → levels */
export function autoContrast(hist) {
    if (!hist.n) return {};
    const lo = Math.min(...["r", "g", "b"].map((c) => pct(hist[c], hist.n, CLIP)));
    const hi = Math.max(...["r", "g", "b"].map((c) => pct(hist[c], hist.n, 1 - CLIP)));
    return { levels: { rgb: [lo, 1, Math.max(lo + 10, hi), 0, 255] } };
}

/** Auto Tone: black and white point for each channel on its own (also removes a colour cast). → levels */
export function autoTone(hist) {
    if (!hist.n) return {};
    const lv = {};
    for (const c of ["r", "g", "b"]) {
        const lo = pct(hist[c], hist.n, CLIP);
        const hi = pct(hist[c], hist.n, 1 - CLIP);
        lv[c] = [lo, 1, Math.max(lo + 10, hi), 0, 255];
    }
    return { levels: { rgb: LEVELS_ID, ...lv } };
}

/**
 * Auto Color: per-channel black/white points from the darkest and lightest colours, then the mid-tones made neutral
 * (gamma per channel). Gentle limits so a skin-heavy photo isn't pushed to blue/green.
 * @param {Uint8ClampedArray} px RGBA @returns levels
 */
export function autoColor(px, minAlpha = 128) {
    const hist = histogram(px, minAlpha);
    if (!hist.n) return {};
    const loL = pct(hist.l, hist.n, 0.005);
    const hiL = pct(hist.l, hist.n, 0.995);
    const dark = [0, 0, 0];
    const light = [0, 0, 0];
    const mid = [0, 0, 0];
    let nd = 0,
        nl = 0,
        nm = 0;
    for (let j = 0; j < px.length; j += 4) {
        if (px[j + 3] < minAlpha) continue;
        const r = px[j],
            g = px[j + 1],
            b = px[j + 2];
        const L = lum(r, g, b);
        if (L <= loL) {
            dark[0] += r;
            dark[1] += g;
            dark[2] += b;
            nd++;
        } else if (L >= hiL) {
            light[0] += r;
            light[1] += g;
            light[2] += b;
            nl++;
        } else {
            const mx = Math.max(r, g, b);
            if (mx > 40 && mx - Math.min(r, g, b) < mx * 0.18) {
                mid[0] += r;
                mid[1] += g;
                mid[2] += b;
                nm++;
            }
        }
    }
    const lv = {};
    ["r", "g", "b"].forEach((c, k) => {
        const lo = nd ? clamp(dark[k] / nd, 0, 80) : 0;
        const hi = nl ? clamp(light[k] / nl, 150, 255) : 255;
        let gamma = 1;
        if (nm > hist.n * 0.01) {
            // Make the near-grey mid-tones grey.
            const greyAvg = (mid[0] + mid[1] + mid[2]) / 3 / nm;
            const x = clamp((mid[k] / nm - lo) / Math.max(1, hi - lo), 0.05, 0.95);
            const target = clamp((greyAvg - lo) / Math.max(1, hi - lo), 0.05, 0.95);
            gamma = clamp(Math.log(x) / Math.log(target), 0.8, 1.25);
        }
        lv[c] = [Math.round(lo), Math.round(gamma * 100) / 100, Math.round(Math.max(lo + 10, hi)), 0, 255];
    });
    return { levels: { rgb: LEVELS_ID, ...lv } };
}