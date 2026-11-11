// src/lib/photo/ai/retouch.js
// Face touch-up for portraits, using the face-mesh points (faces.js → portrait.js `face.pts`).
// Works on RGB float arrays (n × 3, values 0…255) so it runs the same at preview size and at print size.
//
// What it does, all limited to real skin (face oval minus eyes, eyebrows, lips and nostrils, checked by skin colour):
//   blemish  — removes small dark or red spots (acne, marks, pores)
//   smooth   — edge-preserving skin smoothing that keeps some texture (no plastic look)
//   even     — evens out blotchy / red patches of skin colour
//   shine    — tones down oily shine on forehead, nose and cheeks
//   darkCircles — lifts the shadow under the eyes
//   eyes     — brighter, crisper eyes (whites a little cleaner)
//   teeth    — whiter teeth when the mouth is open
//   faceLight — fill light on the face only (for back-lit or dark faces)
// Plus heal() for the "spot fix" brush (works anywhere on the photo) and clarity() / blurBehind() helpers.
// It never moves or reshapes anything — the face stays the customer's own face (important for ID photos).

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smooth01 = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
};
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// Face-mesh point numbers (MediaPipe 468-point mesh). "R" = the person's right = the left of the picture.
const OVAL = [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58,
    132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];
const EYE_R = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
const EYE_L = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
const BROW_R = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
const BROW_L = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276];
const LIPS_OUT = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
const LIPS_IN = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191];

/** Keys used by the touch-up (all 0…100, 0 = off). */
export const retouchKeys = ["blemish", "smooth", "even", "shine", "darkCircles", "eyes", "teeth", "faceLight"];

/** One-tap touch-up levels. */
export const beautyPresets = {
    off: { label: "Off", look: {} },
    natural: {
        label: "Natural",
        look: { blemish: 55, smooth: 30, even: 25, shine: 30, darkCircles: 30, eyes: 20, sharpen: 20 },
    },
    studio: {
        label: "Studio",
        look: { blemish: 80, smooth: 50, even: 45, shine: 50, darkCircles: 50, eyes: 35, teeth: 30, sharpen: 25, clarity: 10 },
    },
    strong: {
        label: "Strong",
        look: { blemish: 100, smooth: 75, even: 60, shine: 70, darkCircles: 70, eyes: 45, teeth: 45, sharpen: 25, clarity: 10 },
    },
};

// ——— small image helpers (planar Float32 arrays) ———

/** Box mean with radius r (edge pixels repeated). Returns a new array. */
export function boxMean(src, w, h, r) {
    r = Math.max(0, Math.round(r));
    if (r === 0) return new Float32Array(src);
    const tmp = new Float32Array(w * h);
    const out = new Float32Array(w * h);
    const win = 2 * r + 1;
    for (let y = 0; y < h; y++) {
        const row = y * w;
        let acc = 0;
        for (let k = -r; k <= r; k++) acc += src[row + clamp(k, 0, w - 1)];
        for (let x = 0; x < w; x++) {
            tmp[row + x] = acc / win;
            acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
        }
    }
    for (let x = 0; x < w; x++) {
        let acc = 0;
        for (let k = -r; k <= r; k++) acc += tmp[clamp(k, 0, h - 1) * w + x];
        for (let y = 0; y < h; y++) {
            out[y * w + x] = acc / win;
            acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
        }
    }
    return out;
}

/** Roughly Gaussian blur: two box passes. */
const soft = (src, w, h, r) =>
    boxMean(boxMean(src, w, h, Math.max(1, Math.round(r / 1.6))), w, h, Math.max(1, Math.round(r / 1.6)));

