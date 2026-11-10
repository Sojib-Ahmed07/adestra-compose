// src/components/photo/bg-picker.jsx
"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const bgColours = [
  { value: "#ffffff", label: "White" },
  { value: "#f3f2ee", label: "Off-white" },
  { value: "#dde1e6", label: "Light grey" },
  { value: "#cfe2f6", label: "Light blue" },
  { value: "#5b9bd5", label: "Sky blue" },
  { value: "#1f4fa0", label: "Blue" },
  { value: "#c0272d", label: "Red" },
];

/** "keep" = the photo's own background. */
export const KEEP = "keep";

/**
 * Background colour swatches + any colour + (optionally) keep the original background.
 * @param {{ value: string, onChange: (v: string) => void, allowKeep?: boolean, id?: string }} props
 */
export function BgPicker({ value, onChange, allowKeep = true, id = "bg" }) {
  const custom = value !== KEEP && !bgColours.some((c) => c.value === value);
  return (
    <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Background">
      {bgColours.map((c) => (
        <button
          key={c.value}
          type="button"
          role="radio"
          aria-checked={value === c.value}
          title={c.label}
          aria-label={c.label}
          onClick={() => onChange(c.value)}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full border border-line-strong shadow-xs transition",
            value === c.value && "ring-2 ring-brand-500 ring-offset-2",
          )}
          style={{ background: c.value }}
        >
          {value === c.value ? (
            <Check className={cn("h-4 w-4", isDark(c.value) ? "text-white" : "text-ink-900")} />
          ) : null}
        </button>
      ))}
      <label
        title="Any colour"
        className={cn(
          "relative flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-line-strong px-3 text-xs font-medium text-ink-700",
          custom && "ring-2 ring-brand-500 ring-offset-2",
        )}
      >
        <span className="h-4 w-4 rounded-full border border-line-strong" style={{ background: custom ? value : "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)" }} />
        Other
        <input
          id={`${id}-custom`}
          type="color"
          value={custom ? value : "#88aadd"}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      {allowKeep ? (
        <button
          type="button"
          role="radio"
          aria-checked={value === KEEP}
          onClick={() => onChange(KEEP)}
          className={cn(
            "h-9 rounded-full border border-line-strong px-3 text-xs font-medium text-ink-700 hover:bg-ink-50",
            value === KEEP && "border-brand-300 bg-brand-50 text-brand-700 ring-2 ring-brand-500 ring-offset-2",
          )}
        >
          Keep original
        </button>
      ) : null}
    </div>
  );
}

function isDark(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 140;
}
