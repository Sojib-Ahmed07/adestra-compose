// src/components/photo/sheet-output.jsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileDown, Printer } from "lucide-react";
import { canvasesToPdf, canvasToBlob, downloadBlob, printCanvases } from "@/lib/photo/export";
import { renderPage } from "@/lib/photo/sheet";
import { PX_PER_MM } from "@/lib/photo/sizes";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/interactive";

const plural = (word) => (/[^aeiou]y$/.test(word) ? word.slice(0, -1) + "ies" : word + "s");

/**
 * Live page preview + Print / Save PDF / Save JPG for already laid-out pages.
 * @param {{ pages: import("@/lib/photo/sheet").Placement[][], paper: { w: number, h: number }, paperLabel: string,
 *   cutLines: boolean, fileName: string, count: number, emptyText?: string, unit?: string, printId?: string,
 *   hidePreview?: boolean }} props
 * hidePreview: the parent shows its own (interactive) page preview — only the buttons and the count are shown here.
 */
export function SheetOutput({
  pages,
  paper,
  paperLabel,
  cutLines,
  fileName,
  count,
  emptyText = "Add a photo to see the page.",
  unit = "photo",
  printId,
  hidePreview = false,
}) {
  const toast = useToast();
  const [busy, setBusy] = useState("");
  const wrapRef = useRef(null);
  const [previewW, setPreviewW] = useState(320);
  const [previews, setPreviews] = useState([]);
  const empty = count === 0;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setPreviewW(Math.max(160, Math.floor(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (empty || hidePreview) {
      setPreviews([]);
      return;
    }
    const t = setTimeout(() => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pxPerMm = Math.min((previewW * dpr) / paper.w, 8);
      const cache = new Map();
      setPreviews(pages.slice(0, 6).map((p) => renderPage(p, paper, pxPerMm, { cutLines, cache }).toDataURL("image/jpeg", 0.85)));
    }, 120);
    return () => clearTimeout(t);
  }, [pages, previewW, cutLines, paper, empty, hidePreview]);

  const fullPages = () => {
    const cache = new Map();
    return pages.map((p) => renderPage(p, paper, PX_PER_MM, { cutLines, cache }));
  };

  const run = async (label, fn) => {
    if (empty || busy) return;
    setBusy(label);
    await new Promise((r) => setTimeout(r, 30)); // let the busy label paint first
    try {
      await fn();
    } catch (err) {
      console.error(err);
      toast(err?.message || "Something went wrong. Try again.", "error");
    } finally {
      setBusy("");
    }
  };

  const onPrint = () => run("print", () => printCanvases(fullPages(), paper));

  // Ctrl+P (Cmd+P) prints the photo pages instead of the web page.
  const printRef = useRef(onPrint);
  printRef.current = onPrint;
  useEffect(() => {
    const onKey = (ev) => {
      if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && !ev.altKey && ev.key.toLowerCase() === "p") {
        ev.preventDefault();
        printRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const onPdf = () =>
    run("pdf", async () => {
      downloadBlob(await canvasesToPdf(fullPages(), paper, fileName), `${fileName}.pdf`);
      toast("PDF saved to Downloads.");
    });
  const onJpg = () =>
    run("jpg", async () => {
      const list = fullPages();
      for (let i = 0; i < list.length; i++) {
        const blob = await canvasToBlob(list[i], "image/jpeg", 0.95);
        downloadBlob(blob, list.length > 1 ? `${fileName}-page-${i + 1}.jpg` : `${fileName}.jpg`);
      }
      toast(list.length > 1 ? `${list.length} JPG pages saved to Downloads.` : "JPG saved to Downloads.");
    });

  return (
    <div className="space-y-4">
      <div ref={wrapRef} className={hidePreview ? "hidden" : "space-y-3"}>
        {empty ? (
          <div
            className="flex w-full items-center justify-center rounded-md border border-dashed border-line-strong bg-white px-6 text-center text-sm text-subtle"
            style={{ aspectRatio: `${paper.w} / ${paper.h}` }}
          >
            {emptyText}
          </div>
        ) : (
          previews.map((src, i) => (
            <div key={i}>
              {pages.length > 1 ? <p className="mb-1 text-xs text-muted">Page {i + 1}</p> : null}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={`Page ${i + 1} preview`}
                className="w-full rounded-sm bg-white shadow-[0_0_0_1px_var(--color-line-strong),var(--shadow-lift)]"
              />
            </div>
          ))
        )}
        {pages.length > 6 ? (
          <p className="text-xs text-muted">Showing the first 6 of {pages.length} pages. All pages are printed.</p>
        ) : null}
      </div>

      <p className="text-sm text-muted">
        {empty ? (
          "Nothing to print yet."
        ) : (
          <>
            <strong className="text-ink-900">{count}</strong> {count === 1 ? unit : plural(unit)} on{" "}
            <strong className="text-ink-900">{pages.length}</strong> page{pages.length === 1 ? "" : "s"} of {paperLabel}.
          </>
        )}
      </p>

      <div className="flex flex-wrap gap-2">
        <Button id={printId} variant="accent" onClick={onPrint} disabled={empty || Boolean(busy)}>
          <Printer className="h-4 w-4" /> {busy === "print" ? "Preparing…" : "Print"}
        </Button>
        <Button variant="outline" onClick={onPdf} disabled={empty || Boolean(busy)}>
          <FileDown className="h-4 w-4" /> {busy === "pdf" ? "Making PDF…" : "Save PDF"}
        </Button>
        <Button variant="outline" onClick={onJpg} disabled={empty || Boolean(busy)}>
          <Download className="h-4 w-4" /> {busy === "jpg" ? "Saving…" : "Save JPG"}
        </Button>
      </div>
      {!empty ? (
        <p className="text-xs text-subtle">
          For exact sizes, set the print dialog to <strong>Actual size / 100%</strong> and margins to <strong>None</strong>.
          Output is 300 DPI. Shortcut: <strong>Ctrl+P</strong> prints these pages.
        </p>
      ) : null}
    </div>
  );
}