/** Fill a polygon (x, y pairs in region pixels) into a 0/1 mask (pixel centres, even-odd). */
export function fillPolygon(mask, w, h, poly, value = 1) {
    const n = poly.length / 2;
    if (n < 3) return;
    let y0 = Infinity,
        y1 = -Infinity;
    for (let k = 0; k < n; k++) {
        y0 = Math.min(y0, poly[k * 2 + 1]);
        y1 = Math.max(y1, poly[k * 2 + 1]);
    }
    const xs = [];
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(h - 1, Math.ceil(y1)); y++) {
        const cy = y + 0.5;
        xs.length = 0;
        for (let k = 0; k < n; k++) {
            const ax = poly[k * 2];
            const ay = poly[k * 2 + 1];
            const bx = poly[((k + 1) % n) * 2];
            const by = poly[((k + 1) % n) * 2 + 1];
            if ((ay <= cy && by > cy) || (by <= cy && ay > cy)) xs.push(ax + ((cy - ay) / (by - ay)) * (bx - ax));
        }
        xs.sort((a, b) => a - b);
        for (let k = 0; k + 1 < xs.length; k += 2) {
            const xa = Math.max(0, Math.ceil(xs[k] - 0.5));
            const xb = Math.min(w - 1, Math.floor(xs[k + 1] - 0.5));
            for (let x = xa; x <= xb; x++) mask[y * w + x] = value;
        }
    }
}

function fillEllipse(mask, w, h, cx, cy, rx, ry, value = 1) {
    for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(h - 1, Math.ceil(cy + ry)); y++) {
        for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(w - 1, Math.ceil(cx + rx)); x++) {
            const dx = (x + 0.5 - cx) / rx;
            const dy = (y + 0.5 - cy) / ry;
            if (dx * dx + dy * dy <= 1) mask[y * w + x] = value;
        }
    }
}

/** Grow a 0…1 mask by about r pixels. */
function dilate(mask, w, h, r) {
    const b = boxMean(mask, w, h, r);
    for (let i = 0; i < b.length; i++) b[i] = b[i] > 0.02 ? 1 : 0;
    return b;
}

/** Guided filter (He et al.) of one channel by itself: smooths flat areas, keeps edges. */
function guided(I, w, h, r, eps) {
    const n = w * h;
    const II = new Float32Array(n);
    for (let i = 0; i < n; i++) II[i] = I[i] * I[i];
    const mI = boxMean(I, w, h, r);
    const mII = boxMean(II, w, h, r);
    const a = new Float32Array(n);
    const b = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const v = mII[i] - mI[i] * mI[i];
        a[i] = v / (v + eps);
        b[i] = mI[i] - a[i] * mI[i];
    }
    const ma = boxMean(a, w, h, r);
    const mb = boxMean(b, w, h, r);
    const q = new Float32Array(n);
    for (let i = 0; i < n; i++) q[i] = ma[i] * I[i] + mb[i];
    return q;
}

/** Fill pixels where weight is low from the area around them (normalised convolution). */
function fillFromAround(ch, weight, w, h, r) {
    const n = w * h;
    const num = new Float32Array(n);
    for (let i = 0; i < n; i++) num[i] = ch[i] * weight[i];
    const bn = soft(num, w, h, r);
    const bd = soft(weight, w, h, r);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = bd[i] > 1e-3 ? bn[i] / bd[i] : ch[i];
    return out;
}

// ——— region (a box around the face and neck) ———

function regionOf(face, W, H) {
    const p = face.pts;
    let x0 = Infinity,
        y0 = Infinity,
        x1 = -Infinity,
        y1 = -Infinity;
    for (const k of OVAL) {
        x0 = Math.min(x0, p[k * 2]);
        x1 = Math.max(x1, p[k * 2]);
        y0 = Math.min(y0, p[k * 2 + 1]);
        y1 = Math.max(y1, p[k * 2 + 1]);
    }
    const fw = x1 - x0;
    const fh = y1 - y0;
    const rx0 = Math.max(0, Math.floor(x0 - fw * 0.12));
    const rx1 = Math.min(W, Math.ceil(x1 + fw * 0.12));
    const ry0 = Math.max(0, Math.floor(y0 - fh * 0.1));
    const ry1 = Math.min(H, Math.ceil(y1 + fh * 0.55)); // neck
    return { x: rx0, y: ry0, w: Math.max(0, rx1 - rx0), h: Math.max(0, ry1 - ry0), fw, fh };
}

function polyOf(face, idx, reg, grow = 1) {
    const p = face.pts;
    let cx = 0,
        cy = 0;
    for (const k of idx) {
        cx += p[k * 2];
        cy += p[k * 2 + 1];
    }
    cx /= idx.length;
    cy /= idx.length;
    const out = new Float32Array(idx.length * 2);
    idx.forEach((k, i) => {
        out[i * 2] = cx + (p[k * 2] - cx) * grow - reg.x;
        out[i * 2 + 1] = cy + (p[k * 2 + 1] - cy) * grow - reg.y;
    });
    return out;
}

