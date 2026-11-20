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
                .map((p, i) => ({ key: k(i), html: `<div style="padding-bottom:${g(3)}">${paraHtml(p)}</div>` }));
        case "languages": {
            const cols = Math.min(3, s.items.length);
            const rows = [];
            for (let i = 0; i < s.items.length; i += cols) rows.push(s.items.slice(i, i + cols));
            return rows.map((row, r) => ({
                key: k(r),
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
                    html: `<div style="${i === s.items.length - 1 ? `padding-bottom:${g(4)}` : ""}">${row([j.company, j.designation, j.location, j.duration], false, false)}</div>`,
                    head,
                })),
            ];
        }
        case "education":
            return s.items.map((e, i) => ({
                key: k(i),
                html: `<div style="padding-bottom:${g(5)}">
          ${e.exam?.trim() ? `<div style="font-weight:700;text-decoration:underline;line-height:${lh(1.6)};padding-bottom:${g(2)}">${esc(e.exam)}</div>` : ""}
          ${e.rows.map((r) => kvRow(r.label, r.value)).join("")}
        </div>`,
            }));
        case "keyvalue":
            return s.rows.map((r, i) => ({ key: k(i), html: kvRow(r.label, r.value) }));
        case "list":
            return s.items.map((it, i) => ({
                key: k(i),
                html: `<div style="display:grid;grid-template-columns:${SIZES.bulletCol}mm 1fr;padding-left:${SIZES.indent}mm;line-height:${lh(1.5)};padding-bottom:${g(1)}">
          ${bullet()}<span>${multiline(it.text)}</span></div>`,
            }));
        case "references": {
            const rows = [];
            for (let i = 0; i < s.items.length; i += 2) rows.push(s.items.slice(i, i + 2));
            return rows.map((row, r) => ({
                key: k(r),
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

export const FIT_LIMITS = { kMin: 0.55, kMax: 1.8, fonts: [1, 0.96, 0.92, 0.88] };

/**
 * Lay the CV out on pages. mode "two" (the shop's rule): always exactly 2 pages — the spacing k is stretched or
 * tightened (largest k that still fits, minus a little room so Word never spills onto a 3rd page), and only if even the
 * tightest spacing doesn't fit, the font gets a little smaller. A very short CV is split at the heading nearest the
 * middle. mode "auto": template spacing, as many pages as needed.
 * @param {object} cv
 * @param {(html: string) => number} measure  height of an HTML block in mm (at the font size set by setFont)
 * @param {(f: number) => void} setFont        sets the body font scale of the measuring box
 * @returns {{ pages: object[][], fit: { k: number, f: number }, tooLong: boolean }}
 */
export function layoutCv(cv, measure, setFont, mode = "two") {
    const trial = (k, f) => {
        setFont(f);
        return paginate(cvBlocks(cv, { k, f }), measure);
    };
    if (mode !== "two") return { pages: trial(1, 1), fit: { k: 1, f: 1 }, tooLong: false };

    const { kMin, kMax, fonts } = FIT_LIMITS;
    for (const f of fonts) {
        if (trial(kMin, f).length > 2) continue;
        let k;
        if (trial(kMax, f).length <= 2) k = kMax;
        else {
            let lo = kMin;
            let hi = kMax;
            for (let i = 0; i < 9; i++) {
                const mid = (lo + hi) / 2;
                if (trial(mid, f).length <= 2) lo = mid;
                else hi = mid;
            }
            k = Math.max(kMin, lo - 0.04); // leave a little room at the end of page 2
        }
        const fit = { k: Math.round(k * 1000) / 1000, f };
        let pages = trial(fit.k, f);
        if (pages.length === 1) pages = splitInTwo(pages[0], measure);
        return { pages, fit, tooLong: false };
    }
    const f = fonts[fonts.length - 1];
    return { pages: trial(kMin, f), fit: { k: kMin, f }, tooLong: true };
}

/** One short page → two: break before the section heading closest to the middle. */
function splitInTwo(blocks, measure) {
    const h = blocks.map((b) => measure(b.html));
    const total = h.reduce((a, b) => a + b, 0);
    let best = -1;
    let bestD = Infinity;
    let acc = 0;
    blocks.forEach((b, i) => {
        if (i > 1 && b.key.endsWith(":h")) {
            const d = Math.abs(acc - total / 2);
            if (d < bestD) {
                bestD = d;
                best = i;
            }
        }
        acc += h[i];
    });
    if (best < 0) return [blocks];
    return [blocks.slice(0, best), blocks.slice(best)];
}

/** Keys of the blocks that start pages 2, 3… (Word gets a page break there, so it breaks where the print does). */
export const pageStarts = (pages) =>
    pages
        .slice(1)
        .map((p) => p.find((b) => !b.key.endsWith(":rehead"))?.key)
        .filter(Boolean);