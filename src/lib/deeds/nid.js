// src/lib/deeds/nid.js
// NID card photo / photocopy → the person's details for a deed, read in the browser (tesseract.js, offline — the photo is
// never uploaded). Works with the smart card and the old laminated card, front and back, in any order and any way up,
// and with a photocopy that has both sides on one page.
//
// Steps for each photo: find the card(s) (card.js) and flatten them → turn the right way up (a quick English read at
// 0° / 180°, or all four turns when no card was found) → read Bangla + English → on the smart card's back also read the
// 3 machine lines (MRZ: NID number, date of birth, English name — very reliable) → nid-parse.js picks out the fields.
// The result is shown to the staff to check before it goes into the deed.
//
// readNidCloud(): the "Best" reader — the same card pictures (found + flattened here) are sent through /api/nid-read to
// the shop's Cloudflare Worker (a Workers AI vision model reads them); its answer goes through the same checks
// (places list, machine-line check digits) before it is shown.
import { findCardCorners, findTwoCards, warpQuad } from "@/lib/photo/card";
import { loadImage, makeCanvas, srcH, srcW } from "@/lib/photo/image";
import { addressLine, mergeAddress } from "./nid-address";
import { fixName, mergeNid, parseMrz, parseNid } from "./nid-parse";

const CARD_W = 2000; // px — the flattened card (≈ 590 dpi), big enough for the small Bangla letters
const CARD_H = Math.round((CARD_W * 54) / 85.6);

const workers = new Map(); // key → Promise<worker>

async function getWorker(key, langs, params) {
    if (!workers.has(key)) {
        workers.set(
            key,
            (async () => {
                const { createWorker, OEM } = await import("tesseract.js");
                const base = `${window.location.origin}/vendor/tesseract`;
                const w = await createWorker(langs, OEM.LSTM_ONLY, {
                    workerPath: `${base}/worker.min.js`,
                    corePath: `${base}/core`,
                    langPath: `${base}/lang`,
                    workerBlobURL: false,
                    gzip: true,
                    cacheMethod: "write",
                });
                if (params) await w.setParameters(params);
                return w;
            })().catch((err) => {
                workers.delete(key);
                throw err;
            }),
        );
    }
    return workers.get(key);
}

/** Free the readers (call when the NID box closes). */
export async function stopNidReader() {
    const list = [...workers.values()];
    workers.clear();
    await Promise.all(list.map((p) => p.then((w) => w.terminate()).catch(() => { })));
}

/** Grey, stretched contrast, scaled so the long side is `long` px. */
function prepare(src, long) {
    const s = long / Math.max(src.width, src.height);
    const c = makeCanvas(src.width * s, src.height * s);
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, 0, 0, c.width, c.height);
    const im = ctx.getImageData(0, 0, c.width, c.height);
    const d = im.data;
    const hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) {
        const y = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) | 0;
        d[i] = y;
        hist[y]++;
    }
    // 1% darkest → black, 1% lightest → white
    const n = d.length / 4;
    let lo = 0;
    let hi = 255;
    for (let a = 0, i = 0; i < 256; i++)
        if ((a += hist[i]) > n * 0.01) {
            lo = i;
            break;
        }
    for (let a = 0, i = 255; i >= 0; i--)
        if ((a += hist[i]) > n * 0.01) {
            hi = i;
            break;
        }
    const k = 255 / Math.max(30, hi - lo);
    for (let i = 0; i < d.length; i += 4) {
        const v = Math.max(0, Math.min(255, (d[i] - lo) * k));
        d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(im, 0, 0);
    return c;
}

/**
 * For faded / tinted photos (used when the plain grey copy reads badly).
 * Grey, light evened out, stretched contrast, scaled so the long side is `long` px. The grey is mostly the darkest of the
 * three colours: dark print stays dark on any card colour (green smart card, pink / faded laminate, red "ID NO" digits),
 * while the card's tint becomes light. Dividing by the blurred picture removes shadows, glare and uneven light.
 */
function prepareEven(src, long) {
    const s = long / Math.max(src.width, src.height);
    const c = makeCanvas(src.width * s, src.height * s);
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, 0, 0, c.width, c.height);
    const im = ctx.getImageData(0, 0, c.width, c.height);
    const d = im.data;
    for (let i = 0; i < d.length; i += 4) {
        const lum = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
        const y = Math.min(d[i], d[i + 1], d[i + 2]) * 0.6 + lum * 0.4;
        d[i] = d[i + 1] = d[i + 2] = y;
    }
    ctx.putImageData(im, 0, 0);
    // even out the light: each pixel against the blurred page around it
    const b = makeCanvas(c.width, c.height);
    const bctx = b.getContext("2d", { willReadFrequently: true });
    bctx.filter = `blur(${Math.max(8, Math.round(Math.min(c.width, c.height) / 18))}px)`;
    bctx.drawImage(c, 0, 0);
    const bg = bctx.getImageData(0, 0, c.width, c.height).data;
    const v = new Float32Array(d.length / 4);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) v[j] = d[i] / Math.max(16, bg[i]);
    // 1% darkest → black, the paper (most of the picture) → white
    const sorted = Float32Array.from(v).sort();
    const lo = sorted[Math.floor(sorted.length * 0.01)];
    const hi = sorted[Math.floor(sorted.length * 0.6)];
    const k = 255 / Math.max(0.08, hi - lo);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, (v[j] - lo) * k));
    ctx.putImageData(im, 0, 0);
    return c;
}

