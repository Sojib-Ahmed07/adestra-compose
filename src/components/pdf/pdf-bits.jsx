// src/components/pdf/pdf-bits.jsx
"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, FileText } from "lucide-react";
import { downloadBlob } from "@/lib/photo/export";
import { closeDoc, openForRender, renderPage } from "@/lib/pdf/engine";
import { readPdfFile } from "@/lib/pdf/ops";
import { zipFiles } from "@/lib/zip";
import { cn, formatBytes } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FileDrop } from "@/components/ui/file-drop";
import { useToast } from "@/components/ui/interactive";

/**
 * Pick PDF files. Calls onFiles with read results ({ name, size, bytes, pageCount, encrypted }).
 * Password-protected files are refused with a message unless allowEncrypted.
 */
export function PdfPicker({ onFiles, multiple = false, allowEncrypted = false, title, hint, compact, acceptImages = false }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const take = async (files) => {
    setBusy(true);
    const ok = [];
    for (const f of files) {
      const isImage = f.type.startsWith("image/");
      if (isImage && acceptImages) {
        ok.push({ kind: "image", file: f, name: f.name, size: f.size });
        continue;
      }
      try {
        const r = await readPdfFile(f);
        if (r.encrypted && !allowEncrypted) {
          toast(`“${r.name}” is password-protected. Unlock it first with Lock / unlock PDF.`, "error");
          continue;
        }
        ok.push({ kind: "pdf", ...r });
      } catch (err) {
        toast(err.message, "error");
      }
    }
    setBusy(false);
    if (ok.length) onFiles(ok);
  };

  return (
    <FileDrop
      onFiles={take}
      multiple={multiple}
      accept={acceptImages ? "application/pdf,.pdf,image/*" : "application/pdf,.pdf"}
      title={busy ? "Opening…" : (title ?? (multiple ? "Choose PDF files" : "Choose a PDF"))}
      hint={hint ?? "Drag files here or click to browse"}
      compact={compact}
      listenPaste={false}
    />
  );
}

/** Open a PDF.js document for some bytes; destroyed when the bytes change or on unmount. */
export function usePdfjsDoc(bytes, password) {
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!bytes) {
      setDoc(null);
      return;
    }
    let alive = true;
    let opened;
    setError("");
    openForRender(bytes, password)
      .then((d) => {
        opened = d;
        if (alive) setDoc(d);
        else closeDoc(d);
      })
      .catch((err) => {
        console.error(err);
        if (alive) setError(err?.name === "PasswordException" ? "This PDF needs a password." : "Couldn't show this PDF's pages.");
      });
    return () => {
      alive = false;
      setDoc(null);
      closeDoc(opened);
    };
  }, [bytes, password]);
  return { doc, error };
}

/**
 * Several PDF.js documents keyed by id (for tools that work on more than one file).
 * const docs = useRenderDocs(); docs.open(id, bytes); docs.get(id)
 */
export function useRenderDocs() {
  const map = useRef(new Map());
  const [, setVersion] = useState(0);
  useEffect(() => {
    const m = map.current;
    return () => {
      m.forEach((d) => closeDoc(d));
      m.clear();
    };
  }, []);
  return {
    get: (id) => map.current.get(id) || null,
    open: async (id, bytes) => {
      if (map.current.has(id)) return;
      map.current.set(id, null);
      try {
        map.current.set(id, await openForRender(bytes));
      } catch (err) {
        console.error(err);
      }
      setVersion((v) => v + 1);
    },
    close: (id) => {
      closeDoc(map.current.get(id));
      map.current.delete(id);
      setVersion((v) => v + 1);
    },
  };
}

const thumbCache = new WeakMap();

/**
 * Lazy page thumbnail. Rendered once per document/page; extra rotation is done with CSS.
 * @param {{ doc: any, page: number, rotate?: number, width?: number, className?: string, label?: string }} props  page is 1-based
 */
