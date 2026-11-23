// src/lib/cv/html.js
// CV → page blocks → HTML. The same HTML is used to measure (for page breaks), to preview and to print, so what is
// on screen is what comes out of the printer. Word export (docx.js) uses the same sizes, in Word units.
//
// Layout (from the shop's Word template): A4, margins 20.3 mm top/bottom and 25.4 mm left/right, Poppins.
// Every row is aligned on fixed columns (no spaces or tabs typed by hand), so labels, colons and values always line up,
// and long values wrap under the value — the misalignment that creeps into hand-made Word CVs can't happen here.
import { contactLines, lines, shownSections, themes } from "./model";

export const PAGE = { w: 210, h: 297, top: 20.3, bottom: 20.3, left: 25.4, right: 25.4 };
export const CONTENT_W = PAGE.w - PAGE.left - PAGE.right; // 159.2 mm

/** Shared sizes (pt / mm) — docx.js reads these too, so Word and print match. */
export const SIZES = {
    body: 10, // pt
    para: 9.5, // paragraphs (objective, profile, declaration)
    title: 22,
    name: 18,
    heading: 12,
    barH: 8, // mm
    photoW: 27, // mm
    photoH: 34, // mm
    bulletCol: 5, // mm — ❖
    labelCol: 42, // mm — label width
    colonCol: 4, // mm
    indent: 4, // mm — rows start this far in
    jobCols: [27, 23, 26, 24], // % of the table width
};

export const FONT = `"Poppins", "Noto Sans Bengali Variable", "Segoe UI", Arial, sans-serif`;
export const HEADING_FONT = `"Times New Roman", Times, serif`;
const BULLET = "❖";

/**
 * Spacing / size for "always 2 pages": k stretches the gaps between rows (and a little the line height),
 * f scales the font. k = 1, f = 1 is the template's own spacing. Set by cvBlocks for the helpers below.
 */
let FIT = { k: 1, f: 1 };
const g = (pt) => `${(pt * FIT.k).toFixed(2)}pt`; // a vertical gap
const lh = (x) => (x * (1 + (FIT.k - 1) * 0.35)).toFixed(3); // a line height
const fs = (pt) => `${(pt * FIT.f).toFixed(2)}pt`; // a font size
const gmm = (mm) => `${(mm * FIT.k).toFixed(2)}mm`;

export const esc = (s) =>
    String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

