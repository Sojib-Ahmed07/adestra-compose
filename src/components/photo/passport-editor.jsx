// src/components/photo/passport-editor.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Brush, Crosshair, Eraser, Eye, Moon, Redo2, RotateCcw, Sparkles, Stamp, Sun, Undo2, Wand2, ZoomIn } from "lucide-react";
import { histogram } from "@/lib/photo/adjust";
import { defaultLook, enhanceLook, renderPortrait } from "@/lib/photo/ai/look";
import { passportEdit } from "@/lib/photo/ai/portrait";
import { beautyPresets, retouchKeys } from "@/lib/photo/ai/retouch";
import { defaultEdit, renderEdit, srcH, srcW } from "@/lib/photo/image";
import { cn } from "@/lib/utils";
import { AdjustPanel } from "./adjust-panel";
import { BgPicker, KEEP } from "./bg-picker";
import { CropEditor } from "./crop-editor";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Select } from "@/components/ui/form";
import { Segmented, Slider, Stepper } from "@/components/ui/interactive";

const tabs = [
  { value: "position", label: "Position" },
  { value: "light", label: "Quick fix" },
  { value: "adjust", label: "Adjustments" },
  { value: "face", label: "Retouch" },
  { value: "background", label: "Background" },
];

/** Retouch brushes (Photoshop names). */
const retouchTools = [
  { value: "heal", label: "Spot healing" },
  { value: "clone", label: "Clone stamp" },
  { value: "dodge", label: "Dodge" },
  { value: "burn", label: "Burn" },
];
const isRetouchStroke = (s) => s.mode === "heal" || s.mode === "clone" || s.mode === "dodge" || s.mode === "burn";

const lightKeys = [
  "brightness",
  "contrast",
  "shadows",
  "highlights",
  "clarity",
  "vibrance",
  "saturation",
  "warmth",
  "tint",
  "denoise",
  "sharpen",
];
const faceKeys = retouchKeys;

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));
const omit = (obj, keys) => Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));

/**
 * Full editor for one automatic photo (auto passport, joint photo).
 * @param {{ p: any, rows: { label: string, w: number, h: number, copies: number }[], head: { head: number, top: number },
 *   globalBg: string, globalFix: boolean, baseLook?: object, allowOwnBg?: boolean, showCopies?: boolean,
 *   onChange: (patch: any) => void, onLookToAll: (look: any) => void, onClose: () => void }} props
 * baseLook: the tool-wide touch-up level (e.g. "Natural"); the photo's own `look` is laid on top of it.
 */
