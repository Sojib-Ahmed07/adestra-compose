// src/components/tools/image-to-text.jsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Download, FileText, Trash2 } from "lucide-react";
import { textStats, unicodeToBijoy } from "@/lib/bangla/convert";
import { enhanceForOcr, ocrLanguages, recognize, stopOcr } from "@/lib/bangla/ocr";
import { copyText } from "@/lib/clipboard";
import { downloadBlob } from "@/lib/photo/export";
import { imageToCanvas, loadImage } from "@/lib/photo/image";
import { closeDoc, openForRender, renderPage } from "@/lib/pdf/engine";
import { Button } from "@/components/ui/button";
import { FileDrop } from "@/components/ui/file-drop";
import { Checkbox } from "@/components/ui/form";
import { Segmented, useToast } from "@/components/ui/interactive";
import { Card, Step } from "@/components/ui/misc";

let nextId = 1;
const PDF_SCALE = 3; // ≈216 DPI — sharp enough for small print

export function ImageToTextTool() {
  const toast = useToast();
  const [files, setFiles] = useState([]);
  const [langs, setLangs] = useState("ben+eng");
  const [enhance, setEnhance] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState({ label: "", progress: 0 });
  const [text, setText] = useState("");
  const [confidence, setConfidence] = useState(null);
  const filesRef = useRef(files);
  filesRef.current = files;

  useEffect(
    () => () => {
      stopOcr();
      filesRef.current.forEach((f) => f.url && URL.revokeObjectURL(f.url));
    },
    [],
  );

  const add = (list) =>
    setFiles((f) => [
      ...f,
      ...list.map((file) => ({
        id: String(nextId++),
        file,
        isPdf: file.type === "application/pdf" || /\.pdf$/i.test(file.name),
        url: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      })),
    ]);

  const remove = (id) => {
    const f = files.find((x) => x.id === id);
    if (f?.url) setTimeout(() => URL.revokeObjectURL(f.url), 1000);
    setFiles(files.filter((x) => x.id !== id));
  };

  /** Every page to read, as canvases (PDFs become one canvas per page). */
  async function* pages() {
    for (const f of files) {
      if (f.isPdf) {
        const doc = await openForRender(new Uint8Array(await f.file.arrayBuffer()));
        try {
          for (let n = 1; n <= doc.numPages; n++)
            yield { label: `${f.file.name} — page ${n}`, canvas: await renderPage(doc, n, { scale: PDF_SCALE }) };
        } finally {
          closeDoc(doc);
        }
      } else {
        const loaded = await loadImage(f.file);
        yield { label: f.file.name, canvas: imageToCanvas(loaded.img, "#ffffff") };
        URL.revokeObjectURL(loaded.url);
      }
    }
  }

  const read = async () => {
    setBusy(true);
    setText("");
    setConfidence(null);
    try {
      const parts = [];
      const scores = [];
      let i = 0;
      for await (const page of pages()) {
        i++;
        const src = enhance ? enhanceForOcr(page.canvas) : page.canvas;
        const r = await recognize(src, langs, (label, progress) =>
          setStatus({ label: `${i > 1 ? `Page ${i}: ` : ""}${label}`, progress }),
        );
        page.canvas.width = page.canvas.height = 0;
        parts.push({ label: page.label, text: r.text });
        scores.push(r.confidence);
        setText(parts.map((p) => (parts.length > 1 ? `--- ${p.label} ---\n${p.text}` : p.text)).join("\n\n"));
      }
      setConfidence(scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null);
      if (!parts.some((p) => p.text)) toast("No text was found. Try a clearer, straight photo.", "error");
    } catch (err) {
      console.error(err);
      toast(
        err?.message?.includes("password")
          ? "This PDF is password-protected. Unlock it first."
          : "Couldn't read the file. Try another photo.",
        "error",
      );
    } finally {
      setBusy(false);
      setStatus({ label: "", progress: 0 });
    }
  };

  const doCopy = async (bijoy) => {
    const ok = await copyText(bijoy ? unicodeToBijoy(text) : text);
    toast(
      ok ? (bijoy ? "Copied for SutonnyMJ." : "Copied.") : "Couldn't copy. Select the text and press Ctrl+C.",
      ok ? "success" : "error",
    );
  };

  const stats = textStats(text);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-6">
        <Card className="p-5">
          <Step n={1} title="Photos or scanned PDF">
            <FileDrop
              multiple
              accept="image/*,application/pdf,.pdf"
              onFiles={add}
              compact={files.length > 0}
              title={files.length ? "Add more" : "Choose photos or a PDF"}
              hint="Printed text works best. Ctrl+V pastes a screenshot."
            />
            {files.length ? (
              <ul className="space-y-1.5">
                {files.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 rounded-lg border border-line p-2">
                    {f.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={f.url} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
                    ) : (
                      <FileText className="h-10 w-10 shrink-0 p-2 text-danger" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm">{f.file.name}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${f.file.name}`}
                      disabled={busy}
                      onClick={() => remove(f.id)}
                      className="rounded-lg p-1.5 text-subtle hover:bg-danger-50 hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </Step>
        </Card>
        <Card className="space-y-4 p-5">
          <Step n={2} title="Read">
            <Segmented
              size="sm"
              options={Object.entries(ocrLanguages).map(([value, label]) => ({ value, label }))}
              value={langs}
              onChange={setLangs}
            />
            <Checkbox
              label="Clean up the photo first (grey, sharper, bigger)"
              checked={enhance}
              onChange={(e) => setEnhance(e.target.checked)}
            />
            <Button variant="accent" className="w-full" disabled={!files.length || busy} onClick={read}>
              {busy ? "Reading…" : "Read the text"}
            </Button>
            {busy ? (
              <div className="space-y-1">
                <div className="h-2 overflow-hidden rounded-full bg-ink-100">
                  <div
                    className="h-full rounded-full bg-brand-500 transition-all"
                    style={{ width: `${Math.round(status.progress * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted">{status.label || "Starting…"}</p>
              </div>
            ) : null}
            <p className="text-xs text-subtle">
              The first time takes a little longer while the language files load. Everything stays on this computer.
            </p>
          </Step>
        </Card>
      </div>

      <Card className="flex min-w-0 flex-col p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-sm font-semibold">Text</h2>
          <Button size="sm" variant="outline" disabled={!text} onClick={() => doCopy(false)}>
            <Copy className="h-3.5 w-3.5" /> Copy
          </Button>
          <Button size="sm" variant="outline" disabled={!text} onClick={() => doCopy(true)}>
            <Copy className="h-3.5 w-3.5" /> Copy for SutonnyMJ
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!text}
            onClick={() => {
              downloadBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), "text-from-image.txt");
              toast("Saved to Downloads.");
            }}
          >
            <Download className="h-3.5 w-3.5" /> .txt
          </Button>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Text found in the image"
          placeholder="The text from your photo appears here. You can correct it before copying."
          className="min-h-[440px] w-full flex-1 resize-y rounded-[10px] border border-line-strong p-3 font-bangla text-[15px] leading-relaxed focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none"
        />
        <p className="mt-2 text-xs text-subtle">
          {text ? `${stats.words} words · ${stats.lines} lines. ` : ""}
          {confidence != null ? `Reader's confidence: ${confidence}%. ` : ""}
          Always check the result — handwriting and blurry photos give mistakes.
        </p>
      </Card>
    </div>
  );
}