/** A small picture of what was read (shown next to the results). */
function thumb(src) {
    const c = toCanvas(src, 640);
    return c.toDataURL("image/jpeg", 0.7);
}

/**
 * Black-and-white copy (Sauvola: each pixel against its own neighbourhood), for faded / uneven photos where the grey copy
 * reads badly. The two readings are merged field by field.
 */
function binarize(src) {
    const { width: W, height: H } = src;
    const ctx = src.getContext("2d", { willReadFrequently: true });
    const im = ctx.getImageData(0, 0, W, H);
    const d = im.data;
    const r = Math.max(8, Math.round(W / 90));
    const S = new Float64Array((W + 1) * (H + 1));
    const S2 = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) {
        let a = 0;
        let b = 0;
        for (let x = 0; x < W; x++) {
            const v = d[(y * W + x) * 4];
            a += v;
            b += v * v;
            const i = (y + 1) * (W + 1) + x + 1;
            S[i] = S[i - W - 1] + a;
            S2[i] = S2[i - W - 1] + b;
        }
    }
    const out = makeCanvas(W, H);
    const oc = out.getContext("2d");
    const od = oc.createImageData(W, H);
    for (let y = 0; y < H; y++) {
        const y0 = Math.max(0, y - r);
        const y1 = Math.min(H, y + r + 1);
        for (let x = 0; x < W; x++) {
            const x0 = Math.max(0, x - r);
            const x1 = Math.min(W, x + r + 1);
            const n = (y1 - y0) * (x1 - x0);
            const a = y1 * (W + 1);
            const b = y0 * (W + 1);
            const sum = S[a + x1] - S[a + x0] - S[b + x1] + S[b + x0];
            const sum2 = S2[a + x1] - S2[a + x0] - S2[b + x1] + S2[b + x0];
            const m = sum / n;
            const sd = Math.sqrt(Math.max(0, sum2 / n - m * m));
            const t = m * (1 + 0.15 * (sd / 128 - 1));
            const v = d[(y * W + x) * 4] > t ? 255 : 0;
            const o = (y * W + x) * 4;
            od.data[o] = od.data[o + 1] = od.data[o + 2] = v;
            od.data[o + 3] = 255;
        }
    }
    oc.putImageData(od, 0, 0);
    return out;
}

/** Each pixel divided by the blurred page around it: uneven light, shadows and a washed-out print become even. */
function flatten(src) {
    const c = makeCanvas(src.width, src.height);
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(src, 0, 0);
    const im = ctx.getImageData(0, 0, c.width, c.height);
    const b = makeCanvas(c.width, c.height);
    const bctx = b.getContext("2d", { willReadFrequently: true });
    bctx.filter = `blur(${Math.max(6, Math.round(c.height / 25))}px)`;
    bctx.drawImage(src, 0, 0);
    const bg = bctx.getImageData(0, 0, c.width, c.height).data;
    const d = im.data;
    const v = new Float32Array(d.length / 4);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
        const y = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
        const g = bg[i] * 0.3 + bg[i + 1] * 0.59 + bg[i + 2] * 0.11;
        v[j] = Math.min(1.2, y / Math.max(8, g));
    }
    const sorted = Float32Array.from(v).sort();
    const lo = sorted[Math.floor(sorted.length * 0.02)];
    const hi = sorted[Math.floor(sorted.length * 0.9)];
    const k = 255 / Math.max(0.05, hi - lo);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, (v[j] - lo) * k));
    ctx.putImageData(im, 0, 0);
    return c;
}

/**
 * The address block in six versions (two sizes × grey / red channel, sharpened; light evened out; black-and-white):
 * the small Bangla letters read differently each time, and nid-address.js votes the readings part by part, so a
 * letter misread in one version is outvoted by the others. Faded / blurry photos gain most.
 */
function addressVariants(block) {
    const out = [];
    for (const w of [1600, 2600]) {
        const s = w / block.width;
        for (const red of [false, true]) {
            const c = makeCanvas(block.width * s, block.height * s);
            const ctx = c.getContext("2d", { willReadFrequently: true });
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(block, 0, 0, c.width, c.height);
            const im = ctx.getImageData(0, 0, c.width, c.height);
            const d = im.data;
            const b = makeCanvas(c.width, c.height);
            const bctx = b.getContext("2d", { willReadFrequently: true });
            bctx.filter = `blur(${Math.max(1, Math.round(s))}px)`;
            bctx.drawImage(c, 0, 0);
            const blur = bctx.getImageData(0, 0, c.width, c.height).data;
            const val = (arr, i) => (red ? arr[i] : arr[i] * 0.3 + arr[i + 1] * 0.59 + arr[i + 2] * 0.11);
            const v = new Float32Array(d.length / 4);
            for (let i = 0, j = 0; i < d.length; i += 4, j++) {
                const x = val(d, i);
                v[j] = x + 1.2 * (x - val(blur, i));
            }
            const sorted = Float32Array.from(v).sort();
            const lo = sorted[Math.floor(sorted.length * 0.01)];
            const hi = sorted[Math.floor(sorted.length * 0.99)];
            const k = 255 / Math.max(20, hi - lo);
            for (let i = 0, j = 0; i < d.length; i += 4, j++) {
                const y = Math.max(0, Math.min(255, (v[j] - lo) * k));
                d[i] = d[i + 1] = d[i + 2] = y;
            }
            ctx.putImageData(im, 0, 0);
            out.push(c);
        }
    }
    // light evened out, and a black-and-white copy of that (for washed-out, uneven or shadowed photos)
    const s = 2200 / block.width;
    const big = makeCanvas(block.width * s, block.height * s);
    const bctx = big.getContext("2d");
    bctx.imageSmoothingQuality = "high";
    bctx.drawImage(block, 0, 0, big.width, big.height);
    const flat = flatten(big);
    out.push(flat, binarize(flat));
    return out;
}

