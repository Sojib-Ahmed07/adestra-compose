// src/lib/photo/ai/tone.js
// Automatic light and colour for portraits (browser or Node — plain arrays only).
// Rule: "do no harm". The automatic fix only takes away a clear colour cast and dullness; it never adds colour.
// 1. White balance from the face's skin, gently: only removes a cast (hue moved a little, colour strength only ever
//    reduced, never increased — so pale or flash-lit faces can't turn yellow/orange).
// 2. A small levels stretch measured on the person, not the background.
// 3. Exposure set from the face's brightness — done on brightness only, so colours stay rich instead of washed out.
// 4. A soft S-curve (gives back "punch") and a little vibrance (boosts dull colours more than strong ones).
// The result is a plain object (`Tone`) that applyTone() / toneTables() use.

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * @typedef {{ gain: number[], lo: number, hi: number, curve: Float32Array, vibrance: number }} Tone
 * curve: 1021 entries, brightness 0…255 in steps of 0.25 → new brightness 0…255.
 */

/** No change. */
export const identityTone = Object.freeze({
    gain: [1, 1, 1],
    lo: 0,
    hi: 255,
    curve: (() => {
        const c = new Float32Array(1021);
        for (let i = 0; i < c.length; i++) c[i] = i / 4;
        return c;
    })(),
    vibrance: 0,
});

/**
 * Measure a portrait and decide the automatic fix.
 * @param {Uint8ClampedArray} src RGBA pixels
 * @param {Uint8ClampedArray} alpha person mask (0–255)
 * @param {number} W @param {number} H
 * @param {{ cx: number, eyeY: number, chinY: number, faceW: number } | null} face
 * @returns {Tone}
 */
export function analyseTone(src, alpha, W, H, face) {
    // Levels on the person (where the mask is solid), ignoring the background.
    const hist = new Uint32Array(256);
    let count = 0;
    let sr = 0,
        sg = 0,
        sb = 0,
        n = 0;
    for (let i = 0; i < W * H; i += 3) {
        const j = i * 4;
        if (!src[j + 3]) continue;
        sr += src[j];
        sg += src[j + 1];
        sb += src[j + 2];
        n++;
        if (alpha[i] > 200) {
            hist[Math.round(lum(src[j], src[j + 1], src[j + 2]))]++;
            count++;
        }
    }
    const pct = (p) => {
        let acc = 0;
        const target = count * p;
        for (let v = 0; v < 256; v++) {
            acc += hist[v];
            if (acc >= target) return v;
        }
        return 255;
    };
    // Stretch dull, flat photos (a dim shop light) most of the way, but never by a huge amount.
    const lo = count ? Math.round(Math.min(pct(0.004), 35) * 0.7) : 0;
    const hi = count ? Math.round(255 - (255 - Math.max(pct(0.996), 175)) * 0.7) : 255;

    // Skin sample: cheeks, nose and mouth area.
    const skin = face ? sampleSkin(src, alpha, W, H, face) : null;

    let gain;
    if (skin && skin.n > 50) {
        gain = skinBalance(skin.r, skin.g, skin.b);
    } else {
        // No face: soft grey-world over the whole photo (old behaviour).
        const mean = (sr + sg + sb) / 3 / Math.max(1, n);
        gain = [sr, sg, sb].map((s) => {
            const g = mean / Math.max(1, s / Math.max(1, n));
            return clamp(1 + (g - 1) * 0.5, 0.9, 1.12);
        });
    }

    // Exposure: bring the face to a pleasant brightness, but keep some of the person's own skin tone
    // (darker skin stays a little darker, fair skin a little fairer — nobody gets bleached).
    let gamma = 1;
    if (skin && skin.n > 50) {
        const y = clamp((lum(skin.r * gain[0], skin.g * gain[1], skin.b * gain[2]) - lo) / Math.max(1, hi - lo), 0.04, 0.96);
        // Comfortable band for a passport face: only faces outside it are moved (to its edge).
        const target = clamp(y, 0.47, 0.7);
        gamma = clamp(Math.log(target) / Math.log(y), 0.72, 1.3);
    }
    const contrast = 0.07; // soft S-curve strength
    const curve = new Float32Array(1021);
    for (let i = 0; i < curve.length; i++) {
        let x = i / 4 / 255;
        x = Math.pow(x, gamma);
        x = sCurve(x, contrast); // leaves 0, 0.5 and 1 in place
        curve[i] = clamp(x, 0, 1) * 255;
    }
    return { gain, lo, hi, curve, vibrance: 0 };
}

