// src/components/deeds/deed-pages.jsx
"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { bn } from "@/lib/deeds/format";

/** Paper sizes in mm. Bangladeshi non-judicial stamp paper is Legal (8.5 × 14 in). */
export const deedPapers = {
    legal: { label: "Legal / স্ট্যাম্প (৮.৫ × ১৪ ইঞ্চি)", w: 215.9, h: 355.6 },
    a4: { label: "A4", w: 210, h: 297 },
};

export const deedFonts = [
    { value: "Kalpurush", label: "Kalpurush (কম্পিউটারে থাকলে)" },
    { value: "Nikosh", label: "Nikosh (কম্পিউটারে থাকলে)" },
    { value: "SolaimanLipi", label: "SolaimanLipi (কম্পিউটারে থাকলে)" },
    { value: "Noto Sans Bengali Variable", label: "Noto Sans Bengali (সবসময় আছে)" },
];

/**
 * @typedef {{ paper: "legal"|"a4", topFirst: number, topOther: number, bottom: number, left: number, right: number,
 *   font: string, size: number, lineHeight: number, keepPages: boolean, fitPages: number }} PageSettings
 * topFirst / topOther: blank space at the top of the first / other sheets (the printed stamp), mm.
 * keepPages: start a new sheet where the template does (e.g. conditions on sheet 2). fitPages: 0 = as many sheets as
 * needed, N = make the writing smaller (down to 9 pt) until it fits in N sheets.
 */
export const defaultPageSettings = {
    paper: "legal",
    topFirst: 105,
    topOther: 105,
    bottom: 22,
    left: 25,
    right: 22,
    font: "Kalpurush",
    size: 14,
    lineHeight: 1.6,
    keepPages: true,
    fitPages: 0,
};

const PX_PER_MM = 96 / 25.4;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
/** Text → HTML: escaped, new lines kept. */
const rich = (s) => esc(s).replace(/\n/g, "<br>");

/** One block as HTML (used both to measure and to print, so they always match). */
export function blockHtml(b) {
    const gap = `padding-bottom:${b.gap ?? 0.35}em;`;
    if (b.t === "p") {
        const st = [
            `text-align:${b.align || "justify"}`,
            b.part === "first" && (b.align || "justify") === "justify" ? "text-align-last:justify" : "",
            `font-size:${b.size || 1}em`,
            b.bold ? "font-weight:700" : "",
            gap,
        ]
            .filter(Boolean)
            .join(";");
        const inner = b.underline
            ? `<span style="text-decoration:underline;text-underline-offset:0.18em">${rich(b.text)}</span>`
            : rich(b.text);
        return `<div style="${st}">${inner}</div>`;
    }
    if (b.t === "clause") {
        const num = b.part === "rest" ? "" : `${bn(b.n)}।`;
        const last = b.part === "first" ? "text-align-last:justify;" : "";
        return `<div style="display:flex;gap:0.4em;${gap}${b.bold ? "font-weight:700;" : ""}"><span style="flex:0 0 2em">${num}</span><span style="flex:1;text-align:justify;${last}">${rich(b.text)}</span></div>`;
    }
    if (b.t === "party") {
        const la = b.labelAlign || "right";
        return `<div style="padding-bottom:0.5em"><div style="text-align:justify;${b.bold ? "font-weight:700;" : ""}">${rich(b.text)}</div><div style="text-align:${la};font-weight:700;padding-top:0.15em"><span style="text-decoration:underline;text-underline-offset:0.18em">${esc(b.label)}</span></div></div>`;
    }
    if (b.t === "box") {
        return `<div style="display:flex;justify-content:flex-end;padding-bottom:0.5em"><div style="border:1px solid #000;padding:0.35em 0.6em;font-size:0.9em;max-width:62%;line-height:1.45">${b.lines.map(rich).join("<br>")}</div></div>`;
    }
    if (b.t === "table") {
        const rows = b.rows
            .map(
                ([a, v]) =>
                    `<tr><td style="padding:0.1em 1em 0.1em 0;white-space:nowrap;vertical-align:top">${rich(a)}</td><td style="padding:0.1em 0;font-weight:700">${rich(v)}</td></tr>`,
            )
            .join("");
        return `<div style="display:flex;justify-content:center;padding-bottom:0.6em"><table style="border-collapse:collapse">${rows}</table></div>`;
    }
    if (b.t === "sign") {
        // witnesses: a list of { name, address } (or a number from older templates); rows also go on for party signatures
        const W = Array.isArray(b.witnesses) ? b.witnesses : Array.from({ length: Number(b.witnesses) || 0 }, () => ({}));
        const lastRight = Math.max(-1, ...b.right.map((x) => x.row));
        const n = Math.max(W.length, lastRight + 1);
        const rows = [];
        for (let i = 0; i < n; i++) {
            const r = b.right.find((x) => x.row === i);
            const w = W[i];
            const who = w ? [w.name?.trim(), w.address?.trim()].filter(Boolean) : [];
            const left = w
                ? `<span style="display:block;border-bottom:1px dotted #000;padding-bottom:0.15em">${bn(i + 1)}।</span>${who.length
                    ? `<span style="display:block;font-size:0.85em;line-height:1.35;padding-top:0.1em">${who.map(rich).join(", ")}</span>`
                    : ""
                }`
                : "";
            rows.push(
                `<div style="display:flex;justify-content:space-between;align-items:flex-end;gap:2em;min-height:3em;${who.length ? "padding-bottom:0.2em;" : ""}"><span style="flex:1">${left}</span><span style="flex:1;text-align:center">${r ? `<span style="display:block;border-top:1px solid #000;padding-top:0.15em">${esc(r.label)}</span>` : ""}</span></div>`,
            );
        }
        return `<div style="padding-bottom:0.6em"><div style="font-weight:700;text-decoration:underline;text-underline-offset:0.18em;padding-bottom:0.3em">${esc(b.title)}</div>${rows.join("")}</div>`;
    }
    return "";
}

