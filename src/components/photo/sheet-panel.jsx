// src/components/photo/sheet-panel.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { layoutFor, roomOnLastPage } from "@/lib/photo/sheet";
import { getPaper, paperSizes } from "@/lib/photo/sizes";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Select } from "@/components/ui/form";
import { Segmented, Stepper } from "@/components/ui/interactive";
import { SheetOutput } from "./sheet-output";

/**
 * Paper settings + live page preview + Print / PDF / JPG.
 * Two layouts: "Grid — easy cutting" (default: same-size cells in rows and columns, spare paper shared out as cutting
 * space right to the corners, 2 stamps share one passport space) and "Pack tight" (row packing, saves paper).
 * Pass `items` from a useMemo so the preview only redraws when something changed.
 * @param {{ items: import("@/lib/photo/sheet").SheetItem[], fileName: string, defaultPaper?: string,
 *   defaultMargin?: number, defaultGap?: number, showNewRow?: boolean, papers?: string[], emptyText?: string, unit?: string,
 *   rememberKey?: string, printId?: string, defaultPosition?: "top-left" | "top" | "center" }} props
 * rememberKey: save the paper settings in this browser under that name, so they're the same next time.
 * Reusing a sheet (grid layout): spaces already printed on are marked on a small map (or with "Printed — mark as used")
 * and the next print fills only the empty spaces of page 1. Remembered with the other settings until "New sheet".
 */