export function PassportEditor({
  p,
  rows,
  head,
  globalBg,
  globalFix,
  baseLook = {},
  allowOwnBg = true,
  showCopies = true,
  onChange,
  onLookToAll,
  onClose,
}) {
  const [tab, setTab] = useState("position");
  const [rowIdx, setRowIdx] = useState(0);
  const row = rows[Math.min(rowIdx, rows.length - 1)];
  const sizeKey = `${row.w}x${row.h}`;
  const auto = Boolean(p.portrait);
  const hasFace = Boolean(p.portrait?.face?.pts);

  // History (Ctrl+Z / Ctrl+Shift+Z): every change saves how the photo was before it.
  const pRef = useRef(p);
  pRef.current = p;
  const history = useRef({ undo: [], redo: [], last: 0 });
  const [, setHistoryRev] = useState(0);
  const snapshot = () => {
    const q = pRef.current;
    return { look: q.look, strokes: q.strokes, edits: q.edits, fix: q.fix, bg: q.bg };
  };
  /** Change the photo (merge: quick repeated changes, like dragging, count as one step). */
  const change = (patch, merge = false) => {
    const h = history.current;
    const now = Date.now();
    if (!(merge && now - h.last < 700)) {
      h.undo.push(snapshot());
      if (h.undo.length > 80) h.undo.shift();
      h.redo = [];
      setHistoryRev((n) => n + 1);
    }
    h.last = now;
    onChange(patch);
  };

  // Sliders change a local copy (fast preview); the photo itself is updated a moment after you stop.
  const [own, setOwn] = useState(p.look || {});
  useEffect(() => setOwn(p.look || {}), [p.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const commit = useRef(null);
  const changeLook = (patch, now = false) => {
    const next = { ...own, ...patch };
    setOwn(next);
    clearTimeout(commit.current);
    if (now) change({ look: next });
    else commit.current = setTimeout(() => change({ look: next }, true), 250);
  };
  const replaceLook = (next) => {
    clearTimeout(commit.current);
    setOwn(next);
    change({ look: next });
  };
  const travel = (from, to) => {
    const h = history.current;
    const prev = h[from].pop();
    if (!prev) return;
    clearTimeout(commit.current);
    h[to].push(snapshot());
    h.last = 0;
    setOwn(prev.look || {});
    onChange({ ...prev, strokesRev: (pRef.current.strokesRev || 0) + 1 });
    setHistoryRev((n) => n + 1);
  };
  const undo = () => travel("undo", "redo");
  const redo = () => travel("redo", "undo");
  useEffect(() => () => clearTimeout(commit.current), []);
  const look = useMemo(() => ({ ...defaultLook, ...baseLook, ...own }), [baseLook, own]);

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
  const setEdit = (e) => change({ edits: { ...p.edits, [sizeKey]: e } }, true);
  const fit = auto ? "contain" : "cover";

  const [faceZoom, setFaceZoom] = useState(true);
  const faceEdit = useMemo(
    () => (auto && faceZoom ? zoomToFace(edit, p.portrait, row.w / row.h, 2.1) : edit),
    [auto, faceZoom, edit, p.portrait, row.w, row.h],
  );

  // Brushes.
  const [tool, setTool] = useState("heal");
  const [clone, setClone] = useState({ src: null, offset: null, picking: false });
  const retouchSize = p.healSize ?? 2;
  const strength = p.toneStrength ?? 30;
  const addStroke = (s) => {
    if (s.mode === "clone") {
      if (!clone.src) return;
      const offset = clone.offset ?? { dx: clone.src.x - s.pts[0], dy: clone.src.y - s.pts[1] };
      if (!clone.offset) setClone((c) => ({ ...c, offset }));
      s = { ...s, ...offset };
    }
    if (s.mode === "dodge" || s.mode === "burn") s = { ...s, s: strength / 100 };
    change({ strokes: [...p.strokes, s], strokesRev: (p.strokesRev || 0) + 1 });
  };
  const undoStroke = (retouch) => {
    const i = p.strokes.findLastIndex((s) => isRetouchStroke(s) === retouch);
    if (i < 0) return;
    change({ strokes: p.strokes.filter((_, j) => j !== i), strokesRev: (p.strokesRev || 0) + 1 });
  };
  const clearStrokes = (retouch) =>
    change({ strokes: p.strokes.filter((s) => isRetouchStroke(s) !== retouch), strokesRev: (p.strokesRev || 0) + 1 });
  const healCount = p.strokes.filter(isRetouchStroke).length;
  const maskCount = p.strokes.length - healCount;

  // Keyboard: Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, and [ ] for brush size (as in Photoshop).
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      const typing =
        t &&
        (t.tagName === "TEXTAREA" ||
          t.isContentEditable ||
          (t.tagName === "INPUT" && !["range", "checkbox", "radio", "button"].includes(t.type)));
      if (typing) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && k === "y") {
        e.preventDefault();
        redo();
      } else if (!mod && (e.key === "[" || e.key === "]")) {
        const d = e.key === "]" ? 1 : -1;
        if (tab === "face") onChange({ healSize: Math.min(12, Math.max(0.5, retouchSize + d * 0.5)) });
        if (tab === "background") {
          const b = p.brush ?? { mode: "erase", size: 4 };
          onChange({ brush: { ...b, size: Math.min(15, Math.max(1, b.size + d)) } });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Histogram + pixels before the Photoshop adjustments (for Levels / Curves and the Auto buttons).
  const baseRender = useMemo(
    () =>
      auto && tab === "adjust"
        ? renderPortrait(p.portrait, {
          keepBackground: keep,
          fix,
          look: { ...look, adj: null },
          strokes: p.strokes,
          strokesRev: p.strokesRev,
          preview: true,
        })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [auto, tab, p.portrait, keep, fix, JSON.stringify({ ...look, adj: null }), p.strokes, p.strokesRev],
  );
  const base = useMemo(() => {
    if (!baseRender) return null;
    const px = baseRender
      .getContext("2d", { willReadFrequently: true })
      .getImageData(0, 0, baseRender.width, baseRender.height).data;
    return { hist: histogram(px), px };
  }, [baseRender]);

  const slider = (key, label, min, max) => (
    <Slider
      key={key}
      label={label}
      value={look[key]}
      min={min}
      max={max}
      defaultValue={baseLook[key] ?? 0}
      onChange={(v) => changeLook({ [key]: v })}
    />
  );

  const beautyNow = Object.entries(beautyPresets).find(([, pr]) =>
    faceKeys.every((k) => (look[k] || 0) === (pr.look[k] || 0)),
  )?.[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="min-w-0 truncate text-sm font-semibold text-ink-900">Edit — {p.name}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            onClick={undo}
            disabled={!history.current.undo.length}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={redo}
            disabled={!history.current.redo.length}
            title="Redo (Ctrl+Shift+Z)"
            aria-label="Redo"
          >
            <Redo2 className="h-4 w-4" />
          </Button>
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
                  change({ edits });
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
                <Button size="sm" variant="outline" onClick={() => setEdit({ ...edit, y: edit.y - 0.01 })}>
                  Move up
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEdit({ ...edit, y: edit.y + 0.01 })}>
                  Move down
                </Button>
              </>
            ) : null}
          </div>
          {showCopies ? <CopiesEditor p={p} rows={rows} onChange={change} /> : null}
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-2">
            {tab === "background" ? (
              <BrushView
                p={p}
                source={source}
                edit={edit}
                aspect={row.w / row.h}
                fill={fill}
                disabled={keep && !(look.bgBlur > 0)}
                onStroke={addStroke}
                brush={p.brush ?? { mode: "erase", size: 4 }}
              />
            ) : tab === "face" ? (
              <>
                <BrushView
                  p={p}
                  source={source}
                  original={original}
                  edit={faceEdit}
                  aspect={row.w / row.h}
                  fill={fill}
                  disabled={false}
                  onStroke={addStroke}
                  brush={{ mode: tool, size: retouchSize }}
                  marker={tool === "clone" && !clone.offset ? clone.src : null}
                  picking={tool === "clone" && (clone.picking || !clone.src)}
                  onPick={(q) => setClone({ src: q, offset: null, picking: false })}
                />
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => setFaceZoom((z) => !z)}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium",
                      faceZoom ? "bg-brand-50 text-brand-700" : "text-ink-700 hover:bg-ink-50",
                    )}
                  >
                    <ZoomIn className="h-4 w-4" /> {faceZoom ? "Zoomed on the face" : "Zoom on the face"}
                  </button>
                </div>
              </>
            ) : (
              <FramePreview source={source} original={original} edit={edit} aspect={row.w / row.h} fill={fill} />
            )}
          </div>
          <div className="min-w-0 space-y-4">
            {tab === "light" ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="accent" onClick={() => changeLook({ ...enhanceLook }, true)}>
                    <Sparkles className="h-4 w-4" /> One-tap enhance
                  </Button>
                  <Checkbox
                    label="Auto brightness and colour"
                    checked={fix}
                    onChange={(e) => change({ fix: e.target.checked })}
                  />
                </div>
                <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-2">
                  {slider("brightness", "Brightness", -100, 100)}
                  {slider("contrast", "Contrast", -60, 80)}
                  {slider("shadows", "Lighten shadows", 0, 100)}
                  {slider("highlights", "Recover bright parts", 0, 100)}
                  {slider("clarity", "Clarity (crisp details)", -50, 80)}
                  {slider("vibrance", "Vibrance (dull colours)", -50, 80)}
                  {slider("saturation", "Colour strength", -100, 80)}
                  {slider("warmth", "Warm / cool", -100, 100)}
                  {slider("tint", "Green / pink", -100, 100)}
                  {slider("denoise", "Reduce grain", 0, 100)}
                  {slider("sharpen", "Sharpen", 0, 100)}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => replaceLook(omit(own, lightKeys))}>
                    <RotateCcw className="h-4 w-4" /> Reset light & colour
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onLookToAll(pick(look, lightKeys))}>
                    Use on all photos
                  </Button>
                </div>
                <p className="text-xs text-muted">
                  Dull or dark phone photo? Press <strong>One-tap enhance</strong>. Click a slider's name to put it back.
                </p>
              </>
            ) : null}
            {tab === "adjust" ? (
              <AdjustPanel value={own.adj ?? null} base={base} onChange={(adj, now) => changeLook({ adj }, now)} />
            ) : null}
            {tab === "face" ? (
              hasFace ? (
                <>
                  <Field label="Automatic face touch-up">
                    <Segmented
                      size="sm"
                      options={Object.entries(beautyPresets).map(([value, pr]) => ({ value, label: pr.label }))}
                      value={beautyNow ?? ""}
                      onChange={(v) =>
                        changeLook(Object.fromEntries(faceKeys.map((k) => [k, beautyPresets[v].look[k] || 0])), true)
                      }
                    />
                  </Field>
                  <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-2">
                    {slider("blemish", "Remove spots & marks", 0, 100)}
                    {slider("smooth", "Smooth skin", 0, 100)}
                    {slider("even", "Even skin colour", 0, 100)}
                    {slider("shine", "Reduce oily shine", 0, 100)}
                    {slider("darkCircles", "Under-eye shadows", 0, 100)}
                    {slider("eyes", "Brighter eyes", 0, 100)}
                    {slider("teeth", "Whiter teeth", 0, 100)}
                    {slider("faceLight", "Light on the face", 0, 100)}
                  </div>
                  <RetouchTools
                    tool={tool}
                    setTool={setTool}
                    size={retouchSize}
                    setSize={(v) => onChange({ healSize: v })}
                    strength={strength}
                    setStrength={(v) => onChange({ toneStrength: v })}
                    clone={clone}
                    setClone={setClone}
                    count={healCount}
                    onUndo={() => undoStroke(true)}
                    onClear={() => clearStrokes(true)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => replaceLook(omit(own, faceKeys))}>
                      <RotateCcw className="h-4 w-4" /> Back to the tool's level
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onLookToAll(pick(look, faceKeys))}>
                      Use on all photos
                    </Button>
                  </div>
                  <p className="text-xs text-muted">
                    Touch-up only cleans the skin, light and eyes — it never changes the shape of the face, so the photo is still
                    good for passports and IDs.
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted">Face touch-up needs the automatic photo. Remove this photo and add it again.</p>
              )
            ) : null}
            {tab === "background" ? (
              <BackgroundControls
                p={p}
                bg={bg}
                keep={keep}
                look={look}
                allowOwnBg={allowOwnBg}
                maskCount={maskCount}
                onEdge={(v) => changeLook({ edge: v })}
                onBlur={(v) => changeLook({ bgBlur: v })}
                onUndo={() => undoStroke(false)}
                onClear={() => clearStrokes(false)}
                onChange={change}
              />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

/** Same framing, zoomed `z` times around the face (for spot fixing). */
function zoomToFace(edit, portrait, aspect, z) {
  const e = { ...defaultEdit, ...edit };
  const pw = portrait.width;
  const ph = portrait.height;
  const f = portrait.face;
  const fx = f.cx;
  const fy = (f.topY + f.chinY) / 2;
  const s = Math.min(aspect / pw, 1 / ph) * e.zoom * z; // frame units (height = 1) per portrait pixel
  return { ...e, zoom: e.zoom * z, x: (-(fx - pw / 2) * s) / aspect, y: -(fy - ph / 2) * s };
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

function BackgroundControls({ p, bg, keep, look, allowOwnBg, maskCount, onEdge, onBlur, onUndo, onClear, onChange }) {
  const brush = p.brush ?? { mode: "erase", size: 4 };
  const setBrush = (patch) => onChange({ brush: { ...brush, ...patch } });
  const canPaint = !keep || look.bgBlur > 0;
  return (
    <div className="space-y-4">
      {allowOwnBg ? (
        <Field label="Background for this photo">
          <div className="space-y-2">
            <BgPicker value={bg} onChange={(v) => onChange({ bg: v })} id={`bg-${p.id}`} />
            {p.bg != null ? (
              <button
                type="button"
                className="text-xs font-medium text-brand-700 hover:underline"
                onClick={() => onChange({ bg: null })}
              >
                Use the same background as the other photos
              </button>
            ) : null}
          </div>
        </Field>
      ) : null}
      {keep ? (
        <Slider label="Blur the original background" value={look.bgBlur} min={0} max={100} defaultValue={0} onChange={onBlur} />
      ) : null}
      {canPaint ? (
        <>
          {!keep ? (
            <Slider
              label="Tighter edges (removes a halo)"
              value={look.edge}
              min={0}
              max={100}
              defaultValue={0}
              onChange={onEdge}
            />
          ) : null}
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
            <Slider
              label="Brush size"
              value={brush.size}
              min={1}
              max={15}
              defaultValue={4}
              onChange={(size) => setBrush({ size })}
            />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={!maskCount} onClick={onUndo}>
                <Undo2 className="h-4 w-4" /> Undo
              </Button>
              <Button size="sm" variant="ghost" disabled={!maskCount} onClick={onClear}>
                Clear all marks
              </Button>
            </div>
            <p className="text-xs text-muted">
              <strong>Erase background</strong> removes leftover bits (a chair, a shadow, another person).{" "}
              <strong>Bring back</strong> restores hair, ears or shoulders that were cut away.
            </p>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted">The original background is kept, so there is nothing to clean up.</p>
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

function CompareButton({ compare, setCompare }) {
  return (
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
  );
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
      <CompareButton compare={compare} setCompare={setCompare} />
    </div>
  );
}

const brushLook = {
  erase: { fill: "rgba(220,38,38,0.45)", line: "#dc2626", label: "Erasing", Icon: Eraser },
  restore: { fill: "rgba(22,163,74,0.45)", line: "#16a34a", label: "Bringing back", Icon: Brush },
  heal: { fill: "rgba(59,92,240,0.35)", line: "#3b5cf0", label: "Spot healing", Icon: Sparkles },
  clone: { fill: "rgba(124,58,237,0.3)", line: "#7c3aed", label: "Clone stamp", Icon: Stamp },
  dodge: { fill: "rgba(250,204,21,0.35)", line: "#ca8a04", label: "Dodge (lighten)", Icon: Sun },
  burn: { fill: "rgba(120,53,15,0.35)", line: "#78350f", label: "Burn (darken)", Icon: Moon },
};

/** Paint erase / restore / spot-fix strokes directly on the framed photo. */
function BrushView({ p, source, original, edit, aspect, fill, disabled, onStroke, brush, marker, picking, onPick }) {
  const [boxRef, size] = useFrameSize(aspect);
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const stroke = useRef(null);
  const [compare, setCompare] = useState(false);
  const dpr = typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  const W = size.w * dpr;
  const H = size.h * dpr;
  const e = { ...defaultEdit, ...edit };
  const iw = srcW(source);
  const ih = srcH(source);
  const quarter = e.turn % 2 === 1;
  const s = Math.min(W / (quarter ? ih : iw), H / (quarter ? iw : ih)) * e.zoom; // display px per source px
  const toFull = p.portrait.width / iw; // source px → full portrait px
  // Brush size is a share of the frame width when not zoomed; zooming in makes the brush finer on the photo.
  const radiusDisplay = (brush.size / 100) * W;
  const look = brushLook[brush.mode] ?? brushLook.erase;

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const out = renderEdit(compare && original ? original : source, edit, W, H, { fit: "contain", background: fill });
    c.width = out.width;
    c.height = out.height;
    c.getContext("2d").drawImage(out, 0, 0);
    const o = overlayRef.current;
    o.width = out.width;
    o.height = out.height;
  }, [source, original, compare, edit, W, H, fill]);

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

  // Full-size portrait pixel → display point (forward of toPortrait).
  const toDisplay = ({ x, y }) => {
    let dx = (x / toFull - iw / 2) * s;
    const dy = (y / toFull - ih / 2) * s;
    if (e.flip) dx = -dx;
    const a = ((e.turn * 90 + e.rotate) * Math.PI) / 180;
    return {
      x: W / 2 + e.x * W + dx * Math.cos(a) - dy * Math.sin(a),
      y: H / 2 + e.y * H + dx * Math.sin(a) + dy * Math.cos(a),
    };
  };
  const drawMarker = (ctx) => {
    if (!marker) return;
    const m = toDisplay(marker);
    const r = 9 * dpr;
    ctx.save();
    ctx.strokeStyle = "#7c3aed";
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.arc(m.x, m.y, r * 0.6, 0, Math.PI * 2);
    ctx.moveTo(m.x - r, m.y);
    ctx.lineTo(m.x + r, m.y);
    ctx.moveTo(m.x, m.y - r);
    ctx.lineTo(m.x, m.y + r);
    ctx.stroke();
    ctx.restore();
  };
  useEffect(() => {
    const o = overlayRef.current;
    if (!o) return;
    const ctx = o.getContext("2d");
    ctx.clearRect(0, 0, o.width, o.height);
    drawMarker(ctx);
  });

  const drawDot = (pt, live) => {
    const ctx = overlayRef.current.getContext("2d");
    if (!live) {
      ctx.clearRect(0, 0, W, H);
      drawMarker(ctx);
    }
    ctx.fillStyle = look.fill;
    ctx.strokeStyle = look.line;
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, radiusDisplay, 0, Math.PI * 2);
    if (live) ctx.fill();
    else ctx.stroke();
  };

  const onDown = (ev) => {
    if (disabled) return;
    ev.preventDefault();
    if (brush.mode === "clone" && (ev.altKey || picking)) {
      // Alt+click (or "Pick source"): where the Clone stamp copies from.
      const q = toPortrait(local(ev));
      onPick?.({ x: Math.round(q.x), y: Math.round(q.y) });
      return;
    }
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
    <div className="space-y-2">
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
            className={cn(
              "absolute inset-0 touch-none",
              disabled ? "cursor-not-allowed" : brush.mode === "clone" && picking ? "cursor-copy" : "cursor-crosshair",
            )}
            aria-label={look.label}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onPointerLeave={() => {
              if (!stroke.current) overlayRef.current?.getContext("2d").clearRect(0, 0, W, H);
            }}
          />
          {!disabled ? (
            <span className="pointer-events-none absolute top-2 left-2 inline-flex items-center gap-1 rounded-md bg-white/90 px-2 py-1 text-[11px] font-medium text-ink-800 shadow-xs">
              <look.Icon className="h-3.5 w-3.5" />
              {brush.mode === "clone" && picking ? "Tap where to copy from" : look.label}
            </span>
          ) : null}
        </div>
      </div>
      {original ? <CompareButton compare={compare} setCompare={setCompare} /> : null}
    </div>
  );
}

/** Photoshop-style retouch brushes: Spot healing, Clone stamp, Dodge, Burn. */
function RetouchTools({ tool, setTool, size, setSize, strength, setStrength, clone, setClone, count, onUndo, onClear }) {
  return (
    <div className="space-y-3 rounded-lg bg-ink-50/60 p-3">
      <p className="text-xs font-medium text-ink-700">Brushes — paint on the photo</p>
      <Segmented size="sm" options={retouchTools} value={tool} onChange={setTool} />
      <Slider label="Brush size  [  ]" value={size} min={0.5} max={12} step={0.5} defaultValue={2} onChange={setSize} />
      {tool === "dodge" || tool === "burn" ? (
        <Slider
          label="Strength (exposure)"
          value={strength}
          min={5}
          max={100}
          defaultValue={30}
          unit="%"
          onChange={setStrength}
        />
      ) : null}
      {tool === "clone" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={clone.picking || !clone.src ? "accent" : "outline"}
            onClick={() => setClone((c) => ({ ...c, picking: true }))}
          >
            <Crosshair className="h-4 w-4" /> {clone.src ? "Pick a new source" : "Pick source"}
          </Button>
          <span className="text-xs text-muted">
            {clone.src
              ? "Now paint where it should be copied to."
              : "Alt+click (or tap after Pick source) on clean skin to copy from."}
          </span>
        </div>
      ) : null}
      <p className="text-xs text-muted">
        {tool === "heal"
          ? "Tap a spot, mark or stray hair — it is filled from the skin around it."
          : tool === "clone"
            ? "Copies the source area exactly, like Photoshop's Clone Stamp (aligned)."
            : tool === "dodge"
              ? "Lightens where you paint — dark patches, shadows on one side of the face."
              : "Darkens where you paint — shiny or too bright patches, outlines."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={!count} onClick={onUndo}>
          <Undo2 className="h-4 w-4" /> Undo last brush
        </Button>
        <Button size="sm" variant="ghost" disabled={!count} onClick={onClear}>
          Clear all brush marks
        </Button>
      </div>
    </div>
  );
}