// src/components/tools/pdf-to-images.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { canvasToBlob } from "@/lib/photo/export";
import { closeDoc, openForRender, renderPage } from "@/lib/pdf/engine";
import { parseRanges, suffixName } from "@/lib/pdf/ops";
import { PageThumb, PdfPicker, ResultFiles, useJob, usePdfjsDoc } from "@/components/pdf/pdf-bits";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Segmented } from "@/components/ui/interactive";
import { Card, Step } from "@/components/ui/misc";

const dpis = [
  { value: "100", label: "100 DPI — screen / WhatsApp" },
  { value: "150", label: "150 DPI — normal" },
  { value: "200", label: "200 DPI — clear" },
  { value: "300", label: "300 DPI — print quality" },
];

export function PdfToImagesTool() {
  const [file, setFile] = useState(null);
  const [format, setFormat] = useState("jpg");
  const [dpi, setDpi] = useState("150");
  const [which, setWhich] = useState("all");
  const [ranges, setRanges] = useState("");
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState(null);
  const [busy, run] = useJob();
  const { doc } = usePdfjsDoc(file?.bytes);
  const count = file?.pageCount ?? 0;

  useEffect(() => setResult(null), [format, dpi, which, ranges]);

  const parsed = useMemo(() => (which === "some" && count ? parseRanges(ranges, count) : null), [which, ranges, count]);
  const pages = useMemo(() => {
    if (!count) return [];
    if (which === "all") return Array.from({ length: count }, (_, i) => i);
    if (!parsed || parsed.error) return [];
    return [...new Set(parsed.groups.flat())];
  }, [which, count, parsed]);

  const convert = () =>
    run("convert", async () => {
      const d = await openForRender(file.bytes);
      try {
        const out = [];
        for (let k = 0; k < pages.length; k++) {
          setProgress(`Page ${k + 1} of ${pages.length}`);
          const canvas = await renderPage(d, pages[k] + 1, { scale: Number(dpi) / 72 });
          const blob = await canvasToBlob(canvas, format === "png" ? "image/png" : "image/jpeg", 0.9);
          canvas.width = canvas.height = 0;
          out.push({ name: suffixName(file.name, `page-${pages[k] + 1}`, format), blob });
        }
        setResult(out);
      } finally {
        closeDoc(d);
        setProgress("");
      }
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
      <Card className="min-w-0 p-5">
        <Step n={1} title="Choose PDF">
          {file ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <p className="min-w-0 flex-1 truncate text-sm">
                  <strong>{file.name}</strong> · {count} page{count === 1 ? "" : "s"}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setFile(null);
                    setResult(null);
                  }}
                >
                  Choose another PDF
                </Button>
              </div>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-3">
                {Array.from({ length: Math.min(count, 60) }, (_, i) => (
                  <li key={i} className={`flex flex-col items-center gap-1 ${pages.includes(i) ? "" : "opacity-35"}`}>
                    <PageThumb doc={doc} page={i + 1} width={84} />
                    <span className="text-xs text-muted">{i + 1}</span>
                  </li>
                ))}
              </ul>
              {count > 60 ? <p className="text-xs text-subtle">Showing the first 60 pages.</p> : null}
            </>
          ) : (
            <PdfPicker onFiles={(f) => setFile(f[0])} />
          )}
        </Step>
      </Card>

      <Card className="h-fit space-y-4 p-5 lg:sticky lg:top-6">
        <Step n={2} title="Convert">
          <Field label="Image type">
            <Segmented
              size="sm"
              options={[
                { value: "jpg", label: "JPG (smaller)" },
                { value: "png", label: "PNG (sharpest)" },
              ]}
              value={format}
              onChange={setFormat}
            />
          </Field>
          <Field label="Sharpness">
            <Segmented
              size="sm"
              options={dpis.map((d) => ({ value: d.value, label: `${d.value} DPI` }))}
              value={dpi}
              onChange={setDpi}
            />
            <p className="text-xs text-subtle">{dpis.find((d) => d.value === dpi)?.label}</p>
          </Field>
          <Field label="Pages">
            <Segmented
              size="sm"
              options={[
                { value: "all", label: "All pages" },
                { value: "some", label: "Some pages" },
              ]}
              value={which}
              onChange={setWhich}
            />
          </Field>
          {which === "some" ? (
            <Field
              label="Which pages"
              htmlFor="p2i-ranges"
              error={ranges && parsed?.error ? parsed.error : undefined}
              hint="e.g. 1, 3-5"
            >
              <Input id="p2i-ranges" value={ranges} onChange={(e) => setRanges(e.target.value)} />
            </Field>
          ) : null}
          <Button variant="accent" className="w-full" disabled={!file || !pages.length || Boolean(busy)} onClick={convert}>
            {busy
              ? progress || "Converting…"
              : pages.length
                ? `Make ${pages.length} image${pages.length === 1 ? "" : "s"}`
                : "Choose a PDF first"}
          </Button>
          <ResultFiles files={result} zipName={file ? suffixName(file.name, "images", "zip") : "images.zip"} />
        </Step>
      </Card>
    </div>
  );
}
