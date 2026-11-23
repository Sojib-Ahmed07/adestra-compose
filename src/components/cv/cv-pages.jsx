// src/components/cv/cv-pages.jsx
"use client";

import "@fontsource/poppins/400.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import { useDeferredValue, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CONTENT_W, FONT, PAGE, SIZES, layoutCv } from "@/lib/cv/html";

const PX_PER_MM = 96 / 25.4;

/**
 * The CV as real A4 pages: measured, split into pages (headings never left alone at the bottom), shown scaled to the
 * panel, and a full-size copy that only appears when printing (colours print as on screen).
 * Always exactly 2 pages: each page's spacing is stretched or tightened to fill it (see layoutCv). cv.layout =
 * { breakAt: "auto" | block key, size: "auto" | pt } — where page 2 starts and the text size, chosen in the form.
 * @param {{ cv: object, onLayout?: (info: { pages: number, fit: object, breakKey: string | null,
 *   choices: { key: string, label: string }[], tooLong: boolean, breakIgnored: boolean }) => void }} props
 */
export function CvPages({ cv: liveCv, onLayout }) {
    const cv = useDeferredValue(liveCv); // typing stays smooth; the layout catches up
    const measureRef = useRef(null);
    const [layout, setLayout] = useState({ pages: [], fit: { k1: 1, k2: 1, f: 1 } });
    const [fonts, setFonts] = useState(0);

    useEffect(() => {
        let alive = true;
        document.fonts?.ready.then(() => alive && setFonts((n) => n + 1));
        const onLoad = () => setFonts((n) => n + 1);
        document.fonts?.addEventListener?.("loadingdone", onLoad);
        return () => {
            alive = false;
            document.fonts?.removeEventListener?.("loadingdone", onLoad);
        };
    }, []);

    useLayoutEffect(() => {
        const el = measureRef.current;
        // While printing the page around us is hidden: keep the last layout.
        if (!el || !el.getClientRects().length) return;
        let cache = new Map();
        const measure = (html) => {
            if (!cache.has(html)) {
                el.innerHTML = html;
                cache.set(html, el.getBoundingClientRect().height / PX_PER_MM);
            }
            return cache.get(html);
        };
        const setFont = (f) => {
            const size = `${(SIZES.body * f).toFixed(2)}pt`;
            if (el.style.fontSize !== size) {
                el.style.fontSize = size;
                cache = new Map();
            }
        };
        const result = layoutCv(cv, measure, setFont, cv.layout);
        el.innerHTML = "";
        setLayout(result);
        const { pages, ...info } = result;
        onLayout?.({ pages: pages.length, ...info });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cv, fonts]);

    const fontSize = `${(SIZES.body * layout.fit.f).toFixed(2)}pt`;
    const sheets = layout.pages.map((page, i) => (
        <div key={i} className="cv-sheet" style={pageStyle}>
            <div
                style={{ position: "absolute", left: `${PAGE.left}mm`, right: `${PAGE.right}mm`, top: `${PAGE.top}mm`, fontSize }}
                dangerouslySetInnerHTML={{ __html: page.map((b) => b.html).join("") }}
            />
        </div>
    ));

    return (
        <>
            <div
                ref={measureRef}
                aria-hidden
                style={{
                    ...textStyle,
                    position: "absolute",
                    left: -20000,
                    top: 0,
                    width: `${CONTENT_W}mm`,
                    visibility: "hidden",
                    display: "flow-root",
                }}
            />
            <Preview>{sheets}</Preview>
            <PrintCopy>{sheets}</PrintCopy>
        </>
    );
}

const textStyle = { fontFamily: FONT, fontSize: `${SIZES.body}pt`, color: "#000", lineHeight: 1.45 };
const pageStyle = {
    ...textStyle,
    width: `${PAGE.w}mm`,
    height: `${PAGE.h}mm`,
    position: "relative",
    background: "#fff",
    overflow: "hidden",
    printColorAdjust: "exact",
    WebkitPrintColorAdjust: "exact",
};

/** Pages scaled down to the width of the panel. */
function Preview({ children }) {
    const ref = useRef(null);
    const [w, setW] = useState(380);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    const scale = w / (PAGE.w * PX_PER_MM);
    return (
        <div ref={ref} className="space-y-4">
            {[children].flat().map((sheet, i) => (
                <div key={i} style={{ height: PAGE.h * PX_PER_MM * scale }} className="relative">
                    <div
                        className="absolute top-0 left-0 origin-top-left shadow-[0_0_0_1px_var(--color-line-strong),var(--shadow-lift)]"
                        style={{ transform: `scale(${scale})` }}
                    >
                        {sheet}
                    </div>
                    <span className="absolute top-1 right-1 rounded bg-white/90 px-1.5 text-[11px] text-muted shadow-xs">Page {i + 1}</span>
                </div>
            ))}
        </div>
    );
}

/** Real-size copy for the printer. Only shown when printing. */
function PrintCopy({ children }) {
    const [host, setHost] = useState(null);
    useEffect(() => {
        const el = document.createElement("div");
        el.id = "cv-print-root";
        document.body.appendChild(el);
        setHost(el);
        return () => el.remove();
    }, []);
    if (!host) return null;
    return createPortal(
        <>
            <style>{`
        #cv-print-root { display: none; }
        @media print {
          @page { size: A4; margin: 0; }
          html, body { background: #fff !important; }
          body > *:not(#cv-print-root) { display: none !important; }
          #cv-print-root { display: block !important; }
          #cv-print-root, #cv-print-root * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          #cv-print-root .cv-sheet { break-after: page; page-break-after: always; }
          #cv-print-root .cv-sheet:last-child { break-after: auto; page-break-after: auto; }
        }
      `}</style>
            {children}
        </>,
        host,
    );
}