const pt = (face, k, reg) => ({ x: face.pts[k * 2] - reg.x, y: face.pts[k * 2 + 1] - reg.y });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Touch up the face in place.
 * @param {Float32Array} rgb  n × 3, 0…255
 * @param {number} W @param {number} H
 * @param {{ pts: Float32Array }} face  points in the same pixels as rgb
 * @param {{ blemish?: number, smooth?: number, even?: number, shine?: number, darkCircles?: number, eyes?: number,
 *   teeth?: number, faceLight?: number }} look  0…100 each
 */
export function retouchFace(rgb, W, H, face, look) {
    if (!face?.pts || face.pts.length < 936) return;
    const amt = (k) => clamp((look[k] || 0) / 100, 0, 1);
    if (!retouchKeys.some((k) => amt(k) > 0)) return;
    const reg = regionOf(face, W, H);
    const { w, h } = reg;
    if (w < 8 || h < 8) return;
    const n = w * h;
    const fw = reg.fw;

    // Planar copy of the region.
    const R = new Float32Array(n);
    const G = new Float32Array(n);
    const B = new Float32Array(n);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const j = ((y + reg.y) * W + x + reg.x) * 3;
            const i = y * w + x;
            R[i] = rgb[j];
            G[i] = rgb[j + 1];
            B[i] = rgb[j + 2];
        }
    }

    // ——— masks ———
    const oval = new Float32Array(n);
    fillPolygon(oval, w, h, polyOf(face, OVAL, reg, 1.03));
    const holes = new Float32Array(n);
    fillPolygon(holes, w, h, polyOf(face, EYE_R, reg, 1.35));
    fillPolygon(holes, w, h, polyOf(face, EYE_L, reg, 1.35));
    fillPolygon(holes, w, h, polyOf(face, BROW_R, reg, 1.25));
    fillPolygon(holes, w, h, polyOf(face, BROW_L, reg, 1.25));
    fillPolygon(holes, w, h, polyOf(face, LIPS_OUT, reg, 1.12));
    const n98 = pt(face, 98, reg);
    const n327 = pt(face, 327, reg);
    const nostrilW = dist(n98, n327);
    fillEllipse(holes, w, h, (n98.x + n327.x) / 2, (n98.y + n327.y) / 2 + nostrilW * 0.05, nostrilW * 0.72, nostrilW * 0.32);
    const holesD = dilate(holes, w, h, Math.max(1, fw * 0.012));

    // Neck under the chin (only where it is skin-coloured, checked below).
    const chin = pt(face, 152, reg);
    const neck = new Float32Array(n);
    fillEllipse(neck, w, h, chin.x, chin.y + reg.fh * 0.32, fw * 0.36, reg.fh * 0.36);

    // Reference skin colour: middle of the cheeks / forehead, mid brightness.
    const area = new Float32Array(n);
    for (let i = 0; i < n; i++) area[i] = oval[i] * (1 - holesD[i]);
    const ref = skinReference(R, G, B, area, n);
    if (!ref) return;

    // Skin likelihood by colour (normalised chroma, so shading doesn't matter).
    const like = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const r = R[i],
            g = G[i],
            b = B[i];
        const Y = 0.299 * r + 0.587 * g + 0.114 * b;
        if (Y < 12) continue;
        const cb = (-0.168736 * r - 0.331264 * g + 0.5 * b) / Y;
        const cr = (0.5 * r - 0.418688 * g - 0.081312 * b) / Y;
        const d2 = (cb - ref.cb) ** 2 + (cr - ref.cr) ** 2;
        like[i] = Math.exp(-d2 / (2 * 0.075 * 0.075)) * smooth01(0.05, 0.16, Y / 255);
    }
    // Skin = (face oval minus holes, or neck) × colour likelihood, feathered.
    let skin = new Float32Array(n);
    for (let i = 0; i < n; i++) skin[i] = Math.max(area[i], neck[i] * (1 - oval[i])) * like[i];
    skin = soft(skin, w, h, Math.max(1, fw * 0.02));
    for (let i = 0; i < n; i++) skin[i] = clamp(skin[i] * 1.25, 0, 1);
    // Face-only skin (not the neck) for spot removal and shine.
    const faceSkin = new Float32Array(n);
    for (let i = 0; i < n; i++) faceSkin[i] = skin[i] * oval[i];

    const setPx = (i, r, g, b) => {
        R[i] = r;
        G[i] = g;
        B[i] = b;
    };

    // ——— fill light on the face ———
    const fl = amt("faceLight");
    if (fl > 0) {
        let m = new Float32Array(n);
        fillPolygon(m, w, h, polyOf(face, OVAL, reg, 1.08));
        m = soft(m, w, h, fw * 0.12);
        for (let i = 0; i < n; i++) {
            const g = 0.6 * fl * m[i];
            if (g < 0.002) continue;
            const L = lum(R[i], G[i], B[i]);
            if (L < 1) continue;
            const nl = (L * (1 + g)) / (1 + (g * L) / 255);
            const k = nl / L;
            setPx(i, R[i] * k, G[i] * k, B[i] * k);
        }
    }

    // ——— spots / blemishes ———
    const bl = amt("blemish");
    if (bl > 0) {
        const L = new Float32Array(n);
        const red = new Float32Array(n);
        const cb = new Float32Array(n);
        const cr = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            L[i] = lum(R[i], G[i], B[i]);
            red[i] = R[i] - G[i];
            cb[i] = -0.168736 * R[i] - 0.331264 * G[i] + 0.5 * B[i];
            cr[i] = 0.5 * R[i] - 0.418688 * G[i] - 0.081312 * B[i];
        }
        const r1 = Math.max(2, fw * 0.028);
        const Ls = boxMean(L, w, h, 1);
        const Lb = soft(L, w, h, r1);
        const redB = soft(red, w, h, r1);
        const cbS = boxMean(cb, w, h, 1);
        const crS = boxMean(cr, w, h, 1);
        const cbB = soft(cb, w, h, r1);
        const crB = soft(cr, w, h, r1);
        const core = new Float32Array(n);
        for (let i = 0; i < n; i++) core[i] = clamp((faceSkin[i] - 0.45) * 2.2, 0, 1);
        let spot = new Float32Array(n);
        const t0 = 3.5 - bl * 1.5;
        for (let i = 0; i < n; i++) {
            if (core[i] <= 0) continue;
            const dark = Lb[i] - Ls[i];
            const rd = red[i] - redB[i] - 5;
            const odd = Math.hypot(cbS[i] - cbB[i], crS[i] - crB[i]) - 2.5; // an odd-coloured mark (bluish, greenish)
            const score = Math.max(dark, rd * 0.7, odd * 1.1);
            spot[i] = smooth01(t0, t0 + 8, score) * core[i];
        }
        spot = boxMean(spot, w, h, Math.max(1, Math.round(fw * 0.008)));
        for (let i = 0; i < n; i++) spot[i] = clamp(spot[i] * 3, 0, 1);
        const keep = new Float32Array(n);
        for (let i = 0; i < n; i++) keep[i] = 1 - spot[i];
        const rf = r1 * 1.3;
        const fR = fillFromAround(R, keep, w, h, rf);
        const fG = fillFromAround(G, keep, w, h, rf);
        const fB = fillFromAround(B, keep, w, h, rf);
        const k = Math.min(1, 0.4 + bl * 0.6);
        for (let i = 0; i < n; i++) {
            const s = spot[i] * k;
            if (s < 0.002) continue;
            setPx(i, R[i] + (fR[i] - R[i]) * s, G[i] + (fG[i] - G[i]) * s, B[i] + (fB[i] - B[i]) * s);
        }
    }

    // ——— even skin colour (blotches, redness) ———
    const ev = amt("even");
    if (ev > 0) {
        const cbN = new Float32Array(n);
        const crN = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            const Y = Math.max(1, 0.299 * R[i] + 0.587 * G[i] + 0.114 * B[i]);
            cbN[i] = (-0.168736 * R[i] - 0.331264 * G[i] + 0.5 * B[i]) / Y;
            crN[i] = (0.5 * R[i] - 0.418688 * G[i] - 0.081312 * B[i]) / Y;
        }
        const rE = Math.max(2, fw * 0.06);
        const cbB = soft(cbN, w, h, rE);
        const crB = soft(crN, w, h, rE);
        for (let i = 0; i < n; i++) {
            const m = skin[i] * ev * 0.75;
            if (m < 0.002) continue;
            const Y = 0.299 * R[i] + 0.587 * G[i] + 0.114 * B[i];
            const cb = (cbN[i] + (ref.cb - cbB[i]) * m) * Y;
            const cr = (crN[i] + (ref.cr - crB[i]) * m) * Y;
            setPx(i, Y + 1.402 * cr, Y - 0.344136 * cb - 0.714136 * cr, Y + 1.772 * cb);
        }
    }

    // ——— smooth skin ———
    const sm = amt("smooth");
    if (sm > 0) {
        const r = Math.max(2, Math.round(fw * 0.02));
        const eps = (7 + 24 * sm) ** 2;
        const qR = guided(R, w, h, r, eps);
        const qG = guided(G, w, h, r, eps);
        const qB = guided(B, w, h, r, eps);
        const texture = 0.42 - 0.22 * sm; // keep a little real skin texture
        const k = 0.55 + 0.45 * sm;
        for (let i = 0; i < n; i++) {
            const m = skin[i] * k;
            if (m < 0.002) continue;
            const tr = qR[i] + (R[i] - qR[i]) * texture;
            const tg = qG[i] + (G[i] - qG[i]) * texture;
            const tb = qB[i] + (B[i] - qB[i]) * texture;
            setPx(i, R[i] + (tr - R[i]) * m, G[i] + (tg - G[i]) * m, B[i] + (tb - B[i]) * m);
        }
    }

    // ——— shine ———
    const sh = amt("shine");
    if (sh > 0) {
        const th = ref.L * 1.1;
        for (let i = 0; i < n; i++) {
            const m = faceSkin[i];
            if (m < 0.01) continue;
            const L = lum(R[i], G[i], B[i]);
            const over = L - th;
            if (over <= 0) continue;
            const t = smooth01(0, 45, over) * sh * m;
            const nl = L - over * 0.7 * t;
            // Shine is whitish: give it the skin's colour back.
            const tr = ref.r * (nl / ref.L);
            const tg = ref.g * (nl / ref.L);
            const tb = ref.b * (nl / ref.L);
            const k = nl / L;
            const c = 0.6 * t;
            setPx(i, R[i] * k * (1 - c) + tr * c, G[i] * k * (1 - c) + tg * c, B[i] * k * (1 - c) + tb * c);
        }
    }

    // ——— under-eye shadows ———
    const dc = amt("darkCircles");
    if (dc > 0) {
        let m = new Float32Array(n);
        for (const [outer, inner, lower] of [
            [33, 133, 145],
            [263, 362, 374],
        ]) {
            const a = pt(face, outer, reg);
            const b = pt(face, inner, reg);
            const lo = pt(face, lower, reg);
            const ew = dist(a, b);
            fillEllipse(m, w, h, (a.x + b.x) / 2, lo.y + ew * 0.32, ew * 0.58, ew * 0.27);
        }
        m = soft(m, w, h, Math.max(2, fw * 0.03));
        for (let i = 0; i < n; i++) {
            const mm = m[i] * like[i] * (1 - holes[i]);
            if (mm < 0.01) continue;
            const L = lum(R[i], G[i], B[i]);
            if (L < 1) continue;
            const k = 1 + (clamp(ref.L / L, 1, 1.4) - 1) * dc * mm;
            const c = 0.45 * dc * mm;
            const nl = L * k;
            setPx(
                i,
                R[i] * k * (1 - c) + ref.r * (nl / ref.L) * c,
                G[i] * k * (1 - c) + ref.g * (nl / ref.L) * c,
                B[i] * k * (1 - c) + ref.b * (nl / ref.L) * c,
            );
        }
    }

    // ——— eyes ———
    const ey = amt("eyes");
    if (ey > 0) {
        let m = new Float32Array(n);
        fillPolygon(m, w, h, polyOf(face, EYE_R, reg, 1.1));
        fillPolygon(m, w, h, polyOf(face, EYE_L, reg, 1.1));
        m = soft(m, w, h, Math.max(1, fw * 0.008));
        const bR = boxMean(R, w, h, 2);
        const bG = boxMean(G, w, h, 2);
        const bB = boxMean(B, w, h, 2);
        for (let i = 0; i < n; i++) {
            const mm = m[i] * ey;
            if (mm < 0.005) continue;
            let r = R[i] + (R[i] - bR[i]) * 1.1 * mm;
            let g = G[i] + (G[i] - bG[i]) * 1.1 * mm;
            let b = B[i] + (B[i] - bB[i]) * 1.1 * mm;
            const L = lum(r, g, b);
            // Whites of the eyes: a little brighter and less red.
            const sat = (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(1, Math.max(r, g, b));
            const white = smooth01(90, 170, L) * (1 - smooth01(0.15, 0.35, sat));
            const lift = 1 + 0.12 * mm;
            r = r * lift;
            g = g * lift;
            b = b * lift;
            const grey = lum(r, g, b);
            const c = 0.5 * white * mm;
            setPx(i, r + (grey - r) * c, g + (grey - g) * c, b + (grey - b) * c);
        }
    }

    // ——— teeth ———
    const te = amt("teeth");
    if (te > 0) {
        let m = new Float32Array(n);
        fillPolygon(m, w, h, polyOf(face, LIPS_IN, reg, 0.95));
        m = soft(m, w, h, 1);
        for (let i = 0; i < n; i++) {
            if (m[i] < 0.01) continue;
            const L = lum(R[i], G[i], B[i]);
            const bright = smooth01(ref.L * 0.55, ref.L * 0.95, L);
            const mm = m[i] * bright * te;
            if (mm < 0.005) continue;
            const k = 1 + 0.12 * mm;
            const r = R[i] * k,
                g = G[i] * k,
                b = B[i] * k;
            const grey = lum(r, g, b);
            const c = 0.65 * mm;
            setPx(i, r + (grey - r) * c, g + (grey - g) * c, b + (grey * 1.02 - b) * c);
        }
    }

    // Write back.
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const j = ((y + reg.y) * W + x + reg.x) * 3;
            const i = y * w + x;
            rgb[j] = clamp(R[i], 0, 255);
            rgb[j + 1] = clamp(G[i], 0, 255);
            rgb[j + 2] = clamp(B[i], 0, 255);
        }
    }
}

