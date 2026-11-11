// src/components/photo/card-slot.jsx
"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Crop, Maximize, RefreshCw, RotateCw, Trash2 } from "lucide-react";
import { findCardCorners, warpQuad } from "@/lib/photo/card";
import { defaultEdit, loadImage, makeCanvas, srcH, srcW } from "@/lib/photo/image";
import { Button } from "@/components/ui/button";
import { FileDrop } from "@/components/ui/file-drop";
import { useToast } from "@/components/ui/interactive";

let nextId = 1;

/**
 * Build a card value from a loaded photo and 4 corners (TL, TR, BR, BL) — also used for "both sides in one photo".
 * @param {{ img: any, url: string }} photo  from loadImage()
 */
export function cardValue(photo, corners, aspect, outWidth = 1600, found = true) {
  const outH = Math.round(outWidth / aspect);
  const card = warpQuad(photo.img, corners, outWidth, outH);
  return { image: { img: card, url: `card-${nextId++}` }, edit: { ...defaultEdit }, src: { photo, corners, found } };
}

/**
 * One side of a card: drop a scan or a phone photo → the card is found, flattened and straightened.
 * Value = { image: { img: canvas, url: string }, edit, src: { photo, corners, found } } | null — the same shape PhotoSlot
 * gives (plus `src`, the original photo and corners, for "Fix corners"), so the print code doesn't care which was used.
 * `url` is only an id here.
 * @param {{ title: string, value: any, onChange: (v: any) => void, aspect: number, outWidth?: number, hint?: string }} props
 */
export function CardSlot({ title, value, onChange, aspect, outWidth = 1600, hint }) {
  const toast = useToast();
  const changeId = useId();
  const [pending, setPending] = useState(null); // { photo, corners, found } while the corners are being placed
  const [editing, setEditing] = useState(false);
  const src = pending ?? value?.src ?? null;

  const apply = (photo, q, found = true) => {
    onChange(cardValue(photo, q, aspect, outWidth, found));
    setPending(null);
    setEditing(false);
  };

  const take = async (files) => {
    try {
      const photo = await loadImage(files[0]);
      const guess = findCardCorners(photo.img);
      if (guess.found) apply(photo, guess.corners);
      else {
        onChange(null);
        setPending({ photo, corners: guess.corners, found: false });
        setEditing(true);
      }
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const clear = () => {
    setPending(null);
    setEditing(false);
    onChange(null);
  };

  const turn = () => {
    const img = value.image.img;
    const c = makeCanvas(img.width, img.height);
    const ctx = c.getContext("2d");
    ctx.translate(c.width, c.height);
    ctx.rotate(Math.PI);
    ctx.drawImage(img, 0, 0);
    onChange({ ...value, image: { img: c, url: `card-${nextId++}` } });
  };

  if (!src && !value) {
    return (
      <FileDrop
        onFiles={take}
        title={title}
        hint={hint ?? "A scan, or a phone photo of the card on a table — it is straightened automatically"}
        listenPaste={false}
      />
    );
  }

  const setCorners = (corners) => {
    if (pending) setPending({ ...pending, corners });
    else setPending({ ...value.src, corners });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-medium text-ink-900">{title}</p>
        <div className="flex shrink-0 gap-1">
          <label
            htmlFor={changeId}
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-ink-700 hover:bg-ink-50"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Change
            <input
              id={changeId}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                if (e.target.files?.length) take([...e.target.files]);
                e.target.value = "";
              }}
            />
          </label>
          <button
            type="button"
            onClick={clear}
            className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted hover:bg-danger-50 hover:text-danger"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </button>
        </div>
      </div>

      {editing && src ? (
        <div className="space-y-3">
          <p className={src.found ? "text-sm text-muted" : "text-sm text-warn"}>
            {src.found
              ? "Drag the 4 dots onto the card's corners if they're not exact."
              : "Couldn't find the card's edges by itself. Drag the 4 dots onto the card's corners."}
          </p>
          <CornerEditor img={src.photo.img} url={src.photo.url} corners={src.corners} onChange={setCorners} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="accent" onClick={() => apply(src.photo, src.corners)}>
              <Crop className="h-4 w-4" /> Straighten card
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const W = srcW(src.photo.img);
                const H = srcH(src.photo.img);
                apply(src.photo, [
                  { x: 0, y: 0 },
                  { x: W, y: 0 },
                  { x: W, y: H },
                  { x: 0, y: H },
                ]);
              }}
            >
              <Maximize className="h-4 w-4" /> Already cropped — use whole picture
            </Button>
            {value ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setPending(null);
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        </div>
      ) : value ? (
        <div className="space-y-2">
          <CanvasView canvas={value.image.img} label={`${title} — straightened`} />
          <div className="flex flex-wrap gap-1.5">
            {value.src ? (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Crop className="h-4 w-4" /> Fix corners
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={turn}>
              <RotateCw className="h-4 w-4" /> Upside down? Turn
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CanvasView({ canvas, label }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const s = Math.min(1, 800 / canvas.width);
    c.width = Math.round(canvas.width * s);
    c.height = Math.round(canvas.height * s);
    const ctx = c.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(canvas, 0, 0, c.width, c.height);
  }, [canvas]);
  return (
    <canvas ref={ref} aria-label={label} className="w-full rounded-lg bg-white shadow-[0_0_0_1px_var(--color-line-strong)]" />
  );
}

/** Photo with 4 draggable corner dots (works with mouse and touch). */
function CornerEditor({ img, url, corners, onChange }) {
  const svgRef = useRef(null);
  const drag = useRef(null);
  const W = srcW(img);
  const H = srcH(img);
  const r = Math.max(W, H) * 0.018;

  const toImage = (ev) => {
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: Math.min(W, Math.max(0, ((ev.clientX - rect.left) / rect.width) * W)),
      y: Math.min(H, Math.max(0, ((ev.clientY - rect.top) / rect.height) * H)),
    };
  };
  const onDown = (i) => (ev) => {
    ev.preventDefault();
    svgRef.current.setPointerCapture(ev.pointerId);
    drag.current = i;
  };
  const onMove = (ev) => {
    if (drag.current == null) return;
    const p = toImage(ev);
    onChange(corners.map((c, j) => (j === drag.current ? p : c)));
  };
  const onUp = () => {
    drag.current = null;
  };

  return (
    <div
      className="relative mx-auto w-full overflow-hidden rounded-lg bg-ink-900"
      style={{ aspectRatio: `${W} / ${H}`, maxWidth: `${(420 * W) / H}px` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="block h-full w-full" />
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full touch-none"
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <polygon
          points={corners.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="rgba(59,92,240,0.15)"
          stroke="#3b5cf0"
          strokeWidth={r * 0.3}
        />
        {corners.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={r}
            fill="#fff"
            stroke="#3b5cf0"
            strokeWidth={r * 0.35}
            className="cursor-grab"
            onPointerDown={onDown(i)}
            aria-label={`Corner ${i + 1}`}
          />
        ))}
      </svg>
    </div>
  );
}