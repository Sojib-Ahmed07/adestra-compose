// src/components/photo/passport-editor.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Brush, Eraser, Eye, RotateCcw, Undo2, Wand2 } from "lucide-react";
import { defaultLook, renderPortrait } from "@/lib/photo/ai/look";
import { passportEdit } from "@/lib/photo/ai/portrait";
import { defaultEdit, renderEdit, srcH, srcW } from "@/lib/photo/image";
import { cn } from "@/lib/utils";
import { BgPicker, KEEP } from "./bg-picker";
import { CropEditor } from "./crop-editor";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Select } from "@/components/ui/form";
import { Segmented, Slider, Stepper } from "@/components/ui/interactive";

const tabs = [
  { value: "position", label: "Position" },
  { value: "light", label: "Light & colour" },
  { value: "touch", label: "Touch-up" },
  { value: "background", label: "Background" },
];

/**
 * Full editor for one automatic passport photo.
 * @param {{ p: any, rows: { label: string, w: number, h: number, copies: number }[], head: { head: number, top: number },
 *   globalBg: string, globalFix: boolean, onChange: (patch: any) => void, onLookToAll: (look: any) => void,
 *   onClose: () => void }} props
 */
export function PassportEditor({ p, rows, head, globalBg, globalFix, onChange, onLookToAll, onClose }) {
  const [tab, setTab] = useState("position");
  const [rowIdx, setRowIdx] = useState(0);
  const row = rows[Math.min(rowIdx, rows.length - 1)];
  const sizeKey = `${row.w}x${row.h}`;
  const auto = Boolean(p.portrait);

  // Sliders move a local copy (fast preview); the photo itself is updated a moment after you stop.
  const [look, setLook] = useState({ ...defaultLook, ...p.look });
  useEffect(() => setLook({ ...defaultLook, ...p.look }), [p.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const commit = useRef(null);
  const changeLook = (patch) => {
    const next = { ...look, ...patch };
    setLook(next);
    clearTimeout(commit.current);
    commit.current = setTimeout(() => onChange({ look: next }), 250);
  };
  useEffect(() => () => clearTimeout(commit.current), []);

  const bg = p.bg ?? globalBg;
  const keep = bg === KEEP;
  const fill = keep ? "#ffffff" : bg;
  const fix = p.fix ?? globalFix;

  const source = useMemo(
    () =>
      auto
        ? renderPortrait(p.portrait, {
            keepBackground: keep,
            fix,
            look,
            strokes: p.strokes,
            strokesRev: p.strokesRev,
            preview: true,
          })
        : p.image.img,
    [auto, p.portrait, p.image, keep, fix, look, p.strokes, p.strokesRev],
  );
  const original = useMemo(() => (auto ? p.portrait.variant({ keepBackground: true, fix: false }) : p.image.img), [auto, p]);

  const autoEdit = auto ? passportEdit(p.portrait, row.w, row.h, head) : defaultEdit;
  const edit = p.edits[sizeKey] ?? autoEdit;
  const setEdit = (e) => onChange({ edits: { ...p.edits, [sizeKey]: e } });
  const fit = auto ? "contain" : "cover";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="min-w-0 truncate text-sm font-semibold text-ink-900">Edit — {p.name}</h3>
        <div className="flex flex-wrap items-center gap-2">
          {rows.length > 1 ? (
            <Select
              aria-label="Size to edit"
              className="h-8 w-44"
              value={String(rowIdx)}
              onChange={(e) => setRowIdx(Number(e.target.value))}
            >
              {rows.map((r, i) => (
                <option key={i} value={i}>
                  {r.label}
                </option>
              ))}
            </Select>
          ) : null}
          <Button size="sm" variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>

      {auto ? <Segmented options={tabs} value={tab} onChange={setTab} size="sm" className="w-full overflow-x-auto" /> : null}

      {tab === "position" || !auto ? (
        <div className="space-y-4">
          <CropEditor
            key={`${p.id}|${sizeKey}`}
            img={source}
            edit={edit}
            onChange={setEdit}
            aspect={row.w / row.h}
            fit={fit}
            background={fill}
            guide={auto ? "none" : "face"}
            showColour={!auto}
          />
          <div className="flex flex-wrap items-center gap-2">
            {auto && p.edits[sizeKey] ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const edits = { ...p.edits };
                  delete edits[sizeKey];
                  onChange({ edits });
                }}
              >
                <Wand2 className="h-4 w-4" /> Back to automatic position
              </Button>
            ) : null}
            {auto ? (
              <>
                <Button size="sm" variant="outline" onClick={() => setEdit({ ...edit, zoom: edit.zoom * 0.95 })}>
                  Head smaller
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEdit({ ...edit, zoom: edit.zoom * 1.05 })}>
                  Head bigger
                </Button>
              </>
            ) : null}
          </div>
          <CopiesEditor p={p} rows={rows} onChange={onChange} />
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            {tab === "background" ? (
              <BrushView
                p={p}
                source={source}
                edit={edit}
                aspect={row.w / row.h}
                fill={fill}
                disabled={keep}
                onStroke={(s) => onChange({ strokes: [...p.strokes, s], strokesRev: (p.strokesRev || 0) + 1 })}
                brush={p.brush ?? { mode: "erase", size: 4 }}
              />
            ) : (
              <FramePreview source={source} original={original} edit={edit} aspect={row.w / row.h} fill={fill} />
            )}
          </div>
          <div className="min-w-0 space-y-4">
            {tab === "light" ? (
              <>
                <Checkbox
                  label="Auto brightness and colour"
                  checked={fix}
                  onChange={(e) => onChange({ fix: e.target.checked })}
                />
                <Slider label="Brightness" value={look.brightness} min={-100} max={100} defaultValue={0} onChange={(v) => changeLook({ brightness: v })} />
                <Slider label="Contrast" value={look.contrast} min={-60} max={80} defaultValue={0} onChange={(v) => changeLook({ contrast: v })} />
                <Slider label="Lighten shadows" value={look.shadows} min={0} max={100} defaultValue={0} onChange={(v) => changeLook({ shadows: v })} />
                <Slider label="Colour strength" value={look.saturation} min={-100} max={80} defaultValue={0} onChange={(v) => changeLook({ saturation: v })} />
                <Slider label="Warm / cool" value={look.warmth} min={-100} max={100} defaultValue={0} onChange={(v) => changeLook({ warmth: v })} />
              </>
            ) : null}
            {tab === "touch" ? (
              <>
                <Slider label="Smooth skin" value={look.smooth} min={0} max={100} defaultValue={0} onChange={(v) => changeLook({ smooth: v })} />
                <Slider label="Sharpen" value={look.sharpen} min={0} max={100} defaultValue={0} onChange={(v) => changeLook({ sharpen: v })} />
                <p className="text-xs text-muted">
                  Smooth skin works on the face only and keeps eyes, eyebrows and lips sharp. A little sharpening (20–40) makes
                  small prints look crisp.
                </p>
              </>
            ) : null}
            {tab === "light" || tab === "touch" ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const keepEdge = { ...defaultLook, edge: look.edge };
                    setLook(keepEdge);
                    onChange({ look: keepEdge });
                  }}
                >
                  <RotateCcw className="h-4 w-4" /> Reset
                </Button>
                <Button size="sm" variant="outline" onClick={() => onLookToAll(look)}>
                  Use these settings on all photos
                </Button>
              </div>
            ) : null}
            {tab === "background" ? (
              <BackgroundControls
                p={p}
                bg={bg}
                keep={keep}
                look={look}
                onEdge={(v) => changeLook({ edge: v })}
                onChange={onChange}
              />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function CopiesEditor({ p, rows, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-ink-50/60 px-3 py-2">
      <span className="text-xs font-medium text-ink-700">Copies of this photo</span>
      {rows.map((r, i) => (
        <span key={i} className="flex items-center gap-2 text-xs text-muted">
          {rows.length > 1 ? r.label : null}
          <Stepper
            value={p.copies?.[i] ?? r.copies}
            onChange={(n) => onChange({ copies: { ...p.copies, [i]: n } })}
            min={0}
            max={200}
            label={`copies of ${r.label}`}
            className="h-8"
          />
        </span>
      ))}
    </div>
  );
}

function BackgroundControls({ p, bg, keep, look, onEdge, onChange }) {
  const brush = p.brush ?? { mode: "erase", size: 4 };
  const setBrush = (patch) => onChange({ brush: { ...brush, ...patch } });
  return (
    <div className="space-y-4">
      <Field label="Background for this photo">
        <div className="space-y-2">
          <BgPicker value={bg} onChange={(v) => onChange({ bg: v })} id={`bg-${p.id}`} />
          {p.bg != null ? (
            <button type="button" className="text-xs font-medium text-brand-700 hover:underline" onClick={() => onChange({ bg: null })}>
              Use the same background as the other photos
            </button>
          ) : null}
        </div>
      </Field>
      {keep ? (
        <p className="text-sm text-muted">The original background is kept, so there is nothing to clean up.</p>
      ) : (
        <>
          <Slider label="Tighter edges (removes a halo)" value={look.edge} min={0} max={100} defaultValue={0} onChange={onEdge} />
          <div className="space-y-2">
            <p className="text-xs font-medium text-ink-700">Fix by hand — paint on the photo</p>
            <Segmented
              size="sm"
              options={[
                { value: "erase", label: "Erase background" },
                { value: "restore", label: "Bring back" },
              ]}
              value={brush.mode}
              onChange={(mode) => setBrush({ mode })}
            />
            <Slider label="Brush size" value={brush.size} min={1} max={15} defaultValue={4} onChange={(size) => setBrush({ size })} />
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!p.strokes.length}
                onClick={() => onChange({ strokes: p.strokes.slice(0, -1), strokesRev: (p.strokesRev || 0) + 1 })}
              >
                <Undo2 className="h-4 w-4" /> Undo
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!p.strokes.length}
                onClick={() => onChange({ strokes: [], strokesRev: (p.strokesRev || 0) + 1 })}
              >
                Clear all marks
              </Button>
            </div>
            <p className="text-xs text-muted">
              <strong>Erase background</strong> removes leftover bits (a chair, a shadow, another person).{" "}
              <strong>Bring back</strong> restores hair, ears or shoulders that were cut away.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/** Watch the width of a box and give a canvas size with the frame's aspect. */
function useFrameSize(aspect, maxHeight = 420) {
  const ref = useRef(null);
  const [size, setSize] = useState({ w: 280, h: 280 / aspect });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      let w = entry.contentRect.width;
      let h = w / aspect;
      if (h > maxHeight) {
        h = maxHeight;
        w = h * aspect;
      }
      setSize({ w: Math.floor(w), h: Math.floor(h) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect, maxHeight]);
  return [ref, size];
}

/** The photo as it will print, with "hold to compare" against the original. */
function FramePreview({ source, original, edit, aspect, fill }) {
  const [boxRef, size] = useFrameSize(aspect);
  const canvasRef = useRef(null);
  const [compare, setCompare] = useState(false);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const out = renderEdit(compare ? original : source, edit, size.w * dpr, size.h * dpr, { fit: "contain", background: fill });
    c.width = out.width;
    c.height = out.height;
    c.getContext("2d").drawImage(out, 0, 0);
  }, [source, original, compare, edit, size, fill]);
  return (
    <div className="space-y-2">
      <div ref={boxRef} className="flex w-full justify-center">
        <canvas
          ref={canvasRef}
          style={{ width: size.w, height: size.h }}
          className="rounded-md bg-white shadow-[0_0_0_1px_var(--color-line-strong)]"
          aria-label="Edited photo"
        />
      </div>
      <div className="flex justify-center">
        <button
          type="button"
          onPointerDown={() => setCompare(true)}
          onPointerUp={() => setCompare(false)}
          onPointerLeave={() => setCompare(false)}
          onKeyDown={(e) => e.key === " " && setCompare(true)}
          onKeyUp={() => setCompare(false)}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium select-none",
            compare ? "bg-ink-900 text-white" : "text-ink-700 hover:bg-ink-50",
          )}
        >
          <Eye className="h-4 w-4" /> {compare ? "Original photo" : "Hold to compare with original"}
        </button>
      </div>
    </div>
  );
}

