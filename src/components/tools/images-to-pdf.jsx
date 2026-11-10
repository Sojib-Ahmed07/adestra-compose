// src/components/tools/images-to-pdf.jsx
"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Trash2 } from "lucide-react";
import { getPaper } from "@/lib/photo/sizes";
import { imageQualities, prepareImage } from "@/lib/pdf/images";
import { imagesToPdf, pdfBlob } from "@/lib/pdf/ops";
import { cn } from "@/lib/utils";
import { ResultFiles, useJob } from "@/components/pdf/pdf-bits";
import { Button } from "@/components/ui/button";
import { FileDrop } from "@/components/ui/file-drop";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { Segmented, Stepper } from "@/components/ui/interactive";
import { moveItem, useDragSort } from "@/components/ui/sortable";
import { Card, Step } from "@/components/ui/misc";

let nextId = 1;
const papers = ["a4", "letter", "legal", "a5"];

export function ImagesToPdfTool() {
  const [items, setItems] = useState([]);
  const [paperId, setPaperId] = useState("a4");
  const [orient, setOrient] = useState("auto");
  const [margin, setMargin] = useState(10);
  const [fit, setFit] = useState("contain");
  const [quality, setQuality] = useState("normal");
  const [grey, setGrey] = useState(false);
  const [name, setName] = useState("photos");
  const [result, setResult] = useState(null);
  const [busy, run] = useJob();

  const change = (l) => {
    setItems(l);
    setResult(null);
  };
  const { itemProps, overIndex } = useDragSort(items, change);

  // Settings changed → the old PDF no longer matches.
  useEffect(() => setResult(null), [paperId, orient, margin, fit, quality, grey]);

  // Free thumbnail memory when the tool closes.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => () => itemsRef.current.forEach((it) => URL.revokeObjectURL(it.url)), []);

  const add = (files) =>
    change([...items, ...files.map((file) => ({ id: String(nextId++), file, url: URL.createObjectURL(file) }))]);
  const remove = (id) => {
    const it = items.find((x) => x.id === id);
    if (it) setTimeout(() => URL.revokeObjectURL(it.url), 1000);
    change(items.filter((x) => x.id !== id));
  };

  const make = () =>
    run("make", async () => {
      const prepared = [];
      for (const it of items) prepared.push(await prepareImage(it.file, quality, { grey }));
      const bytes = await imagesToPdf(prepared, {
        paper: paperId === "image" ? null : getPaper(paperId),
        landscape: orient === "auto" ? "auto" : orient === "landscape",
        marginMm: margin,
        fit,
      });
      setResult([{ name: `${(name.trim() || "photos").replace(/[\\/:*?"<>|]+/g, "-")}.pdf`, blob: pdfBlob(bytes) }]);
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
      <Card className="min-w-0 p-5">
        <Step n={1} title="Photos, in page order">
          <FileDrop
            multiple
            onFiles={add}
            compact={items.length > 0}
            title={items.length ? "Add more photos" : "Choose photos"}
            hint="Each photo becomes one page. Drag to change the order. Ctrl+V pastes a copied image."
          />
          {items.length ? (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
              {items.map((it, i) => (
                <li
                  key={it.id}
                  {...itemProps(i)}
                  className={cn(
                    "flex cursor-grab flex-col items-center gap-1.5 rounded-xl border p-2 active:cursor-grabbing",
                    overIndex === i ? "border-brand-400 bg-brand-50" : "border-line bg-white",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.url} alt="" draggable={false} className="h-28 w-full rounded object-contain" />
                  <p className="w-full truncate text-center text-[11px] text-muted">
                    {i + 1}. {it.file.name}
                  </p>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      aria-label="Move earlier"
                      disabled={i === 0}
                      onClick={() => change(moveItem(items, i, i - 1))}
                      className="rounded-md p-1 text-muted hover:bg-ink-50 disabled:opacity-30"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${it.file.name}`}
                      onClick={() => remove(it.id)}
                      className="rounded-md p-1 text-subtle hover:bg-danger-50 hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Move later"
                      disabled={i === items.length - 1}
                      onClick={() => change(moveItem(items, i, i + 1))}
                      className="rounded-md p-1 text-muted hover:bg-ink-50 disabled:opacity-30"
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </Step>
      </Card>

      <Card className="h-fit space-y-4 p-5 lg:sticky lg:top-6">
        <Step n={2} title="Page settings">
          <Field label="Page size" htmlFor="i2p-paper">
            <Select id="i2p-paper" value={paperId} onChange={(e) => setPaperId(e.target.value)}>
              {papers.map((id) => {
                const p = getPaper(id);
                return (
                  <option key={id} value={id}>
                    {p.label} — {p.detail}
                  </option>
                );
              })}
              <option value="image">Same as each photo</option>
            </Select>
          </Field>
          {paperId !== "image" ? (
            <>
              <Field label="Direction">
                <Segmented
                  size="sm"
                  options={[
                    { value: "auto", label: "Match photo" },
                    { value: "portrait", label: "Portrait" },
                    { value: "landscape", label: "Landscape" },
                  ]}
                  value={orient}
                  onChange={setOrient}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Margin (mm)">
                  <Stepper value={margin} onChange={setMargin} min={0} max={40} label="margin" />
                </Field>
                <Field label="Photo on page">
                  <Segmented
                    size="sm"
                    options={[
                      { value: "contain", label: "Whole" },
                      { value: "cover", label: "Fill" },
                    ]}
                    value={fit}
                    onChange={setFit}
                  />
                </Field>
              </div>
            </>
          ) : null}
          <Field label="Quality">
            <Segmented
              size="sm"
              options={Object.entries(imageQualities).map(([value, q]) => ({ value, label: q.label }))}
              value={quality}
              onChange={setQuality}
            />
          </Field>
          <Checkbox label="Black & white (smaller file)" checked={grey} onChange={(e) => setGrey(e.target.checked)} />
          <Field label="File name" htmlFor="i2p-name">
            <Input id="i2p-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Button variant="accent" className="w-full" disabled={!items.length || Boolean(busy)} onClick={make}>
            {busy
              ? "Making PDF…"
              : items.length
                ? `Make PDF (${items.length} page${items.length === 1 ? "" : "s"})`
                : "Add photos first"}
          </Button>
          <ResultFiles files={result} />
        </Step>
      </Card>
    </div>
  );
}
