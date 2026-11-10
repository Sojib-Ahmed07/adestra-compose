// src/components/tools/pdf-compress.jsx
"use client";

import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { pdfBlob, resave, suffixName } from "@/lib/pdf/ops";
import { rasterizePdf } from "@/lib/pdf/raster";
import { formatBytes } from "@/lib/utils";
import { PdfPicker, ResultFiles, useJob } from "@/components/pdf/pdf-bits";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, NumberInput } from "@/components/ui/form";
import { Card, Step } from "@/components/ui/misc";

const levels = [
  { value: "keep", label: "Light", detail: "Keeps text selectable. Small saving, no quality loss." },
  {
    value: "medium",
    label: "Medium",
    detail: "150 DPI pictures. Good for scans — still prints clearly.",
    dpi: 150,
    quality: 0.7,
  },
  { value: "strong", label: "Strong", detail: "110 DPI. Fine on screen, a little soft when printed.", dpi: 110, quality: 0.55 },
  { value: "target", label: "Under a size", detail: "Tries step by step until the file is under your limit." },
];

// Tried in order for "Under a size" until one fits.
const ladder = [
  { dpi: 150, quality: 0.75 },
  { dpi: 150, quality: 0.55 },
  { dpi: 120, quality: 0.5 },
  { dpi: 100, quality: 0.42 },
  { dpi: 80, quality: 0.38 },
  { dpi: 72, quality: 0.3 },
];

export function PdfCompressTool() {
  const [file, setFile] = useState(null);
  const [level, setLevel] = useState("medium");
  const [targetKb, setTargetKb] = useState(500);
  const [grey, setGrey] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState(null);
  const [busy, run] = useJob();

  useEffect(() => setResult(null), [level, targetKb, grey, file]);

  const compress = () =>
    run("compress", async () => {
      let out;
      let note = "";
      const onProgress = (prefix) => (done, total) => setProgress(`${prefix}page ${done} of ${total}`);
      if (level === "keep") {
        setProgress("Working…");
        out = await resave(file.bytes);
      } else if (level === "target") {
        const limit = targetKb * 1024;
        for (let i = 0; i < ladder.length; i++) {
          const step = ladder[i];
          out = await rasterizePdf(file.bytes, { ...step, grey, onProgress: onProgress(`Try ${i + 1}: `) });
          if (out.length <= limit) break;
        }
        if (out.length > limit)
          note = `This is the smallest it can go (${formatBytes(out.length)}). Try black & white, or split the PDF into parts.`;
      } else {
        const l = levels.find((x) => x.value === level);
        out = await rasterizePdf(file.bytes, { dpi: l.dpi, quality: l.quality, grey, onProgress: onProgress("") });
      }
      setProgress("");
      const saved = 1 - out.length / file.size;
      if (out.length >= file.size) {
        note ||= "This PDF is already compact — the new file isn't smaller. Keep the original.";
      } else {
        note = `${formatBytes(file.size)} → ${formatBytes(out.length)} (${Math.round(saved * 100)}% smaller). ${note}`;
      }
      setResult({
        files: [{ name: suffixName(file.name, "compressed"), blob: pdfBlob(out) }],
        note,
        bigger: out.length >= file.size,
      });
    });

  return (
    <div className="grid max-w-4xl gap-6 lg:grid-cols-2">
      <Card className="h-fit p-5">
        <Step n={1} title="Choose PDF">
          {file ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="min-w-0 flex-1 text-sm">
                <strong className="break-all">{file.name}</strong>
                <br />
                <span className="text-muted">
                  {file.pageCount} page{file.pageCount === 1 ? "" : "s"} · {formatBytes(file.size)}
                </span>
              </p>
              <Button size="sm" variant="outline" onClick={() => setFile(null)}>
                Change
              </Button>
            </div>
          ) : (
            <PdfPicker onFiles={(f) => setFile(f[0])} />
          )}
        </Step>
      </Card>

      <Card className="h-fit space-y-4 p-5">
        <Step n={2} title="How much">
          <div className="space-y-2" role="radiogroup" aria-label="Compression level">
            {levels.map((l) => (
              <label
                key={l.value}
                className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${level === l.value ? "border-brand-400 bg-brand-50" : "border-line"}`}
              >
                <input
                  type="radio"
                  name="level"
                  className="mt-1 accent-brand-500"
                  checked={level === l.value}
                  onChange={() => setLevel(l.value)}
                />
                <span>
                  <span className="block text-sm font-medium">{l.label}</span>
                  <span className="block text-xs text-muted">{l.detail}</span>
                </span>
              </label>
            ))}
          </div>
          {level === "target" ? (
            <Field label="Maximum size (KB)" htmlFor="cmp-kb" hint="e.g. 500 for a 500 KB upload limit, 1024 for 1 MB">
              <NumberInput id="cmp-kb" integer min={20} max={100000} value={targetKb} onChange={setTargetKb} />
            </Field>
          ) : null}
          {level !== "keep" ? (
            <>
              <Checkbox label="Black & white (much smaller)" checked={grey} onChange={(e) => setGrey(e.target.checked)} />
              <p className="flex gap-2 rounded-lg bg-warn-50 px-3 py-2 text-xs text-warn">
                <TriangleAlert className="h-4 w-4 shrink-0" />
                Pages are saved as pictures, so text can no longer be selected or searched. Best for scanned documents.
              </p>
            </>
          ) : null}
          <Button variant="accent" className="w-full" disabled={!file || Boolean(busy)} onClick={compress}>
            {busy ? progress || "Compressing…" : "Compress PDF"}
          </Button>
          {result ? <ResultFiles files={result.files} note={result.note} /> : null}
        </Step>
      </Card>
    </div>
  );
}
