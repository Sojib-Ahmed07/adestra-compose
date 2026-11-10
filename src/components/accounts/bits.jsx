// src/components/accounts/bits.jsx
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Search, UserPlus, X } from "lucide-react";
import { parseMoney, rangePresets, taka } from "@/lib/accounts";
import { cn } from "@/lib/utils";
import { findParties } from "@/server/actions/accounts";
import { Input, Select } from "@/components/ui/form";
import { Badge } from "@/components/ui/misc";

/**
 * Money box: accepts "1,250", "১২৫০", "৳500". onChange gets the number (NaN while invalid).
 * @param {{ value: number, onChange: (n: number) => void, id?: string, className?: string, invalid?: boolean }} props
 */
export function MoneyInput({ value, onChange, id, className, invalid, ...props }) {
  const [text, setText] = useState(value ? String(value) : "");
  const last = useRef(value);
  // Follow outside changes (e.g. "paid = total" button) without fighting the user's typing.
  useEffect(() => {
    if (value !== last.current) {
      setText(value ? String(value) : "");
      last.current = value;
    }
  }, [value]);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-subtle">৳</span>
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        value={text}
        aria-invalid={invalid || Number.isNaN(parseMoney(text)) || undefined}
        onChange={(e) => {
          setText(e.target.value);
          const v = parseMoney(e.target.value);
          last.current = v;
          onChange(v);
        }}
        className={cn("tabular pl-7", (invalid || Number.isNaN(parseMoney(text))) && "border-danger", className)}
        {...props}
      />
    </div>
  );
}

/**
 * Choose an existing customer/supplier or type a new one.
 * value: { party: {...} } | { newParty: { name, phone } } | null
 */
export function PartyPicker({ kind, value, onChange, error, label }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [phone, setPhone] = useState("");
  const [, start] = useTransition();
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => start(async () => setResults(await findParties(q, kind))), 200);
    return () => clearTimeout(t);
  }, [q, open, kind]);

  useEffect(() => {
    const close = (e) => boxRef.current && !boxRef.current.contains(e.target) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const word = kind === "supplier" ? "supplier" : "customer";

  if (value?.party) {
    const p = value.party;
    const bal = kind === "supplier" ? p.payable : p.receivable;
    return (
      <div className="flex items-center gap-3 rounded-[10px] border border-brand-200 bg-brand-50/50 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{p.name}</p>
          <p className="text-xs text-muted">
            {p.phone || "No phone"}
            {bal > 0 ? (
              <span className="ml-2 font-medium text-warn">
                {kind === "supplier" ? "You owe" : "Owes"} {taka(bal)}
              </span>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          aria-label={`Remove ${word}`}
          onClick={() => onChange(null)}
          className="rounded-lg p-1.5 text-subtle hover:bg-white hover:text-ink-900"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  if (adding || value?.newParty) {
    const np = value?.newParty ?? { name: q, phone };
    return (
      <div className="space-y-2 rounded-[10px] border border-line-strong p-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-ink-800">New {word}</p>
          <button
            type="button"
            className="text-xs text-muted hover:text-ink-900"
            onClick={() => {
              setAdding(false);
              onChange(null);
            }}
          >
            Cancel
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            aria-label={`New ${word} name`}
            placeholder="Name"
            value={np.name}
            onChange={(e) => onChange({ newParty: { ...np, name: e.target.value } })}
            autoFocus
          />
          <Input
            aria-label={`New ${word} phone`}
            placeholder="Phone (optional)"
            inputMode="tel"
            value={np.phone}
            onChange={(e) => {
              setPhone(e.target.value);
              onChange({ newParty: { ...np, phone: e.target.value } });
            }}
          />
        </div>
        {error ? (
          <p className="text-xs text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-subtle" />
        <Input
          aria-label={label || `Find ${word}`}
          placeholder={`Name or phone of the ${word} (optional)`}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          className={cn("pl-9", error && "border-danger")}
        />
      </div>
      {open ? (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-line bg-white p-1 shadow-[var(--shadow-float)]">
          {results.map((p) => {
            const bal = kind === "supplier" ? p.payable : p.receivable;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onChange({ party: p });
                  setOpen(false);
                  setQ("");
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-ink-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.name}</span>
                  <span className="block text-xs text-muted">{p.phone || "No phone"}</span>
                </span>
                {bal > 0 ? <Badge tone="warn">{taka(bal)}</Badge> : null}
              </button>
            );
          })}
          {!results.length && q ? (
            <p className="px-3 py-2 text-sm text-muted">
              No {word} called “{q}”.
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setAdding(true);
              setOpen(false);
              onChange({ newParty: { name: /^[\d+\s-]+$/.test(q) ? "" : q, phone: /^[\d+\s-]+$/.test(q) ? q : "" } });
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            <UserPlus className="h-4 w-4" /> Add new {word}
            {q ? ` “${q}”` : ""}
          </button>
        </div>
      ) : null}
      {error ? (
        <p className="mt-1 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Read/write URL query params (filters live in the URL so Back and refresh keep them). */
export function useQueryState() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const set = (patch, { resetPage = true } = {}) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === null || v === "") next.delete(k);
      else next.set(k, String(v));
    }
    if (resetPage && !("page" in patch)) next.delete("page");
    start(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  };
  return { params, set, pending };
}

/** Today / week / month… or custom dates, stored in the URL as ?range=…&from=…&to=… */
export function RangePicker({ range, from, to }) {
  const { set, pending } = useQueryState();
  return (
    <div className={cn("flex flex-wrap items-center gap-2", pending && "opacity-60")}>
      <Select
        aria-label="Dates"
        className="h-9 w-40"
        value={range}
        onChange={(e) =>
          set(e.target.value === "custom" ? { range: "custom", from, to } : { range: e.target.value, from: "", to: "" })
        }
      >
        {Object.entries(rangePresets).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </Select>
      {range === "custom" ? (
        <>
          <Input
            type="date"
            aria-label="From"
            className="h-9 w-40"
            value={from}
            max={to}
            onChange={(e) => e.target.value && set({ from: e.target.value })}
          />
          <span className="text-sm text-muted">to</span>
          <Input
            type="date"
            aria-label="To"
            className="h-9 w-40"
            value={to}
            min={from}
            onChange={(e) => e.target.value && set({ to: e.target.value })}
          />
        </>
      ) : null}
    </div>
  );
}

export function Pager({ page, total, pageSize }) {
  const { set } = useQueryState();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm">
      <span className="text-muted">
        Page {page} of {pages} · {total} total
      </span>
      <div className="flex gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => set({ page: page - 1 }, { resetPage: false })}
          className="rounded-lg border border-line p-1.5 disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={page >= pages}
          onClick={() => set({ page: page + 1 }, { resetPage: false })}
          className="rounded-lg border border-line p-1.5 disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/** Big number tile. */
export function Stat({ label, value, hint, tone, href }) {
  const body = (
    <>
      <p className="text-xs text-muted">{label}</p>
      <p
        className={cn(
          "tabular mt-1 text-xl font-semibold sm:text-2xl",
          tone === "good" && "text-success",
          tone === "bad" && "text-danger",
          tone === "warn" && "text-warn",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-subtle">{hint}</p> : null}
    </>
  );
  const cls = "block rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-lift)]";
  return href ? (
    <Link href={href} className={cn(cls, "hover:border-brand-200")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