/** Smooth S-curve: blend towards a smoothstep around the middle. */
function sCurve(x, k) {
    const s = x * x * (3 - 2 * x);
    return x + (s - x) * k * 2;
}

function sampleSkin(src, alpha, W, H, f) {
    const fcx = f.cx;
    const fcy = f.eyeY + (f.chinY - f.eyeY) * 0.45;
    const rx = f.faceW * 0.3;
    const ry = (f.chinY - f.eyeY) * 0.48;
    const vals = [];
    for (let y = Math.max(0, Math.floor(fcy - ry)); y < Math.min(H, fcy + ry); y += 2) {
        for (let x = Math.max(0, Math.floor(fcx - rx)); x < Math.min(W, fcx + rx); x += 2) {
            const dx = (x - fcx) / rx;
            const dy = (y - fcy) / ry;
            if (dx * dx + dy * dy > 1) continue;
            const i = y * W + x;
            if (alpha[i] < 230) continue;
            const j = i * 4;
            const l = lum(src[j], src[j + 1], src[j + 2]);
            if (l < 18 || l > 248) continue; // deep shadow (nostrils) or blown highlight
            vals.push(l, src[j], src[j + 1], src[j + 2]);
        }
    }
    const m = vals.length / 4;
    if (!m) return { n: 0 };
    // Use the middle 70% by brightness (drop shine and shadow).
    const idx = Array.from({ length: m }, (_, k) => k).sort((a, b) => vals[a * 4] - vals[b * 4]);
    const a = Math.floor(m * 0.15);
    const b = Math.max(a + 1, Math.floor(m * 0.85));
    let r = 0,
        g = 0,
        bl = 0;
    for (let k = a; k < b; k++) {
        const q = idx[k] * 4;
        r += vals[q + 1];
        g += vals[q + 2];
        bl += vals[q + 3];
    }
    const c = b - a;
    return { n: c, r: r / c, g: g / c, b: bl / c };
}

/**
 * Per-channel gains that move the average skin colour towards a natural skin hue,
 * keeping its brightness. Measured skin hue range covers fair to dark South Asian skin.
 */
function skinBalance(r, g, b) {
    const Y = 0.299 * r + 0.587 * g + 0.114 * b;
    if (Y < 8) return [1, 1, 1];
    const cb = (-0.168736 * r - 0.331264 * g + 0.5 * b) / Y;
    const cr = (0.5 * r - 0.418688 * g - 0.081312 * b) / Y;
    // Natural skin hue is around atan2(0.18, −0.145).
    const tHue = Math.atan2(0.18, -0.145);
    const hue = Math.atan2(cr, cb);
    let dh = tHue - hue;
    while (dh > Math.PI) dh -= 2 * Math.PI;
    while (dh < -Math.PI) dh += 2 * Math.PI;
    const mag = Math.hypot(cb, cr);
    // Small hue moves only (a strong "wrong" hue is more likely odd light on one side than a real cast).
    const newHue = hue + clamp(dh, -0.4, 0.4) * 0.7;
    // Never add colour; only calm down skin that is clearly too orange / yellow / red.
    const newMag = mag > 0.24 ? 0.24 + (mag - 0.24) * 0.5 : mag;
    const tcb = Math.cos(newHue) * newMag * Y;
    const tcr = Math.sin(newHue) * newMag * Y;
    const tr = Y + 1.402 * tcr;
    const tg = Y - 0.344136 * tcb - 0.714136 * tcr;
    const tb = Y + 1.772 * tcb;
    const strength = 0.8;
    const gains = [tr / r, tg / g, tb / b].map((k) => clamp(1 + (k - 1) * strength, 0.86, 1.16));
    // Keep brightness the same (gains only change colour).
    const before = 0.299 * r + 0.587 * g + 0.114 * b;
    const after = 0.299 * r * gains[0] + 0.587 * g * gains[1] + 0.114 * b * gains[2];
    return gains.map((k) => k * (before / Math.max(1, after)));
}

