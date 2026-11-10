// src/components/print/print-bar.jsx
"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Printer, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Toolbar shown above a printable page (hidden when printing). Optional size switch (?size=…).
 * ?auto=1 opens the print dialog straight away.
 */
export function PrintBar({ sizes, size }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  useEffect(() => {
    if (params.get("auto") === "1") {
      const t = setTimeout(() => window.print(), 350);
      return () => clearTimeout(t);
    }
  }, [params]);

  const go = (s) => {
    const next = new URLSearchParams(params.toString());
    next.set("size", s);
    next.delete("auto");
    router.replace(`${pathname}?${next}`);
  };

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-line bg-white px-4 py-3 print:hidden">
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex h-9 items-center gap-2 rounded-[10px] bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"
      >
        <Printer className="h-4 w-4" /> Print
      </button>
      {sizes ? (
        <div className="inline-flex gap-1 rounded-[10px] bg-ink-50 p-1">
          {Object.entries(sizes).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => go(k)}
              className={cn(
                "rounded-lg px-3 py-1 text-xs font-medium",
                size === k ? "bg-white shadow-sm" : "text-muted hover:text-ink-900",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
      <span className="text-xs text-subtle">Tip: in the print dialog turn off “Headers and footers”.</span>
      <button
        type="button"
        onClick={() => window.close()}
        className="ml-auto inline-flex h-9 items-center gap-1 rounded-[10px] px-3 text-sm text-muted hover:bg-ink-50"
        aria-label="Close"
      >
        <X className="h-4 w-4" /> Close
      </button>
    </div>
  );
}
