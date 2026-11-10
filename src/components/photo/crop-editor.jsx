// src/components/photo/crop-editor.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FlipHorizontal2, RotateCcw, RotateCw, ZoomIn } from "lucide-react";
import { defaultEdit, previewSource, renderEdit } from "@/lib/photo/image";
import { clamp, cn } from "@/lib/utils";
import { Slider } from "@/components/ui/interactive";

/**
 * Interactive crop: drag to move, mouse wheel to zoom, sliders to straighten and adjust colour.
 * What you see is exactly what gets printed (same renderEdit function at full size).
 *
 * @param {{ img: HTMLImageElement, edit: import("@/lib/photo/image").Edit, onChange: (e: any) => void,
 *   aspect: number, guide?: "face" | "none", fit?: "cover" | "contain", maxHeight?: number,
 *   showColour?: boolean, background?: string, className?: string }} props
 * `background` fills the frame behind the photo (for cut-out photos and zoomed-out "contain" crops).
 */
export function CropEditor({
  img,
  edit,
  onChange,
  aspect,
  guide = "none",
  fit = "cover",
  maxHeight = 420,
  showColour = true,
  background = "#ffffff",
  className,
}) {
  const boxRef = useRef(null);
  const canvasRef = useRef(null);
  const [box, setBox] = useState({ w: 300, h: 300 });
  const [showGuide, setShowGuide] = useState(guide !== "none");
  const source = useMemo(() => previewSource(img), [img]);
  const e = { ...defaultEdit, ...edit };
  const editRef = useRef(e);
  editRef.current = e;
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  // Preview size: as large as the column allows, within maxHeight, keeping the frame's aspect.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const availW = entry.contentRect.width;
      let w = availW;
      let h = w / aspect;
      if (h > maxHeight) {
        h = maxHeight;
        w = h * aspect;
      }
      setBox({ w: Math.floor(w), h: Math.floor(h) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect, maxHeight]);

  // Draw the preview.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const out = renderEdit(source, e, box.w * dpr, box.h * dpr, { fit, background });
    c.width = out.width;
    c.height = out.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(out, 0, 0);
    if (showGuide && guide === "face") {
      const W = c.width;
      const H = c.height;
      ctx.save();
      ctx.strokeStyle = "rgba(59, 92, 240, 0.85)";
      ctx.setLineDash([6 * dpr, 5 * dpr]);
      ctx.lineWidth = 1.5 * dpr;
      // Head from ~10% to ~72% of the height, centred.
      ctx.beginPath();
      ctx.ellipse(W / 2, H * 0.41, W * 0.27, H * 0.31, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(W / 2, 0);
      ctx.lineTo(W / 2, H);
      ctx.moveTo(W * 0.2, H * 0.38);
      ctx.lineTo(W * 0.8, H * 0.38);
      ctx.stroke();
      ctx.restore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    source,
    box.w,
    box.h,
    fit,
    background,
    showGuide,
    guide,
    e.zoom,
    e.x,
    e.y,
    e.rotate,
    e.turn,
    e.flip,
    e.brightness,
    e.contrast,
    e.saturation,
  ]);

  // Mouse-wheel zoom (needs a non-passive listener to stop the page scrolling).
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const onWheel = (ev) => {
      ev.preventDefault();
      const cur = editRef.current;
      const zoom = clamp(cur.zoom * (ev.deltaY < 0 ? 1.06 : 1 / 1.06), fit === "contain" ? 0.2 : 1, 6);
      changeRef.current({ ...cur, zoom });
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => c.removeEventListener("wheel", onWheel);
  }, [fit]);

  // Drag to move.
  const drag = useRef(null);
  const onPointerDown = (ev) => {
    ev.currentTarget.setPointerCapture(ev.pointerId);
    drag.current = { x: ev.clientX, y: ev.clientY, startX: e.x, startY: e.y };
  };
  const onPointerMove = (ev) => {
    if (!drag.current) return;
    const d = drag.current;
    onChange({
      ...e,
      x: clamp(d.startX + (ev.clientX - d.x) / box.w, -1.5, 1.5),
      y: clamp(d.startY + (ev.clientY - d.y) / box.h, -1.5, 1.5),
    });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  // Arrow keys nudge.
  const onKeyDown = (ev) => {
    const step = ev.shiftKey ? 0.02 : 0.004;
    const map = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = map[ev.key];
    if (!m) return;
    ev.preventDefault();
    onChange({ ...e, x: e.x + m[0], y: e.y + m[1] });
  };

  const set = (k) => (v) => onChange({ ...e, [k]: v });

  return (
    <div className={cn("space-y-4", className)}>
      <div ref={boxRef} className="flex w-full justify-center">
        <canvas
          ref={canvasRef}
          tabIndex={0}
          aria-label="Photo crop. Drag to move, scroll to zoom, arrow keys to nudge."
          style={{ width: box.w, height: box.h }}
          className="cursor-move touch-none rounded-md bg-white shadow-[0_0_0_1px_var(--color-line-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
        />
      </div>

      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <IconButton label="Rotate left" onClick={() => onChange({ ...e, turn: (e.turn + 3) % 4 })}>
          <RotateCcw className="h-4 w-4" />
        </IconButton>
        <IconButton label="Rotate right" onClick={() => onChange({ ...e, turn: (e.turn + 1) % 4 })}>
          <RotateCw className="h-4 w-4" />
        </IconButton>
        <IconButton label="Mirror" active={e.flip} onClick={() => onChange({ ...e, flip: !e.flip })}>
          <FlipHorizontal2 className="h-4 w-4" />
        </IconButton>
        <IconButton label="Fit / reset position" onClick={() => onChange({ ...e, zoom: 1, x: 0, y: 0, rotate: 0 })}>
          <ZoomIn className="h-4 w-4" />
        </IconButton>
        {guide === "face" ? (
          <button
            type="button"
            onClick={() => setShowGuide((s) => !s)}
            className={cn(
              "h-8 rounded-lg px-2.5 text-xs font-medium",
              showGuide ? "bg-brand-50 text-brand-700" : "text-muted hover:bg-ink-50",
            )}
          >
            Face guide {showGuide ? "on" : "off"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onChange({ ...defaultEdit })}
          className="h-8 rounded-lg px-2.5 text-xs font-medium text-muted hover:bg-ink-50"
        >
          Reset all
        </button>
      </div>

      <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
        <Slider
          label="Zoom"
          value={e.zoom}
          min={fit === "contain" ? 0.2 : 1}
          max={6}
          step={0.01}
          onChange={set("zoom")}
          defaultValue={1}
          unit="×"
        />
        <Slider
          label="Straighten"
          value={e.rotate}
          min={-30}
          max={30}
          step={0.5}
          onChange={set("rotate")}
          defaultValue={0}
          unit="°"
        />
        {showColour ? (
          <>
            <Slider
              label="Brightness"
              value={e.brightness}
              min={40}
              max={180}
              onChange={set("brightness")}
              defaultValue={100}
              unit="%"
            />
            <Slider
              label="Contrast"
              value={e.contrast}
              min={40}
              max={180}
              onChange={set("contrast")}
              defaultValue={100}
              unit="%"
            />
            <Slider
              label="Colour"
              value={e.saturation}
              min={0}
              max={200}
              onChange={set("saturation")}
              defaultValue={100}
              unit="%"
            />
          </>
        ) : null}
      </div>
      <p className="text-center text-xs text-subtle">
        Drag the photo to move it · scroll to zoom · click a slider name to reset it
      </p>
    </div>
  );
}

function IconButton({ label, onClick, active, children }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink-700 hover:bg-ink-50",
        active && "border-brand-300 bg-brand-50 text-brand-700",
      )}
    >
      {children}
    </button>
  );
}