/** Paint erase / restore strokes directly on the framed photo. */
function BrushView({ p, source, edit, aspect, fill, disabled, onStroke, brush }) {
  const [boxRef, size] = useFrameSize(aspect);
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const stroke = useRef(null);
  const dpr = typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  const W = size.w * dpr;
  const H = size.h * dpr;
  const e = { ...defaultEdit, ...edit };
  const iw = srcW(source);
  const ih = srcH(source);
  const quarter = e.turn % 2 === 1;
  const s = Math.min(W / (quarter ? ih : iw), H / (quarter ? iw : ih)) * e.zoom; // display px per source px
  const toFull = p.portrait.width / iw; // source px → full portrait px
  const radiusDisplay = (brush.size / 100) * W;

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const out = renderEdit(source, edit, W, H, { fit: "contain", background: fill });
    c.width = out.width;
    c.height = out.height;
    c.getContext("2d").drawImage(out, 0, 0);
    const o = overlayRef.current;
    o.width = out.width;
    o.height = out.height;
  }, [source, edit, W, H, fill]);

  const local = (ev) => {
    const rect = overlayRef.current.getBoundingClientRect();
    return { x: ((ev.clientX - rect.left) / rect.width) * W, y: ((ev.clientY - rect.top) / rect.height) * H };
  };
  // Display point → full-size portrait pixel (inverse of drawEdit).
  const toPortrait = ({ x, y }) => {
    let dx = x - (W / 2 + e.x * W);
    let dy = y - (H / 2 + e.y * H);
    const a = (-(e.turn * 90 + e.rotate) * Math.PI) / 180;
    const rx = dx * Math.cos(a) - dy * Math.sin(a);
    const ry = dx * Math.sin(a) + dy * Math.cos(a);
    dx = e.flip ? -rx : rx;
    dy = ry;
    return { x: (dx / s + iw / 2) * toFull, y: (dy / s + ih / 2) * toFull };
  };

  const drawDot = (pt, live) => {
    const ctx = overlayRef.current.getContext("2d");
    if (!live) ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = brush.mode === "erase" ? "rgba(220,38,38,0.45)" : "rgba(22,163,74,0.45)";
    ctx.strokeStyle = brush.mode === "erase" ? "#dc2626" : "#16a34a";
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, radiusDisplay, 0, Math.PI * 2);
    if (live) ctx.fill();
    else ctx.stroke();
  };

  const onDown = (ev) => {
    if (disabled) return;
    ev.preventDefault();
    overlayRef.current.setPointerCapture(ev.pointerId);
    const pt = local(ev);
    overlayRef.current.getContext("2d").clearRect(0, 0, W, H);
    drawDot(pt, true);
    const q = toPortrait(pt);
    stroke.current = { mode: brush.mode, r: (radiusDisplay / s) * toFull, pts: [Math.round(q.x), Math.round(q.y)] };
  };
  const onMove = (ev) => {
    if (disabled) return;
    const pt = local(ev);
    if (!stroke.current) {
      drawDot(pt, false);
      return;
    }
    drawDot(pt, true);
    const q = toPortrait(pt);
    stroke.current.pts.push(Math.round(q.x), Math.round(q.y));
  };
  const onUp = () => {
    if (!stroke.current) return;
    const done = stroke.current;
    stroke.current = null;
    overlayRef.current.getContext("2d").clearRect(0, 0, W, H);
    onStroke(done);
  };

  return (
    <div ref={boxRef} className="flex w-full justify-center">
      <div className="relative" style={{ width: size.w, height: size.h }}>
        <canvas
          ref={canvasRef}
          style={{ width: size.w, height: size.h }}
          className="absolute inset-0 rounded-md bg-white shadow-[0_0_0_1px_var(--color-line-strong)]"
        />
        <canvas
          ref={overlayRef}
          style={{ width: size.w, height: size.h }}
          className={cn("absolute inset-0 touch-none", disabled ? "cursor-not-allowed" : "cursor-crosshair")}
          aria-label={brush.mode === "erase" ? "Paint to erase background" : "Paint to bring back"}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={() => {
            if (!stroke.current) overlayRef.current?.getContext("2d").clearRect(0, 0, W, H);
          }}
        />
        <span className="pointer-events-none absolute top-2 left-2 inline-flex items-center gap-1 rounded-md bg-white/90 px-2 py-1 text-[11px] font-medium text-ink-800 shadow-xs">
          {brush.mode === "erase" ? <Eraser className="h-3.5 w-3.5" /> : <Brush className="h-3.5 w-3.5" />}
          {brush.mode === "erase" ? "Erasing" : "Bringing back"}
        </span>
      </div>
    </div>
  );
}