function rotate(src, quarter) {
    if (!quarter) return src;
    const odd = quarter % 2 === 1;
    const c = makeCanvas(odd ? src.height : src.width, odd ? src.width : src.height);
    const ctx = c.getContext("2d");
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate((quarter * Math.PI) / 2);
    ctx.drawImage(src, -src.width / 2, -src.height / 2);
    return c;
}

function toCanvas(img, maxLong) {
    const w = srcW(img);
    const h = srcH(img);
    const s = Math.min(1, maxLong / Math.max(w, h));
    const c = makeCanvas(w * s, h * s);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c;
}

const quadSize = (q) => ({
    w: (Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y) + Math.hypot(q[2].x - q[3].x, q[2].y - q[3].y)) / 2,
    h: (Math.hypot(q[3].x - q[0].x, q[3].y - q[0].y) + Math.hypot(q[2].x - q[1].x, q[2].y - q[1].y)) / 2,
});

/** Corners pushed out a little from the middle, so a slightly-off guess never cuts text off the card's edge. */
function grow(q, k, W, H) {
    const cx = q.reduce((t, p) => t + p.x, 0) / 4;
    const cy = q.reduce((t, p) => t + p.y, 0) / 4;
    return q.map((p) => ({
        x: Math.max(0, Math.min(W - 1, cx + (p.x - cx) * k)),
        y: Math.max(0, Math.min(H - 1, cy + (p.y - cy) * k)),
    }));
}

/** The part of a page that has something on it (a photocopy: the two card pictures), with a small margin. */
function contentCrop(img) {
    const small = toCanvas(img, 600);
    const { width: w, height: h } = small;
    const d = small.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    const lum = (x, y) => {
        const i = (y * w + x) * 4;
        return d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
    };
    const edge = [];
    for (let x = 0; x < w; x += 4) edge.push(lum(x, 2), lum(x, h - 3));
    for (let y = 0; y < h; y += 4) edge.push(lum(2, y), lum(w - 3, y));
    edge.sort((a, b) => a - b);
    const bg = edge[edge.length >> 1];
    let x0 = w;
    let y0 = h;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
            if (Math.abs(lum(x, y) - bg) > 45) {
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
            }
    const full = toCanvas(img, 3000);
    if (x1 < 0 || (x1 - x0) * (y1 - y0) < w * h * 0.08) return full;
    const s = full.width / w;
    const m = 0.03 * Math.max(w, h);
    const bx = Math.max(0, x0 - m) * s;
    const by = Math.max(0, y0 - m) * s;
    const bw = Math.min(w, x1 + m) * s - bx;
    const bh = Math.min(h, y1 + m) * s - by;
    const c = makeCanvas(bw, bh);
    c.getContext("2d").drawImage(full, bx, by, bw, bh, 0, 0, c.width, c.height);
    return c;
}

const cardShaped = (q) => {
    const { w, h } = quadSize(q);
    const r = Math.max(w, h) / Math.min(w, h);
    // a card is 1.58 : 1 (a little more or less with shadows / the plastic cover); anything else is not one card
    return r > 1.25 && r < 2;
};

/**
 * A scan / photocopy / PDF page (white paper around the cards): the blocks of print separated by white space. Much surer
 * than looking for card edges, because a light card on white paper has hardly any edge. Returns the crops of 2 card-sized
 * blocks (front and back: one above the other or side by side), or null when the page isn't like that.
 */
