// src/components/ui/form.jsx
"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const control =
  "rounded-[10px] border border-line-strong bg-white px-3 text-sm text-ink-900 placeholder:text-subtle " +
  "focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-ink-50 disabled:text-subtle";

/** Full width unless the caller sets its own width class. */
const width = (className) => (/(^|\s)(w-|min-w-|max-w-|flex-1)/.test(className || "") ? "" : "w-full");

export function Input({ className, ...props }) {
  return <input className={cn(control, "h-10", width(className), className)} {...props} />;
}

export function Textarea({ className, ...props }) {
  return <textarea className={cn(control, "min-h-24 py-2", width(className), className)} {...props} />;
}

export function Select({ className, children, ...props }) {
  return (
    <select className={cn(control, "h-10 pr-8", width(className), className)} {...props}>
      {children}
    </select>
  );
}

export function Label({ className, ...props }) {
  return <label className={cn("block text-[13px] font-medium text-ink-800", className)} {...props} />;
}

/** Label + control + hint/error, stacked. */
export function Field({ label, htmlFor, hint, error, className, children }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? <Label htmlFor={htmlFor}>{label}</Label> : null}
      {children}
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

export function Checkbox({ label, className, ...props }) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2 text-sm text-ink-800", className)}>
      <input type="checkbox" className="h-4 w-4 rounded border-line-strong accent-brand-500" {...props} />
      {label}
    </label>
  );
}

/**
 * Number box that lets you type freely and only clamps when you leave it (or press Enter).
 * @param {{ value: number, onChange: (n: number) => void, min: number, max: number, integer?: boolean }} props
 */
export function NumberInput({ value, onChange, min, max, integer = false, className, ...props }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    let n = Number(text);
    if (!Number.isFinite(n) || text.trim() === "") n = value;
    n = Math.min(max, Math.max(min, integer ? Math.round(n) : n));
    setText(String(n));
    if (n !== value) onChange(n);
  };
  return (
    <Input
      inputMode="decimal"
      value={text}
      className={className}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value.trim() !== "" && Number.isFinite(n) && n >= min && n <= max) onChange(integer ? Math.round(n) : n);
      }}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
      {...props}
    />
  );
}