function skinReference(R, G, B, area, n) {
    const list = [];
    for (let i = 0; i < n; i += 2) {
        if (area[i] < 0.5) continue;
        const L = lum(R[i], G[i], B[i]);
        if (L < 20 || L > 245) continue;
        list.push(i);
    }
    if (list.length < 40) return null;
    list.sort((a, b) => lum(R[a], G[a], B[a]) - lum(R[b], G[b], B[b]));
    const a = Math.floor(list.length * 0.25);
    const b = Math.max(a + 1, Math.floor(list.length * 0.8));
    let r = 0,
        g = 0,
        bl = 0;
    for (let k = a; k < b; k++) {
        r += R[list[k]];
        g += G[list[k]];
        bl += B[list[k]];
    }
    const c = b - a;
    r /= c;
    g /= c;
    bl /= c;
    const Y = Math.max(1, 0.299 * r + 0.587 * g + 0.114 * bl);
    return {
        r,
        g,
        b: bl,
        L: Math.max(1, lum(r, g, bl)),
        cb: (-0.168736 * r - 0.331264 * g + 0.5 * bl) / Y,
        cr: (0.5 * r - 0.418688 * g - 0.081312 * bl) / Y,
    };
}

/**
 * Spot-fix brush: replace painted areas with the colours around them.
 * @param {Float32Array} rgb n × 3 @param {number} W @param {number} H
 * @param {{ r: number, pts: number[] }[]} strokes  in full-size pixels
 * @param {number} scale  rgb pixels per full-size pixel
 */