function scanPieces(img) {
    const W = srcW(img);
    const H = srcH(img);
    // paper-shaped only (A4 1.41, Letter 1.29, Legal 1.65 — either way round); a phone screenshot is ~2.2 : 1
    const pr = Math.max(W, H) / Math.min(W, H);
    if (pr < 1.2 || pr > 1.75) return null;
    const small = toCanvas(img, 900);
    const w = small.width;
    const h = small.height;
    const d = small.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    const ink = new Uint8Array(w * h); // 1 = not plain white paper
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
        const mn = Math.min(d[i], d[i + 1], d[i + 2]);
        const mx = Math.max(d[i], d[i + 1], d[i + 2]);
        ink[j] = mn < 225 || mx - mn > 22 ? 1 : 0;
    }
    // a page: the outer 3% all round is (almost) blank paper
    const m = Math.max(2, Math.round(Math.min(w, h) * 0.03));
    let border = 0;
    let borderInk = 0;
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
            if (x < m || y < m || x >= w - m || y >= h - m) {
                border++;
                borderInk += ink[y * w + x];
            }
    if (borderInk / border > 0.04) return null;
    // runs of rows (or columns) with print, white gaps between them
    const bands = (n, count, len) => {
        const out = [];
        let start = -1;
        let gap = 0;
        for (let i = 0; i <= n; i++) {
            const on = i < n && count(i) > len * 0.03;
            if (on) {
                if (start < 0) start = i;
                gap = 0;
            } else if (start >= 0 && (++gap > n * 0.012 || i === n)) {
                out.push([start, i - gap + 1]);
                start = -1;
                gap = 0;
            }
        }
        return out.filter(([a, b]) => b - a > n * 0.04);
    };
    const rowCount = (x0, x1) => (y) => {
        let c = 0;
        for (let x = x0; x < x1; x++) c += ink[y * w + x];
        return c;
    };
    const colCount = (y0, y1) => (x) => {
        let c = 0;
        for (let y = y0; y < y1; y++) c += ink[y * w + x];
        return c;
    };
    const boxes = [];
    for (const [y0, y1] of bands(h, rowCount(0, w), w)) {
        const cols = bands(w, colCount(y0, y1), y1 - y0);
        for (const [x0, x1] of cols) {
            // tighten the rows to this block's own columns
            const rows = bands(y1 - y0, (i) => rowCount(x0, x1)(y0 + i), x1 - x0);
            if (!rows.length) continue;
            boxes.push({ x0, x1, y0: y0 + rows[0][0], y1: y0 + rows[rows.length - 1][1] });
        }
    }
    const cardLike = boxes.filter((b) => {
        const bw = b.x1 - b.x0;
        const bh = b.y1 - b.y0;
        const r = Math.max(bw, bh) / Math.min(bw, bh);
        return r > 1.3 && r < 1.95 && bw * bh > w * h * 0.03;
    });
    if (cardLike.length !== 2) return null;
    const [a, b] = cardLike.map((x) => (x.x1 - x.x0) * (x.y1 - x.y0));
    if (Math.min(a, b) / Math.max(a, b) < 0.6) return null;
    const k = W / w;
    const full = toCanvas(img, Math.max(W, H));
    return cardLike.map((bx) => {
        const pad = 0.02 * Math.max(bx.x1 - bx.x0, bx.y1 - bx.y0);
        const x = Math.max(0, (bx.x0 - pad) * k);
        const y = Math.max(0, (bx.y0 - pad) * k);
        return cropTo(full, {
            x,
            y,
            w: Math.min(W - x, (bx.x1 - bx.x0 + 2 * pad) * k),
            h: Math.min(H - y, (bx.y1 - bx.y0 + 2 * pad) * k),
        });
    });
}

/**
 * The card(s) in a photo, flattened. A scan / photocopy / PDF page with both sides (front above back, or side by side)
 * gives two cards, read one after the other. When no card is found — a card that fills the photo, a faint photocopy —
 * the part of the page with print on it is read as it is.
 */
function cardsIn(img) {
    const W = srcW(img);
    const H = srcH(img);
    // a scan / PDF page with both sides on white paper
    const scanned = scanPieces(img);
    if (scanned) return { pieces: scanned.map((c) => ({ c, card: true })) };
    // a photo with one card that fills a good part of it: that card (pages with two cards are handled above, and a page
    // photographed with both cards has each well under a quarter of the picture)
    const first = findCardCorners(img);
    if (first.found && cardShaped(first.corners)) {
        const { w, h } = quadSize(first.corners);
        if (w * h > W * H * 0.25)
            return { pieces: [{ c: warpQuad(img, grow(first.corners, 1.05, W, H), CARD_W, CARD_H), card: true }] };
    }
    const two = findTwoCards(img);
    // two cards on one page: both clearly card-shaped (1.4–1.8 : 1 — half of a close-up card is ~1.26 : 1), about the same
    // size, and together well under the whole picture (a close-up card split in two halves fills it)
    const sure = (q) => {
        const { w, h } = quadSize(q);
        const r = Math.max(w, h) / Math.min(w, h);
        return r > 1.4 && r < 1.8;
    };
    if (two.found && two.cards.length === 2 && two.cards.every(sure)) {
        const [a, b] = two.cards.map(quadSize);
        const areas = [a.w * a.h, b.w * b.h];
        // …and side by side or one above the other, not one inside the other (a card in its plastic sleeve)
        const box = (q) => ({
            x0: Math.min(...q.map((p) => p.x)),
            x1: Math.max(...q.map((p) => p.x)),
            y0: Math.min(...q.map((p) => p.y)),
            y1: Math.max(...q.map((p) => p.y)),
        });
        const [p, q] = two.cards.map(box);
        const overlap =
            Math.max(0, Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0)) * Math.max(0, Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0));
        if (Math.min(...areas) / Math.max(...areas) > 0.6 && areas[0] + areas[1] < W * H * 0.7 && overlap < Math.min(...areas) * 0.1)
            return { pieces: two.cards.map((q) => ({ c: warpQuad(img, grow(q, 1.04, W, H), CARD_W, CARD_H), card: true })) };
    }
    const one = findCardCorners(img);
    if (one.found && cardShaped(one.corners)) {
        const pieces = [{ c: warpQuad(img, grow(one.corners, 1.05, W, H), CARD_W, CARD_H), card: true }];
        // a page where only one of the two sides was found as a card shape (the other is faint, or cut unevenly): the rest
        // of the page is read too
        const { w, h } = quadSize(one.corners);
        if (w * h < W * H * 0.4) {
            const rest = makeCanvas(W, H);
            const ctx = rest.getContext("2d");
            ctx.drawImage(img, 0, 0, W, H);
            const q = grow(one.corners, 1.08, W, H);
            ctx.fillStyle = "#fff";
            ctx.beginPath();
            q.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
            ctx.closePath();
            ctx.fill();
            const crop = contentCrop(rest);
            if (crop.width * crop.height > W * H * 0.08 && crop.width * crop.height < W * H * 0.9)
                pieces.push({ c: crop, card: false });
        }
        return { pieces };
    }
    return { pieces: [{ c: contentCrop(img), card: false }] };
}