export function SheetPanel({
  items,
  fileName,
  defaultPaper = "a4",
  defaultMargin = 4,
  defaultGap = 3,
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
  const [gap, setGap] = useState(defaultGap); // left–right (and the only gap in "pack tight")
  const [gapY, setGapY] = useState(defaultGap); // up–down (grid)
  const [used, setUsed] = useState([]); // reused sheet: areas of page 1 already printed on ({ x, y, w, h } mm)
  const [usedSig, setUsedSig] = useState("");
  const [cutLines, setCutLines] = useState(true);
  const [newRowPerItem, setNewRowPerItem] = useState(true);
  const [position, setPosition] = useState(defaultPosition);
  const [mode, setMode] = useState("grid");
  const [spread, setSpread] = useState(true);
  const [pair, setPair] = useState(true);
  const [cols, setCols] = useState(0); // 0 = as many as fit
  const [rows, setRows] = useState(0);

  // Load / save remembered settings.
  const loaded = useRef(false);
  useEffect(() => {
    if (!rememberKey) return;
    try {
      // "sheet2:" — new defaults (more cutting space) for everyone after the grid layout came in.
      const saved = JSON.parse(localStorage.getItem(`sheet2:${rememberKey}`) || "null");
      if (saved) {
        if (typeof saved.paperId === "string") setPaperId(saved.paperId);
        if (typeof saved.landscape === "boolean") setLandscape(saved.landscape);
        if (Number.isFinite(saved.margin)) setMargin(saved.margin);
        if (Number.isFinite(saved.gap)) setGap(saved.gap);
        if (typeof saved.cutLines === "boolean") setCutLines(saved.cutLines);
        if (typeof saved.newRowPerItem === "boolean") setNewRowPerItem(saved.newRowPerItem);
        if (["top-left", "top", "center"].includes(saved.position)) setPosition(saved.position);
        if (["grid", "pack"].includes(saved.mode)) setMode(saved.mode);
        if (typeof saved.spread === "boolean") setSpread(saved.spread);
        if (typeof saved.pair === "boolean") setPair(saved.pair);
        if (Number.isFinite(saved.cols)) setCols(saved.cols);
        if (Number.isFinite(saved.rows)) setRows(saved.rows);
        if (Number.isFinite(saved.gapY)) setGapY(saved.gapY);
        if (Array.isArray(saved.used) && saved.used.every((r) => Number.isFinite(r?.x) && Number.isFinite(r?.w)))
          setUsed(saved.used);
        if (typeof saved.usedSig === "string") setUsedSig(saved.usedSig);
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
        `sheet2:${rememberKey}`,
        JSON.stringify({
          paperId,
          landscape,
          margin,
          gap,
          gapY,
          cutLines,
          newRowPerItem,
          position,
          mode,
          spread,
          pair,
          cols,
          rows,
          used,
          usedSig,
        }),
      );
    } catch {
      // ignore
    }
  }, [
    rememberKey,
    paperId,
    landscape,
    margin,
    gap,
    gapY,
    cutLines,
    newRowPerItem,
    position,
    mode,
    spread,
    pair,
    cols,
    rows,
    used,
    usedSig,
  ]);

  const base = getPaper(paperId);
  const paper = useMemo(() => (landscape ? { w: base.h, h: base.w } : { w: base.w, h: base.h }), [base, landscape]);
  const opts = useMemo(
    () => ({
      margin,
      gap,
      gapX: gap,
      gapY: mode === "grid" ? gapY : gap,
      newRowPerItem: showNewRow && newRowPerItem,
      position,
      mode,
      spread,
      pair,
      cols,
      rows,
      used: mode === "grid" ? used : [],
    }),
    [margin, gap, gapY, newRowPerItem, showNewRow, position, mode, spread, pair, cols, rows, used],
  );
  const layout = useMemo(() => layoutFor(opts)(items, paper, opts), [items, paper, opts]);
  const grid = mode === "grid" ? layout.grid : null;

  // Marked areas are real places on the paper, so they stay right when the next customer needs other sizes.
  // Only a different paper (or turning it) drops them.
  const sig = `${paperId}|${landscape}`;
  useEffect(() => {
    if (used.length && usedSig && usedSig !== sig) {
      setUsed([]);
      setUsedSig("");
    }
  }, [sig, used.length, usedSig]);
  const overlaps = (a, b) => a.x < b.x + b.w - 0.3 && b.x < a.x + a.w - 0.3 && a.y < b.y + b.h - 0.3 && b.y < a.y + a.h - 0.3;
  const toggleUsed = (space) => {
    setUsed((u) =>
      space.used ? u.filter((r) => !overlaps(r, space)) : [...u, { x: space.x, y: space.y, w: space.w, h: space.h }],
    );
    setUsedSig(sig);
  };
  const markPrinted = () => {
    const now = layout.pages[0]?.spaces ?? [];
    setUsed((u) => [...u, ...now.map(({ x, y, w, h }) => ({ x, y, w, h }))]);
    setUsedSig(sig);
  };

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
        <Field label="Layout" className="sm:col-span-2">
          <Segmented
            size="sm"
            options={[
              { value: "grid", label: "Grid — easy cutting" },
              { value: "pack", label: "Pack tight — saves paper" },
            ]}
            value={mode}
            onChange={setMode}
          />
        </Field>
        <Field label="Page edge (mm)" hint="Most printers can't print the last 3–4 mm.">
          <Stepper value={margin} onChange={setMargin} min={0} max={30} step={1} label="page edge" />
        </Field>
        {mode === "grid" ? (
          <>
            <Field label={spread ? "Space left–right, at least (mm)" : "Space left–right (mm)"}>
              <Stepper value={gap} onChange={setGap} min={0} max={30} step={1} label="space left to right" />
            </Field>
            <Field label={spread ? "Space up–down, at least (mm)" : "Space up–down (mm)"}>
              <Stepper value={gapY} onChange={setGapY} min={0} max={40} step={1} label="space up and down" />
            </Field>
          </>
        ) : (
          <Field label="Cutting space (mm)">
            <Stepper value={gap} onChange={setGap} min={0} max={20} step={1} label="cutting space" />
          </Field>
        )}
        {mode === "grid" ? (
          <>
            <Field label="Photos in a row">
              <Stepper
                value={grid ? grid.cols : cols}
                onChange={(v) => setCols(grid && v >= grid.maxCols ? 0 : v)}
                min={1}
                max={grid?.maxCols ?? 10}
                label="photos in a row"
              />
            </Field>
            <Field label="Rows on a page">
              <Stepper
                value={grid ? grid.rows : rows}
                onChange={(v) => setRows(grid && v >= grid.maxRows ? 0 : v)}
                min={1}
                max={grid?.maxRows ?? 10}
                label="rows on a page"
              />
            </Field>
          </>
        ) : null}
        {mode === "pack" || !spread ? (
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
        ) : null}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <Checkbox label="Cutting lines" checked={cutLines} onChange={(e) => setCutLines(e.target.checked)} />
        {mode === "grid" ? (
          <>
            <Checkbox
              label="Spread to the corners (more cutting space)"
              checked={spread}
              onChange={(e) => setSpread(e.target.checked)}
            />
            <Checkbox label="2 stamps in one passport space" checked={pair} onChange={(e) => setPair(e.target.checked)} />
          </>
        ) : null}
        {showNewRow ? (
          <Checkbox
            label="Start each person on a new row"
            checked={newRowPerItem}
            onChange={(e) => setNewRowPerItem(e.target.checked)}
          />
        ) : null}
      </div>

      {grid ? (
        <p className="text-xs text-muted">
          {grid.cols} × {grid.rows} = <strong>{grid.cols * grid.rows}</strong> spaces on a page, each {fmt(grid.cell.w)} ×{" "}
          {fmt(grid.cell.h)} mm. Smaller sizes share a space (e.g. 2 stamps), so 4 passport + 2 stamp make one row.
        </p>
      ) : null}

      {grid ? (
        <ReuseSheet
          grid={grid}
          marked={used.length}
          printing={layout.pages[0]?.spaces ?? []}
          onToggle={toggleUsed}
          onMarkPrinted={markPrinted}
          onNewSheet={() => {
            setUsed([]);
            setUsedSig("");
          }}
        />
      ) : null}

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

const fmt = (v) => (Math.round(v * 10) / 10).toString();

/**
 * Small map of page 1: tap the spaces already printed on (a sheet being used again) — the next print skips them.
 */
function ReuseSheet({ grid, marked, printing, onToggle, onMarkPrinted, onNewSheet }) {
  const [open, setOpen] = useState(marked > 0);
  const total = grid.spaces.length;
  const usedCount = grid.spaces.filter((s) => s.used).length;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-brand-700 hover:underline">
        Printing on a sheet that is already partly used? Mark the used spaces
      </button>
    );
  }
  const isPrinting = (s) => printing.some((p) => Math.abs(p.x - s.x) < 0.2 && Math.abs(p.y - s.y) < 0.2);
  return (
    <div className="space-y-3 rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink-900">Reuse this sheet</p>
        <span className="text-xs text-muted">
          {total - usedCount} of {total} spaces free
        </span>
      </div>
      <div className="flex flex-wrap items-start gap-4">
        <div
          className="grid shrink-0 gap-1 rounded-md bg-ink-50 p-1.5"
          style={{ gridTemplateColumns: `repeat(${grid.cols}, 1.5rem)` }}
          role="group"
          aria-label="Spaces on the sheet"
        >
          {grid.spaces.map((space, i) => {
            const isUsed = space.used;
            const now = !isUsed && isPrinting(space);
            return (
              <button
                key={i}
                type="button"
                onClick={() => onToggle(space)}
                aria-pressed={isUsed}
                title={
                  isUsed ? "Already printed — tap to free it" : now ? "Will print here now" : "Free — tap if already printed"
                }
                className={
                  isUsed
                    ? "rounded-sm bg-ink-400 text-[10px] text-white"
                    : now
                      ? "rounded-sm border border-brand-500 bg-brand-100"
                      : "rounded-sm border border-line-strong bg-white hover:bg-ink-100"
                }
                style={{ aspectRatio: `${grid.cell.w} / ${grid.cell.h}` }}
              >
                {isUsed ? "×" : ""}
              </button>
            );
          })}
        </div>
        <div className="min-w-0 flex-1 space-y-2 text-xs text-muted">
          <p>
            <span className="mr-1 inline-block h-3 w-3 rounded-sm bg-ink-400 align-middle" /> already printed ·{" "}
            <span className="mr-1 inline-block h-3 w-3 rounded-sm border border-brand-500 bg-brand-100 align-middle" /> this print
          </p>
          <p>
            After printing, press <strong>Printed — mark as used</strong>. Put the same sheet back in the printer the same way up,
            and the next customer's photos go in the empty spaces. Don't trim the sheet in between — cut out only the photos.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={!printing.length} onClick={onMarkPrinted}>
              Printed — mark as used
            </Button>
            <Button size="sm" variant="ghost" disabled={!marked} onClick={onNewSheet}>
              New sheet
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}