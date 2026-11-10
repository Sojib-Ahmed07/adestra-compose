// src/components/tools/pdf-organize.jsx
"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, RotateCcw, RotateCw, Trash2, Undo2 } from "lucide-react";
import { assemblePages, pdfBlob, suffixName } from "@/lib/pdf/ops";
import { cn } from "@/lib/utils";
import { PageThumb, PdfPicker, ResultFiles, useJob, useRenderDocs } from "@/components/pdf/pdf-bits";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { moveItem, useDragSort } from "@/components/ui/sortable";
import { Card, Step } from "@/components/ui/misc";

let nextId = 1;

export function PdfOrganizeTool() {
  const docs = useRenderDocs();
  const [sources, setSources] = useState({});
  const [pages, setPages] = useState([]);
  const [name, setName] = useState("");
  const [result, setResult] = useState(null);
  const [busy, run] = useJob();

  const changePages = (next) => {
    setPages(next);
    setResult(null);
  };
  const { itemProps, overIndex } = useDragSort(pages, changePages);

  const add = (files) => {
    const newSources = {};
    const newPages = [];
    for (const f of files) {
      const id = String(nextId++);
      newSources[id] = f;
      docs.open(id, f.bytes);
      for (let i = 0; i < f.pageCount; i++)
        newPages.push({ key: `${id}:${i}`, src: id, pageIndex: i, rotate: 0, removed: false });
    }
    setSources((s) => ({ ...s, ...newSources }));
    if (!name && files[0]) setName(files[0].name.replace(/\.pdf$/i, ""));
    changePages([...pages, ...newPages]);
  };

  const patch = (key, fn) => changePages(pages.map((p) => (p.key === key ? fn(p) : p)));
  const kept = pages.filter((p) => !p.removed);
  const removedCount = pages.length - kept.length;

  const save = () =>
    run("save", async () => {
      const out = await assemblePages(
        kept.map((p) => ({ bytes: sources[p.src].bytes, pageIndex: p.pageIndex, rotate: p.rotate })),
        { title: name },
      );
      setResult([{ name: suffixName(name.trim() || "document", "edited"), blob: pdfBlob(out) }]);
    });

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <Step n={1} title="Choose PDF">
          <PdfPicker
            multiple
            onFiles={add}
            compact={pages.length > 0}
            title={pages.length ? "Add pages from another PDF" : "Choose a PDF"}
            hint={pages.length ? "Its pages are added at the end" : undefined}
          />
        </Step>
      </Card>

      {pages.length ? (
        <Card className="p-5">
          <Step n={2} title="Arrange pages">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => changePages(pages.map((p) => ({ ...p, rotate: (p.rotate + 90) % 360 })))}
              >
                <RotateCw className="h-3.5 w-3.5" /> Rotate all
              </Button>
              <Button size="sm" variant="outline" onClick={() => changePages(pages.slice().reverse())}>
                Reverse order
              </Button>
              {removedCount ? (
                <Button size="sm" variant="outline" onClick={() => changePages(pages.map((p) => ({ ...p, removed: false })))}>
                  <Undo2 className="h-3.5 w-3.5" /> Bring back {removedCount} removed
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-subtle">
              Drag pages to change the order. Use the buttons under each page to turn or remove it.
            </p>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
              {pages.map((p, i) => (
                <li
                  key={p.key}
                  {...itemProps(i)}
                  className={cn(
                    "flex cursor-grab flex-col items-center gap-2 rounded-xl border p-2 active:cursor-grabbing",
                    overIndex === i ? "border-brand-400 bg-brand-50" : "border-transparent",
                    p.removed && "opacity-40",
                  )}
                >
                  <div className="flex h-[180px] items-center justify-center">
                    <PageThumb
                      doc={docs.get(p.src)}
                      page={p.pageIndex + 1}
                      rotate={p.rotate}
                      width={p.rotate % 180 ? 170 : 120}
                      label={`Page ${i + 1}`}
                    />
                  </div>
                  <p className="text-xs font-medium text-ink-800">
                    {p.removed ? "Removed" : `Page ${pages.slice(0, i + 1).filter((x) => !x.removed).length}`}
                    {Object.keys(sources).length > 1 ? (
                      <span className="text-subtle"> · file {Object.keys(sources).indexOf(p.src) + 1}</span>
                    ) : null}
                  </p>
                  <div className="flex gap-0.5">
                    <IconBtn label="Move earlier" disabled={i === 0} onClick={() => changePages(moveItem(pages, i, i - 1))}>
                      <ArrowLeft className="h-3.5 w-3.5" />
                    </IconBtn>
                    <IconBtn label="Turn left" onClick={() => patch(p.key, (x) => ({ ...x, rotate: (x.rotate + 270) % 360 }))}>
                      <RotateCcw className="h-3.5 w-3.5" />
                    </IconBtn>
                    <IconBtn label="Turn right" onClick={() => patch(p.key, (x) => ({ ...x, rotate: (x.rotate + 90) % 360 }))}>
                      <RotateCw className="h-3.5 w-3.5" />
                    </IconBtn>
                    <IconBtn
                      label={p.removed ? "Bring back" : "Remove page"}
                      danger={!p.removed}
                      onClick={() => patch(p.key, (x) => ({ ...x, removed: !x.removed }))}
                    >
                      {p.removed ? <Undo2 className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </IconBtn>
                    <IconBtn
                      label="Move later"
                      disabled={i === pages.length - 1}
                      onClick={() => changePages(moveItem(pages, i, i + 1))}
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                    </IconBtn>
                  </div>
                </li>
              ))}
            </ul>
          </Step>
        </Card>
      ) : null}

      {pages.length ? (
        <Card className="space-y-4 p-5">
          <Step n={3} title="Save">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="File name" htmlFor="org-name" className="min-w-56 flex-1">
                <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Button variant="accent" disabled={!kept.length || Boolean(busy)} onClick={save}>
                {busy ? "Saving…" : `Save ${kept.length} page${kept.length === 1 ? "" : "s"} as PDF`}
              </Button>
            </div>
            {!kept.length ? <p className="text-sm text-warn">Every page is removed. Bring at least one back.</p> : null}
            <ResultFiles files={result} />
          </Step>
        </Card>
      ) : null}
    </div>
  );
}

function IconBtn({ label, onClick, disabled, danger, children }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md border border-line bg-white text-ink-700 hover:bg-ink-50 disabled:opacity-30",
        danger && "hover:border-red-200 hover:bg-danger-50 hover:text-danger",
      )}
    >
      {children}
    </button>
  );
}