const KEYWORDS = /GOVERNMENT|BANGLADESH|REPUBLIC|PEOPLE|NATIONAL|CARD|NAME|DATE|BIRTH|BLOOD|GROUP|PLACE|ISSUE|BGD|NID|ID ?NO/gi;

/** Tesseract's TSV output → lines `{ x, y, w, h, text, conf }` (and the words, for finding the card). */
function tsvLines(tsv) {
    const lines = new Map();
    const words = [];
    for (const row of String(tsv || "")
        .split("\n")
        .slice(1)) {
        const c = row.split("\t");
        if (c.length < 12 || c[0] !== "5") continue;
        const [x, y, w, h, conf] = [c[6], c[7], c[8], c[9], c[10]].map(Number);
        const text = c.slice(11).join("\t");
        if (!text.trim()) continue;
        words.push({ x, y, w, h, conf, text });
        const key = `${c[2]}.${c[3]}.${c[4]}`;
        const l = lines.get(key) || { x0: x, y0: y, x1: x + w, y1: y + h, parts: [], confs: [] };
        l.x0 = Math.min(l.x0, x);
        l.y0 = Math.min(l.y0, y);
        l.x1 = Math.max(l.x1, x + w);
        l.y1 = Math.max(l.y1, y + h);
        l.parts.push(text);
        l.confs.push(conf);
        lines.set(key, l);
    }
    return {
        words,
        lines: [...lines.values()].map((l) => ({
            x: l.x0,
            y: l.y0,
            w: l.x1 - l.x0,
            h: l.y1 - l.y0,
            text: l.parts.join(" "),
            conf: l.confs.reduce((a, b) => a + b, 0) / l.confs.length,
        })),
    };
}

