// src/components/ui/misc.jsx
import { cn } from "@/lib/utils";

export function Card({ className, ...props }) {
  return (
    <div
      className={cn("rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-lift)]", className)}
      {...props}
    />
  );
}

export function CardHeader({ title, description, action, className }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 border-b border-line px-5 py-4", className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-ink-900">{title}</h2>
        {description ? <p className="mt-0.5 text-[13px] text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

const tones = {
  neutral: "bg-ink-50 text-ink-700 ring-ink-100",
  brand: "bg-brand-50 text-brand-700 ring-brand-100",
  success: "bg-success-50 text-success ring-green-100",
  warn: "bg-warn-50 text-warn ring-amber-100",
  danger: "bg-danger-50 text-danger ring-red-100",
};

export function Badge({ tone = "neutral", className, ...props }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

/** Page title row used at the top of every page. */
export function PageHeader({ title, bangla, description, action }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-ink-900 sm:text-2xl">
          {title}
          {bangla ? <span className="ml-2 font-bangla text-base font-medium text-muted sm:text-lg">{bangla}</span> : null}
        </h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** Small numbered heading for steps inside a tool panel. */
export function Step({ n, title, children, className }) {
  return (
    <section className={cn("space-y-3", className)}>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink-900 text-[11px] text-white">{n}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}
