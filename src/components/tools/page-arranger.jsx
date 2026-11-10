// src/components/tools/page-arranger.jsx
"use client";

import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { defaultEdit, loadImage, renderEdit, srcH, srcW } from "@/lib/photo/image";
import { getPaper } from "@/lib/photo/sizes";
import { SheetOutput } from "@/components/photo/sheet-output";
import { FileDrop } from "@/components/ui/file-drop";
import { Checkbox, Field, Select } from "@/components/ui/form";
import { Segmented, Stepper, useToast } from "@/components/ui/interactive";
import { Card, Step } from "@/components/ui/misc";

const grids = [
  { value: "1x2", label: "2 per page (1 × 2)", cols: 1, rows: 2 },
  { value: "2x1", label: "2 per page (2 × 1)", cols: 2, rows: 1 },
  { value: "2x2", label: "4 per page (2 × 2)", cols: 2, rows: 2 },
  { value: "2x3", label: "6 per page (2 × 3)", cols: 2, rows: 3 },
  { value: "2x4", label: "8 per page (2 × 4)", cols: 2, rows: 4 },
  { value: "3x3", label: "9 per page (3 × 3)", cols: 3, rows: 3 },
  { value: "2x5", label: "10 per page (2 × 5)", cols: 2, rows: 5 },
  { value: "3x4", label: "12 per page (3 × 4)", cols: 3, rows: 4 },
  { value: "4x4", label: "16 per page (4 × 4)", cols: 4, rows: 4 },
];

export function PageArrangerTool() {
  const toast = useToast();
  const [image, setImage] = useState(null);
  const [paperId, setPaperId] = useState("legal");
  const [gridId, setGridId] = useState("2x2");
  const [margin, setMargin] = useState(5);
  const [gap, setGap] = useState(3);
  const [fit, setFit] = useState("contain");
  const [autoRotate, setAutoRotate] = useState(true);
  const [cutLines, setCutLines] = useState(true);
  const [pageCount, setPageCount] = useState(1);

  const paper = getPaper(paperId);
  const grid = grids.find((g) => g.value === gridId);

  const take = async (files) => {
    try {
      const loaded = await loadImage(files[0]);
      if (image) setTimeout(() => URL.revokeObjectURL(image.url), 1000);
      setImage(loaded);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const layout = useMemo(() => {
    if (!image) return { pages: [], count: 0, cellW: 0, cellH: 0 };
    const cellW = (paper.w - 2 * margin - (grid.cols - 1) * gap) / grid.cols;
    const cellH = (paper.h - 2 * margin - (grid.rows - 1) * gap) / grid.rows;
    if (cellW <= 5 || cellH <= 5) return { pages: [], count: 0, cellW, cellH };
    // Turn the image a quarter if that fills the cell better.
    const imgLandscape = srcW(image.img) > srcH(image.img);
    const cellLandscape = cellW > cellH;
    const turn = autoRotate && imgLandscape !== cellLandscape ? 1 : 0;
    const edit = { ...defaultEdit, turn };
    const item = {
      key: `arr|${image.url}|${cellW}|${cellH}|${fit}|${turn}`,
      label: "Image",
      wMm: cellW,
      hMm: cellH,
      copies: 1,
      draw: (pxPerMm) => renderEdit(image.img, edit, cellW * pxPerMm, cellH * pxPerMm, { fit }),
    };
    const onePage = [];
    for (let r = 0; r < grid.rows; r++)
      for (let c = 0; c < grid.cols; c++)
        onePage.push({ item, x: margin + c * (cellW + gap), y: margin + r * (cellH + gap), w: cellW, h: cellH });
    const pages = Array.from({ length: pageCount }, () => onePage);
    return { pages, count: onePage.length * pageCount, cellW, cellH };
  }, [image, paper, grid, margin, gap, fit, autoRotate, pageCount]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] xl:grid-cols-[minmax(0,1fr)_minmax(0,480px)]">
      <div className="min-w-0 space-y-6">
        <Card className="p-5">
          <Step n={1} title="Image">
            {image ? (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt="" className="h-20 w-20 rounded-lg border border-line object-contain" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{image.name}</p>
                  <p className="text-xs text-muted">
                    {image.width} × {image.height} px
                  </p>
                </div>
                <label className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-line-strong px-3 text-[13px] font-medium hover:bg-ink-50">
                  <RefreshCw className="h-4 w-4" /> Change
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      if (e.target.files?.length) take(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            ) : (
              <FileDrop onFiles={take} title="Choose an image" />
            )}
          </Step>
        </Card>

        <Card className="p-5">
          <Step n={2} title="Arrangement">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Paper" htmlFor="pa-paper">
                <Select id="pa-paper" value={paperId} onChange={(e) => setPaperId(e.target.value)}>
                  {["legal", "a4", "letter", "a5"].map((id) => {
                    const p = getPaper(id);
                    return (
                      <option key={id} value={id}>
                        {p.label} — {p.detail}
                      </option>
                    );
                  })}
                </Select>
              </Field>
              <Field label="Copies per page" htmlFor="pa-grid">
                <Select id="pa-grid" value={gridId} onChange={(e) => setGridId(e.target.value)}>
                  {grids.map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Page margin (mm)">
                <Stepper value={margin} onChange={setMargin} min={0} max={30} label="margin" />
              </Field>
              <Field label="Gap (mm)">
                <Stepper value={gap} onChange={setGap} min={0} max={30} label="gap" />
              </Field>
              <Field label="Image in each box">
                <Segmented
                  size="sm"
                  options={[
                    { value: "contain", label: "Whole image" },
                    { value: "cover", label: "Fill box (crops edges)" },
                  ]}
                  value={fit}
                  onChange={setFit}
                />
              </Field>
              <Field label="Number of pages">
                <Stepper value={pageCount} onChange={setPageCount} min={1} max={50} label="pages" />
              </Field>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <Checkbox
                label="Turn the image to fit best"
                checked={autoRotate}
                onChange={(e) => setAutoRotate(e.target.checked)}
              />
              <Checkbox label="Cutting lines" checked={cutLines} onChange={(e) => setCutLines(e.target.checked)} />
            </div>
            {image && layout.cellW > 5 ? (
              <p className="text-xs text-muted">
                Each box: {layout.cellW.toFixed(1)} × {layout.cellH.toFixed(1)} mm
              </p>
            ) : null}
            {image && layout.cellW <= 5 ? (
              <p role="alert" className="text-sm text-danger">
                The boxes are too small. Reduce the margin, gap or copies per page.
              </p>
            ) : null}
          </Step>
        </Card>
      </div>

      <div className="min-w-0">
        <Card className="p-5 lg:sticky lg:top-6">
          <Step n={3} title="Print">
            <SheetOutput
              pages={layout.pages}
              paper={paper}
              paperLabel={paper.label}
              cutLines={cutLines}
              fileName="arranged-page"
              count={layout.count}
              emptyText="Choose an image to see the page."
              unit="copy"
            />
          </Step>
        </Card>
      </div>
    </div>
  );
}