/**
 * Per-channel prep tables (white balance + levels), 0…255 → 0…255 floats.
 * @param {Tone} t
 */
export function toneTables(t) {
    return [0, 1, 2].map((ch) => {
        const tab = new Float32Array(256);
        for (let v = 0; v < 256; v++) tab[v] = clamp(((v * t.gain[ch] - t.lo) / Math.max(1, t.hi - t.lo)) * 255, 0, 255);
        return tab;
    });
}

/**
 * Apply the brightness curve and vibrance to one pixel after the prep tables (in place on `out`).
 * Brightness is changed by scaling R, G and B together, so colour is kept.
 */
export function toneCurvePixel(t, r, g, b, out) {
    const y = lum(r, g, b);
    const ny = t.curve[Math.min(1020, Math.max(0, Math.round(y * 4)))];
    let k = y > 0.5 ? ny / y : 1;
    if (y <= 0.5) {
        r = g = b = ny;
        k = 1;
    }
    r *= k;
    g *= k;
    b *= k;
    // Over the top: roll the brightest channel back towards white instead of clipping the colour.
    const mx = Math.max(r, g, b);
    if (mx > 255) {
        const over = (mx - 255) / mx;
        r = r + (255 - r) * over;
        g = g + (255 - g) * over;
        b = b + (255 - b) * over;
        const m2 = Math.max(r, g, b);
        if (m2 > 255) {
            r = (r * 255) / m2;
            g = (g * 255) / m2;
            b = (b * 255) / m2;
        }
    }
    if (t.vibrance) {
        const mx2 = Math.max(r, g, b);
        const mn = Math.min(r, g, b);
        const sat = mx2 > 0 ? (mx2 - mn) / mx2 : 0;
        const v = t.vibrance * (1 - sat) * 1.5;
        const grey = lum(r, g, b);
        r = grey + (r - grey) * (1 + v);
        g = grey + (g - grey) * (1 + v);
        b = grey + (b - grey) * (1 + v);
    }
    out[0] = clamp(r, 0, 255);
    out[1] = clamp(g, 0, 255);
    out[2] = clamp(b, 0, 255);
}

/**
 * Apply a Tone to RGBA pixels (returns new RGB floats, n × 3).
 * @param {Uint8ClampedArray} px RGBA
 * @param {Tone | null} t  null = no change
 */
export function applyTone(px, n, t) {
    const rgb = new Float32Array(n * 3);
    if (!t) {
        for (let i = 0; i < n; i++) {
            rgb[i * 3] = px[i * 4];
            rgb[i * 3 + 1] = px[i * 4 + 1];
            rgb[i * 3 + 2] = px[i * 4 + 2];
        }
        return rgb;
    }
    const tabs = toneTables(t);
    const o = [0, 0, 0];
    for (let i = 0; i < n; i++) {
        const j = i * 4;
        toneCurvePixel(t, tabs[0][px[j]], tabs[1][px[j + 1]], tabs[2][px[j + 2]], o);
        rgb[i * 3] = o[0];
        rgb[i * 3 + 1] = o[1];
        rgb[i * 3 + 2] = o[2];
    }
    return rgb;
}