/** Light → full colour, like the template's heading bars (20% tint → colour). */
export function tint(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c + (255 - c) * amount));
    return `#${ch.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The CV as a list of blocks. Each block is one unbreakable piece; `keep` = must stay on the same page as the next
 * block (headings, table headers); `head` = the table header to repeat when a table continues on a new page.
 * @returns {{ key: string, html: string, keep?: boolean, head?: string }[]}
 */
export function cvBlocks(cv, fit = { k: 1, f: 1 }) {
    FIT = fit;
    const t = themes[cv.theme] ?? themes.blue;
    const out = [];
    out.push({ key: "header", html: headerHtml(cv, t) });
    let first = true;
    for (const s of shownSections(cv)) {
        out.push({ key: `${s.id}:h`, html: headingHtml(s.title, t, first), keep: true });
        first = false;
        out.push(...sectionBlocks(s, t));
    }
    return out;
}

function headerHtml(cv, t) {
    const contact = contactLines(cv);
    const photo = cv.photo
        ? `<img src="${cv.photo}" alt="" style="width:${SIZES.photoW}mm;height:${SIZES.photoH}mm;object-fit:cover;display:block" />`
        : "";
    return `<div style="display:flex;gap:6mm;align-items:flex-end;padding-bottom:${g(3)}">
    <div style="flex:1;min-width:0">
      ${cv.title?.trim() ? `<div style="text-align:center;font-size:${fs(SIZES.title)};font-weight:700;color:${t.title};line-height:1.2">${esc(cv.title)}</div>` : ""}
      ${cv.name?.trim() ? `<div style="text-align:center;font-size:${fs(SIZES.name)};font-weight:700;color:${t.title};line-height:1.25">${esc(cv.name)}</div>` : ""}
      <div style="height:${g(contact.length ? 10 : 2)}"></div>
      ${cv.name?.trim() && contact.length ? `<div style="line-height:${lh(1.55)}">${esc(cv.name)}</div>` : ""}
      ${contact.map((c) => `<div style="line-height:${lh(1.55)}">${esc(c)}</div>`).join("")}
    </div>
    ${photo ? `<div style="flex:none">${photo}</div>` : ""}
  </div>`;
}

function headingHtml(title, t, first) {
    return `<div style="padding-top:${first ? "6pt" : g(9)};padding-bottom:${g(4)}">
    <div style="height:${SIZES.barH}mm;background:linear-gradient(90deg, ${tint(t.bar, 0.8)}, ${t.bar});display:flex;align-items:center;padding-left:2.5mm;
      font-family:${HEADING_FONT};font-weight:700;font-size:${fs(SIZES.heading)};color:${t.heading};letter-spacing:0.2pt;
      -webkit-print-color-adjust:exact;print-color-adjust:exact">${esc(title)}</div>
  </div>`;
}

const bullet = () =>
    `<span style="font-size:${fs(8)};line-height:${(SIZES.body * FIT.f * lh(1.5)).toFixed(2)}pt">${BULLET}</span>`;

const kvRow = (
    label,
    value,
) => `<div style="display:grid;grid-template-columns:${SIZES.bulletCol}mm ${SIZES.labelCol}mm ${SIZES.colonCol}mm 1fr;
  padding-left:${SIZES.indent}mm;line-height:${lh(1.5)};padding-bottom:${g(1)}">
  ${bullet()}<span>${esc(label)}</span><span>:</span><span>${multiline(value)}</span></div>`;

const multiline = (v) => lines(v).map(esc).join("<br>");
const short = (t) => {
    const s = String(t || "")
        .replace(/\s+/g, " ")
        .trim();
    return s.length > 40 ? `${s.slice(0, 38)}…` : s;
};

const paraHtml = (text) =>
    `<div style="font-size:${fs(SIZES.para)};line-height:${lh(1.7)};text-align:justify">${multiline(text)}</div>`;

function sectionBlocks(s, t) {
    const k = (i) => `${s.id}:${i}`;
    switch (s.type) {
        case "text":
            return String(s.text)
                .split(/\n\s*\n/)
                .map((p) => p.trim())
                .filter(Boolean)
                .map((p, i) => ({ key: k(i), label: short(p), html: `<div style="padding-bottom:${g(3)}">${paraHtml(p)}</div>` }));
        case "languages": {
            const cols = Math.min(3, s.items.length);
            const rows = [];
            for (let i = 0; i < s.items.length; i += cols) rows.push(s.items.slice(i, i + cols));
            return rows.map((row, r) => ({
                key: k(r),
                label: row.map((l) => l.name).join(", "),
                html: `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:4mm;padding:${g(1)} 0 ${g(4)} ${SIZES.indent}mm">${row
                    .map(
                        (l) =>
                            `<div><div style="font-weight:700;line-height:${lh(1.5)}">${BULLET} ${esc(l.name)}${l.name?.trim() ? ":" : ""}</div>
              <div style="padding-left:${SIZES.bulletCol}mm;line-height:${lh(1.5)}">${multiline(l.detail)}</div></div>`,
                    )
                    .join("")}</div>`,
            }));
        }
        case "experience": {
            const cols = SIZES.jobCols.map((c) => `${c}%`).join(" ");
            const cell = (v, bold, last) =>
                `<div style="padding:${g(2)} 3pt;text-align:center;${bold ? "font-weight:700;" : ""}${last ? "" : "border-right:0.75pt solid #000;"}line-height:${lh(1.45)}">${multiline(v)}</div>`;
            const row = (vals, bold, top) =>
                `<div style="display:grid;grid-template-columns:${cols};border:0.75pt solid #000;${top ? "" : "border-top:none;"}">${vals
                    .map((v, i) => cell(v, bold, i === vals.length - 1))
                    .join("")}</div>`;
            const head = `<div style="padding-top:${g(2)}">${row(["Name of Company", "Designation", "Location", "Duration"], true, true)}</div>`;
            return [
                { key: k("head"), html: head, keep: true },
                ...s.items.map((j, i) => ({
                    key: k(i),
                    label: j.company || j.designation,
                    html: `<div style="${i === s.items.length - 1 ? `padding-bottom:${g(4)}` : ""}">${row([j.company, j.designation, j.location, j.duration], false, false)}</div>`,
                    head,
                })),
            ];
        }
        case "education":
            // The exam title stays with its first row; the rows are separate blocks, so a page can end inside an exam.
            return s.items.flatMap((e, i) => {
                const out = [];
                if (e.exam?.trim()) {
                    out.push({
                        key: k(i),
                        label: e.exam,
                        keep: e.rows.length > 0,
                        html: `<div style="font-weight:700;text-decoration:underline;line-height:${lh(1.6)};padding-bottom:${g(2)}${e.rows.length ? "" : `;margin-bottom:${g(5)}`}">${esc(e.exam)}</div>`,
                    });
                }
                e.rows.forEach((r, j) =>
                    out.push({
                        key: `${k(i)}.${j}`,
                        label: `${e.exam || "Exam"} — ${r.label}`,
                        html:
                            j === e.rows.length - 1
                                ? `<div style="padding-bottom:${g(4)}">${kvRow(r.label, r.value)}</div>`
                                : kvRow(r.label, r.value),
                    }),
                );
                return out;
            });
        case "keyvalue":
            return s.rows.map((r, i) => ({ key: k(i), label: r.label, html: kvRow(r.label, r.value) }));
        case "list":
            return s.items.map((it, i) => ({
                key: k(i),
                label: short(it.text),
                html: `<div style="display:grid;grid-template-columns:${SIZES.bulletCol}mm 1fr;padding-left:${SIZES.indent}mm;line-height:${lh(1.5)};padding-bottom:${g(1)}">
          ${bullet()}<span>${multiline(it.text)}</span></div>`,
            }));
        case "references": {
            const rows = [];
            for (let i = 0; i < s.items.length; i += 2) rows.push(s.items.slice(i, i + 2));
            return rows.map((row, r) => ({
                key: k(r),
                label: row.map((p) => p.name).join(", "),
                html: `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6mm;padding:${g(1)} 0 ${g(6)} ${SIZES.indent}mm">${row
                    .map(
                        (p) =>
                            `<div style="line-height:${lh(1.5)}"><div style="font-weight:700">${esc(p.name)}</div><div>${multiline(p.lines)}</div></div>`,
                    )
                    .join("")}</div>`,
            }));
        }
        case "declaration":
            return [
                {
                    key: k(0),
                    html: `<div style="padding-top:${g(2)}">
            ${s.text?.trim() ? paraHtml(s.text) : ""}
            <div style="height:${gmm(16)}"></div>
            <div style="width:58mm;border-top:0.75pt solid #000;padding-top:3pt;line-height:1.5">${esc(s.sign)}</div>
          </div>`,
                },
            ];
        default:
            return [];
    }
}

