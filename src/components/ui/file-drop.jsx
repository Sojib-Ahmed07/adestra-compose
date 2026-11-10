// src/components/ui/file-drop.jsx
"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ImageUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Click, drag-and-drop or paste (Ctrl+V) files.
 * @param {{ onFiles: (files: File[]) => void, accept?: string, multiple?: boolean, title?: string,
 *   hint?: string, listenPaste?: boolean, compact?: boolean, className?: string }} props
 */
export function FileDrop({
  onFiles,
  accept = "image/*",
  multiple = false,
  title = "Choose a photo",
  hint = "Drag a file here, click to browse, or paste with Ctrl+V",
  listenPaste = true,
  compact = false,
  className,
}) {
  const inputId = useId();
  const [over, setOver] = useState(false);
  const cb = useRef(onFiles);
  cb.current = onFiles;

  const accepts = (file) => {
    if (accept === "*") return true;
    return accept.split(",").some((a) => {
      a = a.trim();
      if (a.endsWith("/*")) return file.type.startsWith(a.slice(0, -1));
      if (a.startsWith(".")) return file.name.toLowerCase().endsWith(a);
      return file.type === a;
    });
  };

  const take = (list) => {
    const files = [...(list || [])].filter(accepts);
    if (files.length) cb.current(multiple ? files : [files[0]]);
  };

  useEffect(() => {
    if (!listenPaste) return;
    const onPaste = (e) => {
      const t = e.target;
      if (t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const files = [...(e.clipboardData?.files || [])];
      if (files.length) {
        e.preventDefault();
        take(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listenPaste, multiple, accept]);

  return (
    <label
      htmlFor={inputId}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        take(e.dataTransfer.files);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center rounded-[var(--radius-card)] border-2 border-dashed text-center transition-colors",
        compact ? "gap-1 px-3 py-4" : "gap-2 px-6 py-10",
        over ? "border-brand-400 bg-brand-50" : "border-line-strong bg-white hover:border-brand-300 hover:bg-brand-50/40",
        className,
      )}
    >
      <ImageUp className={cn("text-brand-500", compact ? "h-5 w-5" : "h-8 w-8")} />
      <span className={cn("font-medium text-ink-900", compact ? "text-[13px]" : "text-sm")}>{title}</span>
      {hint ? <span className="text-xs text-subtle">{hint}</span> : null}
      <input
        id={inputId}
        type="file"
        accept={accept === "*" ? undefined : accept}
        multiple={multiple}
        className="sr-only"
        onChange={(e) => {
          take(e.target.files);
          e.target.value = "";
        }}
      />
    </label>
  );
}