const splittable = (b) => (b.t === "p" || b.t === "clause") && (b.align || "justify") === "justify" && b.text.length > 40;

/** Split a paragraph after `k` words → [first, rest]. */
function splitAt(b, k) {
    const words = b.text.split(/(\s+)/);
    let count = 0;
    let cut = words.length;
    for (let i = 0; i < words.length; i++) {
        if (!/\s/.test(words[i]) && words[i]) count++;
        if (count === k) {
            cut = i + 1;
            break;
        }
    }
    const first = words.slice(0, cut).join("").trimEnd();
    const rest = words.slice(cut).join("").trimStart();
    return [
        { ...b, text: first, part: b.part === "rest" ? "middle" : "first", gap: 0, keep: false },
        { ...b, text: rest, part: "rest" },
    ];
}

const wordCount = (s) => s.split(/\s+/).filter(Boolean).length;

/**
 * Lay blocks out on stamp sheets.
 * @param {(ctx: { pages: number }) => object[]} build  blocks for a given number of sheets
 * @param {PageSettings} s
 * @param {HTMLElement} measureEl  hidden box with the right width and font
 * @returns {{ pages: object[][], size: number }}
 */
function layout(build, s, measureEl) {
    const paper = deedPapers[s.paper] ?? deedPapers.legal;
    const measure = (b) => {
        measureEl.innerHTML = blockHtml(b);
        return measureEl.firstElementChild ? measureEl.firstElementChild.getBoundingClientRect().height / PX_PER_MM : 0;
    };
    const markH = measure({ t: "p", text: "পাতা-০২", align: "center", gap: 0.4 }) || 10;
    const avail = (i) => paper.h - (i === 0 ? s.topFirst : s.topOther) - s.bottom - (i > 0 ? markH : 0) - markH;
    const lineH = (s.size * s.lineHeight * 25.4) / 72;

    const run = (blocks) => {
        const pages = [[]];
        let used = 0;
        const queue = blocks.slice();
        const newPage = () => {
            // Keep headings with what follows them.
            const cur = pages[pages.length - 1];
            const carry = [];
            while (cur.length > 1 && cur[cur.length - 1].keep) carry.unshift(cur.pop());
            pages.push(carry);
            used = carry.reduce((a, b) => a + b._h, 0);
        };
        let guard = 0;
        while (queue.length && guard++ < 5000) {
            const b = queue.shift();
            const i = pages.length - 1;
            if (b.t === "break") {
                if (s.keepPages && pages[i].length) {
                    pages.push([]);
                    used = 0;
                }
                continue;
            }
            const h = measure(b);
            const room = avail(i) - used;
            if (h <= room + 0.2) {
                pages[i].push({ ...b, _h: h });
                used += h;
                continue;
            }
            if (splittable(b) && room > lineH * 2.2) {
                // Largest number of words that still fits.
                const n = wordCount(b.text);
                let lo = 1;
                let hi = n - 1;
                let best = 0;
                while (lo <= hi) {
                    const mid = (lo + hi) >> 1;
                    const [first] = splitAt(b, mid);
                    if (measure(first) <= room + 0.2) {
                        best = mid;
                        lo = mid + 1;
                    } else hi = mid - 1;
                }
                if (best >= 3 && n - best >= 2) {
                    const [first, rest] = splitAt(b, best);
                    pages[i].push({ ...first, _h: measure(first) });
                    queue.unshift(rest);
                    newPage();
                    continue;
                }
            }
            if (!pages[i].length) {
                // Taller than a whole sheet: put it here anyway.
                pages[i].push({ ...b, _h: h });
                used += h;
                continue;
            }
            queue.unshift(b);
            newPage();
        }
        return pages.filter((p, k) => p.length || k === 0);
    };

    // Pass 1 with a guess, pass 2 with the real number of sheets (for "৩ (তিন) ফর্দে").
    let pages = run(build({ pages: 3 }));
    const again = run(build({ pages: pages.length }));
    pages = again.length === pages.length ? again : run(build({ pages: again.length }));
    return pages;
}