/**
 * Put blocks on pages. `measure(html)` returns a block's height in mm.
 * Headings and table headers never end a page; a table that continues gets its header again.
 */
export function paginate(blocks, measure) {
    const avail = PAGE.h - PAGE.top - PAGE.bottom - 0.5;
    const h = blocks.map((b) => measure(b.html));
    const headH = new Map();
    const pages = [[]];
    let used = 0;
    const room = () => avail - used;
    for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        let need = h[i];
        // Keep a heading with what follows it (all chained "keep" blocks + the first real block).
        if (b.keep) {
            let j = i;
            need = 0;
            while (j < blocks.length && blocks[j].keep) need += h[j++];
            if (j < blocks.length) need += h[j];
        }
        if (need > room() && pages[pages.length - 1].length) {
            pages.push([]);
            used = 0;
            if (b.head && !b.keep) {
                if (!headH.has(b.head)) headH.set(b.head, measure(b.head));
                pages[pages.length - 1].push({ key: `${b.key}:rehead`, html: b.head });
                used += headH.get(b.head);
            }
        }
        pages[pages.length - 1].push(b);
        used += h[i];
    }
    return pages;
}

export const FIT_LIMITS = { kMin: 0.55, kMax: 2, fonts: [1, 0.96, 0.92, 0.88] };
const GROW = [1.04, 1.08, 1.12]; // auto text size may grow to 11.2 pt for a short CV
/** Text sizes the staff can pick (pt). "auto" = 10 pt, smaller only when the CV doesn't fit. */
export const TEXT_SIZES = [9, 9.5, 10, 10.5, 11];
const SAFETY = 1.5; // mm kept free at the bottom of each page (Word's lines can be a hair taller)

