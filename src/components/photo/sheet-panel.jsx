// src/components/photo/sheet-panel.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { layoutSheet, roomOnLastPage } from "@/lib/photo/sheet";
import { getPaper, paperSizes } from "@/lib/photo/sizes";
import { Checkbox, Field, Select } from "@/components/ui/form";
import { Segmented, Stepper } from "@/components/ui/interactive";
import { SheetOutput } from "./sheet-output";

/**
 * Paper settings + live page preview + Print / PDF / JPG.
 * Pass `items` from a useMemo so the preview only redraws when something changed.
 * @param {{ items: import("@/lib/photo/sheet").SheetItem[], fileName: string, defaultPaper?: string,
 *   defaultMargin?: number, defaultGap?: number, showNewRow?: boolean, papers?: string[], emptyText?: string, unit?: string,
 *   rememberKey?: string, printId?: string, defaultPosition?: "top-left" | "top" | "center" }} props
 * rememberKey: save the paper settings in this browser under that name, so they're the same next time.
 */
export function SheetPanel({
  items,
  fileName,
  defaultPaper = "a4",
  defaultMargin = 5,
  defaultGap = 2,
  showNewRow = true,
  papers,
  emptyText,
  unit,
  rememberKey,
  printId,
  defaultPosition = "top-left",
}) {
  const [paperId, setPaperId] = useState(defaultPaper);
  const [landscape, setLandscape] = useState(false);
  const [margin, setMargin] = useState(defaultMargin);
  const [gap, setGap] = useState(defaultGap);
  const [cutLines, setCutLines] = useState(true);
  const [newRowPerItem, setNewRowPerItem] = useState(true);
  const [position, setPosition] = useState(defaultPosition);

  // Load / save remembered settings.
  const loaded = useRef(false);
  useEffect(() => {
    if (!rememberKey) return;
    try {
      const saved = JSON.parse(localStorage.getItem(`sheet:${rememberKey}`) || "null");
      if (saved) {
        if (typeof saved.paperId === "string") setPaperId(saved.paperId);
        if (typeof saved.landscape === "boolean") setLandscape(saved.landscape);
        if (Number.isFinite(saved.margin)) setMargin(saved.margin);
        if (Number.isFinite(saved.gap)) setGap(saved.gap);
        if (typeof saved.cutLines === "boolean") setCutLines(saved.cutLines);
        if (typeof saved.newRowPerItem === "boolean") setNewRowPerItem(saved.newRowPerItem);
        if (["top-left", "top", "center"].includes(saved.position)) setPosition(saved.position);
      }
    } catch {
      // storage blocked — use defaults
    }
    loaded.current = true;
  }, [rememberKey]);
  useEffect(() => {
    if (!rememberKey || !loaded.current) return;
    try {
      localStorage.setItem(
        `sheet:${rememberKey}`,
        JSON.stringify({ paperId, landscape, margin, gap, cutLines, newRowPerItem, position }),
      );
    } catch {
      // ignore
    }
  }, [rememberKey, paperId, landscape, margin, gap, cutLines, newRowPerItem, position]);

  const base = getPaper(paperId);
  const paper = useMemo(() => (landscape ? { w: base.h, h: base.w } : { w: base.w, h: base.h }), [base, landscape]);
  const opts = useMemo(
    () => ({ margin, gap, newRowPerItem: showNewRow && newRowPerItem, position }),
    [margin, gap, newRowPerItem, showNewRow, position],
  );
  const layout = useMemo(() => layoutSheet(items, paper, opts), [items, paper, opts]);
  const room = useMemo(() => roomOnLastPage(items, paper, opts), [items, paper, opts]);
  const paperOptions = papers ? paperSizes.filter((p) => papers.includes(p.id)) : paperSizes;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Paper" htmlFor="sheet-paper">
          <Select id="sheet-paper" value={paperId} onChange={(e) => setPaperId(e.target.value)}>
            {paperOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} — {p.detail}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Direction">
          <Segmented
            options={[
              { value: "portrait", label: "Portrait" },
              { value: "landscape", label: "Landscape" },
            ]}
            value={landscape ? "landscape" : "portrait"}
            onChange={(v) => setLandscape(v === "landscape")}
          />
        </Field>
        <Field label="Page margin (mm)">
          <Stepper value={margin} onChange={setMargin} min={0} max={30} step={1} label="margin" />
        </Field>
        <Field label="Gap between photos (mm)">
          <Stepper value={gap} onChange={setGap} min={0} max={20} step={1} label="gap" />
        </Field>
        <Field label="Place on the page" className="sm:col-span-2">
          <Segmented
            size="sm"
            options={[
              { value: "top-left", label: "Top left" },
              { value: "top", label: "Top centre" },
              { value: "center", label: "Middle" },
            ]}
            value={position}
            onChange={setPosition}
          />
        </Field>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <Checkbox label="Cutting lines" checked={cutLines} onChange={(e) => setCutLines(e.target.checked)} />
        {showNewRow ? (
          <Checkbox
            label="Start each person on a new row"
            checked={newRowPerItem}
            onChange={(e) => setNewRowPerItem(e.target.checked)}
          />
        ) : null}
      </div>

      {layout.tooBig.length ? (
        <p role="alert" className="rounded-lg bg-warn-50 px-3 py-2 text-sm text-warn">
          Too big for this paper: {layout.tooBig.join(", ")}. Choose bigger paper or turn it to landscape.
        </p>
      ) : null}

      {room ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">
          <span>
            Room for <strong>{room.extra}</strong> more {room.item.label ? `of ${room.item.label}` : ""} on the last page.
          </span>
          <button
            type="button"
            onClick={() => room.item.setCopies(room.item.copies + room.extra)}
            className="h-8 rounded-lg bg-white px-3 text-[13px] font-medium text-brand-700 shadow-xs hover:bg-brand-100"
          >
            Fill the page
          </button>
        </div>
      ) : null}

      <SheetOutput
        pages={layout.pages}
        paper={paper}
        paperLabel={base.label}
        cutLines={cutLines}
        fileName={fileName}
        count={layout.count}
        emptyText={emptyText}
        unit={unit}
        printId={printId}
      />
    </div>
  );
}