/**
 * Lays out the deed, shows the sheets, and puts a print copy on the page (only visible when printing).
 * @param {{ build: (ctx: { pages: number }) => object[], settings: PageSettings, onLayout?: (info) => void,
 *   showStamp?: boolean }} props
 */
export function DeedPages({ build, settings, onLayout }) {
    const s = settings;
    const paper = deedPapers[s.paper] ?? deedPapers.legal;
    const measureRef = useRef(null);
    const [result, setResult] = useState({ pages: [], size: s.size });
    const [fontsReady, setFontsReady] = useState(0);
    const contentW = paper.w - s.left - s.right;

    useEffect(() => {
        let alive = true;
        document.fonts?.ready.then(() => alive && setFontsReady((n) => n + 1));
        const onLoad = () => setFontsReady((n) => n + 1);
        document.fonts?.addEventListener?.("loadingdone", onLoad);
        return () => {
            alive = false;
            document.fonts?.removeEventListener?.("loadingdone", onLoad);
        };
    }, []);

    useLayoutEffect(() => {
        const el = measureRef.current;
        // While printing, the page around us is hidden: nothing can be measured, so keep the last layout.
        if (!el || !el.getClientRects().length) return;
        let size = s.size;
        const apply = (sz) => {
            el.style.fontSize = `${sz}pt`;
            return layout(build, { ...s, size: sz }, el);
        };
        let pages = apply(size);
        if (s.fitPages > 0) {
            while (pages.length > s.fitPages && size > 9) {
                size = Math.round((size - 0.5) * 10) / 10;
                pages = apply(size);
            }
        }
        el.innerHTML = "";
        setResult({ pages, size });
        onLayout?.({ pages: pages.length, size });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [build, JSON.stringify(s), fontsReady]);

    const fontFamily = `"${s.font}", "Kalpurush", "Noto Sans Bengali Variable", sans-serif`;
    const pageStyle = (i) => ({
        width: `${paper.w}mm`,
        height: `${paper.h}mm`,
        position: "relative",
        background: "#fff",
        color: "#000",
        fontFamily,
        fontSize: `${result.size}pt`,
        lineHeight: s.lineHeight,
        overflow: "hidden",
        ["--top"]: `${i === 0 ? s.topFirst : s.topOther}mm`,
    });

    const sheets = result.pages.map((blocks, i) => (
        <div key={i} className="deed-sheet" style={pageStyle(i)}>
            <div
                className="deed-stamp"
                style={{ position: "absolute", left: 0, right: 0, top: 0, height: `${i === 0 ? s.topFirst : s.topOther}mm` }}
            >
                <span>স্ট্যাম্পের জায়গা — প্রিন্ট হবে না</span>
            </div>
            <div
                style={{
                    position: "absolute",
                    left: `${s.left}mm`,
                    right: `${s.right}mm`,
                    top: `${i === 0 ? s.topFirst : s.topOther}mm`,
                    bottom: `${s.bottom}mm`,
                }}
            >
                {i > 0 ? (
                    <div
                        dangerouslySetInnerHTML={{
                            __html: blockHtml({ t: "p", text: `পাতা-${two(i + 1)}`, align: "center", bold: true, underline: true, gap: 0.4 }),
                        }}
                    />
                ) : null}
                <div dangerouslySetInnerHTML={{ __html: blocks.map(blockHtml).join("") }} />
                {i < result.pages.length - 1 ? (
                    <div
                        style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}
                        dangerouslySetInnerHTML={{
                            __html: blockHtml({ t: "p", text: `চলমান পাতা-${two(i + 2)}`, align: "right", bold: true, gap: 0 }),
                        }}
                    />
                ) : null}
            </div>
        </div>
    ));

    return (
        <>
            <div
                ref={measureRef}
                aria-hidden
                style={{
                    position: "absolute",
                    left: -20000,
                    top: 0,
                    width: `${contentW}mm`,
                    fontFamily,
                    fontSize: `${s.size}pt`,
                    lineHeight: s.lineHeight,
                    visibility: "hidden",
                }}
            />
            <PreviewSheets paper={paper}>{sheets}</PreviewSheets>
            <PrintCopy paper={paper}>{sheets}</PrintCopy>
        </>
    );
}