export function heal(rgb, W, H, strokes, scale = 1) {
    if (!strokes.length) return;
    let x0 = Infinity,
        y0 = Infinity,
        x1 = -Infinity,
        y1 = -Infinity,
        maxR = 1;
    for (const s of strokes) {
        const r = s.r * scale;
        maxR = Math.max(maxR, r);
        for (let k = 0; k < s.pts.length; k += 2) {
            x0 = Math.min(x0, s.pts[k] * scale - r);
            x1 = Math.max(x1, s.pts[k] * scale + r);
            y0 = Math.min(y0, s.pts[k + 1] * scale - r);
            y1 = Math.max(y1, s.pts[k + 1] * scale + r);
        }
    }
    const pad = maxR * 4 + 4;
    const rx = Math.max(0, Math.floor(x0 - pad));
    const ry = Math.max(0, Math.floor(y0 - pad));
    const w = Math.min(W, Math.ceil(x1 + pad)) - rx;
    const h = Math.min(H, Math.ceil(y1 + pad)) - ry;
    if (w < 2 || h < 2) return;
    const n = w * h;
    const mask = new Float32Array(n);
    for (const s of strokes) {
        const r = Math.max(1, s.r * scale);
        const P = s.pts;
        const stamp = (cx, cy) => fillEllipse(mask, w, h, cx - rx, cy - ry, r, r);
        stamp(P[0] * scale, P[1] * scale);
        for (let k = 2; k < P.length; k += 2) {
            const ax = P[k - 2] * scale,
                ay = P[k - 1] * scale,
                bx = P[k] * scale,
                by = P[k + 1] * scale;
            const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (r * 0.4)));
            for (let t = 1; t <= steps; t++) stamp(ax + ((bx - ax) * t) / steps, ay + ((by - ay) * t) / steps);
        }
    }
    const C = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const j = ((y + ry) * W + x + rx) * 3;
            const i = y * w + x;
            C[0][i] = rgb[j];
            C[1][i] = rgb[j + 1];
            C[2][i] = rgb[j + 2];
        }
    }
    const keep = new Float32Array(n);
    for (let i = 0; i < n; i++) keep[i] = 1 - mask[i];
    const filled = C.map((ch) => {
        const a = fillFromAround(ch, keep, w, h, maxR * 1.4);
        const b = fillFromAround(ch, keep, w, h, maxR * 2.8);
        return { a, b };
    });
    const near = soft(keep, w, h, maxR * 1.4);
    const feather = soft(mask, w, h, Math.max(1, maxR * 0.25));
    // Fine grain from just outside the brush, so the fixed patch isn't flat.
    const L = new Float32Array(n);
    for (let i = 0; i < n; i++) L[i] = lum(C[0][i], C[1][i], C[2][i]);
    const Lb = boxMean(L, w, h, 1);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            const m = Math.max(mask[i], feather[i]);
            if (m < 0.003) continue;
            const tB = clamp(1 - near[i] * 4, 0, 1); // deep inside a big patch → use the wider fill
            // grain: take the fine detail from a pixel one brush-width to the side (if that one isn't painted)
            const sx = clamp(x + Math.round(maxR * 2.2), 0, w - 1);
            const si = y * w + sx;
            const grain = mask[si] < 0.1 ? (L[si] - Lb[si]) * 0.6 : 0;
            const j = ((y + ry) * W + x + rx) * 3;
            for (let c = 0; c < 3; c++) {
                const f = filled[c].a[i] * (1 - tB) + filled[c].b[i] * tB + grain;
                rgb[j + c] = clamp(C[c][i] + (f - C[c][i]) * m, 0, 255);
            }
        }
    }
}

