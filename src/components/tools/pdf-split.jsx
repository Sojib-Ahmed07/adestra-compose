// src/components/tools/pdf-split.jsx
"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { assemblePages, parseRanges, pdfBlob, suffixName } from "@/lib/pdf/ops";
import { cn } from "@/lib/utils";
import { PageThumb, PdfPicker, ResultFiles, useJob, usePdfjsDoc } from "@/components/pdf/pdf-bits";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Segmented } from "@/components/ui/interactive";
import { Card, Step } from "@/components/ui/misc";

export function PdfSplitTool() {
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState("ranges");
  const [ranges, setRanges] = useState("");
  const [picked, setPicked] = useState(() => new Set());
  const [result, setResult] = useState(null);
  const [busy, run] = useJob();
  const { doc } = usePdfjsDoc(file?.bytes);

  const count = file?.pageCount ?? 0;
  const parsed = useMemo(() => (mode === "ranges" && count ? parseRanges(ranges, count) : { groups: [] }), [mode, ranges, count]);

  /** groups of 0-based page indexes → one output file each */
  const groups = useMemo(() => {
    if (!count) return [];
    if (mode === "each") return Array.from({ length: count }, (_, i) => [i]);
    if (mode === "pick") return picked.size ? [[...picked].sort((a, b) => a - b)] : [];
    return parsed.error ? [] : parsed.groups;
  }, [mode, count, picked, parsed]);

  const reset = (f) => {
    setFile(f);
    setRanges("");
    setPicked(new Set());
    setResult(null);
  };

  const togglePick = (i) => {
    setResult(null);
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  };

  const label = (g) => (g.length === 1 ? `page-${g[0] + 1}` : `pages-${g[0] + 1}-${g[g.length - 1] + 1}`);

  const split = () =>
    run("split", async () => {
      const out = [];
      for (const g of groups) {
        const bytes = await assemblePages(g.map((pageIndex) => ({ bytes: file.bytes, pageIndex })));
        out.push({ name: suffixName(file.name, mode === "pick" ? "selected" : label(g)), blob: pdfBlob(bytes) });
      }
      setResult(out);
    });

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <Step n={1} title="Choose PDF">
          {file ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="min-w-0 flex-1 truncate text-sm">
                <strong>{file.name}</strong> · {count} page{count === 1 ? "" : "s"}
              </p>
              <Button size="sm" variant="outline" onClick={() => reset(null)}>
                Choose another PDF
              </Button>
            </div>
          ) : (
            <PdfPicker onFiles={(f) => reset(f[0])} />
          )}
        </Step>
      </Card>

      {file ? (
        <Card className="space-y-4 p-5">
          <Step n={2} title="How to split">
            <Segmented
              options={[
                { value: "ranges", label: "By page ranges" },
                { value: "each", label: "Every page separately" },
                { value: "pick", label: "Pick pages" },
              ]}
              value={mode}
              onChange={(m) => {
                setMode(m);
                setResult(null);
              }}
            />
            {mode === "ranges" ? (
              <Field
                label="Page ranges"
                htmlFor="split-ranges"
                error={ranges && parsed.error ? parsed.error : undefined}
                hint={`Each range becomes its own PDF. Example: 1-3, 4-6, 7-${count}`}
              >
                <Input
                  id="split-ranges"
                  value={ranges}
                  placeholder={`e.g. 1-2, 3-${Math.max(3, count)}`}
                  onChange={(e) => {
                    setRanges(e.target.value);
                    setResult(null);
                  }}
                />
              </Field>
            ) : null}
            {mode === "each" ? <p className="text-sm text-muted">Makes {count} PDFs — one for each page.</p> : null}
            {mode === "pick" ? (
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
                Click pages to pick them. They are saved together, in page order, as one PDF.
                {picked.size ? (
                  <button
                    type="button"
                    className="font-medium text-brand-600 hover:underline"
                    onClick={() => setPicked(new Set())}
                  >
                    Clear ({picked.size})
                  </button>
                ) : null}
              </div>
            ) : null}

            <ul className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-3">
              {Array.from({ length: count }, (_, i) => {
                const inGroup = groups.findIndex((g) => g.includes(i));
                const selected = mode === "pick" ? picked.has(i) : inGroup > -1;
                return (
                  <li key={i}>
                    <button
                      type="button"
                      disabled={mode !== "pick"}
                      onClick={() => togglePick(i)}
                      aria-pressed={mode === "pick" ? selected : undefined}
                      className={cn(
                        "relative flex w-full flex-col items-center gap-1.5 rounded-xl border-2 p-1.5 disabled:cursor-default",
                        selected ? "border-brand-400 bg-brand-50" : "border-transparent",
                        mode === "pick" && "hover:border-brand-200",
                      )}
                    >
                      <PageThumb doc={doc} page={i + 1} width={90} />
                      <span className="text-xs text-ink-800">
                        {i + 1}
                        {mode === "ranges" && inGroup > -1 ? <span className="text-brand-600"> · file {inGroup + 1}</span> : null}
                      </span>
                      {mode === "pick" && selected ? (
                        <span className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-white">
                          <Check className="h-3 w-3" />
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Step>
        </Card>
      ) : null}

      {file ? (
        <Card className="space-y-4 p-5">
          <Step n={3} title="Split">
            <Button variant="accent" disabled={!groups.length || Boolean(busy)} onClick={split}>
              {busy
                ? "Splitting…"
                : groups.length > 1
                  ? `Make ${groups.length} PDFs`
                  : groups.length === 1
                    ? "Make the PDF"
                    : "Choose pages first"}
            </Button>
            <ResultFiles files={result} zipName={suffixName(file.name, "split", "zip")} />
          </Step>
        </Card>
      ) : null}
    </div>
  );
}