/**
 * Lay the CV out on exactly 2 pages.
 *
 * Every block's height is a straight line in the spacing k (gaps × k, line heights × 1 + (k−1)·0.35, nothing else
 * changes), so each block is measured at two spacings and the rest is worked out without measuring again.
 * For each place page 2 could start (not after a heading / table header), each page gets its own spacing: the largest
 * that still fills it. Auto picks the place where both pages are filled most evenly, so page 1 never ends with a big
 * empty space. Page 2 may be at most 20% looser than page 1 (a shorter page 2 looks normal; a gappy page 1 doesn't).
 *
 * @param {object} cv
 * @param {(html: string) => number} measure  height of an HTML block in mm (at the font size set by setFont)
 * @param {(f: number) => void} setFont        sets the body font scale of the measuring box
 * @param {{ breakAt?: string, size?: "auto" | number }} [opts]  breakAt = "auto" or the key of the block that starts page 2
 * @returns {{ pages: object[][], fit: { k1: number, k2: number, f: number }, breakKey: string | null,
 *   choices: { key: string, label: string }[], tooLong: boolean, breakIgnored: boolean }}
 */
export function layoutCv(cv, measure, setFont, opts = {}) {
    const breakAt = opts.breakAt || "auto";
    const size = opts.size && opts.size !== "auto" ? Number(opts.size) : null;
    const { kMin, kMax } = FIT_LIMITS;
    const fonts = size ? [size / SIZES.body] : FIT_LIMITS.fonts;
    const avail = PAGE.h - PAGE.top - PAGE.bottom - 0.5 - SAFETY;
    const K0 = 0.6;
    const K1 = 1.6;

    let manualFailed = false;
    // One try at text scale f → a result, or null when nothing fits 2 pages at this size.
    const tryFont = (f, isLast) => {
        setFont(f);
        const A = cvBlocks(cv, { k: K0, f });
        const B = cvBlocks(cv, { k: K1, f });
        const n = A.length;
        // h(k) = a + s·k for every block (and for the repeated table header)
        const line = (ha, hb) => {
            const sl = (hb - ha) / (K1 - K0);
            return { a: ha - sl * K0, s: sl };
        };
        const L = A.map((b, i) => line(measure(b.html), measure(B[i].html)));
        const H = A.map((b, i) => (b.head ? line(measure(b.head), measure(B[i].head)) : null));
        const pa = [0];
        const ps = [0];
        L.forEach((x, i) => {
            pa[i + 1] = pa[i] + x.a;
            ps[i + 1] = ps[i] + x.s;
        });
        const kFit = (a, sl) => (sl > 1e-6 ? (avail - a) / sl : a <= avail ? 99 : -1);

        const options = [];
        for (let b = 1; b < n; b++) {
            if (A[b - 1].keep) continue; // a heading / table header never ends page 1
            const isItem = (x) => x && !x.keep && x.key !== "header";
            const groupEnd = (x) => !x || x.keep || x.key.endsWith(":h");
            // no lonely row: at least 2 rows of a list / exam / table on each side of the break
            if (isItem(A[b]) && (b < 2 || A[b - 2].keep)) continue;
            if (isItem(A[b]) && groupEnd(A[b + 1])) continue;
            const rehead = A[b].head && !A[b].keep ? H[b] : null;
            const k1 = kFit(pa[b], ps[b]);
            const k2 = kFit(pa[n] - pa[b] + (rehead?.a ?? 0), ps[n] - ps[b] + (rehead?.s ?? 0));
            if (k1 < kMin || k2 < kMin) continue;
            const heading = A[b].key.endsWith(":h");
            const cost = Math.abs(Math.log(Math.min(k1, 6)) - Math.log(Math.min(k2, 6))) + (heading ? 0 : 0.04);
            options.push({ b, k1, k2, cost });
        }
        if (!options.length) return null;

        let pick = null;
        if (breakAt !== "auto") {
            pick = options.find((o) => A[o.b].key === breakAt) ?? null;
            if (!pick) {
                manualFailed = true;
                // a chosen place that doesn't fit at this size may fit with smaller text (auto size only)
                if (!isLast && A.some((x) => x.key === breakAt)) return null;
            }
        }
        if (!pick) pick = options.reduce((best, o) => (o.cost < best.cost ? o : best));

        let k1 = Math.min(kMax, pick.k1);
        let k2 = Math.min(kMax, pick.k2, k1 * 1.2);
        // Check with real measurements (the straight-line sums are very close, but rounding exists).
        let pages;
        for (let tries = 0; tries < 12; tries++) {
            const P1 = cvBlocks(cv, { k: k1, f }).slice(0, pick.b);
            const P2all = cvBlocks(cv, { k: k2, f });
            const first2 = P2all[pick.b];
            const P2 = [
                ...(first2.head && !first2.keep ? [{ key: `${first2.key}:rehead`, html: first2.head }] : []),
                ...P2all.slice(pick.b),
            ];
            const h1 = P1.reduce((t, b) => t + measure(b.html), 0);
            const h2 = P2.reduce((t, b) => t + measure(b.html), 0);
            pages = [P1, P2];
            if (h1 <= avail + SAFETY && h2 <= avail + SAFETY) break;
            if (h1 > avail + SAFETY) k1 = Math.max(kMin, k1 - 0.02);
            if (h2 > avail + SAFETY) k2 = Math.max(kMin, k2 - 0.02);
        }
        const title = new Map((cv.sections || []).map((x) => [x.id, x.title]));
        const choices = options
            .map((o) => {
                const key = A[o.b].key;
                const t = title.get(key.split(":")[0]) || "";
                return { key, label: key.endsWith(":h") ? `${t}` : `${t} › ${A[o.b].label || "…"}` };
            })
            .filter((c) => !c.key.endsWith(":head"));
        return {
            pages,
            fit: { k1: round3(k1), k2: round3(k2), f },
            breakKey: A[pick.b].key,
            choices,
            tooLong: false,
            breakIgnored: breakAt !== "auto" && A[pick.b].key !== breakAt && manualFailed,
            loose: pick.k1 > kMax, // page 1 still not full at the widest spacing
        };
    };

    for (let i = 0; i < fonts.length; i++) {
        let r = tryFont(fonts[i], i === fonts.length - 1);
        if (!r) continue;
        // A short CV: rather than a half-empty page 1, the text grows a little (up to 11 pt) — auto size only.
        if (!size && i === 0 && r.loose) {
            for (const f of GROW) {
                const bigger = tryFont(f, false);
                if (!bigger) break;
                r = bigger;
                if (!bigger.loose) break;
            }
            if (r.fit.f !== fonts[0]) {
                // re-measure at the chosen size (the measuring box was left at the last size tried)
                r = tryFont(r.fit.f, true) ?? r;
            }
        }
        delete r.loose;
        return r;
    }
    // Too much for 2 pages even with the tightest spacing and smallest text.
    const f = fonts[fonts.length - 1];
    setFont(f);
    const pages = paginate(cvBlocks(cv, { k: kMin, f }), measure);
    return {
        pages,
        fit: { k1: kMin, k2: kMin, f },
        breakKey: pages[1]?.find((b) => !b.key.endsWith(":rehead"))?.key ?? null,
        choices: [],
        tooLong: true,
        breakIgnored: false,
    };
}

const round3 = (x) => Math.round(x * 1000) / 1000;