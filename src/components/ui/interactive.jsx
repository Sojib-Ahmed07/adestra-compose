// src/components/ui/interactive.jsx
"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CheckCircle2, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/** Pill switcher: options = [{ value, label }] */
export function Segmented({ options, value, onChange, className, size = "md" }) {
  return (
    <div className={cn("inline-flex flex-wrap gap-1 rounded-[10px] bg-ink-50 p-1", className)} role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-lg font-medium transition-colors",
            size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-[13px]",
            value === o.value ? "bg-white text-ink-900 shadow-sm" : "text-muted hover:text-ink-900",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Labelled range slider. Double-click the label to reset. */
export function Slider({ label, value, onChange, min, max, step = 1, unit = "", defaultValue, digits }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          className="font-medium text-ink-700 hover:text-ink-900"
          title={defaultValue !== undefined ? "Click to reset" : undefined}
          onClick={() => defaultValue !== undefined && onChange(defaultValue)}
        >
          {label}
        </button>
        <span className="tabular text-muted">
          {digits != null ? value.toFixed(digits) : Number.isInteger(step) ? value : value.toFixed(1)}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </div>
  );
}

/** − [n] + */
export function Stepper({ value, onChange, min = 0, max = 999, step = 1, className, label }) {
  const set = (n) => onChange(Math.min(max, Math.max(min, n)));
  return (
    <div
      className={cn(
        "inline-flex h-10 items-stretch overflow-hidden rounded-[10px] border border-line-strong bg-white",
        className,
      )}
    >
      <button
        type="button"
        aria-label={`Less ${label || ""}`}
        className="w-9 text-lg text-ink-700 hover:bg-ink-50"
        onClick={() => set(value - step)}
      >
        −
      </button>
      <input
        aria-label={label}
        inputMode="decimal"
        className="tabular w-14 border-x border-line text-center text-sm focus:outline-none"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) set(n);
        }}
      />
      <button
        type="button"
        aria-label={`More ${label || ""}`}
        className="w-9 text-lg text-ink-700 hover:bg-ink-50"
        onClick={() => set(value + step)}
      >
        +
      </button>
    </div>
  );
}

// ---------- Toasts ----------

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);
  const remove = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const show = useCallback(
    (message, tone = "success") => {
      const id = ++idRef.current;
      setToasts((t) => [...t.slice(-3), { id, message, tone }]);
      setTimeout(() => remove(id), tone === "error" ? 6000 : 3500);
    },
    [remove],
  );
  return (
    <ToastContext value={show}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex max-w-md items-start gap-2 rounded-xl bg-ink-900 px-4 py-3 text-sm text-white shadow-[var(--shadow-float)]"
          >
            {t.tone === "error" ? (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-300" />
            )}
            <span>{t.message}</span>
            <button type="button" aria-label="Close" onClick={() => remove(t.id)} className="ml-1 text-ink-300 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext>
  );
}

/** const toast = useToast(); toast("Saved"); toast("Failed", "error"); */
export function useToast() {
  const show = useContext(ToastContext);
  return show ?? ((m) => console.log(m));
}

// ---------- Modal ----------

export function Modal({ open, onClose, title, children, footer, className }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cn(
        "m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl p-0 shadow-[var(--shadow-float)] backdrop:bg-ink-950/40",
        className,
      )}
    >
      {open ? (
        <div>
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="text-[15px] font-semibold">{title}</h2>
            <button type="button" aria-label="Close" onClick={onClose} className="text-subtle hover:text-ink-900">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="px-5 py-4">{children}</div>
          {footer ? <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div> : null}
        </div>
      ) : null}
    </dialog>
  );
}