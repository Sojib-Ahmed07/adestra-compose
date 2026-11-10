// src/components/ui/button.jsx
import Link from "next/link";
import { cn } from "@/lib/utils";

const variants = {
  primary: "bg-ink-900 text-white hover:bg-ink-800 disabled:bg-ink-300",
  accent: "bg-brand-500 text-white hover:bg-brand-600 disabled:bg-brand-200",
  outline: "border border-line-strong bg-white text-ink-900 hover:bg-ink-50 disabled:text-ink-300",
  ghost: "text-ink-700 hover:bg-ink-50 disabled:text-ink-300",
  subtle: "bg-ink-50 text-ink-800 hover:bg-ink-100 disabled:text-ink-300",
  danger: "bg-danger text-white hover:bg-red-700 disabled:bg-red-200",
};

const sizes = {
  sm: "h-8 gap-1.5 rounded-lg px-3 text-[13px]",
  md: "h-10 gap-2 rounded-[10px] px-4 text-sm",
  lg: "h-12 gap-2 rounded-xl px-5 text-[15px]",
  icon: "h-9 w-9 rounded-[10px]",
};

/** Class string for anything that should look like a button. */
export function buttonClass({ variant = "primary", size = "md", className } = {}) {
  return cn(
    "inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors select-none",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400 disabled:cursor-not-allowed",
    variants[variant],
    sizes[size],
    className,
  );
}

export function Button({ variant, size, className, type = "button", ...props }) {
  return <button type={type} className={buttonClass({ variant, size, className })} {...props} />;
}

export function ButtonLink({ variant, size, className, ...props }) {
  return <Link className={buttonClass({ variant, size, className })} {...props} />;
}
