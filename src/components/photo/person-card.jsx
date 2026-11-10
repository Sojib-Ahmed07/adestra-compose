// src/components/photo/person-card.jsx
"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Hand, Loader2, RefreshCw, SlidersHorizontal, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { stepText } from "./use-portraits";

/**
 * One photo in an automatic photo list: preview (or the original while working), status, warnings and actions.
 * `preview` returns a canvas of the finished photo; it is redrawn when `previewKey` changes.
 */
export function PersonCard({ p, preview, previewKey, active, onAdjust, onRemove, onRetry, onManual, onMove }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !preview) return;
    const out = preview();
    c.width = out.width;
    c.height = out.height;
    c.getContext("2d").drawImage(out, 0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey]);

  const working = p.status in stepText;
  return (
    <li
      className={cn(
        "flex gap-3 rounded-xl border bg-white p-2.5",
        active ? "border-brand-300 bg-brand-50/50" : "border-line",
        p.status === "error" && "border-danger/40",
      )}
    >
      <div className="relative h-24 w-[4.75rem] shrink-0 overflow-hidden rounded-md bg-ink-50">
        {preview ? (
          <button type="button" onClick={onAdjust} className="h-full w-full" title="Edit this photo">
            <canvas ref={ref} className="h-full w-full object-contain" aria-label={`${p.name} ready — click to edit`} />
          </button>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.image.url} alt="" className={cn("h-full w-full object-cover", working && "opacity-60")} />
        )}
        {working ? (
          <span className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-white drop-shadow" />
          </span>
        ) : null}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="truncate text-sm font-medium text-ink-900" title={p.name}>
          {p.name}
        </p>
        {working ? <p className="text-xs text-brand-700">{stepText[p.status]}</p> : null}
        {p.status === "done" ? <p className="text-xs text-success">Ready</p> : null}
        {p.manual ? <p className="text-xs text-muted">Cropped by hand</p> : null}
        {p.status === "error" ? <p className="text-xs text-danger">{p.error}</p> : null}
        {p.warnings?.map((w) => (
          <p key={w} className="flex gap-1 text-xs text-warn">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" /> {w}
          </p>
        ))}
        <div className="flex flex-wrap gap-1">
          {p.status === "done" || p.manual ? (
            <SmallButton onClick={onAdjust}>
              <SlidersHorizontal className="h-3.5 w-3.5" /> Edit
            </SmallButton>
          ) : null}
          {p.status === "error" ? (
            <>
              <SmallButton onClick={onRetry}>
                <RefreshCw className="h-3.5 w-3.5" /> Try again
              </SmallButton>
              <SmallButton onClick={onManual}>
                <Hand className="h-3.5 w-3.5" /> Crop by hand
              </SmallButton>
            </>
          ) : null}
          {onMove ? (
            <>
              <SmallButton onClick={() => onMove(-1)} label="Move left">
                <ArrowLeft className="h-3.5 w-3.5" />
              </SmallButton>
              <SmallButton onClick={() => onMove(1)} label="Move right">
                <ArrowRight className="h-3.5 w-3.5" />
              </SmallButton>
            </>
          ) : null}
          <SmallButton onClick={onRemove} danger>
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </SmallButton>
        </div>
      </div>
    </li>
  );
}

function SmallButton({ onClick, danger, label, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium",
        danger ? "text-muted hover:bg-danger-50 hover:text-danger" : "text-ink-700 hover:bg-ink-50",
      )}
    >
      {children}
    </button>
  );
}