export function PageThumb({ doc, page, rotate = 0, width = 140, className, label }) {
  const ref = useRef(null);
  const [src, setSrc] = useState(null);
  const [ratio, setRatio] = useState(1.414);

  useEffect(() => {
    if (!doc) return;
    let alive = true;
    const el = ref.current;
    const load = async () => {
      let perDoc = thumbCache.get(doc);
      if (!perDoc) thumbCache.set(doc, (perDoc = new Map()));
      let hit = perDoc.get(page);
      if (!hit) {
        const c = await renderPage(doc, page, { maxWidth: 260 });
        hit = { url: c.toDataURL("image/jpeg", 0.8), ratio: c.height / c.width };
        perDoc.set(page, hit);
      }
      if (alive) {
        setSrc(hit.url);
        setRatio(hit.ratio);
      }
    };
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          load().catch((e) => console.error(e));
        }
      },
      { rootMargin: "300px" },
    );
    if (el) io.observe(el);
    return () => {
      alive = false;
      io.disconnect();
    };
  }, [doc, page]);

  const quarter = ((rotate % 180) + 180) % 180 === 90;
  const shownRatio = quarter ? 1 / ratio : ratio;

  return (
    <div
      ref={ref}
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-md bg-white shadow-[0_0_0_1px_var(--color-line-strong)]",
        className,
      )}
      style={{ width, height: Math.round(width * shownRatio) }}
      aria-label={label}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          draggable={false}
          className="max-w-none transition-transform"
          style={{ width: quarter ? Math.round(width * shownRatio) : width, transform: `rotate(${rotate}deg)` }}
        />
      ) : (
        <FileText className="h-6 w-6 text-ink-200" />
      )}
    </div>
  );
}

/** Finished file(s) with download buttons. files = [{ name, blob }]. More than one file also gets "Download all (ZIP)". */
export function ResultFiles({ files, note, onReset, resetLabel = "Start again", zipName = "files.zip" }) {
  const toast = useToast();
  if (!files?.length) return null;
  const total = files.reduce((n, f) => n + f.blob.size, 0);
  return (
    <div className="space-y-3 rounded-xl border border-green-200 bg-success-50 p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-success">
        <CheckCircle2 className="h-4 w-4" />
        {files.length === 1 ? "Your file is ready." : `${files.length} files are ready (${formatBytes(total)}).`}
      </p>
      {note ? <p className="text-sm text-ink-800">{note}</p> : null}
      <ul className="max-h-72 space-y-1.5 overflow-y-auto">
        {files.map((f, i) => (
          <li key={`${i}-${f.name}`} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2">
            <FileText className="h-4 w-4 shrink-0 text-muted" />
            <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
            <span className="tabular text-xs text-muted">{formatBytes(f.blob.size)}</span>
            <Button
              size="sm"
              variant={files.length === 1 ? "accent" : "outline"}
              onClick={() => {
                downloadBlob(f.blob, f.name);
                toast(`${f.name} saved to Downloads.`);
              }}
            >
              <Download className="h-3.5 w-3.5" /> Download
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {files.length > 1 ? (
          <Button
            size="sm"
            variant="accent"
            onClick={async () => {
              downloadBlob(await zipFiles(files), zipName);
              toast(`${zipName} saved to Downloads.`);
            }}
          >
            <Download className="h-3.5 w-3.5" /> Download all (ZIP)
          </Button>
        ) : null}
        {onReset ? (
          <Button size="sm" variant="ghost" onClick={onReset}>
            {resetLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Run a heavy job with a busy flag and error toast. Returns [busy, run]. */
export function useJob() {
  const toast = useToast();
  const [busy, setBusy] = useState("");
  const run = async (label, fn) => {
    setBusy(label);
    await new Promise((r) => setTimeout(r, 30));
    try {
      return await fn();
    } catch (err) {
      console.error(err);
      toast(err?.message || "Something went wrong. Try again.", "error");
      return undefined;
    } finally {
      setBusy("");
    }
  };
  return [busy, run];
}