/**
 * Local contrast ("clarity") on brightness only, in place.
 * @param {number} amount −1…1
 */
export function clarity(rgb, W, H, amount, radius) {
    if (!amount) return;
    const n = W * H;
    const L = new Float32Array(n);
    for (let i = 0; i < n; i++) L[i] = lum(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
    const Lb = soft(L, W, H, Math.max(2, radius));
    for (let i = 0; i < n; i++) {
        if (L[i] < 1) continue;
        const mid = 1 - Math.abs(L[i] / 127.5 - 1) ** 2; // mostly mid-tones
        const nl = L[i] + (L[i] - Lb[i]) * amount * 1.2 * mid;
        const k = clamp(nl, 0, 255) / L[i];
        rgb[i * 3] = clamp(rgb[i * 3] * k, 0, 255);
        rgb[i * 3 + 1] = clamp(rgb[i * 3 + 1] * k, 0, 255);
        rgb[i * 3 + 2] = clamp(rgb[i * 3 + 2] * k, 0, 255);
    }
}

/**
 * Blur of a background behind a person: colours of the person don't leak into the blur.
 * @param {Float32Array} rgb n × 3 background colours @param {Uint8ClampedArray} alpha person mask
 * @param {Uint8ClampedArray} [srcRGBA] original pixels (their alpha marks what was inside the photo)
 * @returns {Float32Array} blurred n × 3
 */
export function blurBehind(rgb, alpha, W, H, radius, srcRGBA = null) {
    const n = W * H;
    const wgt = new Float32Array(n);
    // Only real background pixels count (not the person, not empty corners outside the photo).
    for (let i = 0; i < n; i++) wgt[i] = (1 - alpha[i] / 255) * (srcRGBA ? srcRGBA[i * 4 + 3] / 255 : 1);
    const out = new Float32Array(n * 3);
    const blurW = boxMean(boxMean(boxMean(wgt, W, H, radius), W, H, radius), W, H, radius);
    for (let c = 0; c < 3; c++) {
        const ch = new Float32Array(n);
        for (let i = 0; i < n; i++) ch[i] = rgb[i * 3 + c] * wgt[i];
        const b = boxMean(boxMean(boxMean(ch, W, H, radius), W, H, radius), W, H, radius);
        for (let i = 0; i < n; i++) out[i * 3 + c] = blurW[i] > 1e-3 ? b[i] / blurW[i] : rgb[i * 3 + c];
    }
    return out;
}

/**
 * Reduce grain / phone noise over the whole photo, keeping edges (in place).
 * @param {number} amount 0…1
 */
export function denoise(rgb, W, H, amount, radius = 2) {
    if (amount <= 0) return;
    const n = W * H;
    const eps = (4 + 14 * amount) ** 2;
    for (let c = 0; c < 3; c++) {
        const ch = new Float32Array(n);
        for (let i = 0; i < n; i++) ch[i] = rgb[i * 3 + c];
        const q = guided(ch, W, H, radius, eps);
        const k = 0.5 + 0.5 * amount;
        for (let i = 0; i < n; i++) rgb[i * 3 + c] = clamp(ch[i] + (q[i] - ch[i]) * k, 0, 255);
    }
}

/**
 * Fill the parts of a kept background that were outside the original photo (corners left empty after
 * levelling the eyes) with the colours next to them, so no white wedges show. In place.
 * @param {Uint8ClampedArray} src RGBA (its alpha says what was inside the photo)
 * @returns {boolean} true when something was filled
 */
export function fillOutside(rgb, src, W, H) {
    const n = W * H;
    let empty = 0;
    for (let i = 0; i < n; i++) if (src[i * 4 + 3] < 250) empty++;
    if (!empty) return false;
    const wgt = new Float32Array(n);
    for (let i = 0; i < n; i++) wgt[i] = src[i * 4 + 3] / 255;
    const scales = [Math.max(2, W * 0.02), Math.max(4, W * 0.08)].map((r) => {
        const bw = soft(soft(wgt, W, H, r), W, H, r);
        const chans = [0, 1, 2].map((c) => {
            const ch = new Float32Array(n);
            for (let i = 0; i < n; i++) ch[i] = rgb[i * 3 + c] * wgt[i];
            return soft(soft(ch, W, H, r), W, H, r);
        });
        return { bw, chans };
    });
    for (let i = 0; i < n; i++) {
        const a = wgt[i];
        if (a >= 0.98) continue;
        const s = scales[0].bw[i] > 0.05 ? scales[0] : scales[1];
        const d = Math.max(1e-4, s.bw[i]);
        for (let c = 0; c < 3; c++) {
            const f = s.bw[i] > 1e-4 ? s.chans[c][i] / d : rgb[i * 3 + c];
            rgb[i * 3 + c] = rgb[i * 3 + c] * a + f * (1 - a);
        }
    }
    return true;
}