const two = (n) => bn(String(n).padStart(2, "0"));

/** Sheets scaled down to the width of the panel. */
function PreviewSheets({ paper, children }) {
    const ref = useRef(null);
    const [w, setW] = useState(360);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    const scale = w / (paper.w * PX_PER_MM);
    return (
        <div ref={ref} className="deed-preview space-y-4">
            {[children].flat().map((sheet, i) => (
                <div key={i} style={{ height: paper.h * PX_PER_MM * scale }} className="relative">
                    <div
                        className="absolute top-0 left-0 origin-top-left shadow-[0_0_0_1px_var(--color-line-strong),var(--shadow-lift)]"
                        style={{ transform: `scale(${scale})` }}
                    >
                        {sheet}
                    </div>
                    <span className="absolute -top-0 right-1 rounded bg-white/90 px-1.5 text-[11px] text-muted shadow-xs">
                        Sheet {i + 1}
                    </span>
                </div>
            ))}
        </div>
    );
}

/** Real-size copy for the printer. Only shown when printing (see the style below). */
function PrintCopy({ paper, children }) {
    const [host, setHost] = useState(null);
    useEffect(() => {
        const el = document.createElement("div");
        el.id = "deed-print-root";
        document.body.appendChild(el);
        setHost(el);
        return () => el.remove();
    }, []);
    if (!host) return null;
    return createPortal(
        <>
            <style>{`
        #deed-print-root { display: none; }
        .deed-preview .deed-stamp { background: repeating-linear-gradient(135deg, #f3f4f8 0 8px, #e9ebf2 8px 16px);
          display: flex; align-items: center; justify-content: center; color: #8a91aa; font: 600 22px/1 var(--font-bangla); }
        @media print {
          @page { size: ${paper.w}mm ${paper.h}mm; margin: 0; }
          html, body { background: #fff !important; }
          body > *:not(#deed-print-root) { display: none !important; }
          #deed-print-root { display: block !important; }
          #deed-print-root .deed-stamp { display: none !important; }
          #deed-print-root .deed-sheet { break-after: page; page-break-after: always; }
          #deed-print-root .deed-sheet:last-child { break-after: auto; page-break-after: auto; }
        }
      `}</style>
            {children}
        </>,
        host,
    );
}