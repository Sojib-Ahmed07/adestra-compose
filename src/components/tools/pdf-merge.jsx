// src/components/tools/pdf-merge.jsx
"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, FileText, GripVertical, ImageIcon, Trash2 } from "lucide-react";
import { getPaper } from "@/lib/photo/sizes";
import { prepareImage } from "@/lib/pdf/images";
import { assemblePages, imagesToPdf, pdfBlob } from "@/lib/pdf/ops";
import { cn, formatBytes } from "@/lib/utils";
import { PdfPicker, ResultFiles, useJob } from "@/components/pdf/pdf-bits";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { moveItem, useDragSort } from "@/components/ui/sortable";
import { Card, Step } from "@/components/ui/misc";

let nextId = 1;

export function PdfMergeTool() {
  const [items, setItems] = useState([]);
  const [name, setName] = useState("merged");
  const [result, setResult] = useState(null);
  const [busy, run] = useJob();
  const { itemProps, overIndex } = useDragSort(items, (l) => {
    setItems(l);
    setResult(null);
  });

  const add = (files) => {
    setItems((l) => [...l, ...files.map((f) => ({ id: String(nextId++), ...f }))]);
    setResult(null);
  };
  const update = (l) => {
    setItems(l);
    setResult(null);
  };

  const pageTotal = items.reduce((n, it) => n + (it.kind === "pdf" ? it.pageCount : 1), 0);

  const merge = () =>
    run("merge", async () => {
      const pages = [];
      for (const it of items) {
        if (it.kind === "pdf") {
          for (let i = 0; i < it.pageCount; i++) pages.push({ bytes: it.bytes, pageIndex: i });
        } else {
          const img = await prepareImage(it.file, "normal");
          const bytes = await imagesToPdf([img], { paper: getPaper("a4"), landscape: "auto", marginMm: 10, fit: "contain" });
          pages.push({ bytes, pageIndex: 0 });
        }
      }
      const out = await assemblePages(pages, { title: name });
      const fileName = `${(name.trim() || "merged").replace(/[\\/:*?"<>|]+/g, "-")}.pdf`;
      setResult([{ name: fileName, blob: pdfBlob(out) }]);
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
      <Card className="min-w-0 p-5">
        <Step n={1} title="Add files in order">
          <PdfPicker
            multiple
            acceptImages
            onFiles={add}
            compact={items.length > 0}
            title={items.length ? "Add more files" : "Choose PDFs or photos"}
            hint="PDFs and photos (photos become A4 pages). Drag the list to change the order."
          />
          {items.length ? (
            <ul className="space-y-1.5">
              {items.map((it, i) => (
                <li
                  key={it.id}
                  {...itemProps(i)}
                  className={cn(
                    "flex cursor-grab items-center gap-2 rounded-xl border bg-white p-2.5 active:cursor-grabbing",
                    overIndex === i ? "border-brand-400 bg-brand-50" : "border-line",
                  )}
                >
                  <GripVertical className="h-4 w-4 shrink-0 text-subtle" />
                  <span className="w-6 shrink-0 text-center text-xs font-medium text-muted">{i + 1}</span>
                  {it.kind === "pdf" ? (
                    <FileText className="h-5 w-5 shrink-0 text-danger" />
                  ) : (
                    <ImageIcon className="h-5 w-5 shrink-0 text-brand-500" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{it.name}</p>
                    <p className="text-xs text-muted">
                      {it.kind === "pdf" ? `${it.pageCount} page${it.pageCount === 1 ? "" : "s"}` : "Photo → 1 page"} ·{" "}
                      {formatBytes(it.size)}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Move up"
                    disabled={i === 0}
                    onClick={() => update(moveItem(items, i, i - 1))}
                    className="rounded-lg p-1.5 text-muted hover:bg-ink-50 disabled:opacity-30"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Move down"
                    disabled={i === items.length - 1}
                    onClick={() => update(moveItem(items, i, i + 1))}
                    className="rounded-lg p-1.5 text-muted hover:bg-ink-50 disabled:opacity-30"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${it.name}`}
                    onClick={() => update(items.filter((x) => x.id !== it.id))}
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

      <Card className="h-fit space-y-4 p-5 lg:sticky lg:top-6">
        <Step n={2} title="Merge">
          <Field label="File name" htmlFor="merge-name">
            <Input id="merge-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <p className="text-sm text-muted">
            {items.length ? (
              <>
                <strong className="text-ink-900">{items.length}</strong> file{items.length === 1 ? "" : "s"} →{" "}
                <strong className="text-ink-900">{pageTotal}</strong> page
                {pageTotal === 1 ? "" : "s"}
              </>
            ) : (
              "Add at least two files."
            )}
          </p>
          <Button variant="accent" className="w-full" disabled={items.length < 2 || Boolean(busy)} onClick={merge}>
            {busy ? "Merging…" : "Merge into one PDF"}
          </Button>
          <ResultFiles files={result} />
        </Step>
      </Card>
    </div>
  );
}
