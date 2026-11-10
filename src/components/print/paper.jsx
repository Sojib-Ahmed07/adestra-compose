// src/components/print/paper.jsx
import { cn } from "@/lib/utils";

export const receiptSizes = { 80: "80mm roll", 58: "58mm roll", a5: "A5", a4: "A4" };

const papers = {
  58: { page: "58mm auto", width: "58mm", pad: "3mm", text: "text-[10.5px]" },
  80: { page: "80mm auto", width: "80mm", pad: "4mm", text: "text-[12px]" },
  a5: { page: "A5", width: "148mm", pad: "10mm", text: "text-[13px]" },
  a4: { page: "A4", width: "210mm", pad: "14mm", text: "text-[14px]" },
};

/** A sheet of paper at real size on screen; prints at that size. */
export function Paper({ size = "a4", children, className }) {
  const p = papers[size] ?? papers.a4;
  return (
    <>
      <style>{`@page { size: ${p.page}; margin: 0; } @media print { html, body { background: #fff; } }`}</style>
      <div
        className={cn(
          "mx-auto my-6 bg-white text-ink-950 shadow-[var(--shadow-float)] print:my-0 print:shadow-none",
          p.text,
          className,
        )}
        style={{ width: p.width, padding: p.pad, minHeight: size === "a4" ? "297mm" : size === "a5" ? "210mm" : undefined }}
      >
        {children}
      </div>
    </>
  );
}

/** Shop name and contact lines at the top of a printout. */
export function ShopHeading({ shop, compact }) {
  return (
    <div className={cn("text-center", compact ? "mb-2" : "mb-4")}>
      <p className={cn("font-bold", compact ? "text-[1.25em]" : "text-[1.6em]")}>{shop.name}</p>
      {shop.tagline ? <p className="text-[0.9em]">{shop.tagline}</p> : null}
      {shop.address ? <p className="text-[0.85em]">{shop.address}</p> : null}
      {shop.phone || shop.email ? <p className="text-[0.85em]">{[shop.phone, shop.email].filter(Boolean).join(" · ")}</p> : null}
    </div>
  );
}