const CARD_WORD =
    /^(GOVERNMENT|BANGLADESH|REPUBLIC|PEOPLE'?S|NATIONAL|CARD|NAME|DATE|BIRTH|BLOOD|GROUP|PLACE|ISSUE|NID|ID|NO\.?|THE|OF)$/i;

/**
 * Which way up? Read English quickly at each turn; the right way up finds the card's English words. Also returns where
 * the card's text is (so a small card in a big photo can be cut out and enlarged).
 */
async function orient(piece, turns) {
    const w = await getWorker("eng-fast", ["eng"], { tessedit_pageseg_mode: "11" });
    let small = prepare(piece, 1400);
    let best = { q: turns[0], score: -1, words: [], size: [small.width, small.height] };
    // a faded / tinted photo where no turn finds any card word: try again with the light evened out
    for (const pass of [0, 1]) {
        if (pass === 1) {
            if (best.score >= 100) break;
            small = prepareEven(piece, 1400);
            // nothing found the right way up or upside down: the card may lie sideways in its picture — try those turns too
            if (turns.length === 2) turns = [0, 1, 2, 3];
        }
        for (const q of turns) {
            const r = rotate(small, q);
            const { data } = await w.recognize(r, {}, { text: true, tsv: true });
            // the machine lines are the surest sign: "<<<<" the right way up, ">>>>" upside down
            const hits =
                (data.text.match(KEYWORDS) || []).length +
                (data.text.match(/<{4,}/g) || []).length * 3 -
                (data.text.match(/>{4,}/g) || []).length * 3;
            const score = hits * 100 + (data.confidence || 0);
            if (score > best.score) best = { q, score, words: tsvLines(data.tsv).words, size: [r.width, r.height] };
        }
    }
    const up = rotate(piece, best.q);
    // the card = the area of the confident words (card words, machine lines, numbers), with room around it
    const good = best.words.filter(
        (x) =>
            x.conf > 55 && x.h > 6 && (CARD_WORD.test(x.text) || /<{3,}|BGD|\d{4,}/.test(x.text) || (x.conf > 80 && x.text.length > 3)),
    );
    let box = null;
    if (good.length >= 3) {
        const k = up.width / best.size[0];
        const x0 = Math.min(...good.map((g) => g.x));
        const y0 = Math.min(...good.map((g) => g.y));
        const x1 = Math.max(...good.map((g) => g.x + g.w));
        const y1 = Math.max(...good.map((g) => g.y + g.h));
        const padX = (x1 - x0) * 0.25;
        const padY = (y1 - y0) * 0.35;
        box = {
            x: Math.max(0, (x0 - padX) * k),
            y: Math.max(0, (y0 - padY) * k),
            w: Math.min(up.width, (x1 + padX) * k) - Math.max(0, (x0 - padX) * k),
            h: Math.min(up.height, (y1 + padY) * k) - Math.max(0, (y0 - padY) * k),
        };
    }
    return { up, box };
}

function cropTo(src, b) {
    const c = makeCanvas(b.w, b.h);
    c.getContext("2d").drawImage(src, b.x, b.y, b.w, b.h, 0, 0, c.width, c.height);
    return c;
}

/**
 * Read each Bangla / weak line again on its own, enlarged (letter height ≈ 70 px). Small Bangla letters on the card's
 * patterned background read much better one line at a time.
 */
async function rereadLines(worker, big, lines, step, bnWorker) {
    const out = [];
    const todo = lines.filter((l) => l.h >= 10 && l.w >= l.h * 2 && l.h < big.height * 0.2);
    let n = 0;
    for (const l of lines) {
        if (!todo.includes(l) || /<{3,}/.test(l.text)) {
            out.push(l.text);
            continue;
        }
        step?.(++n, todo.length);
        const padY = l.h * 0.45;
        const padX = l.h * 0.6;
        const b = {
            x: Math.max(0, l.x - padX),
            y: Math.max(0, l.y - padY),
            w: Math.min(big.width, l.x + l.w + padX) - Math.max(0, l.x - padX),
            h: Math.min(big.height, l.y + l.h + padY) - Math.max(0, l.y - padY),
        };
        const crop = cropTo(big, b);
        const scale = Math.min(4, Math.max(1, 90 / l.h));
        const c = makeCanvas(crop.width * scale, crop.height * scale);
        const ctx = c.getContext("2d");
        ctx.imageSmoothingQuality = "high";
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(crop, 0, 0, c.width, c.height);
        // a line with Bangla in it is read by the Bangla-only reader: the mixed reader too often turns small Bangla words
        // into English letters ("রাস্তা TYAN: GIGHEETR")
        const bangla =
            bnWorker &&
            /[\u0980-\u09FF]/.test(l.text) &&
            !/Name|Date|Birth|NID|ID ?NO|Blood|Group|Place|Issue|Govern|Republic|National|Card/i.test(l.text);
        const { data } = await (bangla ? bnWorker : worker).recognize(c);
        const t = data.text.replace(/\s+/g, " ").trim();
        out.push(t && (data.confidence || 0) >= l.conf - (bangla ? 12 : 5) ? t : l.text);
    }
    return out.join("\n");
}

const isPdf = (file) => file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");

/** The first 2 pages of a PDF (a scan of the card), drawn at about 300 dpi. */
async function pdfPages(file) {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.mjs";
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    const doc = await task.promise;
    const out = [];
    try {
        for (let n = 1; n <= Math.min(2, doc.numPages); n++) {
            const page = await doc.getPage(n);
            const v1 = page.getViewport({ scale: 1 });
            const viewport = page.getViewport({ scale: Math.min(4.2, 3200 / Math.max(v1.width, v1.height)) });
            const c = makeCanvas(viewport.width, viewport.height);
            const ctx = c.getContext("2d");
            ctx.fillStyle = "#fff";
            ctx.fillRect(0, 0, c.width, c.height);
            await page.render({ canvas: c, viewport }).promise;
            out.push(c);
        }
    } finally {
        await task.destroy();
    }
    return out;
}

/** Read one photo / scan / PDF (one card side, or a page with both sides). */
async function readPhoto(file, step) {
    if (isPdf(file)) {
        step("Opening the PDF");
        const out = [];
        for (const page of await pdfPages(file)) out.push(...(await readImage(page, step)));
        return out;
    }
    const { img, url } = await loadImage(file);
    try {
        return await readImage(img, step);
    } finally {
        URL.revokeObjectURL(url);
    }
}

/** Read one picture: every card in it. */
async function readImage(img, step) {
    {
        const { pieces } = cardsIn(img);
        const out = [];
        for (const { c: piece, card: cards } of pieces) {
            step("Finding the card and which way up");
            const found = await orient(piece, cards ? [0, 2] : [0, 1, 2, 3]);
            let up = found.up;
            // no card shape found, but the card's text is in a small part of the photo: cut that part out
            if (!cards && found.box && found.box.w * found.box.h < up.width * up.height * 0.6) up = cropTo(up, found.box);
            const main = await getWorker("ben-eng", ["ben", "eng"], { tessedit_pageseg_mode: "3", preserve_interword_spaces: "1" });
            const long = Math.max(up.width, up.height);
            const size = cards ? CARD_W : Math.min(3000, Math.max(2200, long));
            let big = prepare(up, size);
            step("Reading Bangla and English");
            let { data } = await main.recognize(big, {}, { text: true, tsv: true });
            // read badly (faded / pink / shadowed photo): the copy with the light evened out, if it reads more of the card
            const cardWords = (t) => (t.match(KEYWORDS) || []).length * 10 + (t.match(/[\u0980-\u09FF]{3,}/g) || []).length;
            if ((data.confidence || 0) < 60 || cardWords(data.text) < 25) {
                const even = prepareEven(up, size);
                const again = (await main.recognize(even, {}, { text: true, tsv: true })).data;
                if (cardWords(again.text) + (again.confidence || 0) / 5 > cardWords(data.text) + (data.confidence || 0) / 5) {
                    data = again;
                    big = even;
                }
            }
            // the automatic layout finder sometimes gives up on busy card backgrounds — then read it as loose text
            if (data.text.replace(/\s/g, "").length < 60) {
                await main.setParameters({ tessedit_pageseg_mode: "11" });
                const again = (await main.recognize(big, {}, { text: true, tsv: true })).data;
                await main.setParameters({ tessedit_pageseg_mode: "3" });
                if (again.text.replace(/\s/g, "").length > data.text.replace(/\s/g, "").length) data = again;
            }
            const { lines } = tsvLines(data.tsv);
            let mrz = "";
            if (/<{3,}|BGD|Place of Birth|Issue Date/i.test(data.text)) {
                step("Reading the machine lines");
                const m = await getWorker("mrz", ["eng"], {
                    tessedit_pageseg_mode: "6",
                    tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<",
                });
                mrz = (await m.recognize(big)).data.text;
                // the machine lines again, cut out and enlarged (faded / small cards): the lines with "<" in them, or the bottom
                // 40% of the card
                const ml = lines.filter((l) => /<{2,}|BGD/.test(l.text));
                const top = ml.length ? Math.max(0, Math.min(...ml.map((l) => l.y)) - 20) : big.height * 0.6;
                const bottom = ml.length ? Math.min(big.height, Math.max(...ml.map((l) => l.y + l.h)) + 20) : big.height;
                const band = cropTo(big, { x: 0, y: top, w: big.width, h: bottom - top });
                const z = makeCanvas(band.width * 1.6, band.height * 1.6);
                const zc = z.getContext("2d");
                zc.imageSmoothingQuality = "high";
                zc.drawImage(band, 0, 0, z.width, z.height);
                mrz += `\n${(await m.recognize(z)).data.text}\n${(await m.recognize(binarize(z))).data.text}`;
            }
            // each line again, enlarged, one at a time (much better for the small Bangla letters)
            const line = await getWorker("ben-eng-line", ["ben", "eng"], {
                tessedit_pageseg_mode: "7",
                preserve_interword_spaces: "1",
            });
            const bnLine = await getWorker("ben-line", ["ben"], { tessedit_pageseg_mode: "7", preserve_interword_spaces: "1" });
            const lineText = await rereadLines(line, big, lines, (k, n) => step(`Reading line ${k} of ${n}`), bnLine);
            // the address block read again on its own, enlarged, in several versions (the page reader often skips or
            // garbles its small letters on the patterned background). Old card: from the "ঠিকানা" line down; smart card:
            // just above "Blood Group / Place of Birth", left of the lotus.
            let addr = [];
            const blood = lines.find((l) => /Blood|Group|Place|Birth|Issue/i.test(l.text) && !/Date of Birth/i.test(l.text));
            const start = lines.find((l) => /ঠিকান|ঠিকনা|ঠিকা না|ডাকঘর|গ্রাম\s*\/|হো[ল্]*ডিং/.test(l.text));
            const smart = /<{3,}|BGD/.test(data.text + mrz);
            let box = null;
            if (start) {
                const below = lines
                    .filter((l) => l.y > start.y + start.h * 0.5 && /Blood|Group|Place|রক্ত|জন্মস্থান|প্রদান|মুদ্রণ|<{3,}/i.test(l.text))
                    .sort((a, b) => a.y - b.y)[0];
                const top = Math.max(0, start.y - start.h * 0.6);
                const bottom = Math.min(big.height, below ? below.y - 2 : start.y + start.h * 4.2);
                box = { top, bottom };
            } else if (blood) box = { top: Math.max(0, blood.y - big.height * 0.3), bottom: blood.y };
            if (box && box.bottom - box.top > 10) {
                step("Reading the address");
                // from the colour photo (not the grey copy): the red channel shows dark letters best on the green card
                const k = up.width / big.width;
                const wide = smart ? 0.75 : 0.97;
                const block = cropTo(up, { x: 0, y: box.top * k, w: up.width * wide, h: (box.bottom - box.top) * k });
                // Bangla only: the address has no English, and the mixed reader turns small Bangla words into English letters
                const bnBlock = await getWorker("ben-block", ["ben"], { tessedit_pageseg_mode: "6", preserve_interword_spaces: "1" });
                for (const variant of addressVariants(block)) addr.push((await bnBlock.recognize(variant)).data.text);
            }
            step("Reading again (black and white)");
            // black-and-white copy read as one block of text (a different layout guess catches lines the first one missed)
            await main.setParameters({ tessedit_pageseg_mode: "6" });
            const bw = (await main.recognize(binarize(big))).data.text;
            await main.setParameters({ tessedit_pageseg_mode: "3" });
            out.push({
                text: data.text,
                lines: lineText,
                addr,
                bw,
                mrz,
                confidence: Math.round(data.confidence || 0),
                preview: thumb(up),
                ...(globalThis.__nidDebug ? { full: big.toDataURL("image/png") } : {}),
            });
        }
        return out;
    }
}

/**
 * Read 1–3 NID photos / scans / PDFs (front, back, or one page with both sides) and pick out the details.
 * @param {File[]} files
 * @param {(label: string, done: number) => void} [onProgress]  done 0–1
 * @returns {Promise<{ fields: object, found: string[], texts: object[] }>}  fields use the deed's person keys
 *   (name, father, mother, husband, house, village, post, upazila, district, nid) + nameEn, dob, blood, addressLine
 */
export async function readNid(files, onProgress) {
    const list = [...files].slice(0, 3);
    const texts = [];
    let i = 0;
    for (const f of list) {
        const step = (label) => onProgress?.(`${label} (${i + 1}/${list.length})`, i / list.length);
        texts.push(...(await readPhoto(f, step)));
        i++;
    }
    onProgress?.("Done", 1);
    const fields = mergeNid(
        texts.flatMap((t) => [parseNid(t.lines, t.mrz), parseNid(t.text, t.mrz), parseNid(t.bw, t.mrz)]),
        // the address block readings, as they are (every version is a vote)
        texts.flatMap((t) => t.addr || []),
    );
    return { fields, found: Object.keys(fields).filter((k) => fields[k]), texts };
}

// ——— Best reader: Cloudflare Workers AI ———

/** A picture → JPEG data URL, long side ≤ `long` px (small enough for the 4 MB request limit, big enough to read). */
function jpegUrl(src, long = 1600) {
    const c = toCanvas(src, long);
    return c.toDataURL("image/jpeg", 0.86);
}

const BN_ONLY = (v) => {
    const t = String(v || "")
        .replace(/^\s*(?:নাম|পিতা|মাতা|স্বামী)\s*[:ঃ]?\s*/, "")
        .replace(/[\u200C\u200D]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    // a name must be Bangla (the model sometimes answers in English or "N/A" when it can't read it)
    const bn = (t.match(/[\u0980-\u09FF]/g) || []).length;
    return bn && bn >= t.replace(/[\s.:]/g, "").length * 0.85 ? t : "";
};

/**
 * The model's answer → the deed fields, checked: names Bangla only (common name words set right), NID 10 / 13 / 17
 * digits — and the smart card's machine lines (check digits) win over the printed number / date when they check out,
 * the address split into the 5 boxes and checked against the places list (nid-address.js).
 */
function cloudFields(data) {
    const out = {};
    for (const k of ["name", "father", "mother", "husband"]) {
        const v = BN_ONLY(data[k]);
        if (v) out[k] = fixName(v) || v;
    }
    const en = String(data.nameEn || "")
        .replace(/[^A-Za-z.\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    if (en.length > 2) out.nameEn = en.toUpperCase();
    const nid = String(data.nid || "")
        .replace(/[০-৯]/g, (c) => "০১২৩৪৫৬৭৮৯".indexOf(c))
        .replace(/\D/g, "");
    if ([10, 13, 17].includes(nid.length)) out.nid = nid;
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(data.dob || ""))) out.dob = data.dob;
    const blood = /\b(A|B|AB|O)\s*[+-]/i.exec(String(data.blood || ""));
    if (blood) out.blood = blood[0].replace(/\s/g, "").toUpperCase();
    const mrz = parseMrz(String(data.mrz || ""));
    if (mrz.nid) {
        out.nid = mrz.nid;
        out.nidChecked = true;
    }
    if (mrz.dob) out.dob = mrz.dob;
    if (data.address) {
        Object.assign(out, mergeAddress([String(data.address)]));
        const line = addressLine(out);
        if (line) out.addressLine = line;
    }
    return out;
}

/**
 * The Best reader: card pictures → Cloudflare Workers AI → checked fields. Same answer shape as readNid().
 * Throws when the cloud can't be used (the caller falls back to readNid()).
 * @param {File[]} files
 * @param {(label: string, done: number) => void} [onProgress]
 */
export async function readNidCloud(files, onProgress) {
    onProgress?.("Finding the card", 0.1);
    const pictures = [];
    for (const f of [...files].slice(0, 3)) {
        if (isPdf(f)) {
            for (const page of await pdfPages(f)) for (const { c } of cardsIn(page).pieces) pictures.push(c);
        } else {
            const { img, url } = await loadImage(f);
            try {
                for (const { c } of cardsIn(img).pieces) pictures.push(c);
            } finally {
                URL.revokeObjectURL(url);
            }
        }
    }
    if (!pictures.length) throw new Error("no card picture");
    const images = pictures.slice(0, 4).map((c) => jpegUrl(c));
    onProgress?.("Reading with Cloudflare AI", 0.35);
    const res = await fetch("/api/nid-read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ images }),
        signal: AbortSignal.timeout(65000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `error ${res.status}`);
    onProgress?.("Checking", 0.95);
    const fields = cloudFields(body.data || {});
    onProgress?.("Done", 1);
    return {
        fields,
        found: Object.keys(fields).filter((k) => fields[k]),
        texts: pictures.slice(0, 4).map((c) => ({ preview: thumb(c) })),
        engine: "cloud",
        model: String(body.model || "")
            .split("/")
            .pop(),
    };
}